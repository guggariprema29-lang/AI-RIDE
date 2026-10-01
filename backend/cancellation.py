"""
Cancellation Fee, Time Policy, and Anti-Fraud Booking System.

Provides configurable settings, preview calculation, server-side cancellation logic,
escrow refunds, seat releases, user cancellation statistics, trust score updates,
cancellation history logging, and real-time notifications.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from psycopg2.extras import RealDictCursor
from database import get_connection

# Configurable Settings
CANCELLATION_MIN_FEE = 5.0
CANCELLATION_MAX_FEE = 50.0
CANCELLATION_PERCENTAGE = 0.05  # 5%
FLAT_FEE_FALLBACK = 10.0

EARLY_CANCELLATION_MINUTES = 120  # > 2 hours: Free or minimal
LATE_CANCELLATION_MINUTES = 30    # < 30 mins: Late fee

HIGH_CANCELLATION_RATE_THRESHOLD = 0.30  # 30%
HIGH_CANCELLATION_MIN_COUNT = 3

WARNING_MESSAGE = "Frequent cancellations may affect your trust score and future booking privileges."


def calculate_cancellation_fee(
    booking_amount: float,
    departure_time: Optional[Any] = None,
    cancelled_by: str = "passenger",
    cancel_time: Optional[datetime] = None
) -> Tuple[float, float, str, bool]:
    """
    Returns (cancellation_fee, refund_amount, policy_note, is_late).
    Server-side math. Never trust client values.
    """
    amount = max(0.0, float(booking_amount or 0.0))

    # Rule: Driver or System cancellation = No fee, 100% full refund
    if cancelled_by.lower() in ("rider", "driver", "system"):
        return 0.0, amount, "Cancelled by driver/system. Full refund issued without fee.", False

    if cancel_time is None:
        cancel_time = datetime.now(timezone.utc)

    minutes_before_departure = None
    if departure_time:
        try:
            if isinstance(departure_time, str):
                dep_dt = datetime.fromisoformat(departure_time.replace("Z", "+00:00"))
            elif isinstance(departure_time, datetime):
                dep_dt = departure_time
            else:
                dep_dt = None

            if dep_dt:
                if dep_dt.tzinfo is None:
                    dep_dt = dep_dt.replace(tzinfo=timezone.utc)
                if cancel_time.tzinfo is None:
                    cancel_time = cancel_time.replace(tzinfo=timezone.utc)
                minutes_before_departure = (dep_dt - cancel_time).total_seconds() / 60.0
        except Exception:
            minutes_before_departure = None

    # Time-based rules
    if minutes_before_departure is not None and minutes_before_departure >= EARLY_CANCELLATION_MINUTES:
        # Early cancellation: free
        fee = 0.0
        refund = amount
        policy = f"Early cancellation ({int(minutes_before_departure // 60)}h before departure). No cancellation fee applied."
        is_late = False

    elif minutes_before_departure is not None and minutes_before_departure < LATE_CANCELLATION_MINUTES:
        # Late cancellation: 10% or ₹25, capped at booking amount
        perc_fee = amount * 0.10
        candidate_fee = max(25.0, perc_fee)
        fee = min(candidate_fee, amount)
        refund = amount - fee
        policy = "Late cancellation (<30 mins before departure). Late cancellation fee applied."
        is_late = True

    else:
        # Standard cancellation: ₹10 or 5% of booking amount, whichever is lower, min ₹5, max ₹50
        perc_fee = amount * CANCELLATION_PERCENTAGE
        candidate_fee = min(FLAT_FEE_FALLBACK, perc_fee)
        fee = max(CANCELLATION_MIN_FEE, min(candidate_fee, CANCELLATION_MAX_FEE))
        fee = min(fee, amount)
        refund = amount - fee
        policy = "Standard cancellation (30m - 2h before departure). Small cancellation fee applied."
        is_late = False

    return round(fee, 2), round(refund, 2), policy, is_late


def get_cancellation_preview(booking_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
    from rides import get_booking
    booking = get_booking(booking_id)
    if not booking:
        raise ValueError("Booking not found.")

    booking_amount = float(booking.get("fare") or 0.0)
    departure_time = booking.get("ride_departure_time")
    pax_id = booking.get("passenger_id")

    fee, refund, policy, is_late = calculate_cancellation_fee(
        booking_amount=booking_amount,
        departure_time=departure_time,
        cancelled_by="passenger"
    )

    # Check passenger cancellation stats for anti-fraud warning
    warning = None
    if pax_id:
        conn = get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT total_bookings, total_cancellations, cancellation_rate, is_cancellation_flagged FROM users WHERE id = %s;",
                    (pax_id,)
                )
                user_row = cursor.fetchone()
                if user_row:
                    tot_canc = user_row.get("total_cancellations", 0) or 0
                    rate = user_row.get("cancellation_rate", 0.0) or 0.0
                    flagged = user_row.get("is_cancellation_flagged", False)
                    if flagged or (tot_canc >= HIGH_CANCELLATION_MIN_COUNT and rate >= HIGH_CANCELLATION_RATE_THRESHOLD):
                        warning = WARNING_MESSAGE
        finally:
            conn.close()

    return {
        "booking_id": booking_id,
        "booking_amount": booking_amount,
        "cancellation_fee": fee,
        "refund_amount": refund,
        "cancellation_policy": policy,
        "is_late": is_late,
        "cancelled_by": "passenger",
        "warning_message": warning,
        "status": booking.get("status")
    }


def execute_cancellation(
    booking_id: int,
    user_id: int,
    reason: str = "Change of plans",
    cancelled_by: str = "passenger"
) -> Dict[str, Any]:
    """
    Executes cancellation atomically server-side:
      1. Idempotency check: if already cancelled, return existing cancellation details safely.
      2. Verify non-completed state.
      3. Calculate fee & refund.
      4. Update booking row & release seat.
      5. Process refund & wallet balances.
      6. Record cancellation_history row.
      7. Update user anti-fraud stats & recalculate AI trust score.
      8. Send notifications to passenger & rider.
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT b.*, r.rider_id, r.departure_time AS ride_departure_time, r.seats_total, r.booked_seats
                FROM bookings b
                JOIN rides r ON r.id = b.ride_id
                WHERE b.id = %s
                FOR UPDATE;
                """,
                (booking_id,)
            )
            booking = cursor.fetchone()
            if not booking:
                conn.rollback()
                raise ValueError("Booking not found.")

            status = booking["status"]
            # Idempotency check: if already cancelled, return existing details without double-refunding
            if status == "cancelled":
                conn.rollback()
                return {
                    "idempotent": True,
                    "booking_id": booking_id,
                    "status": "cancelled",
                    "cancellation_fee": float(booking.get("cancellation_fee") or 0.0),
                    "refund_amount": float(booking.get("refund_amount") or 0.0),
                    "cancelled_at": str(booking.get("cancelled_at")),
                    "message": "Booking was already cancelled."
                }

            if status in ("completed", "paid", "closed"):
                conn.rollback()
                raise ValueError("Completed or paid bookings cannot be cancelled.")

            booking_amount = float(booking.get("fare") or 0.0)
            dep_time = booking.get("ride_departure_time")
            pax_id = booking["passenger_id"]
            rider_id = booking["rider_id"]
            ride_id = booking["ride_id"]
            seats_requested = int(booking.get("seats") or 1)

            fee, refund, policy, is_late = calculate_cancellation_fee(
                booking_amount=booking_amount,
                departure_time=dep_time,
                cancelled_by=cancelled_by
            )

            # 1. Update Booking row
            now_dt = datetime.now(timezone.utc)
            cursor.execute(
                """
                UPDATE bookings
                SET status = 'cancelled',
                    cancellation_fee = %s,
                    refund_amount = %s,
                    cancelled_at = %s,
                    cancellation_reason = %s,
                    cancelled_by = %s,
                    updated_at = %s
                WHERE id = %s;
                """,
                (fee, refund, now_dt, reason, cancelled_by, now_dt, booking_id)
            )

            # 2. Release seat back to ride if not already released
            cursor.execute(
                """
                UPDATE rides
                SET booked_seats = GREATEST(0, booked_seats - %s),
                    seats_available = GREATEST(0, seats_total - GREATEST(0, booked_seats - %s)),
                    updated_at = %s
                WHERE id = %s;
                """,
                (seats_requested, seats_requested, now_dt, ride_id)
            )

            # 3. Handle Wallet / Escrow Refund
            # Transfer refund back to passenger wallet & deduct held fare from escrow
            cursor.execute("SELECT wallet_balance, escrow_balance FROM users WHERE id = %s FOR UPDATE;", (pax_id,))
            pax_wallet = cursor.fetchone()
            if pax_wallet:
                escrow_held = float(pax_wallet.get("escrow_balance") or 0.0)
                if escrow_held > 0:
                    deduct_escrow = min(escrow_held, booking_amount)
                    net_refund = min(refund, deduct_escrow)
                    cursor.execute(
                        """
                        UPDATE users
                        SET escrow_balance = GREATEST(0.0, escrow_balance - %s),
                            wallet_balance = wallet_balance + %s
                        WHERE id = %s;
                        """,
                        (deduct_escrow, net_refund, pax_id)
                    )

            # 4. Insert Cancellation History Record
            cursor.execute(
                """
                INSERT INTO cancellation_history (
                    booking_id, user_id, ride_id, booking_amount, cancellation_fee,
                    refund_amount, cancelled_at, reason, cancelled_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (booking_id, pax_id, ride_id, booking_amount, fee, refund, now_dt, reason, cancelled_by)
            )

            # 5. Update Passenger Anti-Fraud & Cancellation Statistics
            warning_issued = False
            if cancelled_by.lower() == "passenger":
                cursor.execute(
                    """
                    SELECT total_bookings, total_cancellations, late_cancellations, cancellation_count
                    FROM users WHERE id = %s FOR UPDATE;
                    """,
                    (pax_id,)
                )
                u_stats = cursor.fetchone()
                if u_stats:
                    tot_b = u_stats.get("total_bookings", 0) or 0
                    tot_c = (u_stats.get("total_cancellations", 0) or 0) + 1
                    late_c = (u_stats.get("late_cancellations", 0) or 0) + (1 if is_late else 0)
                    canc_cnt = (u_stats.get("cancellation_count", 0) or 0) + 1
                    rate = tot_c / max(1, tot_b)
                    flagged = (tot_c >= HIGH_CANCELLATION_MIN_COUNT and rate >= HIGH_CANCELLATION_RATE_THRESHOLD)

                    cursor.execute(
                        """
                        UPDATE users
                        SET total_cancellations = %s,
                            late_cancellations = %s,
                            cancellation_count = %s,
                            cancellation_rate = %s,
                            is_cancellation_flagged = %s
                        WHERE id = %s;
                        """,
                        (tot_c, late_c, canc_cnt, round(rate, 4), flagged, pax_id)
                    )
                    warning_issued = flagged

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

    # Recalculate Passenger AI Trust Score
    from models import recalculate_user_trust
    recalculate_user_trust(pax_id)

    # Dispatch Notifications
    from notifications import create_notification
    if cancelled_by.lower() == "passenger":
        create_notification(
            user_id=pax_id,
            event_type="ride_cancelled",
            title="Booking Cancelled",
            message=f"Booking cancelled successfully. Cancellation fee: ₹{fee:.2f}. Refund: ₹{refund:.2f}.",
            booking_id=booking_id
        )
        create_notification(
            user_id=rider_id,
            event_type="ride_cancelled",
            title="Seat Available Again",
            message=f"Booking #{booking_id} was cancelled by the passenger. A seat has become available on your ride.",
            booking_id=booking_id
        )
    else:
        create_notification(
            user_id=pax_id,
            event_type="ride_cancelled",
            title="Ride Cancelled by Driver",
            message=f"Your booking #{booking_id} was cancelled by the driver. Full refund of ₹{refund:.2f} credited to your wallet.",
            booking_id=booking_id
        )

    return {
        "booking_id": booking_id,
        "status": "cancelled",
        "booking_amount": booking_amount,
        "cancellation_fee": fee,
        "refund_amount": refund,
        "cancelled_by": cancelled_by,
        "cancellation_policy": policy,
        "warning_issued": warning_issued
    }

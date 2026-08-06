"""Payment Gateway Service (Razorpay Integration + Fallback Simulation).

Handles checkout sessions, Razorpay UPI orders, payment processing, 
transaction signature verification, and automatic wallet deposits.
"""

import os
import time
import secrets
from typing import Optional, Dict

# Try importing Razorpay SDK if installed
try:
    import razorpay
    HAS_RAZORPAY_SDK = True
except ImportError:
    razorpay = None
    HAS_RAZORPAY_SDK = False

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")


def get_razorpay_client():
    if HAS_RAZORPAY_SDK and RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and not RAZORPAY_KEY_ID.startswith("rzp_test_placeholder"):
        try:
            return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        except Exception:
            return None
    return None


class PaymentGateway:
    _sessions: Dict[str, dict] = {}

    @classmethod
    def create_checkout_session(
        cls,
        user_id: int,
        amount: float,
        payment_method: str = "upi",
        description: str = "AI Ride Wallet Top-up"
    ) -> dict:
        """Creates a payment gateway session (Live Razorpay Order or Mock Fallback)."""
        session_id = f"PAY-SESS-{secrets.token_hex(6).upper()}"
        expiry = time.time() + 600  # 10 min TTL

        rzp_client = get_razorpay_client()
        razorpay_order = None

        if rzp_client:
            try:
                order_payload = {
                    "amount": int(round(amount * 100)),  # in paise
                    "currency": "INR",
                    "receipt": f"rcpt_{session_id[-8:]}",
                    "notes": {"user_id": str(user_id), "description": description}
                }
                razorpay_order = rzp_client.order.create(data=order_payload)
            except Exception as e:
                print(f"[Razorpay Integration] Warning creating order: {e}")

        session = {
            "session_id": session_id,
            "user_id": user_id,
            "amount": round(amount, 2),
            "currency": "INR",
            "payment_method": payment_method.lower(),
            "description": description,
            "status": "created",
            "expires_at": expiry,
            "created_at": time.time(),
            "razorpay_order_id": razorpay_order.get("id") if razorpay_order else None,
            "razorpay_key_id": RAZORPAY_KEY_ID if razorpay_order else None,
            "qr_code_mock": f"upi://pay?pa=airide@mock&pn=AIRide&am={amount}&tr={session_id}"
        }
        cls._sessions[session_id] = session
        return session

    @classmethod
    def verify_and_process_payment(
        cls,
        session_id: str,
        transaction_ref: Optional[str] = None,
        razorpay_payment_id: Optional[str] = None,
        razorpay_signature: Optional[str] = None
    ) -> tuple[bool, Optional[dict], str]:
        """Verifies payment (via Razorpay HMAC or simulation) and credits user wallet."""
        session = cls._sessions.get(session_id)
        if not session:
            return False, None, "Payment session not found or invalid."

        if time.time() > session["expires_at"]:
            session["status"] = "expired"
            return False, session, "Payment session has expired."

        if session["status"] == "completed":
            return True, session, "Payment already processed."

        # If Razorpay order & signature provided, verify signature
        rzp_client = get_razorpay_client()
        if rzp_client and session.get("razorpay_order_id") and razorpay_payment_id and razorpay_signature:
            try:
                rzp_client.utility.verify_payment_signature({
                    'razorpay_order_id': session["razorpay_order_id"],
                    'razorpay_payment_id': razorpay_payment_id,
                    'razorpay_signature': razorpay_signature
                })
            except Exception as sig_err:
                return False, session, f"Razorpay signature verification failed: {sig_err}"

        # Mark completed
        session["status"] = "completed"
        session["transaction_ref"] = razorpay_payment_id or transaction_ref or f"TXN-{secrets.token_hex(4).upper()}"
        session["completed_at"] = time.time()

        # Credit user's wallet in DB
        from models import deposit_wallet
        updated_user = deposit_wallet(session["user_id"], session["amount"])
        if not updated_user:
            return False, session, "Failed to deposit funds into user wallet."

        return True, session, "Payment verified successfully. Wallet funded."

    @classmethod
    def get_session(cls, session_id: str) -> Optional[dict]:
        return cls._sessions.get(session_id)

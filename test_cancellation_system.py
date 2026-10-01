"""
Automated Test Suite for Cancellation Fee and Anti-Fraud Booking System.

Verifies:
  1. User books -> no cancellation -> booking remains confirmed.
  2. User books -> cancels early (>2 hrs before departure) -> correct full refund with 0 fee.
  3. User books -> cancels close to departure -> cancellation fee applied (₹10 or 5%).
  4. Double cancellation -> second request handled safely and idempotently.
  5. Driver cancels -> user receives full refund with 0 cancellation fee.
  6. User repeatedly cancels -> cancellation statistics and trust score update.
  7. Cancelled seat becomes available for another user to book.
  8. Payment/refund/escrow records remain consistent.
  9. Refreshing page / repeat API call does not create duplicate transactions.
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

# Add backend directory to path
backend_path = os.path.join(os.path.dirname(__file__), "backend")
if not os.path.exists(backend_path):
    backend_path = os.path.join(os.path.dirname(__file__), "AI-RIDE", "backend")
sys.path.insert(0, backend_path)

from models import create_tables, create_user, deposit_wallet, get_user, recalculate_user_trust, get_connection, hold_escrow
from rides import create_ride_tables, publish_ride, create_booking, get_booking, get_ride
from cancellation import calculate_cancellation_fee, get_cancellation_preview, execute_cancellation

class TestCancellationSystem(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        print("\n=== Initializing Cancellation System Test Suite ===")
        create_tables()
        create_ride_tables()

    def setUp(self):
        # Create fresh test passenger & rider
        ts = int(datetime.now().timestamp() * 1000)
        self.passenger = create_user({
            "name": f"Test Passenger {ts}",
            "email": f"pax_{ts}@example.com",
            "government_id": f"GOV-PAX-{ts}",
            "face_verified": True,
            "rating": 4.8,
            "trust_score": 85
        })
        self.rider = create_user({
            "name": f"Test Rider {ts}",
            "email": f"rider_{ts}@example.com",
            "government_id": f"GOV-RIDER-{ts}",
            "face_verified": True,
            "rating": 4.9,
            "trust_score": 90
        })

        # Fund passenger wallet with ₹1000
        deposit_wallet(self.passenger["id"], 1000.0)

        # Publish a test ride departing in 4 hours
        dep_time = datetime.now(timezone.utc) + timedelta(hours=4)
        self.ride = publish_ride({
            "rider_id": self.rider["id"],
            "origin": "Bangalore Central",
            "destination": "Electronic City",
            "origin_lat": 12.9716,
            "origin_lng": 77.5946,
            "dest_lat": 12.8399,
            "dest_lng": 77.6770,
            "seats_total": 4,
            "fare_per_km": 10.0,
            "departure_time": dep_time.isoformat(),
            "vehicle_type": "car"
        })

    def create_test_booking(self, ride_id=None, fare=100.0, seats=1):
        if ride_id is None:
            ride_id = self.ride["id"]
        hold_escrow(self.passenger["id"], fare)
        return create_booking({
            "ride_id": ride_id,
            "passenger_id": self.passenger["id"],
            "pickup": "Bangalore Central",
            "dropoff": "Electronic City",
            "pickup_lat": 12.9716,
            "pickup_lng": 77.5946,
            "drop_lat": 12.8399,
            "drop_lng": 77.6770,
            "seats": seats,
            "fare": fare,
            "overlap_score": 0.9,
            "detour_m": 100.0
        })

    def test_01_no_cancellation_remains_confirmed(self):
        """Case 1: User books -> no cancellation -> booking remains confirmed."""
        booking = self.create_test_booking()
        self.assertIsNotNone(booking)
        self.assertIn(booking["status"], ("pending", "confirmed", "accepted"))
        
        fetched = get_booking(booking["id"])
        self.assertEqual(fetched["id"], booking["id"])
        self.assertNotEqual(fetched["status"], "cancelled")
        print("[OK] Test 1 Passed: Booking created and remains confirmed without cancellation.")

    def test_02_early_cancellation_full_refund(self):
        """Case 2: User books -> cancels early (>2h before departure) -> correct refund, 0 fee."""
        booking = self.create_test_booking(fare=200.0)
        
        # Ride is in 4 hours (> 2 hours early)
        preview = get_cancellation_preview(booking["id"], self.passenger["id"])
        self.assertEqual(preview["cancellation_fee"], 0.0)
        self.assertEqual(preview["refund_amount"], 200.0)

        res = execute_cancellation(booking["id"], self.passenger["id"], reason="Change of plans", cancelled_by="passenger")
        self.assertEqual(res["status"], "cancelled")
        self.assertEqual(res["cancellation_fee"], 0.0)
        self.assertEqual(res["refund_amount"], 200.0)

        # Check booking row in DB
        b_after = get_booking(booking["id"])
        self.assertEqual(b_after["status"], "cancelled")
        self.assertEqual(float(b_after["cancellation_fee"]), 0.0)
        self.assertEqual(float(b_after["refund_amount"]), 200.0)
        print("[OK] Test 2 Passed: Early cancellation resulting in 0 fee and full Rs.200 refund verified.")

    def test_03_close_to_departure_cancellation_fee(self):
        """Case 3: User books -> cancels close to departure (between 30m and 2h) -> cancellation fee applied."""
        # Publish ride departing in 45 minutes
        dep_time = datetime.now(timezone.utc) + timedelta(minutes=45)
        close_ride = publish_ride({
            "rider_id": self.rider["id"],
            "origin": "Koramangala",
            "destination": "Whitefield",
            "origin_lat": 12.9352,
            "origin_lng": 77.6245,
            "dest_lat": 12.9698,
            "dest_lng": 77.7500,
            "seats_total": 4,
            "fare_per_km": 10.0,
            "departure_time": dep_time.isoformat(),
            "vehicle_type": "car"
        })

        booking = self.create_test_booking(ride_id=close_ride["id"], fare=100.0)

        preview = get_cancellation_preview(booking["id"], self.passenger["id"])
        # Expected fee: lower of ₹10 or 5% of ₹100 (which is 5.0, subject to min ₹5.0) -> ₹5.0
        self.assertGreater(preview["cancellation_fee"], 0.0)
        self.assertEqual(preview["refund_amount"], 100.0 - preview["cancellation_fee"])

        res = execute_cancellation(booking["id"], self.passenger["id"], reason="Standard cancellation", cancelled_by="passenger")
        self.assertEqual(res["status"], "cancelled")
        self.assertGreater(res["cancellation_fee"], 0.0)
        self.assertEqual(res["refund_amount"] + res["cancellation_fee"], 100.0)
        print(f"[OK] Test 3 Passed: Standard cancellation fee of Rs.{res['cancellation_fee']} and refund of Rs.{res['refund_amount']} verified.")

    def test_04_double_cancellation_idempotent(self):
        """Case 4: User cancels twice -> second request handled safely and idempotently."""
        booking = self.create_test_booking(fare=150.0)
        
        # First cancellation
        res1 = execute_cancellation(booking["id"], self.passenger["id"], cancelled_by="passenger")
        self.assertEqual(res1["status"], "cancelled")
        
        # Second cancellation attempt on same booking ID
        res2 = execute_cancellation(booking["id"], self.passenger["id"], cancelled_by="passenger")
        self.assertTrue(res2.get("idempotent"))
        self.assertEqual(res2["status"], "cancelled")
        print("[OK] Test 4 Passed: Second cancellation request handled idempotently without error or duplicate refund.")

    def test_05_driver_cancellation_full_refund(self):
        """Case 5: Driver cancels -> user receives full refund and no cancellation fee."""
        booking = self.create_test_booking(fare=180.0)

        res = execute_cancellation(booking["id"], self.rider["id"], reason="Vehicle breakdown", cancelled_by="rider")
        self.assertEqual(res["status"], "cancelled")
        self.assertEqual(res["cancellation_fee"], 0.0)
        self.assertEqual(res["refund_amount"], 180.0)
        print("[OK] Test 5 Passed: Driver cancellation verified with 0 fee and full 100% refund.")

    def test_06_repeated_cancellation_anti_fraud(self):
        """Case 6: User repeatedly cancels -> cancellation statistics and trust score update."""
        dep_time = datetime.now(timezone.utc) + timedelta(minutes=15) # late cancellations
        
        # Perform 3 late cancellations to trigger anti-fraud threshold
        for i in range(3):
            r = publish_ride({
                "rider_id": self.rider["id"],
                "origin": f"Point A {i}",
                "destination": f"Point B {i}",
                "origin_lat": 12.9,
                "origin_lng": 77.6,
                "dest_lat": 12.95,
                "dest_lng": 77.65,
                "seats_total": 4,
                "departure_time": dep_time.isoformat()
            })
            b = self.create_test_booking(ride_id=r["id"], fare=100.0)
            execute_cancellation(b["id"], self.passenger["id"], reason=f"Repeated cancel {i+1}", cancelled_by="passenger")

        pax_user = get_user(self.passenger["id"])
        self.assertGreaterEqual(pax_user.get("total_cancellations", 0), 3)
        self.assertGreater(pax_user.get("cancellation_rate", 0.0), 0.25)
        self.assertTrue(pax_user.get("is_cancellation_flagged", False))
        print(f"[OK] Test 6 Passed: Anti-fraud tracking verified! Cancellations: {pax_user['total_cancellations']}, Rate: {pax_user['cancellation_rate']*100:.1f}%, Flagged: {pax_user['is_cancellation_flagged']}.")

    def test_07_seat_released_and_rebookable(self):
        """Case 7: Cancelled seat becomes available for another user to book."""
        # Create single seat ride
        dep_time = datetime.now(timezone.utc) + timedelta(hours=3)
        single_ride = publish_ride({
            "rider_id": self.rider["id"],
            "origin": "Silk Board",
            "destination": "MG Road",
            "origin_lat": 12.9172,
            "origin_lng": 77.6228,
            "dest_lat": 12.9756,
            "dest_lng": 77.6066,
            "seats_total": 1,
            "departure_time": dep_time.isoformat()
        })

        # Book the 1 seat
        b1 = self.create_test_booking(ride_id=single_ride["id"], seats=1)
        r_after_b1 = get_ride(single_ride["id"])
        self.assertEqual(r_after_b1["seats_available"], 0)

        # Cancel b1
        execute_cancellation(b1["id"], self.passenger["id"], cancelled_by="passenger")
        r_after_cancel = get_ride(single_ride["id"])
        self.assertEqual(r_after_cancel["seats_available"], 1)

        # Second passenger can now book the freed seat!
        pax2 = create_user({"name": "Second Pax", "email": f"pax2_{int(datetime.now().timestamp())}@example.com", "government_id": f"GOV-P2-{int(datetime.now().timestamp())}"})
        b2 = create_booking({
            "ride_id": single_ride["id"],
            "passenger_id": pax2["id"],
            "pickup": "Silk Board",
            "dropoff": "MG Road",
            "pickup_lat": 12.9172,
            "pickup_lng": 77.6228,
            "drop_lat": 12.9756,
            "drop_lng": 77.6066,
            "seats": 1,
            "fare": 80.0
        })
        self.assertIsNotNone(b2)
        print("[OK] Test 7 Passed: Released seat was successfully re-booked by another passenger.")

    def test_08_payment_escrow_consistency(self):
        """Case 8: Payment/refund/escrow records remain consistent."""
        initial_wallet = float(get_user(self.passenger["id"])["wallet_balance"] or 0.0)
        
        booking = self.create_test_booking(fare=100.0)
        res = execute_cancellation(booking["id"], self.passenger["id"], cancelled_by="passenger")
        
        final_user = get_user(self.passenger["id"])
        expected_wallet = initial_wallet - float(res["cancellation_fee"])
        self.assertAlmostEqual(float(final_user["wallet_balance"]), expected_wallet, places=2)
        self.assertAlmostEqual(float(final_user["escrow_balance"]), 0.0, places=2)
        print(f"[OK] Test 8 Passed: Wallet & Escrow balance integrity verified (Initial: Rs.{initial_wallet}, Final: Rs.{final_user['wallet_balance']}, Fee: Rs.{res['cancellation_fee']}).")

    def test_09_repeat_call_no_duplicate_transactions(self):
        """Case 9: Refreshing / repeat API call does not produce duplicate cancellation/refund transactions."""
        booking = self.create_test_booking(fare=100.0)
        
        # Execute cancellation 3 times
        res1 = execute_cancellation(booking["id"], self.passenger["id"], cancelled_by="passenger")
        wallet1 = get_user(self.passenger["id"])["wallet_balance"]
        
        res2 = execute_cancellation(booking["id"], self.passenger["id"], cancelled_by="passenger")
        wallet2 = get_user(self.passenger["id"])["wallet_balance"]
        
        res3 = execute_cancellation(booking["id"], self.passenger["id"], cancelled_by="passenger")
        wallet3 = get_user(self.passenger["id"])["wallet_balance"]

        self.assertEqual(wallet1, wallet2)
        self.assertEqual(wallet2, wallet3)
        print("[OK] Test 9 Passed: Repeat calls did not create duplicate wallet transactions or fees.")

if __name__ == "__main__":
    unittest.main()

import unittest
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from models import create_tables, create_user
from rides import create_ride_tables, publish_ride
from route_engine import route_length, detect_route_deviation
from app import push_ride_location
from schemas import RideLocationUpdate

class TestOffRouteDeviationAndAutoSOS(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        create_tables()
        create_ride_tables()

    def test_off_route_detection_and_auto_sos(self):
        print("\n=== Testing Live Off-Route Deviation Warning & Auto-SOS ===")

        # 1. Create test rider with emergency contact
        rider = create_user({
            "name": "Rohan Verma",
            "email": f"rohan_{os.urandom(4).hex()}@example.com",
            "government_id": f"RO-{os.urandom(4).hex()}",
            "phone": "9876543210",
            "emergency_contact": "9998887776"
        })

        # 2. Define polyline (Koramangala to Indiranagar, ~4.5 km straight line)
        polyline = [
            {"latitude": 12.9352, "longitude": 77.6245}, # Koramangala
            {"latitude": 12.9784, "longitude": 77.6408}  # Indiranagar
        ]

        ride = publish_ride({
            "rider_id": rider["id"],
            "origin": "Koramangala",
            "destination": "Indiranagar",
            "origin_lat": 12.9352,
            "origin_lng": 77.6245,
            "dest_lat": 12.9784,
            "dest_lng": 77.6408,
            "polyline": polyline,
            "total_distance_m": route_length(polyline),
            "vehicle_type": "car",
            "seats_total": 3,
            "departure_time": "2026-08-06T10:00:00Z"
        })

        # 3. Test Location Update On-Route (0m deviation)
        on_route_req = RideLocationUpdate(latitude=12.9352, longitude=77.6245)
        res_on_route = push_ride_location(ride["id"], on_route_req)
        dev_on = res_on_route["route_deviation"]
        self.assertFalse(dev_on["is_deviated"])
        self.assertEqual(dev_on["warning_level"], "normal")
        print(f"[OK] On-route location check (Deviation: {dev_on['deviation_distance_m']}m) -> Status: NORMAL")

        # 4. Test Location Update >500m Off-Route (650m deviation)
        off_650m_req = RideLocationUpdate(latitude=12.9352 + 0.015, longitude=77.6245)
        res_650m = push_ride_location(ride["id"], off_650m_req)
        dev_650m = res_650m["route_deviation"]
        self.assertTrue(dev_650m["is_deviated"])
        self.assertFalse(dev_650m["is_critical"])
        self.assertEqual(dev_650m["warning_level"], "warning")
        self.assertIn("Vehicle off-route by", dev_650m["message"])
        print(f"[OK] 650m Off-Route check (Dist: {dev_650m['deviation_distance_m']}m) -> Warning Banner triggered")

        # 5. Test Location Update >=2 km Off-Route (2.2 km deviation)
        off_2200m_req = RideLocationUpdate(latitude=12.9352 + 0.060, longitude=77.6245)
        res_2200m = push_ride_location(ride["id"], off_2200m_req)
        dev_2200m = res_2200m["route_deviation"]
        self.assertTrue(dev_2200m["is_deviated"])
        self.assertTrue(dev_2200m["is_critical"])
        self.assertEqual(dev_2200m["warning_level"], "critical")
        self.assertTrue(dev_2200m.get("auto_sos_triggered", False))
        self.assertIn("CRITICAL SAFETY ALERT", dev_2200m["message"])
        print(f"[OK] 2.2 km Off-Route check (Dist: {dev_2200m['deviation_distance_m']}m) -> CRITICAL Auto-SOS Dispatched")

        print("\nALL OFF-ROUTE DEVIATION & AUTO-SOS TESTS PASSED PERFECTLY! [OK]\n")

if __name__ == "__main__":
    unittest.main()

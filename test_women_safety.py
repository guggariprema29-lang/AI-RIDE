import unittest
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from models import create_tables, create_user
from rides import create_ride_tables, publish_ride
from parcels import create_parcels_table, create_parcel, get_nearby_parcels_for_ride
from app import search_rides
from schemas import RideSearchRequest

class TestWomenSafetyMode(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        create_tables()
        create_ride_tables()
        create_parcels_table()

    def test_women_only_ride_and_parcel_privacy(self):
        print("\n=== Testing Women Safety Mode (Female-Only Rides & Parcels) ===")

        # 1. Create test users
        female_rider = create_user({
            "name": "Ananya Sharma",
            "email": f"ananya_{os.urandom(4).hex()}@example.com",
            "government_id": f"AA-{os.urandom(4).hex()}",
            "gender": "female",
            "phone": "9876543210"
        })

        male_rider = create_user({
            "name": "Rahul Kumar",
            "email": f"rahul_{os.urandom(4).hex()}@example.com",
            "government_id": f"RA-{os.urandom(4).hex()}",
            "gender": "male",
            "phone": "9876543211"
        })

        female_passenger = create_user({
            "name": "Priya Patel",
            "email": f"priya_{os.urandom(4).hex()}@example.com",
            "government_id": f"PR-{os.urandom(4).hex()}",
            "gender": "female",
            "phone": "9876543212"
        })

        male_passenger = create_user({
            "name": "Vikram Singh",
            "email": f"vikram_{os.urandom(4).hex()}@example.com",
            "government_id": f"VI-{os.urandom(4).hex()}",
            "gender": "male",
            "phone": "9876543213"
        })

        from route_engine import route_length
        polyline = [
            {"latitude": 12.9352, "longitude": 77.6245},
            {"latitude": 12.9784, "longitude": 77.6408}
        ]
        ride_data = {
            "rider_id": female_rider["id"],
            "origin": "Koramangala, Bengaluru",
            "destination": "Indiranagar, Bengaluru",
            "origin_lat": 12.9352,
            "origin_lng": 77.6245,
            "dest_lat": 12.9784,
            "dest_lng": 77.6408,
            "vehicle_type": "car",
            "seats_total": 3,
            "departure_time": datetime.now(timezone.utc).isoformat(),
            "notes": "Female passengers only please!",
            "women_only": True,
            "polyline": polyline,
            "total_distance_m": route_length(polyline)
        }
        published = publish_ride(ride_data)
        self.assertTrue(published["women_only"])
        print(f"[OK] Women-Only Ride #{published['id']} published by female rider ({female_rider['name']})")

        # 3. Female passenger searches for ride
        req_female = RideSearchRequest(
            passenger_id=female_passenger["id"],
            pickup="Koramangala",
            dropoff="Indiranagar",
            pickup_lat=12.9352,
            pickup_lng=77.6245,
            drop_lat=12.9784,
            drop_lng=77.6408,
            min_overlap=0.0
        )
        res_female = search_rides(req_female)
        female_match_ids = [m["id"] for m in res_female.get("matches", [])]
        self.assertIn(published["id"], female_match_ids)
        print(f"[OK] Female Passenger ({female_passenger['name']}) CAN see the Women-Only Ride")

        # 4. Male passenger searches for ride
        req_male = RideSearchRequest(
            passenger_id=male_passenger["id"],
            pickup="Koramangala",
            dropoff="Indiranagar",
            pickup_lat=12.9352,
            pickup_lng=77.6245,
            drop_lat=12.9784,
            drop_lng=77.6408,
            min_overlap=0.0
        )
        res_male = search_rides(req_male)
        male_match_ids = [m["id"] for m in res_male.get("matches", [])]
        self.assertNotIn(published["id"], male_match_ids)
        print(f"[OK] Male Passenger ({male_passenger['name']}) CANNOT see the Women-Only Ride (Excluded by Safety Engine)")

        # 5. Create Women-Only Parcel Request
        parcel_data = {
            "sender_id": female_passenger["id"],
            "title": "Important Documents",
            "category": "documents",
            "weight_kg": 1.0,
            "pickup": "Koramangala",
            "dropoff": "Indiranagar",
            "pickup_lat": 12.9352,
            "pickup_lng": 77.6245,
            "drop_lat": 12.9784,
            "drop_lng": 77.6408,
            "receiver_name": "Ritu",
            "receiver_phone": "9998887776",
            "fare": 80.0,
            "women_only": True
        }
        # Give female passenger wallet funds for escrow
        from models import get_connection
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET wallet_balance = 500 WHERE id = %s;", (female_passenger["id"],))
        conn.commit()
        conn.close()

        parcel, err = create_parcel(parcel_data)
        self.assertTrue(parcel["women_only"])
        print(f"[OK] Women-Only Parcel #{parcel['id']} created")

        # 6. Male rider publishes a ride along same route
        male_ride_data = dict(ride_data)
        male_ride_data["rider_id"] = male_rider["id"]
        male_ride_data["women_only"] = False
        male_published = publish_ride(male_ride_data)

        # Female rider checks nearby parcels
        parcels_for_female = get_nearby_parcels_for_ride(published["id"])
        female_parcel_ids = [p["id"] for p in parcels_for_female]
        self.assertIn(parcel["id"], female_parcel_ids)
        print(f"[OK] Female Rider ({female_rider['name']}) CAN see the Women-Only Parcel job")

        # Male rider checks nearby parcels
        parcels_for_male = get_nearby_parcels_for_ride(male_published["id"])
        male_parcel_ids = [p["id"] for p in parcels_for_male]
        self.assertNotIn(parcel["id"], male_parcel_ids)
        print(f"[OK] Male Rider ({male_rider['name']}) CANNOT see the Women-Only Parcel job")

        print("\nALL WOMEN SAFETY MODE TESTS PASSED PERFECTLY! [OK]\n")

if __name__ == "__main__":
    unittest.main()

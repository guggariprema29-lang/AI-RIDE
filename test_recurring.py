import unittest
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from models import create_tables, create_user
from rides import create_ride_tables
from recurring import (
    create_recurring_tables, create_recurring_schedule, get_user_recurring_schedules,
    toggle_recurring_schedule, subscribe_to_schedule, search_recurring_schedules,
    process_recurring_schedules
)

class TestRecurringCommuteScheduler(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        create_tables()
        create_ride_tables()
        create_recurring_tables()

    def test_recurring_commute_lifecycle(self):
        print("\n=== Testing Recurring Commute Scheduler (Office & College Commutes) ===")

        # 1. Create test rider and passenger
        rider = create_user({
            "name": "Arjun Rider",
            "email": f"arjun_{os.urandom(4).hex()}@example.com",
            "government_id": f"AR-{os.urandom(4).hex()}",
            "gender": "male",
            "phone": "9876543210"
        })

        passenger = create_user({
            "name": "Kavya Commuter",
            "email": f"kavya_{os.urandom(4).hex()}@example.com",
            "government_id": f"KC-{os.urandom(4).hex()}",
            "gender": "female",
            "phone": "9876543211"
        })

        # 2. Rider creates a Mon-Sun daily recurring commute schedule
        current_day_abbr = datetime.now(timezone.utc).strftime("%a").lower()
        sched_data = {
            "user_id": rider["id"],
            "schedule_type": "rider_ride",
            "title": "Daily Electronic City Commute",
            "days_of_week": [current_day_abbr, "mon", "tue", "wed", "thu", "fri"],
            "departure_time_str": "08:30",
            "origin": "Koramangala, Bengaluru",
            "destination": "Electronic City, Bengaluru",
            "origin_lat": 12.9352,
            "origin_lng": 77.6245,
            "dest_lat": 12.8399,
            "dest_lng": 77.6770,
            "vehicle_type": "car",
            "seats_total": 3,
            "fare_per_km": 6.0,
            "notes": "Daily office route",
        }
        schedule = create_recurring_schedule(sched_data)
        self.assertEqual(schedule["status"], "active")
        print(f"[OK] Created Recurring Schedule #{schedule['id']}: '{schedule['title']}' for days {schedule['days_of_week']}")

        # 3. Verify user's schedules listing
        my_schedules = get_user_recurring_schedules(rider["id"])
        self.assertTrue(any(s["id"] == schedule["id"] for s in my_schedules))
        print(f"[OK] Rider can retrieve active schedules list (Total: {len(my_schedules)})")

        # 4. Passenger searches and subscribes to recurring commute
        public_schedules = search_recurring_schedules()
        self.assertTrue(any(s["id"] == schedule["id"] for s in public_schedules))
        print(f"[OK] Public search returns recurring schedule")

        sub, err = subscribe_to_schedule(schedule["id"], passenger["id"], {
            "seats": 1,
            "pickup": schedule["origin"],
            "dropoff": schedule["destination"],
            "pickup_lat": schedule["origin_lat"],
            "pickup_lng": schedule["origin_lng"],
            "drop_lat": schedule["dest_lat"],
            "drop_lng": schedule["dest_lng"],
        })
        self.assertIsNotNone(sub)
        print(f"[OK] Passenger ({passenger['name']}) subscribed to Schedule #{schedule['id']}")

        # 5. Process recurring schedules (Auto-generates live ride + auto-books passenger)
        res = process_recurring_schedules()
        self.assertTrue(res["success"])
        print(f"[OK] Auto-Generation Engine ran for date {res['date']}: {res['generated_rides']} ride(s) generated, {res['generated_bookings']} auto-booking(s) created")

        # 6. Pause / Resume schedule toggle
        toggled = toggle_recurring_schedule(schedule["id"])
        self.assertEqual(toggled["status"], "paused")
        print(f"[OK] Schedule #{schedule['id']} successfully toggled to PAUSED")

        resumed = toggle_recurring_schedule(schedule["id"])
        self.assertEqual(resumed["status"], "active")
        print(f"[OK] Schedule #{schedule['id']} successfully RESUMED")

        print("\nALL RECURRING COMMUTE SCHEDULER TESTS PASSED PERFECTLY! [OK]\n")

if __name__ == "__main__":
    unittest.main()

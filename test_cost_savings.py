import unittest
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from matching import calculate_cost_savings

class TestCostSavingsBreakdown(unittest.TestCase):

    def test_car_ride_cost_breakdown(self):
        print("\n=== Testing Detailed Cost-Split & Fuel Savings Breakdown ===")

        # 1. Test 15 km Car Ride (Koramangala to Electronic City)
        res = calculate_cost_savings(distance_m=15000.0, vehicle_type="car", seats=1)
        self.assertEqual(res["distance_km"], 15.0)
        self.assertEqual(res["fuel_liters"], 1.0)
        self.assertEqual(res["total_fuel_cost"], 102.0)
        self.assertGreater(res["commercial_fare"], 300.0)
        self.assertGreater(res["savings_pct"], 70)
        self.assertGreater(res["co2_saved_kg"], 2.0)
        self.assertEqual(res["commission_percent"], 5.0)
        self.assertEqual(res["platform_fee"], 4.5)
        self.assertEqual(res["rider_payout"], 85.5)

        print(f"[OK] 15 km Car Ride Breakdown:")
        print(f"  - Distance: {res['distance_km']} km")
        print(f"  - Fuel Consumed: {res['fuel_liters']} L (Total Fuel Bill: Rs.{res['total_fuel_cost']})")
        print(f"  - Total Fare: Rs.{res['cost_share']}")
        print(f"  - Rider Fuel Recovery (95%): Rs.{res['rider_payout']}")
        print(f"  - Platform Safety Fee (5%): Rs.{res['platform_fee']}")
        print(f"  - Uber/Ola Cab Estimate: Rs.{res['commercial_fare']}")
        print(f"  - Savings: {res['savings_pct']}% (Saved Rs.{res['savings_amount']})")
        print(f"  - CO2 Saved: {res['co2_saved_kg']} kg")

    def test_parcel_delivery_cost_breakdown(self):
        # 2. Test 10 km Parcel Delivery
        res = calculate_cost_savings(distance_m=10000.0, vehicle_type="car", is_parcel=True, actual_fare=60.0)
        self.assertEqual(res["distance_km"], 10.0)
        self.assertEqual(res["cost_share"], 60.0)
        self.assertEqual(res["commercial_name"], "Porter / Dunzo Courier")
        self.assertEqual(res["commercial_fare"], 190.0)
        self.assertGreater(res["savings_pct"], 60)
        self.assertEqual(res["commission_percent"], 5.0)
        self.assertEqual(res["platform_fee"], 3.0)
        self.assertEqual(res["rider_payout"], 57.0)

        print(f"\n[OK] 10 km Parcel Delivery Breakdown:")
        print(f"  - Distance: {res['distance_km']} km")
        print(f"  - AI Ride Parcel Fare: Rs.{res['cost_share']}")
        print(f"  - Rider Payout (95%): Rs.{res['rider_payout']}")
        print(f"  - Platform Safety Fee (5%): Rs.{res['platform_fee']}")
        print(f"  - Porter/Dunzo Courier Estimate: Rs.{res['commercial_fare']}")
        print(f"  - Savings: {res['savings_pct']}% (Saved Rs.{res['savings_amount']})")

        print("\nALL COST-SPLIT & SAVINGS BREAKDOWN TESTS PASSED PERFECTLY! [OK]\n")

if __name__ == "__main__":
    unittest.main()

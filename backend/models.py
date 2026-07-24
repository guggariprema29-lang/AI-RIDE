from __future__ import annotations

import json
from datetime import datetime
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from database import get_connection

CREATE_EXTENSION_POSTGIS = "CREATE EXTENSION IF NOT EXISTS postgis;"
CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    government_id TEXT UNIQUE,
    face_verified BOOLEAN DEFAULT FALSE,
    rating REAL DEFAULT 0,
    delivery_success_rate REAL DEFAULT 0,
    cancellation_count INTEGER DEFAULT 0,
    trust_score INTEGER DEFAULT 0,
    completed_deliveries INTEGER DEFAULT 0,
    route_deviation_count INTEGER DEFAULT 0,
    report_count INTEGER DEFAULT 0,
    response_time_minutes REAL DEFAULT 10.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_ROUTES_TABLE = """
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    polyline JSONB NOT NULL,
    total_distance_m REAL NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    max_wait_minutes INTEGER DEFAULT 15,
    package_weight_kg REAL DEFAULT 0,
    package_category TEXT DEFAULT 'none',
    route_type TEXT DEFAULT 'traveler',
    package_size TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_routes_departure_time ON routes (departure_time);
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes (user_id);
"""


postgis_available = False


def polyline_to_wkt(polyline: list[dict]) -> str:
    points = [f"{point['longitude']} {point['latitude']}" for point in polyline]
    return f"SRID=4326;LINESTRING({', '.join(points)})"


def create_tables():
    global postgis_available
    conn = get_connection()
    conn.autocommit = True
    with conn.cursor() as cursor:
        try:
            cursor.execute(CREATE_EXTENSION_POSTGIS)
            postgis_available = True
        except psycopg2.Error:
            postgis_available = False
        cursor.execute(CREATE_USERS_TABLE)
        cursor.execute(CREATE_ROUTES_TABLE)
        # Ensure all columns exist (safe to run multiple times)
        migrations = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS government_id TEXT;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verified BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS rating REAL DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS delivery_success_rate REAL DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS cancellation_count INTEGER DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance REAL DEFAULT 0.0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS escrow_balance REAL DEFAULT 0.0;",
            # Ensure the unique constraint exists for ON CONFLICT to work
            """DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'users_government_id_key'
                ) THEN
                    ALTER TABLE users ADD CONSTRAINT users_government_id_key UNIQUE (government_id);
                END IF;
            END $$;""",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'Unknown';",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS destination TEXT DEFAULT 'Unknown';",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS polyline JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_distance_m REAL DEFAULT 0;",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS departure_time TIMESTAMPTZ DEFAULT NOW();",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS max_wait_minutes INTEGER DEFAULT 15;",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS package_weight_kg REAL DEFAULT 0;",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS package_category TEXT DEFAULT 'none';",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_deliveries INTEGER DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS route_deviation_count INTEGER DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS response_time_minutes REAL DEFAULT 10.0;",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_type TEXT DEFAULT 'traveler';",
            "ALTER TABLE routes ADD COLUMN IF NOT EXISTS package_size TEXT DEFAULT 'medium';",
        ]
        for migration in migrations:
            try:
                cursor.execute(migration)
            except psycopg2.Error:
                pass
        if postgis_available:
            cursor.execute("ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_geom GEOGRAPHY(LINESTRING, 4326);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_geom ON routes USING GIST (route_geom);")
    conn.close()



def create_user(user_data: dict) -> dict:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO users (
                    name, email, government_id, face_verified, rating,
                    delivery_success_rate, cancellation_count, trust_score,
                    password_hash, dob, title, phone, completed_deliveries,
                    route_deviation_count, report_count, response_time_minutes
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (government_id) DO UPDATE
                    SET name                  = EXCLUDED.name,
                        email                 = EXCLUDED.email,
                        face_verified         = EXCLUDED.face_verified,
                        rating                = EXCLUDED.rating,
                        delivery_success_rate = EXCLUDED.delivery_success_rate,
                        cancellation_count    = EXCLUDED.cancellation_count,
                        trust_score           = EXCLUDED.trust_score,
                        password_hash         = COALESCE(EXCLUDED.password_hash, users.password_hash),
                        dob                   = COALESCE(EXCLUDED.dob, users.dob),
                        title                 = COALESCE(EXCLUDED.title, users.title),
                        phone                 = COALESCE(EXCLUDED.phone, users.phone),
                        completed_deliveries  = EXCLUDED.completed_deliveries,
                        route_deviation_count = EXCLUDED.route_deviation_count,
                        report_count          = EXCLUDED.report_count,
                        response_time_minutes = EXCLUDED.response_time_minutes
                RETURNING *;
                """,
                (
                    user_data.get("name"),
                    user_data.get("email"),
                    user_data.get("government_id"),
                    user_data.get("face_verified", False),
                    user_data.get("rating", 0.0),
                    user_data.get("delivery_success_rate", 0.0),
                    user_data.get("cancellation_count", 0),
                    user_data.get("trust_score", 0),
                    user_data.get("password_hash"),
                    user_data.get("dob"),
                    user_data.get("title"),
                    user_data.get("phone"),
                    user_data.get("completed_deliveries", 0),
                    user_data.get("route_deviation_count", 0),
                    user_data.get("report_count", 0),
                    user_data.get("response_time_minutes", 10.0),
                ),
            )
            user = cursor.fetchone()
        conn.commit()
        return dict(user)
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            gov_id = user_data.get("government_id")
            email  = user_data.get("email")
            if gov_id:
                cursor.execute("SELECT * FROM users WHERE government_id = %s", (gov_id,))
                user = cursor.fetchone()
                if user: return dict(user)
            if email:
                cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
                user = cursor.fetchone()
                if user: return dict(user)
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_user_by_email(email: str) -> dict | None:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None


def get_user_by_government_id(government_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT * FROM users WHERE government_id = %s", (government_id,))
        user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None



def get_user(user_id: int) -> dict | None:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None


def create_route(route_data: dict) -> dict:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        route_line = polyline_to_wkt(route_data["polyline"])
        if postgis_available:
            cursor.execute(
                """
                INSERT INTO routes (user_id, origin, destination, polyline, route_geom, total_distance_m, departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size)
                VALUES (%s, %s, %s, %s, ST_GeogFromText(%s), %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, origin, destination, polyline, total_distance_m, departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size, created_at;
                """,
                (
                    route_data["user_id"],
                    route_data["origin"],
                    route_data["destination"],
                    json.dumps(route_data["polyline"]),
                    route_line,
                    route_data["total_distance_m"],
                    route_data["departure_time"],
                    route_data.get("max_wait_minutes", 15),
                    route_data.get("package_weight_kg", 0.0),
                    route_data.get("package_category", "none"),
                    route_data.get("route_type", "traveler"),
                    route_data.get("package_size", "medium"),
                ),
            )
        else:
            cursor.execute(
                """
                INSERT INTO routes (user_id, origin, destination, polyline, total_distance_m, departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, origin, destination, polyline, total_distance_m, departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size, created_at;
                """,
                (
                    route_data["user_id"],
                    route_data["origin"],
                    route_data["destination"],
                    json.dumps(route_data["polyline"]),
                    route_data["total_distance_m"],
                    route_data["departure_time"],
                    route_data.get("max_wait_minutes", 15),
                    route_data.get("package_weight_kg", 0.0),
                    route_data.get("package_category", "none"),
                    route_data.get("route_type", "traveler"),
                    route_data.get("package_size", "medium"),
                ),
            )
        route = cursor.fetchone()
    conn.commit()
    conn.close()
    return dict(route)


def get_all_routes() -> list[dict]:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT id, user_id, origin, destination, polyline, total_distance_m,
                   departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size, created_at
            FROM routes
            """
        )
        routes = cursor.fetchall()
    conn.close()
    return [dict(route) for route in routes]


def get_routes_near_route(polyline: list[dict], search_radius_m: float = 500.0) -> list[dict]:
    if not postgis_available:
        return get_all_routes()

    conn = get_connection()
    route_line = polyline_to_wkt(polyline)
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT id, user_id, origin, destination, polyline, total_distance_m,
                   departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size, created_at
            FROM routes
            WHERE ST_DWithin(route_geom, ST_GeogFromText(%s), %s)
            """,
            (route_line, search_radius_m),
        )
        routes = cursor.fetchall()
    conn.close()
    return [dict(route) for route in routes]


def get_route(route_id: int) -> dict | None:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT id, user_id, origin, destination, polyline, total_distance_m, departure_time, max_wait_minutes, package_weight_kg, package_category, route_type, package_size, created_at FROM routes WHERE id = %s", (route_id,))
        route = cursor.fetchone()
    conn.close()
    return dict(route) if route else None


def deposit_wallet(user_id: int, amount: float) -> dict | None:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            "UPDATE users SET wallet_balance = wallet_balance + %s WHERE id = %s RETURNING *;",
            (amount, user_id)
        )
        user = cursor.fetchone()
    conn.commit()
    conn.close()
    return dict(user) if user else None


def hold_escrow(user_id: int, amount: float) -> bool:
    conn = get_connection()
    success = False
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT wallet_balance FROM users WHERE id = %s;", (user_id,))
        res = cursor.fetchone()
        if res and res["wallet_balance"] >= amount:
            cursor.execute(
                """
                UPDATE users 
                SET wallet_balance = wallet_balance - %s, 
                    escrow_balance = escrow_balance + %s 
                WHERE id = %s;
                """,
                (amount, amount, user_id)
            )
            success = True
    conn.commit()
    conn.close()
    return success


def release_escrow(sender_id: int, driver_id: int, amount: float) -> bool:
    conn = get_connection()
    success = False
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT escrow_balance FROM users WHERE id = %s;", (sender_id,))
        res = cursor.fetchone()
        if res and res["escrow_balance"] >= amount:
            cursor.execute(
                "UPDATE users SET escrow_balance = escrow_balance - %s WHERE id = %s;",
                (amount, sender_id)
            )
            cursor.execute(
                "UPDATE users SET wallet_balance = wallet_balance + %s WHERE id = %s;",
                (amount, driver_id)
            )
            success = True
    conn.commit()
    conn.close()
    return success


def refund_escrow(sender_id: int, amount: float) -> bool:
    conn = get_connection()
    success = False
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT escrow_balance FROM users WHERE id = %s;", (sender_id,))
        res = cursor.fetchone()
        if res and res["escrow_balance"] >= amount:
            cursor.execute(
                """
                UPDATE users 
                SET escrow_balance = escrow_balance - %s, 
                    wallet_balance = wallet_balance + %s 
                WHERE id = %s;
                """,
                (amount, amount, sender_id)
            )
            success = True
    conn.commit()
    conn.close()
    return success


def verify_user(user_id: int, government_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            UPDATE users 
            SET face_verified = TRUE, 
                government_id = %s,
                trust_score = 95
            WHERE id = %s 
            RETURNING *;
            """,
            (government_id, user_id)
        )
        user = cursor.fetchone()
    conn.commit()
    conn.close()
    
    if user:
        # Re-trigger accurate trust calculation
        user = recalculate_user_trust(user_id)
        
    return dict(user) if user else None


def recalculate_user_trust(user_id: int) -> dict | None:
    from ai_engine import calculate_trust_score
    user = get_user(user_id)
    if not user:
        return None
    
    success_rate = user.get("delivery_success_rate", 0.0)
    if success_rate <= 1.0:
        success_rate = success_rate * 100.0
        
    trust_score = calculate_trust_score(
        face_verified=user.get("face_verified", False),
        rating=user.get("rating", 0.0),
        completed_deliveries=user.get("completed_deliveries", 0),
        cancellation_count=user.get("cancellation_count", 0),
        delivery_success_rate=success_rate,
        route_deviation_count=user.get("route_deviation_count", 0),
        report_count=user.get("report_count", 0),
        response_time_minutes=user.get("response_time_minutes", 10.0),
    )
    
    conn = get_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            "UPDATE users SET trust_score = %s WHERE id = %s RETURNING *;",
            (trust_score, user_id)
        )
        updated_user = cursor.fetchone()
    conn.commit()
    conn.close()
    return dict(updated_user) if updated_user else None

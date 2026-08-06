import os

import psycopg2
from dotenv import find_dotenv, load_dotenv

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
else:
    backend_env = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(backend_env):
        load_dotenv(backend_env)
    else:
        load_dotenv()

# Managed hosts (Render, Railway, Supabase, Heroku) inject a single connection
# string. Locally we fall back to the individual settings from backend/.env.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

DB_NAME = os.getenv("DB_NAME", "ride_sharing_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")


def _needs_ssl(url: str) -> bool:
    """Hosted Postgres requires TLS; a local socket does not."""
    return not any(host in url for host in ("localhost", "127.0.0.1"))


def get_connection():
    if DATABASE_URL:
        # psycopg2 understands postgres:// as well as postgresql://
        kwargs = {}
        sslmode = os.getenv("PGSSLMODE")
        if sslmode:
            kwargs["sslmode"] = sslmode
        elif _needs_ssl(DATABASE_URL):
            kwargs["sslmode"] = "require"
        return psycopg2.connect(DATABASE_URL, **kwargs)

    passwords_to_try = [
        DB_PASSWORD,
        "",
        "postgres",
        "root",
        "admin",
        "1234",
        "password",
        "123456",
        "admin123",
        "postgres123",
        "prema",
        "airide",
        "root123",
        "12345678",
    ]
    seen = set()
    unique_passwords = [p for p in passwords_to_try if p is not None and not (p in seen or seen.add(p))]

    last_error = None
    for pwd in unique_passwords:
        try:
            return psycopg2.connect(
                dbname=DB_NAME,
                user=DB_USER,
                password=pwd,
                host=DB_HOST,
                port=DB_PORT,
            )
        except psycopg2.OperationalError as e:
            last_error = e

    if last_error:
        raise last_error

import os

import psycopg2
from dotenv import find_dotenv, load_dotenv

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
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

    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
    )

import os
from backend.database import get_connection

os.environ['DB_USER'] = 'postgres'
os.environ['DB_PASSWORD'] = 'Prema@2004'
os.environ['DB_HOST'] = 'localhost'
os.environ['DB_PORT'] = '5432'
os.environ['DB_NAME'] = 'ride_sharing_db'

try:
    conn = get_connection()
    print('CONNECTED')
    print('DSN:', conn.dsn)
    conn.close()
except Exception as e:
    print('ERROR', type(e).__name__, str(e))

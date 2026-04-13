"""
db.py
-----
Pool de conexiones a PostgreSQL (Railway).
Las tablas las crea y gestiona bridge.py en Railway.
"""

from psycopg2 import pool

from app.config.settings import DB_URL

_pool: pool.SimpleConnectionPool | None = None


def get_pool() -> pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=DB_URL,
        )
    return _pool


def get_conn():
    return get_pool().getconn()


def release_conn(conn):
    get_pool().putconn(conn)
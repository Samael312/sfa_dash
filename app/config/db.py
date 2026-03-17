"""
db.py
-----
Pool de conexiones a PostgreSQL (Railway).
Las tablas las crea y gestiona bridge.py en Railway.
"""

import psycopg2
from psycopg2 import pool

from settings import PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD

_pool: pool.SimpleConnectionPool | None = None


def get_pool() -> pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            host=PG_HOST,
            port=PG_PORT,
            dbname=PG_DATABASE,
            user=PG_USER,
            password=PG_PASSWORD,
        )
    return _pool


def get_conn():
    return get_pool().getconn()


def release_conn(conn):
    get_pool().putconn(conn)
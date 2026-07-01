from __future__ import annotations

import asyncio
import ssl
from logging.config import fileConfig
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings
from app.models import Base


config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def database_url(raw_url: str | None = None) -> str:
    url = (raw_url or get_settings().DATABASE_URL).strip()
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("sslmode", None)
    query.pop("sslrootcert", None)
    if (parsed.hostname or "").endswith(".pooler.supabase.com") and parsed.port == 6543:
        query.setdefault("prepared_statement_cache_size", "0")

    return urlunsplit(parsed._replace(query=urlencode(query)))


def build_connect_args() -> dict:
    raw_url = get_settings().DATABASE_URL.strip()
    parsed = urlsplit(raw_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    sslmode = query.get("sslmode", "").lower()
    hostname = parsed.hostname or ""

    connect_args = {"command_timeout": 60}
    if sslmode == "disable":
        return connect_args

    if (
        sslmode == "require"
        or hostname.endswith(".supabase.co")
        or hostname.endswith(".pooler.supabase.com")
    ):
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = context

    return connect_args


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = database_url()
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=build_connect_args(),
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

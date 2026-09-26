"""Read-only schema/security audit. Run from backend: python scripts/audit_database.py."""

import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect, text

from app.database.connection import engine
from app.models import Base


def compare_schema(connection):
    inspector = inspect(connection)
    for name, table in Base.metadata.tables.items():
        if not inspector.has_table(name):
            print("MISSING TABLE:", name)
            continue
        columns = {column["name"]: column for column in inspector.get_columns(name)}
        for column in table.columns:
            live = columns.get(column.name)
            if live is None:
                print("MISSING COLUMN:", name, column.name)
            elif str(column.type.compile(dialect=connection.dialect)) != str(live["type"]):
                print("TYPE DIFFERENCE:", name, column.name, column.type, live["type"])
            elif column.nullable != live["nullable"]:
                print("NULLABILITY DIFFERENCE:", name, column.name)
        indexes = {index["name"] for index in inspector.get_indexes(name)}
        for index in table.indexes:
            if index.name not in indexes:
                print("MISSING INDEX:", name, index.name)
        foreign_keys = {tuple(key["constrained_columns"]) for key in inspector.get_foreign_keys(name)}
        for constraint in table.foreign_key_constraints:
            if tuple(column.name for column in constraint.columns) not in foreign_keys:
                print("MISSING FOREIGN KEY:", name, tuple(column.name for column in constraint.columns))


async def main():
    try:
        async with asyncio.timeout(30):
            async with engine.connect() as connection:
                print("Migration:", (await connection.execute(text("SELECT version_num FROM alembic_version"))).scalars().all())
                rows = await connection.execute(text("""
                    SELECT c.relname, c.relrowsecurity
                    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
                """))
                for name, enabled in rows:
                    print("RLS:", name, "enabled" if enabled else "DISABLED")
                policies = await connection.execute(text("""
                    SELECT tablename, policyname, roles, cmd
                    FROM pg_policies WHERE schemaname='public' ORDER BY tablename
                """))
                for row in policies:
                    print("POLICY:", tuple(row))
                privileges = await connection.execute(text("""
                    SELECT table_name, grantee, privilege_type FROM information_schema.table_privileges
                    WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated')
                    ORDER BY table_name, grantee, privilege_type
                """))
                for row in privileges:
                    print("BROWSER GRANT:", tuple(row))
                await connection.run_sync(compare_schema)
        return 0
    except Exception as error:
        # Connection exceptions can contain URLs or SQL parameters. Never print them.
        print("Database audit could not connect/complete:", type(error).__name__)
        return 1
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

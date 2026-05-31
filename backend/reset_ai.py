import asyncio
from dotenv import load_dotenv
load_dotenv()
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

url = os.getenv('DATABASE_URL').replace('postgresql://', 'postgresql+asyncpg://')
engine = create_async_engine(url)
Session = sessionmaker(engine, class_=AsyncSession)

async def run():
    async with Session() as s:
        await s.execute(text('UPDATE users SET ai_messages_used_today=0'))
        await s.commit()
        print('AI limit reset for all users!')

asyncio.run(run())

import asyncio
import config
from maj_soul_api import get_token, stored_token
import discord

async def main():
    await get_token(config.MS_USERNAME, config.MS_PASSWORD)
    config.MS_TOKEN = stored_token
    print("✅ Logged in to Mahjong Soul API")
    print("Token:", config.MS_TOKEN)
    await bot.start(config.BOT_TOKEN)

if __name__ == "__main__":
    asyncio.run(main())

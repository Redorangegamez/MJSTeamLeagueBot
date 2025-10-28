import asyncio
import discord
from discord.ext import tasks
import config
from maj_soul_api import get_token, stored_token
from majsoul_tracker import get_readied_players, CONFIG

intents = discord.Intents.default()
intents.message_content = True
bot = discord.Client(intents=intents)

status_message = None  # Discord message to update

@bot.event
async def on_ready():
    print(f"✅ Logged in as {bot.user}")
    update_status.start()

@tasks.loop(seconds=30)
async def update_status():
    """Background task that updates the Discord message."""
    global status_message
    content = await get_readied_players(CONFIG["lobby"], CONFIG["season"])
    channel = bot.get_channel(config.STATUS_CHANNEL_ID)

    if status_message is None:
        status_message = await channel.send(content)
    else:
        await status_message.edit(content=content)

async def main():
    await get_token(config.MS_USERNAME, config.MS_PASSWORD)
    config.MS_TOKEN = stored_token
    print("✅ Logged in to Mahjong Soul API")
    print("Token:", config.MS_TOKEN)
    await bot.start(config.BOT_TOKEN)

if __name__ == "__main__":
    asyncio.run(main())

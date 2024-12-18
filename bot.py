import discord
from discord.ext import tasks
import hashlib

import config
from scrap import get_message


intents = discord.Intents.default()
intents.message_content = True

bot = discord.Client(intents=intents)

@bot.event
async def on_ready():
    print(f'We have logged in as {bot.user}')
    channel = bot.get_channel(config.CHANNEL_ID)

    msg = await channel.send(content="No game yet!")

    task.msg_id   = msg.id
    task.prev_hsh = None
    task.channel  = channel
    task.start()

@tasks.loop(seconds=config.UPDATE_PERIOD)
async def task():
    new_msg = get_message()
    new_hsh = hashlib.sha256(new_msg.encode()).hexdigest()

    print(f"{task.prev_hsh}, {new_hsh}")

    if task.prev_hsh == new_hsh:
        return

    task.prev_hsh = new_hsh
    msg = await task.channel.fetch_message(task.msg_id)
    await msg.edit(content=new_msg)


bot.run(config.BOT_TOKEN)
import discord
from discord.ext import tasks
import time

import config
from scrap import load_games, check_config
from utils import *


intents = discord.Intents.default()
intents.message_content = True

bot = discord.Client(intents=intents)

@bot.event
async def on_ready():
    check_config()
    print(f'We have logged in as {bot.user}')

    # clear all message in channel
    task.indv_channel = bot.get_channel(config.INDV_CHANNEL_ID)
    task.team_channel = bot.get_channel(config.TEAM_CHANNEL_ID)

    async def clear_channel(channel):
        async for message in channel.history(limit=100):
            await message.delete()
            time.sleep(1)

    await clear_channel(task.indv_channel)
    await clear_channel(task.team_channel)

    task.indv_msg_ids = []
    for i in range(4):
        msg = await task.indv_channel.send(content="``` \n```")
        task.indv_msg_ids.append(msg.id)

    msg = await task.team_channel.send(content="``` \n```")
    task.team_msg_id = msg.id

    task.username2name = get_username2name_mapping()
    name2team = get_username2team_mapping()

    task.username2team = {}

    for username, name in task.username2name.items():
        if name not in name2team:
            print(f"Hey {name}, you are not in the team list WTF")
            continue
        task.username2team[username] = name2team[name]

    task.all_players   = list(task.username2name.keys())

    task.start()

@tasks.loop(seconds=config.UPDATE_PERIOD)
async def task():
    games = load_games()
    indv_result = calculate_score(games, task.all_players, task.username2name)
    team_result = calculate_score(games, task.all_players, task.username2team)

    indv = format_leaderboard(indv_result)
    # assert len(indv) == 4, f"number of messages don't match for indv leaderboard {len(indv)} != {len(task.indv_msg_ids)}" 
    for i in range(len(indv)):
        msg_id = task.indv_msg_ids[i]
        msg = await task.indv_channel.fetch_message(msg_id)
        await msg.edit(content=indv[i])


    team = format_leaderboard(team_result)
    assert len(team) == 1, str(len(team))
    team_msg = team[0]
    msg = await task.team_channel.fetch_message(task.team_msg_id)
    await msg.edit(content=team_msg)


bot.run(config.BOT_TOKEN)
import asyncio
import discord
from discord.ext import tasks, commands
import config
import time

from majsoul_api import *
from majsoul_tracker import get_readied_players
from scrap import check_config
from utils import *

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

leaderboard_started = False
status_started = False


# ---------------- SAFE CHANNEL FETCH ---------------- #

async def safe_fetch_channel(channel_id):
    try:
        return await bot.fetch_channel(channel_id)
    except Exception as e:
        print(f"Failed to fetch channel {channel_id}: {e}")
        return None


# ---------------- MESSAGE HELPERS ---------------- #

async def get_or_create_message(channel, msg_list, index):
    """
    Ensures message exists at index.
    If missing → create once.
    """
    try:
        if index < len(msg_list):
            return msg_list[index]
    except:
        pass

    msg = await channel.send("``` ```")
    msg_list.append(msg)
    return msg


# ---------------- BOT READY ---------------- #

@bot.event
async def on_ready():
    print("ENTERED on_ready")

    check_config()
    print("AFTER check_config")

    status_loop.channel = await safe_fetch_channel(config.STATUS_CHANNEL_ID)
    print("STATUS CHANNEL:", status_loop.channel)

    leaderboard_loop.indv_channel = await safe_fetch_channel(config.INDV_CHANNEL_ID)
    print("INDV CHANNEL:", leaderboard_loop.indv_channel)

    leaderboard_loop.team_channel = await safe_fetch_channel(config.TEAM_CHANNEL_ID)
    print("TEAM CHANNEL:", leaderboard_loop.team_channel)
    leaderboard_loop.sanma_indv_channel = await safe_fetch_channel(config.SANMA_INDV_CHANNEL_ID)
    leaderboard_loop.sanma_team_channel = await safe_fetch_channel(config.SANMA_TEAM_CHANNEL_ID)

    if not all([
        status_loop.channel,
        leaderboard_loop.indv_channel,
        leaderboard_loop.team_channel
    ]):
        print("Missing channels — aborting startup")
        return

    # mappings
    leaderboard_loop.username2name = get_username2name_mapping()
    name2team = get_username2team_mapping()
    print('got names')
    leaderboard_loop.username2team = {}

    for u, name in leaderboard_loop.username2name.items():
        if name in name2team:
            leaderboard_loop.username2team[u] = name2team[name]
    print('got name mapping')
    leaderboard_loop.all_players = list(leaderboard_loop.username2name.keys())

    # init message storage
    leaderboard_loop.indv_msgs = []
    leaderboard_loop.team_msg = None
    leaderboard_loop.sanma_indv_msgs = []
    leaderboard_loop.sanma_team_msg = None

    if not leaderboard_started:
        print("LEADERBOARD LOOP TICK")
        leaderboard_loop.start()
        leaderboard_started = True

    if not status_started:
        print("LEADERBOARD LOOP TICK")
        status_loop.start()
        status_started = True


# ---------------- LEADERBOARD LOOP ---------------- #

@tasks.loop(seconds=config.LEADERBOARD_UPDATE_PERIOD)
async def leaderboard_loop():
    try:
        print("LEADERBOARD LOOP TICK")

        games = await load_games(config.TOURN_ID, config.SEASON_ID)

        print("Games loaded:", len(games))

        indv_result = calculate_score(
            games,
            leaderboard_loop.all_players,
            leaderboard_loop.username2name
        )

        print("Score calculated")

        indv_rows = format_leaderboard(indv_result)

        print("Formatted rows:", len(indv_rows))

        chunks = [indv_rows[i:i+25] for i in range(0, len(indv_rows), 25)]

        for i, chunk in enumerate(chunks):
            msg = await get_or_create_message(
                leaderboard_loop.indv_channel,
                leaderboard_loop.indv_msgs,
                i
            )

            content = "```" + "\n".join(chunk) + "```"
            await msg.edit(content=content)

    except Exception as e:
        print("❌ leaderboard_loop crashed:", repr(e))

    # delete extra old messages if shrinking
    while len(leaderboard_loop.indv_msgs) > len(chunks):
        msg = leaderboard_loop.indv_msgs.pop()
        await msg.delete()

    # -------- TEAM LEADERBOARD -------- #
    team_content = "```" + "\n".join(team_rows)
    team_content += f"\nLast update: <t:{timestamp}:R>```"

    if leaderboard_loop.team_msg is None:
        leaderboard_loop.team_msg = await leaderboard_loop.team_channel.send("``` ```")

    await leaderboard_loop.team_msg.edit(content=team_content)


# ---------------- STATUS LOOP ---------------- #

@tasks.loop(seconds=config.STATUS_UPDATE_PERIOD)
async def status_loop():
    try:
        four_p = await get_readied_players(config.TOURN_ID, config.SEASON_ID, 4)
        sanma = await get_readied_players(config.SANMA_TOURN_ID, config.SANMA_SEASON_ID, 3)

        timestamp = int(time.time())

        content = ""

        if four_p:
            content += f"## 4-Player Lobby\n{four_p}\n\n"

        if sanma:
            content += f"## 3-Player Lobby\n{sanma}\n\n"

        content += f"Last update: <t:{timestamp}:R>"

        if not hasattr(status_loop, "msg"):
            status_loop.msg = await status_loop.channel.send("``` ```")

        await status_loop.msg.edit(content=content)

    except Exception as e:
        print("Status loop error:", e)


# ---------------- MAIN ---------------- #

async def main():
    token = await get_token(config.MS_USERNAME, config.MS_PASSWORD)

    if not token:
        print("Failed to get Mahjong Soul token")
        return

    config.MS_TOKEN = token
    print("Logged into Mahjong Soul API")

    await bot.start(config.BOT_TOKEN)


if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import discord
from discord.ext import tasks, commands
import config
import time

from majsoul_api import *
from majsoul_tracker import get_readied_players
from scrap import check_config
from utils import *

# ---------------- BOT SETUP ---------------- #

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)


# ---------------- STATE (NO FUNCTION MUTATION) ---------------- #

state = {
    "indv_msgs": [],
    "team_msg": None,
    "sanma_indv_msgs": [],
    "sanma_team_msg": None,
    "players": [],
    "username2name": {},
    "username2team": {},
    "channels": {}
}


# ---------------- SAFE HELPERS ---------------- #

async def safe_fetch(channel_id):
    try:
        return await bot.fetch_channel(channel_id)
    except Exception as e:
        print(f"Failed to fetch channel {channel_id}: {e}")
        return None


async def get_or_create(channel, msg_list, index):
    if index < len(msg_list):
        return msg_list[index]

    msg = await channel.send("``` ```")
    msg_list.append(msg)
    return msg


# ---------------- LIFECYCLE HOOK ---------------- #

@bot.event
async def setup_hook():
    """
    Correct place to start tasks.
    Runs once BEFORE bot is fully ready.
    """

    check_config()
    print("setup_hook running...")

    # preload mappings (safe here)
    username2name = get_username2name_mapping()
    name2team = get_username2team_mapping()

    state["username2name"] = username2name
    state["username2team"] = {}

    for u, name in username2name.items():
        if name in name2team:
            state["username2team"][u] = name2team[name]

    state["players"] = list(username2name.keys())

    # start tasks safely
    leaderboard_task.start()
    status_task.start()


# ---------------- ON READY (LOG ONLY) ---------------- #

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")


# ---------------- TASK: LEADERBOARD ---------------- #

@tasks.loop(seconds=config.LEADERBOARD_UPDATE_PERIOD)
async def leaderboard_task():

    games = await load_games(config.TOURN_ID, config.SEASON_ID)

    indv = calculate_score(
        games,
        state["players"],
        state["username2name"]
    )

    team = calculate_score(
        games,
        state["players"],
        state["username2team"]
    )

    timestamp = int(time.time())

    indv_rows = format_leaderboard(indv)
    team_rows = format_leaderboard(team)

    # chunk for 103+ players
    chunks = [indv_rows[i:i+25] for i in range(0, len(indv_rows), 25)]

    channel = state["channels"].get("indv")

    if not channel:
        channel = await safe_fetch(config.INDV_CHANNEL_ID)
        state["channels"]["indv"] = channel

    if not channel:
        print("INDV channel missing")
        return

    # update individual leaderboard
    for i, chunk in enumerate(chunks):

        msg = await get_or_create(channel, state["indv_msgs"], i)

        content = "```" + "\n".join(chunk)
        content += f"\nLast update: <t:{timestamp}:R>```"

        await msg.edit(content=content)

    # team leaderboard (single message)
    team_channel = state["channels"].get("team")

    if not team_channel:
        team_channel = await safe_fetch(config.TEAM_CHANNEL_ID)
        state["channels"]["team"] = team_channel

    if not team_channel:
        print("TEAM channel missing")
        return

    if state["team_msg"] is None:
        state["team_msg"] = await team_channel.send("``` ```")

    team_content = "```" + "\n".join(team_rows)
    team_content += f"\nLast update: <t:{timestamp}:R>```"

    await state["team_msg"].edit(content=team_content)


# ---------------- TASK: STATUS ---------------- #

@tasks.loop(seconds=config.STATUS_UPDATE_PERIOD)
async def status_task():

    try:
        four_p = await get_readied_players(
            config.TOURN_ID,
            config.SEASON_ID,
            4
        )

        sanma = await get_readied_players(
            config.SANMA_TOURN_ID,
            config.SANMA_SEASON_ID,
            3
        )

        timestamp = int(time.time())

        content = ""

        if four_p:
            content += f"## 4-Player Lobby\n{four_p}\n\n"

        if sanma:
            content += f"## 3-Player Lobby\n{sanma}\n\n"

        content += f"Last update: <t:{timestamp}:R>"

        channel = state["channels"].get("status")

        if not channel:
            channel = await safe_fetch(config.STATUS_CHANNEL_ID)
            state["channels"]["status"] = channel

        if not channel:
            print("STATUS channel missing")
            return

        if not hasattr(status_task, "msg"):
            status_task.msg = await channel.send("``` ```")

        await status_task.msg.edit(content=content)

    except Exception as e:
        print("status_task error:", repr(e))


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

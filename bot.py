import asyncio
import discord
from discord.ext import tasks, commands
import time
import traceback

import config
from majsoul_api import *
from majsoul_tracker import get_readied_players
from scrap import check_config
from utils import *

# ---------------- BOT ---------------- #

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# ---------------- STATE ---------------- #

state = {
    "indv_msg_ids": [],
    "team_msg_id": None,
    "status_msg_id": None,
    "players": [],
    "username2name": {},
    "username2team": {},
    "channels": {}
}

# ---------------- HELPERS ---------------- #

def timestamp():
    return f"Last update: <t:{int(time.time())}:R>"

async def safe_fetch(channel_id, name):
    try:
        return await bot.fetch_channel(channel_id)
    except Exception as e:
        print(f"[FETCH ERROR] {name}: {e}")
        return None

async def safe_edit(channel, msg_id, content):
    """
    Always fetch fresh message before editing (prevents 404 crash)
    """
    try:
        msg = await channel.fetch_message(msg_id)
        await msg.edit(content=content)

    except discord.NotFound:
        print("[WARN] message missing, recreating")
        new_msg = await channel.send("starting...")
        return new_msg.id

    return msg_id

# ---------------- SETUP ---------------- #

@bot.event
async def setup_hook():
    print("[SETUP] starting")

    check_config()

    state["username2name"] = get_username2name_mapping()
    name2team = get_username2team_mapping()

    state["username2team"] = {
        u: name2team[name]
        for u, name in state["username2name"].items()
        if name in name2team
    }

    state["players"] = list(state["username2name"].keys())

    leaderboard_task.start()
    status_task.start()

    print("[SETUP] tasks started")

@bot.event
async def on_ready():
    print(f"[READY] Logged in as {bot.user}")

# ---------------- LEADERBOARD ---------------- #

@tasks.loop(seconds=config.LEADERBOARD_UPDATE_PERIOD)
async def leaderboard_task():

    try:
        games = await load_games(config.TOURN_ID, config.SEASON_ID)

        indv = calculate_score(games, state["players"], state["username2name"])
        team = calculate_score(games, state["players"], state["username2team"])

        indv_rows = format_leaderboard(indv)
        team_rows = format_leaderboard(team)

        # ---------------- INDIVIDUAL ---------------- #

        if "indv" not in state["channels"]:
            state["channels"]["indv"] = await safe_fetch(
                config.INDV_CHANNEL_ID,
                "INDV"
            )

        indv_ch = state["channels"]["indv"]
        if not indv_ch:
            return

        # restore messages ONCE
        if not state["indv_msg_ids"]:

            print("[INDV] restoring messages")

            async for msg in indv_ch.history(limit=50, oldest_first=False):
                if msg.author == bot.user:
                    state["indv_msg_ids"].append(msg.id)

            state["indv_msg_ids"].reverse()

            print(f"[INDV] restored {len(state['indv_msg_ids'])}")

        # create missing messages ONLY if needed
        while len(state["indv_msg_ids"]) < len(indv_rows):
            msg = await indv_ch.send("starting...")
            state["indv_msg_ids"].append(msg.id)

        # edit messages
        for i, (msg_id, content) in enumerate(zip(state["indv_msg_ids"], indv_rows)):

            if i == len(indv_rows) - 1:
                content += "\n" + timestamp()

            state["indv_msg_ids"][i] = await safe_edit(indv_ch, msg_id, content)

        # ---------------- TEAM ---------------- #

        if "team" not in state["channels"]:
            state["channels"]["team"] = await safe_fetch(
                config.TEAM_CHANNEL_ID,
                "TEAM"
            )

        team_ch = state["channels"]["team"]
        if not team_ch:
            return

        team_content = "\n".join(team_rows) + "\n" + timestamp()

        if state["team_msg_id"] is None:
            msg = await team_ch.send("starting...")
            state["team_msg_id"] = msg.id

        state["team_msg_id"] = await safe_edit(
            team_ch,
            state["team_msg_id"],
            team_content
        )

    except Exception:
        print("[LEADERBOARD ERROR]")
        traceback.print_exc()

# ---------------- STATUS ---------------- #

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

        content = ""

        if four_p:
            content += f"## 4P\n{four_p}\n\n"

        if sanma:
            content += f"## 3P\n{sanma}\n\n"

        content += timestamp()

        if "status" not in state["channels"]:
            state["channels"]["status"] = await safe_fetch(
                config.STATUS_CHANNEL_ID,
                "STATUS"
            )

        ch = state["channels"]["status"]
        if not ch:
            return

        if state["status_msg_id"] is None:
            msg = await ch.send("starting...")
            state["status_msg_id"] = msg.id

        state["status_msg_id"] = await safe_edit(
            ch,
            state["status_msg_id"],
            content
        )

    except Exception:
        print("[STATUS ERROR]")
        traceback.print_exc()

# ---------------- MAIN ---------------- #

async def main():

    try:
        token = await get_token(
            config.MS_USERNAME,
            config.MS_PASSWORD
        )

        if not token:
            print("[MAIN] no token")
            return

        config.MS_TOKEN = token

        await bot.start(config.BOT_TOKEN)

    except Exception:
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())

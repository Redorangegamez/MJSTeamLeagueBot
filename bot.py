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

# ---------------- SAFE FETCH ---------------- #

async def safe_fetch(channel_id, name):
    try:
        ch = await bot.fetch_channel(channel_id)
        print(f"[FETCH] OK {name}")
        return ch
    except Exception as e:
        print(f"[FETCH ERROR] {name}: {e}")
        return None

# ---------------- SAFE EDIT ---------------- #

async def safe_edit(channel, msg_id, content, fallback_send):
    try:
        msg = await channel.fetch_message(msg_id)
        return await msg.edit(content=content)

    except discord.NotFound:
        print("[WARN] message missing, recreating")
        msg = await fallback_send()
        return msg

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

# ---------------- READY ---------------- #

@bot.event
async def on_ready():
    print(f"[READY] Logged in as {bot.user}")

# ---------------- HELPERS ---------------- #

def build_timestamp():
    return f"Last update: <t:{int(time.time())}:R>"

# ---------------- LEADERBOARD TASK ---------------- #

@tasks.loop(seconds=config.LEADERBOARD_UPDATE_PERIOD)
async def leaderboard_task():

    try:
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

        indv_rows = format_leaderboard(indv)
        team_rows = format_leaderboard(team)

        # ---------------- INDV ---------------- #

        if "indv" not in state["channels"]:
            state["channels"]["indv"] = await safe_fetch(
                config.INDV_CHANNEL_ID,
                "INDV"
            )

        indv_ch = state["channels"]["indv"]

        if not indv_ch:
            return

        while len(state["indv_msg_ids"]) < len(indv_rows):
            msg = await indv_ch.send("starting...")
            state["indv_msg_ids"].append(msg.id)

        for i, (msg_id, content) in enumerate(zip(state["indv_msg_ids"], indv_rows)):

            content = content + "\n" + build_timestamp()

            await safe_edit(
                indv_ch,
                msg_id,
                content,
                lambda: indv_ch.send("starting...")
            )

        # ---------------- TEAM ---------------- #

        if "team" not in state["channels"]:
            state["channels"]["team"] = await safe_fetch(
                config.TEAM_CHANNEL_ID,
                "TEAM"
            )

        team_ch = state["channels"]["team"]

        if not team_ch:
            return

        team_content = "\n".join(team_rows)
        team_content += "\n" + build_timestamp()

        if state["team_msg_id"] is None:
            msg = await team_ch.send("starting...")
            state["team_msg_id"] = msg.id

        await safe_edit(
            team_ch,
            state["team_msg_id"],
            team_content,
            lambda: team_ch.send("starting...")
        )

    except Exception:
        print("[LEADERBOARD ERROR]")
        traceback.print_exc()

# ---------------- STATUS TASK ---------------- #

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

        content += build_timestamp()

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

        await safe_edit(
            ch,
            state["status_msg_id"],
            content,
            lambda: ch.send("starting...")
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

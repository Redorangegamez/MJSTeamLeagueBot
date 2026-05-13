import asyncio
import discord
from discord.ext import tasks, commands
import config
import time
import traceback

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
    "indv_msgs": [],
    "team_msg": None,
    "status_msg": None,
    "players": [],
    "username2name": {},
    "username2team": {},
    "channels": {}
}


# ---------------- SAFE FETCH ---------------- #

async def safe_fetch(channel_id, name):
    try:
        print(f"[FETCH] Trying channel {name} ({channel_id})")
        ch = await bot.fetch_channel(channel_id)
        print(f"[FETCH] OK {name}: {ch}")
        return ch
    except Exception as e:
        print(f"[FETCH ERROR] {name}: {e}")
        return None

# ---------------- SAFE EDIT ---------------- #

async def safe_edit(msg, content, send_fallback):
    try:
        await msg.edit(content=content)
        return msg

    except discord.NotFound:
        print("[WARN] Message missing, recreating...")

        new_msg = await send_fallback()
        await new_msg.edit(content=content)

        return new_msg


# ---------------- SETUP HOOK ---------------- #

@bot.event
async def setup_hook():
    print("[SETUP] setup_hook started")

    try:
        check_config()
        print("[SETUP] config OK")

        username2name = get_username2name_mapping()
        name2team = get_username2team_mapping()

        print("[SETUP] mappings loaded")

        state["username2name"] = username2name
        state["username2team"] = {}

        for u, name in username2name.items():
            if name in name2team:
                state["username2team"][u] = name2team[name]

        state["players"] = list(username2name.keys())

        print(f"[SETUP] players loaded: {len(state['players'])}")

        print("[SETUP] starting tasks...")
        leaderboard_task.start()
        status_task.start()

        print("[SETUP] tasks started")

    except Exception as e:
        print("[SETUP ERROR]")
        traceback.print_exc()


# ---------------- READY ---------------- #

@bot.event
async def on_ready():
    print(f"[READY] Logged in as {bot.user}")


# ---------------- LEADERBOARD LOOP ---------------- #

@tasks.loop(seconds=config.LEADERBOARD_UPDATE_PERIOD)
async def leaderboard_task():

    print("\n[LEADERBOARD] tick started")

    try:
        print("[LEADERBOARD] loading games...")
        games = await load_games(config.TOURN_ID, config.SEASON_ID)

        print(f"[LEADERBOARD] games loaded: {len(games)}")

        print("[LEADERBOARD] calculating score...")
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

        print("[LEADERBOARD] score done")

        indv_rows = format_leaderboard(indv)
        team_rows = format_leaderboard(team)

        print(f"[LEADERBOARD] rows: {len(indv_rows)}")

        chunks = [indv_rows[i:i+25] for i in range(0, len(indv_rows), 25)]

        print(f"[LEADERBOARD] chunks: {len(chunks)}")

        # ---------------- INDIVIDUAL ---------------- #

        if "indv" not in state["channels"]:
            print("[LEADERBOARD] fetching INDV channel")
            state["channels"]["indv"] = await safe_fetch(
                config.INDV_CHANNEL_ID,
                "INDV"
            )
        
        ch = state["channels"]["indv"]
        
        if not ch:
            print("[LEADERBOARD] INDV channel missing - abort")
            return
        
        # Get leaderboard rows (already chunked + formatted safely)
        indv_rows = format_leaderboard(indv)
        
        # ---------------- LOAD EXISTING MESSAGES ---------------- #
        
        if not state["indv_msgs"]:
        
            print("[LEADERBOARD] loading existing INDV messages")
        
            async for msg in ch.history(limit=50, oldest_first=False):
        
                if msg.author == bot.user:
                    state["indv_msgs"].append(msg)
        
            # ensure correct order
            state["indv_msgs"].reverse()
        
            print(f"[LEADERBOARD] found {len(state['indv_msgs'])} messages")
        
        # ---------------- CREATE MISSING MESSAGES ---------------- #
        
        while len(state["indv_msgs"]) < len(indv_rows):
        
            print("[LEADERBOARD] creating missing INDV message")
        
            msg = await ch.send("starting...")
            state["indv_msgs"].append(msg)
        
        # ---------------- EDIT MESSAGES ---------------- #
        
        for i, (msg, content) in enumerate(zip(state["indv_msgs"], indv_rows)):
            state["indv_msgs"][i] = await safe_edit(
                msg,
                content,
                lambda: ch.send("starting...")
            )
        
        print("[LEADERBOARD] INDIVIDUAL leaderboard updated")
        
        
        # ---------------- TEAM ---------------- #
        
        if "team" not in state["channels"]:
            print("[LEADERBOARD] fetching TEAM channel")
            state["channels"]["team"] = await safe_fetch(
                config.TEAM_CHANNEL_ID,
                "TEAM"
            )
        
        team_ch = state["channels"]["team"]
        
        if not team_ch:
            print("[LEADERBOARD] TEAM channel missing")
            return
        
        # Find existing team message after restart
        if state["team_msg"] is None:
        
            print("[LEADERBOARD] searching for existing team message")
        
            async for msg in team_ch.history(limit=50):
        
                if msg.author == bot.user:
                    state["team_msg"] = msg
                    print(f"[LEADERBOARD] found existing team message: {msg.id}")
                    break
        
        # Create one if none exists
        if state["team_msg"] is None:
        
            print("[LEADERBOARD] creating new team message")
        
            state["team_msg"] = await team_ch.send("starting...")
        
        # Edit team leaderboard
        team_content = "\n".join(team_rows)
        
        print("[LEADERBOARD] editing team message")
        
        state["team_msg"] = await safe_edit(
            state["team_msg"],
            team_content,
            lambda: team_ch.send("starting...")
        )
        
        print("[LEADERBOARD] team leaderboard updated")

    except Exception as e:
        print("[LEADERBOARD ERROR]")
        traceback.print_exc()


# ---------------- STATUS LOOP ---------------- #

@tasks.loop(seconds=config.STATUS_UPDATE_PERIOD)
async def status_task():

    print("\n[STATUS] tick started")

    try:
        print("[STATUS] fetching data...")

        four_p = await get_readied_players(config.TOURN_ID, config.SEASON_ID, 4)
        sanma = await get_readied_players(config.SANMA_TOURN_ID, config.SANMA_SEASON_ID, 3)

        print("[STATUS] data fetched")

        content = ""

        if four_p:
            content += f"## 4P\n{four_p}\n\n"

        if sanma:
            content += f"## 3P\n{sanma}\n\n"

        content += f"Last update: <t:{int(time.time())}:R>"

        if "status" not in state["channels"]:
            print("[STATUS] fetching channel")
            state["channels"]["status"] = await safe_fetch(config.STATUS_CHANNEL_ID, "STATUS")

        ch = state["channels"]["status"]

        if not ch:
            print("[STATUS] missing channel")
            return

        if state["status_msg"] is None:
            print("[STATUS] searching for existing status message")
            async for msg in ch.history(limit=50):
                if msg.author == bot.user:
                    state["status_msg"] = msg
                    print(f"[STATUS] found existing message: {msg.id}")
                    break
    
        if state["status_msg"] is None:
            print("[STATUS] sending new status msg")
            state["status_msg"] = await ch.send("starting...")
    
        print("[STATUS] editing msg")
        state["status_msg"] = await safe_edit(
            state["status_msg"],
            content,
            lambda: ch.send("starting...")
        )

        print("[STATUS] tick finished")

    except Exception:
        print("[STATUS ERROR]")
        traceback.print_exc()


# ---------------- MAIN ---------------- #

async def main():
    print("[MAIN] starting")

    try:
        token = await get_token(config.MS_USERNAME, config.MS_PASSWORD)

        print("[MAIN] token result:", token)

        if not token:
            print("[MAIN] FAILED to get token")
            return

        config.MS_TOKEN = token

        print("[MAIN] starting bot")
        await bot.start(config.BOT_TOKEN)

    except Exception:
        print("[MAIN ERROR]")
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())

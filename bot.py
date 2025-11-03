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

status_message = None

leaderboard_started = False
status_started = False

@bot.command()
async def pause(ctx, nickname: str):
    """Pause a running game by player nickname in default lobby."""
    try:
        lobby = config.TOURN_ID  # or SANMA_TOURN_ID depending on type
        game_uuid = await find_player_game(lobby, config.SEASON_ID, nickname)
        if not game_uuid:
            await ctx.send(f"⚠️ No active game found for player {nickname}.")
            return

        res = await pause_game(lobby, game_uuid)
        if res.get("error"):
            await ctx.send(f"⚠️ Failed to pause game: {res['error']}")
        else:
            await ctx.send(f"✅ Game for {nickname} paused successfully.")
    except Exception as e:
        await ctx.send(f"❌ Exception occurred: {e}")


@bot.command()
async def resume(ctx, nickname: str):
    """Resume a paused game by player nickname in default lobby."""
    try:
        lobby = config.TOURN_ID
        game_uuid = await find_player_game(lobby, config.SEASON_ID, nickname)
        if not game_uuid:
            await ctx.send(f"⚠️ No active game found for player {nickname}.")
            return

        res = await resume_game(lobby, game_uuid)
        if res.get("error"):
            await ctx.send(f"⚠️ Failed to resume game: {res['error']}")
        else:
            await ctx.send(f"✅ Game for {nickname} resumed successfully.")
    except Exception as e:
        await ctx.send(f"❌ Exception occurred: {e}")

@bot.event
async def on_ready():
    global leaderboard_started, status_started
    check_config()
    print(f'We have logged in as {bot.user}')

    # clear all messages in status channel
    status_loop.channel = bot.get_channel(config.STATUS_CHANNEL_ID)
    
    # clear all message in leaderboard channels
    leaderboard_loop.indv_channel = bot.get_channel(config.INDV_CHANNEL_ID)
    leaderboard_loop.team_channel = bot.get_channel(config.TEAM_CHANNEL_ID)
    leaderboard_loop.sanma_indv_channel = bot.get_channel(config.SANMA_INDV_CHANNEL_ID)
    leaderboard_loop.sanma_team_channel = bot.get_channel(config.SANMA_TEAM_CHANNEL_ID)
    
    async def clear_channel(channel):
        async for message in channel.history(limit=100):
            await message.delete()
            time.sleep(1)

    await clear_channel(leaderboard_loop.indv_channel)
    await clear_channel(leaderboard_loop.team_channel)
    await clear_channel(leaderboard_loop.sanma_indv_channel)
    await clear_channel(leaderboard_loop.sanma_team_channel)
    await clear_channel(status_loop.channel)
    
    leaderboard_loop.indv_msg_ids = []
    for i in range(4):
        msg = await leaderboard_loop.indv_channel.send(content="``` \n```")
        leaderboard_loop.indv_msg_ids.append(msg.id)

    msg = await leaderboard_loop.team_channel.send(content="``` \n```")
    leaderboard_loop.team_msg_id = msg.id

    leaderboard_loop.sanma_indv_msg_ids = []
    for i in range(4):
        msg = await leaderboard_loop.sanma_indv_channel.send(content="``` \n```")
        leaderboard_loop.sanma_indv_msg_ids.append(msg.id)

    msg = await leaderboard_loop.sanma_team_channel.send(content="``` \n```")
    leaderboard_loop.sanma_team_msg_id = msg.id

    leaderboard_loop.username2name = get_username2name_mapping()
    name2team = get_username2team_mapping()

    leaderboard_loop.username2team = {}

    for username, name in leaderboard_loop.username2name.items():
        if name not in name2team:
            print(f"Hey {name}, you are not in the team list WTF")
            continue
        leaderboard_loop.username2team[username] = name2team[name]
    leaderboard_loop.all_players = list(leaderboard_loop.username2name.keys())

    if not leaderboard_started:
        leaderboard_loop.start()
        leaderboard_started = True
    if not status_started:
        status_loop.start()
        status_started = True

@tasks.loop(seconds=config.LEADERBOARD_UPDATE_PERIOD)
async def leaderboard_loop():
    games = await load_games(config.TOURN_ID, config.SEASON_ID)
    indv_result = calculate_score(games, leaderboard_loop.all_players, leaderboard_loop.username2name)
    team_result = calculate_score(games, leaderboard_loop.all_players, leaderboard_loop.username2team)

    indv = format_leaderboard(indv_result)
    # assert len(indv) == 4, f"number of messages don't match for indv leaderboard {len(indv)} != {len(task.indv_msg_ids)}" 
    for i in range(len(indv)):
        msg_id = leaderboard_loop.indv_msg_ids[i]
        msg = await leaderboard_loop.indv_channel.fetch_message(msg_id)
        await msg.edit(content=indv[i])
    print(team_result)
    team = format_leaderboard(team_result)
    print(team)
    print(team[0])
    assert len(team) == 1, str(len(team))
    team_msg = team[0]
    msg = await leaderboard_loop.team_channel.fetch_message(leaderboard_loop.team_msg_id)
    await msg.edit(content=team_msg)

    # printPointDifferences(games, leaderboard_loop.all_players, leaderboard_loop.username2name)

    # sanma task

    games = await load_games(config.SANMA_TOURN_ID, config.SANMA_SEASON_ID)
    indv_result = calculate_score(games, leaderboard_loop.all_players, leaderboard_loop.username2name)
    team_result = calculate_score(games, leaderboard_loop.all_players, leaderboard_loop.username2team)

    indv = format_leaderboard(indv_result)
    # assert len(indv) == 4, f"number of messages don't match for indv leaderboard {len(indv)} != {len(leaderboard_loop.indv_msg_ids)}" 
    for i in range(len(indv)):
        msg_id = leaderboard_loop.sanma_indv_msg_ids[i]
        msg = await leaderboard_loop.sanma_indv_channel.fetch_message(msg_id)
        await msg.edit(content=indv[i])


    team = format_leaderboard(team_result)
    assert len(team) == 1, str(len(team))
    team_msg = team[0]
    msg = await leaderboard_loop.sanma_team_channel.fetch_message(leaderboard_loop.sanma_team_msg_id)
    await msg.edit(content=team_msg)

@tasks.loop(seconds=config.STATUS_UPDATE_PERIOD)
async def status_loop():
    global status_message
    try:
        four_p_content = await get_readied_players(config.TOURN_ID, config.SEASON_ID, 4)
        sanma_content = await get_readied_players(config.SANMA_TOURN_ID, config.SANMA_SEASON_ID, 3)
    
        # If either failed to fetch, skip update to avoid overwriting with blank
        if not four_p_content and not sanma_content:
            print("⚠️ Failed to fetch both lobby statuses.")
            return
    
        # Combine outputs neatly
        content = ""
        if four_p_content:
            content += f"## 🀄 4-Player Lobby Status\n{four_p_content}\n\n"
        if sanma_content:
            content += f"## 🀄 3-Player (Sanma) Lobby Status\n{sanma_content}"
    
        # Send or edit Discord message
        if status_message is None:
            status_message = await status_loop.channel.send(content)
        else:
            await status_message.edit(content=content)
    except Exception as e:
        print("Error in status_loop:", e)

async def main():
    token = await get_token(config.MS_USERNAME, config.MS_PASSWORD)
    print(token)
    config.MS_TOKEN = token
    if config.MS_TOKEN:
        print("✅ Logged in to Mahjong Soul API")
        print("Token:", config.MS_TOKEN)
    else:
        print('Could not get token')
        return
    await bot.start(config.BOT_TOKEN)

if __name__ == "__main__":
    asyncio.run(main())

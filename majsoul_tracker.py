from majsoul_api import active_players, live_status
from utils import *

ROUNDS = [
    '東１', '東２', '東３', '東４',
    '南１', '南２', '南３', '南４',
    '西１', '西２', '西３', '西４',
]

current_games = []
sequence = 0
username2name_mapping = get_username2name_mapping()

async def get_status(lobby: int, season: int, players: int):
    """Fetch live game status and update `current_games` list."""
    global current_games
    players_per_table = players
    updates = await live_status(lobby, season)
    current_games = []

    for game in updates:
        if game.get("wind", -1) > -1:
            player_list = []
            for i, player in enumerate(game["players"]):
                nickname = player.get("nickname", "🤖")
                score = f"{player['score'] / 1000:.1f}ᵏ"
                # Highlight dealer (based on wind)
                if game["wind"] % players_per_table == i:
                    nickname = f"**{nickname}**"
                player_list.append(f"{nickname} {score}")

            round_str = ROUNDS[(game["round"] * 4) + game["wind"]]
            honba = game["honba"]
            current_games.append(f"　`{round_str}-{honba}` {', '.join(player_list)}")
    return current_games


async def get_readied_players(lobby: int, season: int, players: int):
    """Fetch ready players and optionally refresh live status."""
    global sequence
    res = await active_players(lobby, season)
    if "error" in res:
        return res["error"]

    ready_players = [p["nickname"] for p in res if p.get("nickname")]
    sequence += 1
    if sequence % 4 == 0:
        await get_status(lobby, season, players)

    playing_str = ""
    if current_games:
        player_count = len(current_games) * players
        playing_str = "\n**Playing ({}):**\n{}".format(
            player_count, "\n".join(current_games)
        )

    if not ready_players:
        return f"# **{players}** Player Lobby\n**Ready (0)**{playing_str}"

    ready_players.sort(key=lambda x: x.lower())
    ready_players[:] = [f"{username2name_mapping.get(player, 'Unknown')} ({player})" for player in ready_players]
    ready_str = ", ".join(ready_players)
    return f"# **{players}** Player Lobby\n**Ready ({len(ready_players)}):** {ready_str}{playing_str}"

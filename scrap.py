import re
import requests

import config

def check_config():
    if not config.MS_TOKEN.startswith("Majsoul"):
        config.MS_TOKEN = "Majsoul " + config.MS_TOKEN
    pattern = "Majsoul [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    assert re.fullmatch(pattern, config.MS_TOKEN), "Majsoul token format: Majsoul XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    assert isinstance(config.TOURN_ID, int), "Tournament ID should be an integer"
    assert isinstance(config.SEASON_ID, int), "Season ID should be an integer"

def load_games_offset(offset, limit=100):
    url = f"https://engame.mahjongsoul.com/api/contest_gate/api/contest/fetch_contest_game_records"
    params = {
        "unique_id": config.TOURN_ID,
        "season_id": config.SEASON_ID,
        "offset": offset,
        "limit": limit,
    }
    headers = {
        "Authorization": config.MS_TOKEN,
    }
    r = requests.get(url, params=params, headers=headers)

    assert r.status_code == 200, "failed to fetch game records"
    data = r.json()
    return data["data"]["record_list"]

def load_games():
    games = []
    offset = 0
    step = 100  # get 100 games per request
    while True:
        result = load_games_offset(offset, limit=step)
        if len(result) == 0:
            break

        games += result
        offset += len(result)

    return games

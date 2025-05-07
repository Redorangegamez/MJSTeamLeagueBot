import re
import requests

import config

def check_config():
    # if not config.MS_TOKEN.startswith("Majsoul"):
    #     config.MS_TOKEN = "Majsoul " + config.MS_TOKEN
    # pattern = "Majsoul [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    # assert re.fullmatch(pattern, config.MS_TOKEN), "Majsoul token format: Majsoul XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    assert isinstance(config.TOURN_ID, int), "Tournament ID should be an integer"
    assert isinstance(config.SEASON_ID, int), "Season ID should be an integer"
    assert isinstance(config.SANMA_TOURN_ID, int), "Sanma Tournament ID should be an integer"
    assert isinstance(config.SANMA_SEASON_ID, int), "Sanma Season ID should be an integer"

def load_games_offset(tourn_id, season_id, offset, limit=100):
    url = f"https://engame.mahjongsoul.com/api/contest_gate/api/contest/fetch_contest_game_records"
    params = {
        "unique_id": tourn_id,
        "season_id": season_id,
        "offset": offset,
        "limit": limit,
    }
    headers = {
        "Authorization": config.MS_TOKEN,
    }
    r = requests.get(url, params=params, headers=headers)

    assert r.status_code == 200, f"""\
Failed to fetch game records. Error code: {r.status_code}
JSON = {r.json()}
data = {r.text}
"""

    data = r.json()
    return data["data"]["record_list"]

def load_games(tourn_id, season_id):
    games = []
    offset = 0
    step = 100  # get 100 games per request
    while True:
        result = load_games_offset(tourn_id, season_id, offset, limit=step)
        if len(result) == 0:
            break

        games += result
        offset += len(result)

    return games

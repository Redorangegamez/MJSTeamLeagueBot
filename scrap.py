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

def calculate_score(games):
    id2name = {}
    id2score = {}
    id2rank = {}

    for game in games:
        players = [None] * 4

        for account in game["accounts"]:
            account_id = account["account_id"]
            name       = account["nickname"]
            seat       = account["seat"]

            players[seat] = account_id

            if account_id not in id2name:
                id2name[account_id] = name
                id2score[account_id] = 0
                id2rank[account_id] = [0, 0, 0, 0]

        scores = game["result"]["players"]
        starting_score = sum([score["part_point_1"] for score in scores]) // 4
        assert starting_score % 100 == 0

        uma = config.uma[:]
        for rank, score in enumerate(scores):
            seat = score["seat"]
            # store the actual score * 10 so it's an integer
            delta = (score["part_point_1"] - starting_score) // 100
            delta += uma[rank] * 10

            id2score[players[seat]] += delta
            id2rank[players[seat]][rank] += 1

    return id2name, id2score, id2rank

def format_message(id2name, id2score, id2rank):
    lines = []

    for ID in id2name:
        name = id2name[ID]
        score = id2score[ID]
        rank = id2rank[ID]
        lines.append((score, name, rank))

    lines.sort(reverse=True)

    message = ""
    for i, line in enumerate(lines):
        score, name, rank = line
        if score >= 0:
            whole   = score // 10
            decimal = abs(score) % 10
        else:
            whole = score // 10 + 1
            decimal = abs(score) % 10
        score = f"{whole}.{decimal}"

        message += f"{i: <4}{score:<8}{rank[0]:<4}{rank[1]:<4}{rank[2]:<4}{rank[3]:<4}{name}\n"
    message = "```\n" + message + "```\n"
    return message

def get_message():
    check_config()
    games = load_games()
    result = calculate_score(games)
    return format_message(*result)

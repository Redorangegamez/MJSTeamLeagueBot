import aiohttp
import asyncio

API = 'https://contest-gate-202411.maj-soul.com/api/'
REALTIME_API = 'https://common-202411.maj-soul.com/api/'

stored_token = ''
contestPlayers = []

async def return_json(url, method='GET', body=None, headers=None):
    print(f"\n--- Sending {method} request ---")
    print("URL:", url)
    print("Headers:", headers)
    if body:
        print("Body:", body)

    try:
        async with aiohttp.ClientSession() as session:
            if method == 'GET':
                async with session.get(url, headers=headers) as res:
                    print("HTTP Status:", res.status)
                    text = await res.text()
                    print("Raw response text:", text)
                    res.raise_for_status()
                    data = await res.json()
            else:  # POST
                async with session.post(url, headers=headers, json=body) as res:
                    print("HTTP Status:", res.status)
                    text = await res.text()
                    print("Raw response text:", text)
                    res.raise_for_status()
                    data = await res.json()

            print("Parsed JSON:", data)
            return data.get('data')

    except Exception as e:
        print("Request failed:", e)
        return {'error': str(e)}


async def dhs_get(endpoint):
    return await return_json(
        f"{API}{endpoint}",
        method='GET',
        headers={
            'Content-type': 'application/json; charset=UTF-8',
            'Authorization': stored_token,
        },
    )


async def dhs_post(endpoint, body):
    return await return_json(
        f"{API}{endpoint}",
        method='POST',
        body=body,
        headers={
            'Content-type': 'application/json; charset=UTF-8',
            'Authorization': stored_token,
        },
    )


async def get_token(user, password):
    global stored_token
    res = await return_json(
        f"{API}login",
        method='POST',
        body={
            'account': user,
            'password': password,
            'type': 0,
        },
        headers={'Content-type': 'application/json; charset=UTF-8'},
    )
    if 'error' not in res:
        stored_token = f"Majsoul {res['token']}"


async def live_update(uuid):
    return await return_json(
        f"{REALTIME_API}game/realtime/{uuid}/progress/latest",
        method='GET',
        headers={'Content-type': 'application/json; charset=UTF-8'},
    )


async def contest_list():
    return await dhs_get('contest/fetch_contest_list')


async def season_players(lobby, season):
    start = 0
    done = False
    global contestPlayers
    while not done:
        players = await dhs_get(
            f"contest/contest_season_player_list?unique_id={lobby}&season_id={season}&search=&state=2&offset={start}&limit=100"
        )
        if not players:
            return False
        start += 100
        if start >= players['total']:
            done = True
        contestPlayers.extend(players['list'])
    return contestPlayers


async def search_players(lobby, season, pid):
    internal_id = decode_id(pid)
    return await dhs_get(
        f"contest/contest_season_player_list?unique_id={lobby}&season_id={season}&search={internal_id}&state=2&offset=0&limit=10"
    )


async def get_logs(lobby, season, offset=0, limit=10):
    return await dhs_get(
        f"contest/fetch_contest_game_records?unique_id={lobby}&season_id={season}&offset={offset}&limit={limit}"
    )


async def get_yakuman(lobby, season, offset=0, limit=10):
    return await dhs_get(
        f"contest/fetch_marked_contest_game?unique_id={lobby}&season_id={season}&offset={offset}&limit={limit}"
    )


async def contest_details(lobby):
    return await dhs_get(f"contest/fetch_contest_detail?unique_id={lobby}")


async def start_default_game(lobby, season, players, shuffle=False):
    res = await contest_details(lobby)
    init_point = res['game_mode']['detail_rule']['init_point']
    points = [init_point] * 4
    return await start_game(lobby, season, players, points, shuffle)


async def start_game(lobby, season, players, init_points, shuffle=False):
    return await dhs_post('contest/create_game_plan', {
        'unique_id': lobby,
        'season_id': season,
        'account_list': players,
        'init_points': init_points,
        'game_start_time': int(__import__('time').time()) - 180,
        'shuffle_seats': shuffle,
        'ai_level': 1,
    })


async def game_plan_list(lobby, season):
    return await dhs_get(f"contest/fetch_contest_game_plan_list?unique_id={lobby}&season_id={season}")


async def remove_game_plan(lobby, season, uuid):
    return await dhs_post('contest/remove_contest_plan_game', {
        'unique_id': lobby,
        'season_id': season,
        'uuid': uuid,
    })


async def active_games(lobby, season):
    return await dhs_get(f"contest/contest_running_game_list?unique_id={lobby}&season_id={season}")


async def find_player_game(lobby, season, nickname):
    games = await active_games(lobby, season)
    if not games or len(games) == 0:
        return None
    for g in games:
        if any(p['nickname'] == nickname for p in g['players']):
            return g['game_uuid']
    return None


async def pause_game(lobby, uuid, mode=1):
    return await dhs_post('contest/pause_contest_running_game', {
        'unique_id': lobby,
        'game_uuid': uuid,
        'resume': mode,
    })


async def resume_game(lobby, uuid):
    return await pause_game(lobby, uuid, 2)


async def terminate_game(lobby, uuid):
    return await dhs_post('contest/terminate_contest_running_game', {
        'unique_id': lobby,
        'game_uuid': uuid,
    })


async def active_players(lobby: int, season: int):
    return await dhs_get(f"contest/ready_player_list?unique_id={lobby}&season_id={season}")


async def live_status(lobby: int, season: int):
    status = []
    games = await active_games(lobby, season)

    for g in games:
        s = await live_update(g["game_uuid"])
        if s.get("uuid"):
            g["round"] = s.get("chang")   # current round
            g["wind"] = s.get("ju")      # current wind
            g["honba"] = s.get("ben")    # current honba
            scores = s.get("scores", [])
            for i, score in enumerate(scores):
                g["players"][i]["score"] = score
        status.append(g)

    return status


def decode_id(pid: int) -> int:
    e = pid
    e -= 10_000_000
    if e <= 0:
        return 0
    t = e & 0x3FFFFFF
    for _ in range(5):
        t = ((t & 0x1FFFF) << 9) | (t >> 17)
    return ((e & -0x4000000) + t) ^ 6139246


def encode_id(iid: int) -> int:
    e = iid ^ 6139246
    t = e & 0x3FFFFFF
    for _ in range(5):
        t = ((t & 0x1FF) << 17) | (t >> 9)
    return (e & -0x4000000) + t + 10_000_000

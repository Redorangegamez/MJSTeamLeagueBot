import config

# Load csv file containting Majsoul username and real name
def get_username2name_mapping():
    mp = {}
    have_seen = set({})
    dups = set({})
    with open("names.csv") as f:
        f.readline()  # first line column names
        for line in f:
            _, first_name, last_name, username, _ = line.split(",")

            # sanitize
            first_name = first_name.strip()
            last_name = last_name.strip()

            mp[username] = (first_name, last_name)
            if first_name in have_seen:
                dups.add(first_name)
            else:
                have_seen.add(first_name)
    ret = {}
    for username, name in mp.items():
        first, last = name
        if first in dups:
            ret[username] = first + last.upper()
        else:
            ret[username] = first  # unique first name
    return ret

def get_username2team_mapping():
    mp = {}
    with open("teams.csv") as f:
        for line in f:
            team_name, *members = line.split(",")
            for member in members:
                member = member.strip()
                if len(member) == 0:  # empty string
                    continue

                mp[member] = team_name
    return mp

# `name_mapping` decides what name to show on leaderboard
# In case of team leaderboard, it maps multiple people
# to the same names (the team name).
def calculate_score(games, all_players, name_mapping=None):
    name2score = {}
    name2rank  = {}

    for player in all_players:
        if name_mapping is not None:
            if player not in name_mapping:
                continue
            player = name_mapping[player]

        name2score[player] = 0
        name2rank[player]  = [0, 0, 0, 0]

    for game in games:
        # removing game between MaxS, Dai, Cristi, and Felix
        if game["result"]["uuid"] == "250210-76f05b61-0274-4142-9ec1-013ded273998":
            continue
        players = [None] * 4

        for account in game["accounts"]:
            name = account["nickname"]
            seat = account["seat"]

            if name_mapping is not None:
                name = name_mapping.get(name, None)

            players[seat] = name

        scores = game["result"]["players"]
        starting_score = sum([score["part_point_1"] for score in scores]) // 4
        assert starting_score % 100 == 0

        uma = config.uma[:]
        for rank, score in enumerate(scores):
            seat = score["seat"]
            # store the actual score * 10 so it's an integer
            delta = (score["part_point_1"] - starting_score) // 100
            delta += uma[rank] * 10

            name = players[seat]

            if name is None:
                continue

            name2score[name] += delta
            name2rank[name][rank] += 1

    lines = []

    for name in name2score:
        score = name2score[name]
        rank = name2rank[name]
        lines.append((score, name, rank))

    lines.sort(reverse=True)

    return lines

def format_leaderboard(lines):
    message = f"""{"Rk":<4}{"Score":<8}{"1st":<4}{"2nd":<4}{"3rd":<4}{"4th":<4}{"name"}\n"""
    for i, line in enumerate(lines, start=1):
        score, name, rank = line

        decimal = abs(score) % 10
        whole = abs(score) // 10
        sign = "-" if score < 0 else ""
        score = f"{sign}{whole}.{decimal}"

        message += f"{i:<4}{score:<8}{rank[0]:<4}{rank[1]:<4}{rank[2]:<4}{rank[3]:<4}{name}\n"

    # group per 40 lines
    lines_per_msg = 40
    message = message.split("\n")
    message = ["\n".join(message[i:i+lines_per_msg]) for i in range(0, len(message), lines_per_msg)]
    message = ["```\n" + s + "\n```\n"for s in message]
    return message

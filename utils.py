import config

# Load csv file containting Majsoul username and real name
def get_username2name_mapping():
    mp = {}
    have_seen = set({})
    dups = set({})
    with open("names.csv", "r") as f:
        f.readline()  # first line column names
        for line in f:
            if (line.isspace()):
                break
            _, first_name, last_name, username, _ = line.split(",")
            # sanitize
            first_name = first_name.strip()
            last_name = last_name.strip()
            username = username.strip()

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
            if (line.isspace()):
                break
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

    assert len(games) != 0, "there's no game WTF"
    n_player = len(games[0]["accounts"])  # trying to figure out whether its yonma or sanma

    name2score = {}
    name2rank  = {}

    for player in all_players:
        if name_mapping is not None:
            if player not in name_mapping:
                continue
            player = name_mapping[player]

        name2score[player] = 0
        name2rank[player]  = [0] * n_player

    for game in games:
        # removing game between MaxS, Dai, Cristi, and Felix
        if game["removed"] == 1:
            continue
        players = [None] * n_player

        for account in game["accounts"]:
            name = account["nickname"]
            seat = account["seat"]

            if name_mapping is not None:
                name = name_mapping.get(name, None)

            players[seat] = name

        scores = game["result"]["players"]
        starting_score = sum([score["part_point_1"] for score in scores]) // n_player
        assert starting_score % 100 == 0

        uma = {
            3: config.sanma_uma[:],
            4: config.uma[:],
        }[n_player]

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

    """
    If the player does not play any game, the rank
    data will be an array with only 0s (length depends 
    on sanma/yonma), and they should be rank the lowest 
    on the leaderboard
    """
    lines.sort(reverse=True, key=lambda x: (x[0] if any(r > 0 for r in x[2]) else -100000000))

    return lines

def format_leaderboard(lines):

    assert len(lines) > 0, "no lines wtf"
    n_player = len(lines[0][2])

    message = {
        3: f"""{"Rk":<4}{"Score":<8}{"1st":<4}{"2nd":<4}{"3rd":<4}{"name"}\n""",
        4: f"""{"Rk":<4}{"Score":<8}{"1st":<4}{"2nd":<4}{"3rd":<4}{"4th":<4}{"name"}\n""",
    }[n_player]

    for i, line in enumerate(lines, start=1):
        score, name, rank = line

        decimal = abs(score) % 10
        whole = abs(score) // 10
        sign = "-" if score < 0 else ""
        score = f"{sign}{whole}.{decimal}"

        if n_player == 3:
            message += f"{i:<4}{score:<8}{rank[0]:<4}{rank[1]:<4}{rank[2]:<4}{name}\n"
        else:
            message += f"{i:<4}{score:<8}{rank[0]:<4}{rank[1]:<4}{rank[2]:<4}{rank[3]:<4}{name}\n"

    # group per 40 lines
    lines_per_msg = 40
    message = message.split("\n")
    message = ["\n".join(message[i:i+lines_per_msg]) for i in range(0, len(message), lines_per_msg)]
    message = ["```\n" + s + "\n```\n"for s in message]
    return message

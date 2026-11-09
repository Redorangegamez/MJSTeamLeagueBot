"""Regular-season participation counting. No penalties are applied automatically."""
from collections import Counter
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")


def game_end(game):
    """Return an aware UTC completion time, or None if the API schema is unknown."""
    for key in ("end_time", "finish_time", "game_end_time"):
        value = game.get(key)
        if isinstance(value, (int, float)) and value > 0:
            if value > 10**12:
                value /= 1000
            return datetime.fromtimestamp(value, timezone.utc)
        if isinstance(value, str) and value:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is not None:
                    return parsed.astimezone(timezone.utc)
            except ValueError:
                pass
    return None


def count_regular_season(games, username_to_team, start="2026-09-07",
                         end="2026-11-29", required=32):
    """Count one credit per rostered participant per completed, eligible 4P game.

    Teammates in the same game each earn a credit. Such games are flagged
    for organizer visibility but never disqualified.
    """
    first = date.fromisoformat(start)
    last = date.fromisoformat(end)
    if last < first or required < 0:
        raise ValueError("Invalid season dates or requirement")
    cutoff = datetime.combine(last + timedelta(days=1), time.min, PACIFIC)
    counts = Counter({team: 0 for team in username_to_team.values()})
    weeks = {}
    teammate_games = []
    unknown_time = 0
    unmatched = Counter()
    seen = set()
    for game in games:
        if game.get("removed") == 1 or not game.get("result"):
            continue
        accounts = game.get("accounts") or []
        if len(accounts) != 4:
            continue
        finished = game_end(game)
        if finished is None:
            unknown_time += 1
            continue
        local = finished.astimezone(PACIFIC)
        if not (datetime.combine(first, time.min, PACIFIC) <= local < cutoff):
            continue
        game_id = game.get("uuid") or game.get("game_uuid")
        if game_id is not None:
            if game_id in seen:
                continue
            seen.add(game_id)
        week = (local.date() - first).days // 7 + 1
        teams_here = Counter()
        usernames_seen = set()
        for account in accounts:
            nickname = account.get("nickname")
            if not nickname or nickname in usernames_seen:
                continue
            usernames_seen.add(nickname)
            team = username_to_team.get(nickname)
            if team:
                counts[team] += 1
                teams_here[team] += 1
                weeks.setdefault(week, Counter())[team] += 1
            else:
                unmatched[nickname] += 1
        if any(n > 1 for n in teams_here.values()):
            teammate_games.append({"game_id": game_id, "week": week,
                                   "teams": {t: n for t, n in teams_here.items() if n > 1}})
    return {
        "teams": {team: {"played": count, "remaining": max(0, required - count)}
                  for team, count in sorted(counts.items())},
        "weeks": {week: dict(scores) for week, scores in sorted(weeks.items())},
        "teammate_games": teammate_games,
        "unknown_timestamp_games": unknown_time,
        "unmatched_nicknames": dict(unmatched),
        "required": required,
        "start": start,
        "end": end,
    }


def format_summary(report):
    lines = [f"Regular season: {report['start']} to {report['end']} (Pacific)",
             f"Requirement: {report['required']} player-games per team",
             "Team | Played | Remaining"]
    for team, row in report["teams"].items():
        lines.append(f"{team} | {row['played']} | {row['remaining']}")
    lines.append(f"Teammate matchups (allowed): {len(report['teammate_games'])}")
    if report["unknown_timestamp_games"]:
        lines.append(f"WARNING: {report['unknown_timestamp_games']} games skipped: unknown completion timestamp")
    if report["unmatched_nicknames"]:
        lines.append(f"WARNING: {len(report['unmatched_nicknames'])} unrecognized usernames; verify roster")
    return "\n".join(lines)

"""Persistent league roster. CSVs are used once to seed existing teams/players."""
import sqlite3

DEFAULT_DB = "league_roster.sqlite3"


def connect(path=DEFAULT_DB):
    db = sqlite3.connect(path)
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("""CREATE TABLE IF NOT EXISTS registrations (
        discord_id INTEGER PRIMARY KEY,
        majsoul_username TEXT NOT NULL UNIQUE,
        team TEXT NOT NULL,
        is_leader INTEGER NOT NULL DEFAULT 0 CHECK (is_leader IN (0, 1))
    )""")
    db.execute("CREATE TABLE IF NOT EXISTS teams (name TEXT PRIMARY KEY)")
    db.execute("""CREATE TABLE IF NOT EXISTS roster_players (
        username TEXT PRIMARY KEY, display_name TEXT NOT NULL,
        team TEXT NOT NULL REFERENCES teams(name)
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS majsoul_teams (team_id INTEGER PRIMARY KEY, name TEXT NOT NULL)""")
    db.commit()
    return db


def seed_from_csv(db, names, name_to_team, team_names):
    """Seed only on first launch; never overwrite organizer edits on restart."""
    with db:
        if db.execute("SELECT COUNT(*) FROM teams").fetchone()[0]:
            return
        db.executemany("INSERT INTO teams(name) VALUES (?)", [(x,) for x in team_names])
        db.executemany(
            "INSERT INTO roster_players(username,display_name,team) VALUES (?,?,?)",
            [(username, display, name_to_team[display])
             for username, display in names.items() if display in name_to_team],
        )


def teams(db):
    return [r[0] for r in db.execute("SELECT name FROM teams ORDER BY name COLLATE NOCASE")]


def roster(db, team=None):
    if team is None:
        return list(db.execute("SELECT username,display_name,team FROM roster_players ORDER BY team,display_name"))
    return list(db.execute("SELECT username,display_name,team FROM roster_players WHERE team=? ORDER BY display_name", (team,)))


def set_player(db, username, display_name, team):
    username, display_name = username.strip(), display_name.strip()
    if not username or not display_name:
        raise ValueError("Username and display name cannot be blank")
    if team not in teams(db):
        raise ValueError("Choose a team from the existing team list")
    with db:
        db.execute("""INSERT INTO roster_players(username,display_name,team) VALUES (?,?,?)
            ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name,team=excluded.team""",
            (username, display_name, team))
        db.execute("UPDATE registrations SET team=? WHERE majsoul_username=?", (team, username))


def remove_player(db, username):
    with db:
        result = db.execute("DELETE FROM roster_players WHERE username=?", (username,))
        db.execute("DELETE FROM registrations WHERE majsoul_username=?", (username,))
        return result.rowcount


def register(db, discord_id, majsoul_username, team, is_leader=False):
    username = majsoul_username.strip()
    row = db.execute("SELECT team FROM roster_players WHERE username=?", (username,)).fetchone()
    if row is None or row[0] != team:
        raise ValueError("Add the player to the selected team with /roster addplayer first")
    with db:
        other = db.execute("SELECT discord_id FROM registrations WHERE majsoul_username=?", (username,)).fetchone()
        if other and other[0] != discord_id:
            raise ValueError("This Mahjong Soul username is already linked to another Discord member")
        db.execute("""INSERT INTO registrations(discord_id,majsoul_username,team,is_leader)
            VALUES (?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET
            majsoul_username=excluded.majsoul_username,team=excluded.team,
            is_leader=excluded.is_leader""", (discord_id, username, team, int(is_leader)))


def get_registration(db, discord_id):
    row = db.execute("SELECT majsoul_username,team,is_leader FROM registrations WHERE discord_id=?", (discord_id,)).fetchone()
    return {"username": row[0], "team": row[1], "is_leader": bool(row[2])} if row else None


def team_mapping(db):
    return {u: team for u, team in db.execute("SELECT username,team FROM roster_players")}


def name_mapping(db):
    return {u: name for u, name in db.execute("SELECT username,display_name FROM roster_players")}

def sync_team_catalog(db, api_teams):
    """Upsert authoritative team names/IDs without deleting or reassigning local players."""
    with db:
        for item in api_teams:
            team_id, name = int(item["team_id"]), item["name"].strip()
            if not name:
                raise ValueError("Empty team name returned by Mahjong Soul")
            db.execute("""INSERT INTO majsoul_teams(team_id,name) VALUES (?,?)
                ON CONFLICT(team_id) DO UPDATE SET name=excluded.name""", (team_id, name))
            db.execute("INSERT OR IGNORE INTO teams(name) VALUES (?)", (name,))


def team_options(db):
    rows = list(db.execute("SELECT name FROM majsoul_teams ORDER BY name COLLATE NOCASE"))
    return [r[0] for r in rows] if rows else teams(db)

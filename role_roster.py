"""Organizer-controlled Discord-to-Mahjong-Soul roster mapping."""
import sqlite3
from pathlib import Path

DEFAULT_DB = "league_roster.sqlite3"


def connect(path=DEFAULT_DB):
    db = sqlite3.connect(path)
    db.execute("""CREATE TABLE IF NOT EXISTS registrations (
        discord_id INTEGER PRIMARY KEY,
        majsoul_username TEXT NOT NULL UNIQUE,
        team TEXT NOT NULL,
        is_leader INTEGER NOT NULL DEFAULT 0 CHECK (is_leader IN (0, 1))
    )""")
    db.commit()
    return db


def register(db, discord_id, majsoul_username, team, is_leader=False):
    username = majsoul_username.strip()
    team = team.strip()
    if not username or not team:
        raise ValueError("Mahjong Soul username and team are required")
    with db:
        other = db.execute(
            "SELECT discord_id FROM registrations WHERE majsoul_username = ?",
            (username,)
        ).fetchone()
        if other and other[0] != discord_id:
            raise ValueError("This Mahjong Soul username is already registered to another Discord member")
        db.execute(
            """INSERT INTO registrations (discord_id, majsoul_username, team, is_leader)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(discord_id) DO UPDATE SET
                 majsoul_username=excluded.majsoul_username,
                 team=excluded.team,
                 is_leader=excluded.is_leader""",
            (discord_id, username, team, int(is_leader)),
        )


def get_registration(db, discord_id):
    row = db.execute(
        "SELECT majsoul_username, team, is_leader FROM registrations WHERE discord_id=?",
        (discord_id,),
    ).fetchone()
    return {"username": row[0], "team": row[1], "is_leader": bool(row[2])} if row else None


def team_mapping(db):
    return {username: team for username, team in db.execute(
        "SELECT majsoul_username, team FROM registrations"
    )}

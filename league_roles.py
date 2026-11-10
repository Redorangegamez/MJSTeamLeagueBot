"""Organizer-only slash commands for editable team rosters."""
import sqlite3
import discord
from discord import app_commands
from discord.ext import commands
import config
from role_roster import connect, seed_from_csv, teams, roster, set_player, remove_player, register, team_options, sync_official_roster
from utils import get_username2name_mapping, get_username2team_mapping
from majsoul_api import contest_team_list, contest_team_members, search_accounts, add_team_member, delete_team_members
import csv


def csv_team_names():
    with open("teams.csv", newline="", encoding="utf-8") as file:
        return [row[0].strip() for row in csv.reader(file) if row and row[0].strip()]


class RosterCommands(app_commands.Group):
    def __init__(self, cog):
        super().__init__(name="roster", description="Manage league team rosters")
        self.cog = cog

    async def interaction_check(self, interaction):
        return await self.cog.organizer_check(interaction)

    async def team_choices(self, interaction, current):
        return [app_commands.Choice(name=t[:100], value=t)
                for t in team_options(self.cog.db) if current.casefold() in t.casefold()][:25]

    async def player_choices(self, interaction, current):
        return [app_commands.Choice(name=f"{name} ({u})"[:100], value=u)
                for u, name, team in roster(self.cog.db)
                if current.casefold() in (u + " " + name + " " + team).casefold()][:25]

    @app_commands.command(name="sync", description="Import official Mahjong Soul teams and members")
    async def sync(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            api_teams = await contest_team_list(config.TOURN_ID, config.SEASON_ID)
            if not api_teams:
                raise ValueError("Mahjong Soul returned no teams")
            members = []
            for team in api_teams:
                members.extend(await contest_team_members(config.TOURN_ID, config.SEASON_ID, team["team_id"]))
            team_count, member_count = sync_official_roster(self.cog.db, api_teams, members)
        except Exception as exc:
            await interaction.followup.send(
                f"Roster sync failed: {type(exc).__name__}: {exc}",
                ephemeral=True,
            )
            return
        await interaction.followup.send(
            f"Imported **{team_count} teams** and **{member_count} players** from Mahjong Soul. "
            "Discord links preserved; stale CSV-only players not removed.",
            ephemeral=True,
        )

    @app_commands.command(name="addplayer", description="Add or update a player's Mahjong Soul username and team")
    @app_commands.describe(username="Exact Mahjong Soul username", display_name="Leaderboard display name", team="Choose a team")
    @app_commands.autocomplete(team=team_choices)
    async def addplayer(self, interaction: discord.Interaction, username: str, display_name: str, team: str):
        try:
            set_player(self.cog.db, username, display_name, team)
        except ValueError as exc:
            await interaction.response.send_message(str(exc), ephemeral=True)
            return
        await interaction.response.send_message(f"Saved **{display_name}** (`{username}`) on **{team}**.", ephemeral=True)

    @app_commands.command(name="moveplayer", description="Move an existing player to another team")
    @app_commands.autocomplete(username=player_choices, team=team_choices)
    async def moveplayer(self, interaction: discord.Interaction, username: str, team: str):
        match = next((r for r in roster(self.cog.db) if r[0] == username), None)
        if not match:
            await interaction.response.send_message("Player not found.", ephemeral=True)
            return
        try:
            set_player(self.cog.db, username, match[1], team)
        except ValueError as exc:
            await interaction.response.send_message(str(exc), ephemeral=True)
            return
        await interaction.response.send_message(f"Moved **{match[1]}** to **{team}**.", ephemeral=True)

    @app_commands.command(name="removeplayer", description="Remove a player from the active roster")
    @app_commands.autocomplete(username=player_choices)
    async def removeplayer(self, interaction: discord.Interaction, username: str):
        if remove_player(self.cog.db, username):
            await interaction.response.send_message(f"Removed `{username}` from the roster. Existing Discord roles are not changed.", ephemeral=True)
        else:
            await interaction.response.send_message("Player not found.", ephemeral=True)

    @app_commands.command(name="show", description="Show players on a team")
    @app_commands.autocomplete(team=team_choices)
    async def show(self, interaction: discord.Interaction, team: str):
        if team not in teams(self.cog.db):
            await interaction.response.send_message("Unknown team.", ephemeral=True)
            return
        entries = roster(self.cog.db, team)
        lines = [f"• {name} — `{username}`" for username, name, _ in entries]
        await interaction.response.send_message(
            f"**{team}** ({len(entries)} players)\n" + ("\n".join(lines) or "No players"),
            ephemeral=True,
        )


class LeagueRoles(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = connect(getattr(config, "ROSTER_DB_PATH", "league_roster.sqlite3"))
        seed_from_csv(self.db, get_username2name_mapping(), get_username2team_mapping(), csv_team_names())
        self.bot.tree.add_command(RosterCommands(self))

    def cog_unload(self):
        self.bot.tree.remove_command("roster")
        self.db.close()

    async def organizer_check(self, interaction):
        role_id = getattr(config, "ORGANIZER_ROLE_ID", 0)
        if not role_id or not isinstance(interaction.user, discord.Member) or not any(
            role.id == role_id for role in interaction.user.roles
        ):
            await interaction.response.send_message("Only Organizers can manage the league roster.", ephemeral=True)
            return False
        return True

    async def team_choices(self, interaction, current):
        return [app_commands.Choice(name=t[:100], value=t)
                for t in team_options(self.db) if current.casefold() in t.casefold()][:25]

    @app_commands.command(name="registerplayer", description="Link a Discord member to a rostered Mahjong Soul player")
    @app_commands.describe(member="Discord member", majsoul_username="Exact Mahjong Soul username",
                           team="Select team from roster", team_leader="Assign Team Leader role")
    @app_commands.autocomplete(team=team_choices)
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_roles=True)
    async def registerplayer(self, interaction: discord.Interaction, member: discord.Member,
                             majsoul_username: str, team: str, team_leader: bool = False):
        if not await self.organizer_check(interaction):
            return
        await interaction.response.defer(ephemeral=True)
        player_role = interaction.guild.get_role(getattr(config, "PLAYER_ROLE_ID", 0))
        leader_role = interaction.guild.get_role(getattr(config, "TEAM_LEADER_ROLE_ID", 0))
        if not player_role or not leader_role:
            await interaction.followup.send("Configure PLAYER_ROLE_ID and TEAM_LEADER_ROLE_ID.", ephemeral=True)
            return
        # Validate all local constraints before making a remote change.
        team_row = self.db.execute(
            "SELECT team_id FROM majsoul_teams WHERE name=?", (team,)
        ).fetchone()
        if not team_row:
            await interaction.followup.send(
                "Unknown official Mahjong Soul team. Run /roster sync first.", ephemeral=True
            )
            return
        team_id = int(team_row[0])
        username = majsoul_username.strip()
        existing_link = self.db.execute(
            "SELECT discord_id FROM registrations WHERE majsoul_username=?", (username,)
        ).fetchone()
        if existing_link and existing_link[0] != member.id:
            await interaction.followup.send(
                "That Mahjong Soul nickname is linked to another Discord member.", ephemeral=True
            )
            return
        known = self.db.execute(
            "SELECT account_id,team_id FROM majsoul_members WHERE nickname=?", (username,)
        ).fetchall()
        if len(known) != 1:
            await interaction.followup.send(
                "Could not uniquely resolve this nickname to a Mahjong Soul account ID. "
                "Run /roster sync first; players not yet in a team need an account-ID lookup.",
                ephemeral=True,
            )
            return
        account_id, previous_team_id = map(int, known[0])
        try:
            lookup = await search_accounts([account_id])
            accounts = lookup if isinstance(lookup, list) else lookup.get("list", [])
            if not any(int(x.get("account_id", -1)) == account_id and
                       x.get("nickname") == username for x in accounts):
                raise ValueError("Mahjong Soul account lookup did not match the username")
            if previous_team_id != team_id:
                await delete_team_members(config.TOURN_ID, previous_team_id, [account_id])
                try:
                    await add_team_member(config.TOURN_ID, team_id, account_id, username)
                except Exception:
                    # Best effort compensation for a failed transfer.
                    await add_team_member(config.TOURN_ID, previous_team_id, account_id, username)
                    raise
            remote_members = await contest_team_members(config.TOURN_ID, config.SEASON_ID, team_id)
            if not any(int(x["account_id"]) == account_id for x in remote_members):
                raise RuntimeError("Mahjong Soul did not confirm membership in the target team")
            from role_roster import set_player
            display_row = self.db.execute(
                "SELECT display_name FROM roster_players WHERE username=?", (username,)
            ).fetchone()
            set_player(self.db, username, display_row[0] if display_row else username, team)
            register(self.db, member.id, username, team, team_leader)
            with self.db:
                self.db.execute(
                    "UPDATE majsoul_members SET team_id=? WHERE account_id=?",
                    (team_id, account_id),
                )
        except Exception as exc:
            await interaction.followup.send(
                f"Registration stopped: {type(exc).__name__}: {exc}. "
                "Check Mahjong Soul membership before retrying.",
                ephemeral=True,
            )
            return
        try:
            await member.add_roles(player_role, reason="League registration")
            if team_leader:
                await member.add_roles(leader_role, reason="League leader registration")
            elif leader_role in member.roles:
                await member.remove_roles(leader_role, reason="Organizer changed leader flag")
        except (discord.Forbidden, discord.HTTPException) as exc:
            await interaction.followup.send(f"Mapping saved, but role update failed: {exc}", ephemeral=True)
            return
        await interaction.followup.send(
            f"Registered {member.mention} as `{majsoul_username}` on **{team}**.", ephemeral=True
        )


async def setup(bot):
    await bot.add_cog(LeagueRoles(bot))

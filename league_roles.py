"""Organizer-only slash commands for editable team rosters."""
import sqlite3
import discord
from discord import app_commands
from discord.ext import commands
import config
from role_roster import connect, seed_from_csv, teams, roster, set_player, remove_player, register
from utils import get_username2name_mapping, get_username2team_mapping
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
                for t in teams(self.cog.db) if current.casefold() in t.casefold()][:25]

    async def player_choices(self, interaction, current):
        return [app_commands.Choice(name=f"{name} ({u})"[:100], value=u)
                for u, name, team in roster(self.cog.db)
                if current.casefold() in (u + " " + name + " " + team).casefold()][:25]

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
                for t in teams(self.db) if current.casefold() in t.casefold()][:25]

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
        try:
            register(self.db, member.id, majsoul_username, team, team_leader)
        except (ValueError, sqlite3.IntegrityError) as exc:
            await interaction.followup.send(f"Registration rejected: {exc}", ephemeral=True)
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

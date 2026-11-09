"""Discord slash commands for organizer-only league registration."""
import discord
from discord import app_commands
from discord.ext import commands

import config
from role_roster import connect, get_registration, register


class LeagueRoles(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = connect(getattr(config, "ROSTER_DB_PATH", "league_roster.sqlite3"))

    def cog_unload(self):
        self.db.close()

    @app_commands.command(name="registerplayer", description="Register a Discord member to an existing league roster entry")
    @app_commands.describe(member="Discord member", majsoul_username="Exact Mahjong Soul nickname",
                           team="Team name from teams.csv", team_leader="Assign the Team Leader role")
    @app_commands.guild_only()
    @app_commands.default_permissions(manage_roles=True)
    async def registerplayer(self, interaction: discord.Interaction, member: discord.Member,
                             majsoul_username: str, team: str, team_leader: bool = False):
        await interaction.response.defer(ephemeral=True)
        organizer_role_id = getattr(config, "ORGANIZER_ROLE_ID", None)
        if not organizer_role_id or not any(r.id == organizer_role_id for r in interaction.user.roles):
            await interaction.followup.send("Only members with the configured Organizers role can register players.", ephemeral=True)
            return
        player_role = interaction.guild.get_role(getattr(config, "PLAYER_ROLE_ID", 0))
        leader_role = interaction.guild.get_role(getattr(config, "TEAM_LEADER_ROLE_ID", 0))
        if player_role is None or leader_role is None:
            await interaction.followup.send("Player/Team Leader role IDs are missing or invalid in config.py.", ephemeral=True)
            return
        # Validate the existing season roster; do not permit arbitrary team claims.
        from utils import get_username2name_mapping, get_username2team_mapping
        names = get_username2name_mapping()
        teams = get_username2team_mapping()
        expected_team = teams.get(names.get(majsoul_username))
        if expected_team != team:
            await interaction.followup.send(
                "Username/team combination is not in the existing names.csv and teams.csv roster.", ephemeral=True
            )
            return
        try:
            register(self.db, member.id, majsoul_username, team, team_leader)
        except (ValueError, __import__("sqlite3").IntegrityError) as exc:
            await interaction.followup.send(f"Registration rejected: {exc}", ephemeral=True)
            return
        try:
            await member.add_roles(player_role, reason=f"League registration by {interaction.user}")
            if team_leader:
                await member.add_roles(leader_role, reason=f"League captain registration by {interaction.user}")
            elif leader_role in member.roles:
                await member.remove_roles(leader_role, reason="League captain flag removed by organizer")
        except (discord.Forbidden, discord.HTTPException) as exc:
            await interaction.followup.send(
                f"Mapping saved, but role update failed. Check Manage Roles and role hierarchy: {exc}", ephemeral=True
            )
            return
        await interaction.followup.send(
            f"Registered {member.mention} as {majsoul_username} ({team}). Leader: {team_leader}.", ephemeral=True
        )


async def setup(bot):
    await bot.add_cog(LeagueRoles(bot))

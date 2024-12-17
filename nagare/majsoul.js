// SET PLAYER COUNT AT THE FOLLOWING TIMES:
// - When /lobby set
// - When persistent button is pushed or when /list
// - When games start

import { CONFIG, WINDEMOJI, CHANNEL, PERSISTENT, ROUNDS } from './constants.js';
import { sheets, exportFile, liveInteraction, interactionTimeout, setPersistentTimeout,
	waiting, intervalLog, sendToSpreadsheet, updatePersistentScores, timedout,
	checkPermissions, displayRule, clearPersistentTimeout } from './common.js';
import shuffle from 'shuffle-array';
import { MessageActionRow, MessageButton, MessageEmbed } from 'discord.js';
import { contest_list, active_players, live_status, pause_player_game, add_player_by_id, start_game,
	contest_details, terminate_player_game, get_logs, active_games, search_players, game_plan_list,
	remove_game_plan, game_log } from './majsoul_api.js';
import { parseMajsoulRules as parseRules } from './utils.js';

let tables = [];
const scoredGames = [];
let currentGames = [];
let sequence = 0; // ping once every 15

export function loadHelp(channel, user, admin) {
	const guild = channel.guildId;
	if (admin) {
		channel.send(`***Hi! I'm Nagare!*** Use \`/\` for a list of commands.\n**　Results channel:** <#${CONFIG[guild].channelid}>\n**　Majsoul lobby:** ${CONFIG[guild].majsoul.room} season ${CONFIG[guild].majsoul.season}`);
	} else {
		channel.send('***Hi! I\'m Nagare!*** Use `/` for a list of commands.');
	}
}

export async function showInfo(interaction) {
	await interaction.deferReply({ ephemeral: true });
	let warning = false;
	const display = {};
	const guild = interaction.guildId;

	// Initialize if new guild
	// if (!CONFIG.spreadsheet[guild] || CONFIG.spreadsheet[guild] === '') await initialize(guild);

	// 0: Guild info
	display.guild = `**Hi! I'm Nagare!** I'm here to assist with your mahjong league.\nDisplaying settings for guild **${interaction.guild.name}**.`;

	// 1: Check lobby info
	if (!CONFIG[guild].majsoul.lobby || CONFIG[guild].majsoul.lobby === 0) {
		display.lobby = '⚠️ **Warning!** No lobby ID set!\nUse `/lobby set` to link a Majsoul lobby.';
		warning = true;
	} else {
		const res = await contest_list();
		console.log(res);
		const contest = (!res || res.error) ? undefined : res.find(c => c.contest_id === CONFIG[guild].majsoul.room);
		if (!contest) {
			display.lobby = `⚠️ **Warning!** Error connecting to lobby ${CONFIG[guild].majsoul.room}!\nUse \`/lobby set\` to link a new lobby (are you sure you added **69093925** as an admin).`;
			warning = true;
		} else {
			display.lobby = `　　Connected to lobby **${CONFIG[guild].majsoul.room}** (${contest.contest_name[0].content})\n　　Lobby expires <t:${contest.season.endTime_}:R> (<t:${contest.season.endTime_}>)`;
		}
	}

	// 2: Starting games info
	display.starting = `　　Roles allowed to start games: ${CONFIG[guild].permissions.map(o => `<@&${o}>`).join(', ')}.`;

	// 3: Result display info
	if (!CONFIG[guild].channelid || CONFIG[guild].channelid === '') {
		display.result = '⚠️ **Warning!** No result channel set!\nUse `/display [minimum] [channel]` to set the result display channel.';
		warning = true;
	} else {
		const permissions = interaction.guild.me.permissionsIn(CONFIG[guild].channelid);
		if (!permissions.has('SEND_MESSAGES')) {
			display.result = `⚠️ **Warning!** ${interaction.client.user}> does not have permission to post in <#${CONFIG[guild].channelid}>!\nGive permissions or use \`/display [minimum] [channel]\` to change the result display channel.`;
			warning = true;
		} else {
			display.result = `　　Game results will be displayed in <#${CONFIG[guild].channelid}>.`;
		}
	}

	// 4: Scoring info
	try {
		const sheetIndex = await sheets[guild].sheetsByIndex.findIndex((i) => i.title === 'Results');
		const sheet = sheets[guild].sheetsByIndex[sheetIndex];
		await sheet.loadCells(['A1', 'H1:H2', 'J1', 'Q1:Q2']);
		display.scoring = `　　All game results are posted [**here**](https://docs.google.com/spreadsheets/d/${CONFIG[guild].spreadsheet}/).\n　　**${sheet.getCell(0, 0).value}** showing games from ${sheet.getCell(0, 7).formattedValue} to ${sheet.getCell(1, 7).formattedValue}.\n　　**${sheet.getCell(0, 9).value}** showing games from ${sheet.getCell(0, 16).formattedValue} to ${sheet.getCell(1, 16).formattedValue}.`;
	} catch (e) {
		console.log(e);
		display.scoring = `　　All game results are posted [**here**](https://docs.google.com/spreadsheets/d/${CONFIG[guild].spreadsheet}/).\n　　⚠️ **Error connecting to Google sheet.** Please try again later.`;
	}

	const message = `${display.guild}${warning ? '\n\n⚠️ **CONFIGURATION NOT COMPLETE! Check below for how to fix.**' : ''}

**__MAHJONG SOUL LOBBY__**
　**\`/client [client]\`:** Set the client to manage.
　**\`/lobby [?set]\`:** Show (or set) the current Majsoul lobby.
${display.lobby}

**__STARTING GAMES__**
　**\`/persistent [on|off]\`:** Displays (or disables) a persistent player list and scoreboard.${CONFIG[guild].persistent.channel ? `\n　　Persistent message enabled: https://discord.com/channels/${guild}/${CONFIG[guild].persistent.channel}/${CONFIG[guild].persistent.list}` : ''}
　**\`/list\`:** List the current readied players and show a button to start games.
　**\`/permissions [add|remove|view] [role]\`:** Set (or show) roles that can hit the button to start games.
${display.starting}

**__LOBBY / IN GAME__**
　**\`/register [id]\`:** Register a Majsoul friend ID into the lobby.
　**\`/pause [username]\`:** Pause the game for the specific Majsoul username.
　**\`/resume [username]\` (alias \`/unpause\`):** Resume the game for the specific Majsoul username.

**__GAME RESULTS__**
　**\`/display [minimum] [?channel]\`:** Set the minimum hand value to show in game reports.
${display.result}

**__LEADERBOARDS__**
　**\`/scores [all|weekly|monthly]\`:** Show the current leaderboard.
　**\`/filter [weekly|monthly] [from] [to] [?heading]\`:** Set the (inclusive) date ranges for the leaderboards.
${display.scoring}

**__MISCELLANEOUS FUNCTIONS__**
　**\`/help\`:** Shows this message.
　**\`/parse [log] [?minimum]\`:** Manually parse and display the results of a Tenhou game log.
　**\`/restart\`:** Restarts the bot in case of misbehavior.

-# I was created by Ember. Version 1.0.0, updated 2024.07.29`;

	const embed = new MessageEmbed()
		.setColor('#F532E1')
		.setTitle('Nagare Help - Current mode: Mahjong Soul')
		.setDescription(message);

	await interaction.editReply({
		embeds: [embed],
	});
}

export async function showRules(interaction) {

	const guild = interaction.guildId;

	if (!CONFIG[guild].majsoul.lobby) {
		interaction.reply({
			content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
		});
		return;
	}
	const res = await contest_details(CONFIG[guild].majsoul.lobby);
	const rules = parseRules(res);

	if (rules.players !== CONFIG[guild].majsoul.players) {
		CONFIG[guild].majsoul.players = rules.players;
		await exportFile();
	}

	const oka = (rules.starting_points - rules.goal_points) / 1000;
	const uma = new Array(rules.players).fill(oka);
	for (let i = 0; i < rules.players - 1; i++) {
		uma[0] -= rules.uma[i];
		uma[i + 1] += rules.uma[i];
	}
	uma[0] -= (oka * rules.players);

	const fields = [
		[
			`Starting points: **${rules.starting_points}**`,
			`Minimum points to win: **${rules.min_points_to_win}**`,
			`Uma (with oka): **${uma.join('/')}**`,
			`Riichi bet: **${rules.riichi_value}**`,
			`Honba value: **${rules.honba_value}** (${rules.honba_value / (rules.players - 1)}∀)`,
			`Noten penalty: **${rules.noten_payments.slice(0, rules.players - 1).join('/')}**`,
			`Time control: **${rules.time_per_turn}+${rules.time_bank}**`,
		], [
			displayRule(!rules.head_bump_enabled, 'Multiple ron'),
			displayRule(rules.kiriage_mangan_enabled, 'Kiriage mangan'),
			displayRule(rules.double_wind_is_4_fu, 'Double wind 4 fu'),
			displayRule(rules.swap_calling_enabled, 'Swap calling'),
			displayRule(rules.charleston_enabled, 'Charleston'),
			displayRule(rules.hints_enabled, 'Tips'),
			displayRule(rules.allow_emotes, 'Emotes'),
		], [
			displayRule(rules.auto_win_points, 'Mercy rule', rules.auto_win_points, rules.auto_win_points),
			displayRule(rules.busting_enabled, 'Busting'),
			displayRule(rules.extension_to_west, `Extension to ${rules.mode === 1 ? 'South' : 'West'}`),
			displayRule(rules.dealer_win_repeat_enabled, 'Dealer repeats on win'),
			displayRule(rules.dealer_tenpai_repeat_enabled, 'Dealer repeats on tenpai'),
			displayRule(rules.last_dealer_win_ends, 'Dealer win ends game'),
			displayRule(rules.last_dealer_tenpai_ends, 'Dealer tenpai ends game'),
		], [
			displayRule(rules.nine_terminal_draw_enabled, 'Nine terminal abort'),
			displayRule(rules.four_wind_draw_enabled, 'Four wind abort'),
			displayRule(rules.four_riichi_draw_enabled, 'Four riichi abort'),
			displayRule(rules.four_kan_draw_enabled, 'Four kan abort'),
			displayRule(rules.triple_ron_draw_enabled, 'Triple ron abort'),
		], [
			displayRule(rules.aka_count, 'Aka dora', rules.aka_count, rules.aka_count),
			displayRule(rules.dora_enabled, 'Dora'),
			displayRule(rules.kan_dora_enabled, 'Kan dora'),
			displayRule(rules.ura_dora_enabled, 'Ura dora'),
			displayRule(rules.kan_ura_dora_enabled, 'Kan ura dora'),
			displayRule(rules.immediate_kan_dora, 'Immediate reveal'),
		], [
			displayRule(rules.min_han - 1, 'Minimum han', rules.min_han > 1, rules.min_han),
			displayRule(rules.open_tanyao_enabled, 'Open tanyao'),
			displayRule(rules.renhou_enabled, 'Renhou', rules.renhou_enabled, (rules.renhou_enabled === 1 ? 'mangan' : 'yakuman')),
			displayRule(rules.nagashi_mangan_enabled, 'Nagashi mangan'),
			displayRule(rules.ippatsu_enabled, 'Ippatsu'),
			displayRule(rules.last_turn_riichi_enabled, 'No draw riichi'),
		], [
			displayRule(rules.pao_mode !== 2, 'Pao', rules.pao_mode !== 2, (rules.pao_mode === 0 ? 'daisangen, daisuushi' : 'daisangen, daisuushi, suukantsu')),
			displayRule(rules.can_rob_ankan_for_13_orphans, 'Kokushi ankan chankan'),
			displayRule(rules.kazoe_yakuman_enabled, 'Kazoe yakuman'),
			displayRule(rules.double_yakuman_enabled, 'Double yakuman'),
			displayRule(rules.multiple_yakuman_enabled, 'Multiple yakuman'),
		],
	];

	if (rules.players === 3) {
		fields[1][4] = displayRule(rules.tsumo_loss_enabled, 'Tsumo loss');
	}

	const rulesEmbed = new MessageEmbed()
		.setColor('#F532E1')
		.setTitle(`${rules.players} player ${rules.dora_dorara ? 'DoraDorara' : (rules.asura ? 'Battle of Asura' : (rules.bloodshed ? 'Bloodshed Skirmish' : 'Riichi'))} ${rules.mode === 1 ? 'Tonpuu' : 'Hanchan'}`)
		.setDescription(fields[0].join('\n'))
		.addFields(
			{ name: 'Basic Rules', value: fields[1].join('\n'), inline: true },
			{ name: 'Continuation', value: fields[2].join('\n'), inline: true },
			{ name: 'Aborts', value: fields[3].join('\n'), inline: true },
			{ name: 'Dora', value: fields[4].join('\n'), inline: true },
			{ name: 'Yaku', value: fields[5].join('\n'), inline: true },
			{ name: 'Yakuman', value: fields[6].join('\n'), inline: true },
		);
	await interaction.reply({
		embeds: [rulesEmbed],
	});
}

export async function setLobby(interaction) {
	const lobbyNumber = parseInt(interaction.options.getString('set'));
	const guild = interaction.guildId;

	if (!CONFIG[guild].spreadsheet || CONFIG[guild].spreadsheet === '') {
		interaction.reply({
			ephemeral: true,
			content: '**Error:** Nagare has not yet been initialized for this guild.\nPlease use `/help` first to get started.',
		});
		return;
	}

	if (!lobbyNumber || lobbyNumber > 999999) {
		interaction.reply({
			ephemeral: true,
			content: '**Error:** Please provide the 6-digit Mahjong Soul room ID.',
		});
		return;
	}
	await interaction.deferReply({ ephemeral: true });
	const res = await contest_list();
	if (!res || res.error) {
		interaction.editReply({
			content: `**Error:** Could not connect to Mahjong Soul. Code ${res.error}\nPlease try again.`,
		});
		return;
	}
	const contest = res.find(c => c.contest_id === lobbyNumber);
	if (!contest) {
		interaction.editReply({
			content: '**Error:** Could not find contest.\nPlease ensure **69093925** is an admin of the lobby.',
		});
		return;
	}

	const rules = await contest_details(contest.season.uniqueId_);
	const games = await get_logs(contest.season.uniqueId_, contest.season.seasonId_);

	CONFIG[guild].majsoul = {
		lastgame: games.record_list?.[0]?.uuid ?? '',
		room: lobbyNumber,
		lobby: contest.season.uniqueId_,
		season: contest.season.seasonId_,
		players: rules.game_mode.mode > 10 ? 3 : 4,
	};
	interaction.editReply({
		content: `${contest.contest_name[0].content} **${CONFIG[guild].majsoul.room}**\nExpires <t:${contest.season.endTime_}:f>`,
	});
	await exportFile();
}

export async function showLobby(interaction) {

	const guild = interaction.guildId;

	if (!CONFIG[guild].majsoul.lobby) {
		interaction.reply({
			content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
		});
		return;
	}

	await interaction.reply({
		content: `# ${CONFIG[guild].majsoul.room}`,
	});
}

export async function pauseGame(interaction, mode = 1) {

	const guild = interaction.guildId;

	if (!CONFIG[guild].majsoul.lobby) {
		interaction.reply({
			content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
		});
		return;
	}

	const player = interaction.options.getString('player');
	const res = await pause_player_game(CONFIG[guild].majsoul.lobby, CONFIG[guild].majsoul.season, player, mode);
	if (res === null) {
		await interaction.reply({
			ephemeral: true,
			content: `**Error**: Player ${player} not found in game.`,
		});
		return;
	}
	if (res.error?.code === 1208 + mode) {
		await interaction.reply({
			ephemeral: true,
			content: `**Error**: Game already ${mode === 1 ? 'paused' : 'resumed'}.`,
		});
		return;
	}
	await interaction.reply({
		ephemeral: true,
		content: `${mode === 1 ? 'Paused' : 'Resumed'} game for ${player}.`,
	});
}

export async function resumeGame(interaction) {
	await pauseGame(interaction, 2);
}

export async function terminateGame(interaction) {
	const guild = interaction.guildId;
	if (!CONFIG[guild].majsoul.lobby) {
		interaction.reply({
			content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
		});
		return;
	}

	const player = interaction.options.getString('player');
	const res = await terminate_player_game(CONFIG[guild].majsoul.lobby, CONFIG[guild].majsoul.season, player);
	if (res === null) {
		await interaction.reply({
			ephemeral: true,
			content: `**Error**: Player ${player} not found in game.`,
		});
		return;
	}

	await interaction.reply({
		ephemeral: true,
		content: `Terminated game for ${player}.`,
	});
}

export async function registerPlayer(interaction) {
	const guild = interaction.guildId;

	if (!CONFIG[guild].majsoul.lobby) {
		interaction.reply({
			content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
		});
		return;
	}

	const player = interaction.options.getInteger('code');
	if (!player || player < 1E7) {
		await interaction.reply({
			ephemeral: true,
			content: '**Error**: Invalid friend code.\nFind it in-game in the top right of the Friends page or on the top of the Tournament page.',
		});
		return;
	}
	await interaction.deferReply({
		ephemeral: true,
	});
	const res = await add_player_by_id(CONFIG[guild].majsoul.lobby, CONFIG[guild].majsoul.season, player);
	if (res.success?.length > 0) {
		const found = await search_players(CONFIG[guild].majsoul.lobby, CONFIG[guild].majsoul.season, player);
		if (found?.total === 0) {
			await interaction.editReply({
				content: '**Error**: Could not add player.',
			});
			return;
		}
		await interaction.editReply({
			content: `Successfully registered player **${found.list[0].nickname}** to the lobby.`,
		});
	} else {
		await interaction.editReply({
			content: '**Error**: Could not add player.',
		});
	}
}

// --------------------------------------------------------------------------
// * Get list of players who are readied
// --------------------------------------------------------------------------

export async function pingReadiedPlayers(guild, interaction = null, persistent = false) {

	try {
		const lobby = CONFIG[guild].majsoul.lobby;
		const season = CONFIG[guild].majsoul.season;

		if (!lobby) {
			if (persistent) {
				PERSISTENT[guild].list.edit({
					content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
				});
				return;
			} else {
				interaction?.reply({
					content: 'No lobby set! Use `/lobby set` to set the Majsoul lobby to listen to.',
				});
				interactionTimeout(guild);
				return;
			}
		}

		if (!liveInteraction[guild] && !interaction && !persistent) {
			interactionTimeout(guild);
			return;
		}
		const res = await active_players(lobby, season);
		let content;
		if (res.error) {
			content = res.error;
		} else {
			const readyPlayers = res.map(p => p.nickname);
			if (++sequence % 4 === 0) {
				await getStatus(lobby, season, guild);
			}
			const playingString = currentGames.length > 0 ? `\n**Playing (${currentGames.length * CONFIG[guild].majsoul.players}):**\n${currentGames.join('\n')}` : '';
			if (readyPlayers.length === 0 || readyPlayers[0] === '') {
				content = `# **${CONFIG[guild].majsoul.room}**\n**Ready (0)**${playingString}`;
			} else {
				readyPlayers.sort(function(a, b) {
					return a.toLowerCase().localeCompare(b.toLowerCase());
				});
				content = `# **${CONFIG[guild].majsoul.room}**\n**Ready (${readyPlayers.length}):** ${readyPlayers.join(', ')}${playingString}`;
			}
		}

		const bottom = `\n\n-# Updated <t:${Math.floor(Date.now() / 1000)}:T>`;
		content += bottom;

		if (interaction) {
			const row = new MessageActionRow()
				.addComponents(
					new MessageButton()
						.setCustomId('shuffle')
						.setLabel('Shuffle')
						.setStyle('PRIMARY')
						.setEmoji('🎲'),
				);
			liveInteraction[guild] = interaction;
			liveInteraction[guild].reply({
				content: content,
				components: [row],
			});
		} else if (persistent) {
			if (!timedout[guild]) {
				await PERSISTENT[guild].list.edit({
					content: content,
				});
			}
		} else {
			liveInteraction[guild].editReply(content);
		}
	} catch (e) {
		console.log(e);
		persistent ? clearPersistentTimeout(guild) : interactionTimeout(guild);
	}
}

async function getStatus(lobby, season, guild) {
	const playersPerTable = CONFIG[guild].majsoul.players;
	const updates = await live_status(lobby, season);
	currentGames = [];
	for (const game of updates) {
		if (game?.wind > -1) {
			const playerList = game.players.map((o, i) => `${game.wind % playersPerTable === i ? '**' : ''}${o.nickname ?? '🤖'}${game.wind % playersPerTable === i ? '**' : ''} ${(o.score / 1000).toFixed(1)}ᵏ`).join(', ');
			currentGames.push(`　\`${ROUNDS[(game.round * 4) + game.wind]}-${game.honba}\` ${playerList}`);
		}
	}
	if (updates.length > 0) setPersistentTimeout(guild);
}

// --------------------------------------------------------------------------
// * Shuffle players
// --------------------------------------------------------------------------

export async function shufflePlayers(interaction) {
	const guild = interaction.guildId;
	const lobby = CONFIG[guild].majsoul.lobby;
	const season = CONFIG[guild].majsoul.season;
	const playersPerTable = CONFIG[guild].majsoul.players;

	if (!checkPermissions(interaction)) return;
	try {
		const readiedPlayers = await active_players(lobby, season);
		const numTables = (readiedPlayers.length - (readiedPlayers.length % playersPerTable)) / playersPerTable;

		if (readiedPlayers.length < playersPerTable) {
			interaction.reply({
				ephemeral: true,
				content: `Not enough players are ready to start a table. (${readiedPlayers.length})`,
			});
			waiting[guild] = false;
			return;
		}
		await interactionTimeout(guild);

		tables = [];

		shuffle(readiedPlayers);
		console.log(readiedPlayers);

		if (CONFIG[guild].persistent.channel) interaction.deferUpdate();

		for (let i = 0; i < numTables; i++) {
			if (playersPerTable === 4) {
				tables.push(`<:sw:848707751391920178>${WINDEMOJI[0]} ${readiedPlayers[4 * i].nickname} ${WINDEMOJI[1]} ${readiedPlayers[4 * i + 1].nickname} ${WINDEMOJI[2]} ${readiedPlayers[4 * i + 2].nickname} ${WINDEMOJI[3]} ${readiedPlayers[4 * i + 3].nickname}`);
			} else {
				tables.push(`<:sw:848707751391920178>${WINDEMOJI[0]} ${readiedPlayers[3 * i].nickname} ${WINDEMOJI[1]} ${readiedPlayers[3 * i + 1].nickname} ${WINDEMOJI[2]} ${readiedPlayers[3 * i + 2].nickname}`);
			}
		}
		if (readiedPlayers.length % playersPerTable !== 0) {
			console.log(readiedPlayers.length);
			const orphans = [];
			for (let j = numTables * playersPerTable; j < readiedPlayers.length; j++) {
				orphans.push(readiedPlayers[j].nickname);
			}
			tables.push(`**Unpaired: **${orphans.join(', ')}`);
		}
		tables.push('');
		tables.push(`-# The button was pushed by ${interaction.user.toString()}`);
		let message;
		if (CONFIG[guild].persistent.channel) {
			message = await CHANNEL[guild].send({
				content: tables.join('\n'),
			});
		} else {
			await interaction.reply({
				ephemeral: false,
				content: tables.join('\n'),
			});
			message = await interaction.fetchReply();
		}
		await fireGames(readiedPlayers, message);
	} catch (e) {
		waiting[guild] = false;
		if (CONFIG[guild].persistent.channel) {
			CHANNEL[guild].send({
				content: `**Button error:** ${e}`,
			});
		} else {
			interaction.reply({
				ephemeral: false,
				content: `**Button error:** ${e}`,
			});
		}
	}
}

// --------------------------------------------------------------------------
// * Fire games
// --------------------------------------------------------------------------

async function fireGames(playerList, message) {
	const guild = message.guildId;
	const lobby = CONFIG[guild].majsoul.lobby;
	const season = CONFIG[guild].majsoul.season;
	const rules = await contest_details(lobby);
	if (!rules || rules.error) {
		message.channel.send('**Error firing games.** Please try again.');
	}
	const playersPerTable = rules.game_mode.mode > 10 ? 3 : 4;
	const points = new Array(playersPerTable).fill(rules.game_mode.detail_rule.init_point);

	if (playersPerTable !== CONFIG[guild].majsoul.players) {
		message.edit('Number of players per table in lobby changed. Please hit the button again.');
		CONFIG[guild].majsoul.players = playersPerTable;
		await exportFile();
		waiting[guild] = false;
		return;
	}

	clearInterval(intervalLog[guild]);
	intervalLog[guild] = setInterval(parseMessage, 30000, guild);
	console.log(`${guild} interval now 30s`);
	setPersistentTimeout(guild);
	const numTables = (playerList.length - (playerList.length % playersPerTable)) / playersPerTable;

	const tableInfo = [];
	const failedTables = [];
	let doneTables = 0;

	for (let i = 0; i < numTables; i++) {
		const tablePlayers = playerList.slice(i * playersPerTable, (i + 1) * playersPerTable).map(p => p.account_id);
		tableInfo[i] = tablePlayers[0];
		try {
			const res = await start_game(lobby, season, tablePlayers, points, false);
			if (JSON.stringify(res) !== '{}') {
				tables[i] = `<:sx:848707751382482974>${tables[i].substring(24)}`;
				message.channel.send(`　**Failed to start game ${i + 1}**. Will retry shortly.`);
				failedTables.push(i);
			}
			message.edit(tables.join('\n'));
		} catch (e) {
			message.channel.send(`**Error:** ${e} (Will retry shortly)`);
		}
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	// Retry failed tables if any
	if (failedTables.length > 0) {
		await new Promise(resolve => setTimeout(resolve, 5000));
		for (let i = 0; i < failedTables.length; i++) {
			const tablePlayers = playerList.slice(failedTables[i] * playersPerTable, (failedTables[i] + 1) * playersPerTable).map(p => p.account_id);
			tableInfo[i] = tablePlayers[0];
			try {
				const res = await start_game(lobby, season, tablePlayers, points, false);
				if (JSON.stringify(res) !== '{}') {
					tables[i] = `<:sx:848707751382482974>${tables[i].substring(24)}`;
					message.channel.send(`　**Failed to start game ${i + 1}**. Try again later.`);
					tableInfo[i] = null;
					doneTables++;
				}
				message.edit(tables.join('\n'));
			} catch (e) {
				message.channel.send(`**Error:** ${e}`);
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}
	for (let t = 0; t < 3; t++) {
		// Check active game plans to see if games have started
		await new Promise(resolve => setTimeout(resolve, 2000));
		const notStartedList = await game_plan_list(lobby, season);
		for (let i = 0; i < tableInfo.length; i++) {
			if (tableInfo[i] && (notStartedList.length === 0 || !notStartedList.some(g => g.accounts[0].account_id === tableInfo[i]))) {
				// game started
				tables[i] = `<:so:848707751408304138>${tables[i].substring(24)}`;
				tableInfo[i] = null;
				doneTables++;
			}
		}
		message.edit(tables.join('\n'));
		if (doneTables === numTables) break;
		await new Promise(resolve => setTimeout(resolve, 3000));
	}
	if (doneTables !== numTables) {
		for (let i = 1; i < tableInfo.length; i++) {
			if (tableInfo[i]) {
				tables[i] = `<:sx:848707751382482974>${tables[i].substring(24)}`;
				message.channel.send(`　**Failed to start game ${i + 1}**. Try again later.`);
			}
		}
		message.edit(tables.join('\n'));
		const notStartedList = await game_plan_list(lobby, season);
		for (const g of notStartedList) await remove_game_plan(lobby, season, g.uuid);
	}
}

// --------------------------------------------------------------------------
// * Parse config
// --------------------------------------------------------------------------

export async function parseMessage(guild) {
	const lobby = CONFIG[guild].majsoul.lobby;
	const season = CONFIG[guild].majsoul.season;
	let lastgame = CONFIG[guild].majsoul.lastgame;

	if (!lobby) return;

	const games = await get_logs(lobby, season);
	if (lastgame === '') lastgame = games.record_list?.[0]?.uuid ?? '';

	if (lastgame !== '' && games.record_list?.[0] && games.record_list?.[0]?.uuid !== lastgame) {
		for (const l of games.record_list) {
			try {
				if (l.uuid === lastgame) {
					break;
				} else {
					const players = l.result.players;
					for (const p of players) p.nickname = l.accounts[p.seat].nickname;
					const gameScore = {
						players,
						log: l.uuid,
						time: l.end_time - l.start_time,
					};
					await score(gameScore, guild, true);
				}
			} catch (e) {
				console.error(`**Log error:** ${e}`);
			}
		}
	}
	if (games.record_list?.[0]?.uuid && (games.record_list?.[0]?.uuid !== CONFIG[guild].majsoul.lastgame)) {
		await exportFile();
		CONFIG[guild].majsoul.lastgame = games.record_list?.[0]?.uuid ?? '';
	}

	const activeGames = await active_games(lobby, season);

	if (activeGames.length === 0) {
		clearInterval(intervalLog[guild]);
		intervalLog[guild] = setInterval(parseMessage, 1800000, guild);
		console.log(`${guild} interval now 30m`);
	}
}

// --------------------------------------------------------------------------
// * Score games
// --------------------------------------------------------------------------

export async function addGame(interaction) {
	const uuid = interaction.options.getString('log').match(/[a-f0-9]{4,}-[a-f0-9]{8,}-[a-f0-9]{4,}-[a-f0-9]{4,}-[a-f0-9]{4,}-[a-f0-9]{12,}/)?.[0];
	const guild = interaction.guildId;
	const lobby = CONFIG[guild].majsoul.lobby;
	const season = CONFIG[guild].majsoul.season || 1;

	if (!lobby) {
		interaction.reply({
			ephemeral: true,
			content: '**Error:** Cannot find lobby link for this guild',
		});
		return;
	}

	if (!uuid) {
		interaction.reply({
			ephemeral: true,
			content: '**Error:** Invalid log identifier.',
		});
		return;
	}

	await interaction.deferReply({
		ephemeral: true,
	});
	const result = await game_log(lobby, season, uuid);
	if (!result) {
		interaction.editReply({
			content: 'Game not found',
		});
		return;
	}
	interaction.editReply({
		content: 'Scoring...',
	});
	await score(result, guild);
}

export async function formatScores(guild, sheet) {

	const monthDisplay = ['**　 **__**`Total `**__ __**`Gm`**__ __**`Player`**__'];
	const weekDisplay = [...monthDisplay];

	for (let i = 2; i < 83; i++) {
		if (!sheet.getCell(i, 0).value || sheet.getCell(i, 2).value === 0) {
			break;
		}
		monthDisplay.push(`${i - 1}. \`${sheet.getCell(i, 4).formattedValue}\` \`${sheet.getCell(i, 2).formattedValue}\` ${sheet.getCell(i, 1).value}`);
	}

	for (let i = 2; i < 83; i++) {
		if (!sheet.getCell(i, 9).value || sheet.getCell(i, 11).value === 0) {
			break;
		}
		weekDisplay.push(`${i - 1}. \`${sheet.getCell(i, 13).formattedValue}\` \`${sheet.getCell(i, 11).formattedValue}\` ${sheet.getCell(i, 10).value}`);
	}

	return { monthDisplay, weekDisplay };
}

async function score(result, guild, upload = true) {
	console.log(`SCORING ${result.log}`);
	if (scoredGames.includes(result.log)) return;
	scoredGames.push(result.log);

	try {
		const playersPerTable = CONFIG[guild].majsoul.players;

		const final = [];
		const display = [];

		for (let i = 0; i < playersPerTable; i++) {
			final[i] = result.players[i].total_point / 1000;
			display[i] = `${result.players[i].nickname} **${final[i] > 0 ? '+' : '−'}${Math.abs(final[i]).toFixed(1)}**`;
		}
		console.log(`${display.join(' ・ ')}`);

		if (upload) {
			const text = `**Game finished!** ⏲️ ${Math.floor(result.time / 60)}:${('0' + (result.time % 60)).substr(-2)}\n${display.join('<:dd:910815362776461312>')}\nhttps://mahjongsoul.game.yo-star.com/?paipu=${result.log}`;
			await CHANNEL[guild].send({ content: text });
		}
		const date = new Intl.DateTimeFormat('fr-ca').format(new Date());
		const sendData = {
			'Date': date,
			'1 Name': result.players[0].nickname, '1 Score': final[0], '1 Shuugi': 0, '1 Total': final[0],
			'2 Name': result.players[1].nickname, '2 Score': final[1], '2 Shuugi': 0, '2 Total': final[1],
			'3 Name': result.players[2].nickname, '3 Score': final[2], '3 Shuugi': 0, '3 Total': final[2],
			'4 Name': result.players[3]?.nickname ?? '', '4 Score': final[3] ?? '', '4 Shuugi': 0, '4 Total': final[3] ?? '',
			'Log': result.log,
		};
		await sendToSpreadsheet(guild, 'Games', 'USER_ENTERED', sendData);
		await updatePersistentScores(guild);
	} catch (e) {
		await CHANNEL[guild].send({ content: e });
	}
}
import { CONFIG, LEVELS, WINDEMOJI, LIMITVALUES, CHANNEL, PERSISTENT } from './constants.js';
import { sheets, exportFile, liveInteraction, interactionTimeout, setPersistentTimeout,
	waiting, intervalLog, checkStatus, makeChart, sendToSpreadsheet, updatePersistentScores,
	timedout, checkPermissions } from './common.js';
import { writeFileSync } from 'fs';
import shuffle from 'shuffle-array';
import { convlog } from './convlog.js';
import fetch from 'node-fetch';
import { Util, MessageActionRow, MessageButton, MessageEmbed } from 'discord.js';
// import { parseTenhouRules as parseRules } from './utils.js';

let tables = [];
const scoredGames = [];

export function loadHelp(channel, user, admin) {
	const guild = channel.guildId;
	if (admin) {
		channel.send(`***Hi! I'm Nagare!*** Use \`/\` for a list of commands.\n**　Results channel:** <#${CONFIG[guild].channelid}>\n**　Tenhou lobby:** ${CONFIG[guild].tenhou.lobby}`);
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
	if (!CONFIG[guild].tenhou.lobby || CONFIG[guild].tenhou.lobby === 0) {
		display.lobby = '⚠️ **Warning!** No lobby ID set!\nUse `/lobby set` to link a Tenhou lobby.';
		warning = true;
	} else {
		const res = await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${CONFIG[guild].tenhou.lobby}`, { method: 'GET', headers: { 'Content-Type': 'text/plain' } });
		if (!res.ok) {
			display.lobby = `⚠️ **Warning!** Error connecting to lobby ${CONFIG[guild].tenhou.lobby.toString().substring(0, 8)}! (HTTP ${res.status})\nUse \`/lobby set\` to link a new lobby or try again later.`;
			warning = true;
		} else {
			const text = await res.text();
			console.log(text);
			if (text.indexOf('"RULE":""') > 0) {
				display.lobby = `⚠️ **Warning!** Lobby ${CONFIG[guild].tenhou.lobby.toString().substring(0, 8)} does not exist!\nUse \`/lobby set\` to link a new lobby.`;
				warning = true;
			} else {
				const title = decodeURI(text.substring(13, text.indexOf('"RULE"') - 2));
				const expiry = text.substring(text.indexOf('"RULE"') + 21, text.indexOf('"RULE"') + 33);
				const date = Date.UTC(expiry.substring(0, 4), expiry.substring(4, 6) - 1, expiry.substring(6, 8), expiry.substring(8, 10), expiry.substring(10, 12)) / 1000 - 32400; // UTC+9
				display.lobby = `　　Connected to lobby **${CONFIG[guild].tenhou.lobby.toString().substring(0, 8)}** (${title})\n　　Lobby expires <t:${date}:R> (<t:${date}>)`;
			}
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
		display.result += `\n　　Hand details will be shown for **${LEVELS[CONFIG[guild].display]}**.`;
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

**__TENHOU LOBBY__**
　**\`/client [client]\`:** Set the client to manage.
　**\`/lobby [?set]\`:** Show (or set) the current Tenhou lobby.
${display.lobby}

**__STARTING GAMES__**
　**\`/persistent [on|off]\`:** Displays (or disables) a persistent player list and scoreboard.${CONFIG[guild].persistent.channel ? `\n　　Persistent message enabled: https://discord.com/channels/${guild}/${CONFIG[guild].persistent.channel}/${CONFIG[guild].persistent.list}` : ''}
　**\`/list\`:** List the current readied players and show a button to start games.
　**\`/permissions [add|remove|view] [role]\`:** Set (or show) roles that can hit the button to start games.
${display.starting}

**__LOBBY / IN GAME__**
　**\`/register [id]\`:** Register a Majsoul friend ID into the lobby.
　**\`/pause [username]\`:** *Does nothing on Tenhou.*
　**\`/resume [username]\` (alias \`/unpause\`):** *Does nothing on Tenhou.*

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
		.setTitle('Nagare Help - Current mode: Tenhou')
		.setDescription(message);

	await interaction.editReply({
		embeds: [embed],
	});
}

export async function showRules(interaction) {
	/* const guild = interaction.guildId;
	const res = await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${CONFIG[guild].tenhou.lobby}`, { method: 'GET', headers: { 'Content-Type': 'text/plain' } });
	const text = await res.text();
	const rules = parseRules(text); */

	await interaction.reply({
		ephemeral: true,
		content: 'Coming soon for Tenhou!',
	});

	/* const oka = (rules.goal_points - rules.starting_points) / 1000;
	const uma = new Array(rules.players).fill(oka);
	for (let i = 0; i < rules.players - 1; i++) {
		uma[0] -= rules.uma[i];
		uma[i + 1] += rules.uma[i];
	}

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
			displayRule(rules.immediate_kan_dora, 'Reveal dora immediately'),
		], [
			displayRule(rules.min_han - 1, 'Minimum han', rules.min_han > 1, rules.min_han),
			displayRule(rules.open_tanyao_enabled, 'Open tanyao'),
			displayRule(rules.renhou_enabled, 'Renhou', rules.renhou_enabled, (rules.renhou_enabled === 1 ? ': **mangan**' : ': **yakuman**')),
			displayRule(rules.nagashi_mangan_enabled, 'Nagashi mangan'),
			displayRule(rules.ippatsu_enabled, 'Ippatsu'),
			displayRule(rules.last_turn_riichi_enabled, 'No draw riichi'),
		], [
			displayRule(rules.pao_mode !== 2, 'Pao', rules.pao_mode !== 2, (rules.pao_mode === 0 ? ': **daisangen, daisuushi**' : ': **daisangen, daisuushi, suukantsu**')),
			displayRule(rules.can_rob_ankan_for_13_orphans, 'Kokushi ankan chankan'),
			displayRule(rules.kazoe_yakuman_enabled, 'Kazoe yakuman'),
			displayRule(rules.double_yakuman_enabled, 'Double yakuman'),
			displayRule(rules.multiple_yakuman_enabled, 'Multiple yakuman'),
		],
	];

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
	}); */
}

function getLobbyLink(guild) {
	return `# ${CONFIG[guild].tenhou.lobby.toString().substring(0, 8)}\nhttps://tenhou.net/4/?C${CONFIG[guild].tenhou.lobby.toString().substring(0, 8)}`;
}

export async function setLobby(interaction) {
	const lobbyNumber = interaction.options.getString('set').match(/\d{16}/)?.[0];
	const guild = interaction.guildId;

	if (!CONFIG[guild].spreadsheet || CONFIG[guild].spreadsheet === '') {
		interaction.reply({
			ephemeral: true,
			content: '**Error:** Nagare has not yet been initialized for this guild.\nPlease use `/help` first to get started.',
		});
		return;
	}

	if (!lobbyNumber) {
		interaction.reply({
			ephemeral: true,
			content: '**Error:** Please provide the full 16-digit Tenhou lobby ID.',
		});
		return;
	}
	await interaction.deferReply({ ephemeral: true });
	const res = await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${lobbyNumber}`, { method: 'GET', headers: { 'Content-Type': 'text/plain' } });
	if (!res.ok) {
		interaction.editReply({
			content: `**Error:** Could not connect to Tenhou lobby (HTTP ${res.status}).\nPlease double check the lobby ID and try again.`,
		});
		return;
	}
	const text = await res.text();
	console.log(text);
	if (text.indexOf('"RULE":""') > 0) {
		interaction.editReply({
			content: '**Error:** Could not load lobby administration page.\nPlease double check the lobby ID and try again.',
		});
		return;
	}
	CONFIG[guild].tenhou.lobby = lobbyNumber;
	interaction.editReply({
		content: getLobbyLink(guild),
	});
	await exportFile();
}

export async function showLobby(interaction) {
	const guild = interaction.guildId;
	await interaction.reply({
		content: getLobbyLink(guild),
	});
}

export async function pauseGame(interaction) {
	await interaction.reply({
		ephemeral: true,
		content: '**Error**: Pausing not supported in Tenhou.',
	});
}

export async function resumeGame(interaction) {
	await pauseGame(interaction);
}

export async function registerPlayer(interaction) {
	await interaction.reply({
		ephemeral: true,
		content: 'No need to register on Tenhou! Just join the lobby.',
	});
}

export async function terminateGame(interaction) {
	await interaction.reply({
		ephemeral: true,
		content: '*To be implemented soon.*',
	});
}


// --------------------------------------------------------------------------
// * Get list of players who are readied
// --------------------------------------------------------------------------

export async function pingReadiedPlayers(guild, interaction = null, persistent = false) {

	if ((!liveInteraction[guild] || liveInteraction[guild]?.deleted) && !interaction && !persistent) {
		interactionTimeout(guild);
		return;
	}
	const res = await fetch('https://tenhou.net/cs/edit/cmd_get_players.cgi', { method: 'POST', body: `L=C${CONFIG[guild].tenhou.lobby}`, headers: { 'Content-Type': 'text/plain' } });
	let content;
	if (!res.ok) {
		content = `**HTTP ${res.status}**: ${res.statusText}`;
	} else {
		const text = await res.text();
		const readiedPlayers = decodeURI(text.substring(text.indexOf('IDLE=') + 5, text.lastIndexOf('&PLAY='))).trim().split(',');
		console.log(readiedPlayers);
		const playingPlayers = decodeURI(text.substring(text.indexOf('PLAY=') + 5)).split(',');
		const index = readiedPlayers.indexOf('nTourney'); // TODO: Replace with BotName string
		if (index > -1) { readiedPlayers.splice(index, 1); }
		const playingString = `\n**Playing (${playingPlayers.length}):** ${playingPlayers.join(', ')}`;
		if (readiedPlayers.length === 0 || readiedPlayers[0] === '') {
			content = `${getLobbyLink(guild)}\n\n**Ready (0)**${playingPlayers.length < 2 ? '' : playingString}`;
		} else {
			readiedPlayers.sort(function(a, b) {
				return a.toLowerCase().localeCompare(b.toLowerCase());
			});
			content = `${getLobbyLink(guild)}\n\n**Ready (${readiedPlayers.length}):** ${readiedPlayers.join(', ')}${playingPlayers.length < 2 ? '' : playingString}`;
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
			PERSISTENT[guild].list.edit({
				content: content,
			});
		}
	} else {
		liveInteraction[guild].editReply(content);
	}
}


// --------------------------------------------------------------------------
// * Shuffle players
// --------------------------------------------------------------------------

export async function shufflePlayers(interaction) {
	const guild = interaction.guildId;
	if (!checkPermissions(interaction)) return;
	try {
		let readiedPlayers;
		await fetch('https://tenhou.net/cs/edit/cmd_get_players.cgi', { method: 'POST', body: `L=C${CONFIG[guild].tenhou.lobby}`, headers: { 'Content-Type': 'text/plain' } })
			.then(res => res.text())
			.then((text) => {
				console.log(text);
				readiedPlayers = decodeURI(text.substring(text.indexOf('IDLE=') + 5, text.lastIndexOf('&PLAY='))).split(',');
			});
		const index = readiedPlayers.indexOf('nTourney');
		if (index > -1) { readiedPlayers.splice(index, 1); }
		const numTables = (readiedPlayers.length - (readiedPlayers.length % 4)) / 4;

		if (readiedPlayers.length < 4) {
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

		for (let i = 0; i < numTables; i++) {
			tables.push(`<:sw:848707751391920178>${WINDEMOJI[0]} ${readiedPlayers[4 * i]} ${WINDEMOJI[1]} ${readiedPlayers[4 * i + 1]} ${WINDEMOJI[2]} ${readiedPlayers[4 * i + 2]} ${WINDEMOJI[3]} ${readiedPlayers[4 * i + 3]}`);
		}
		if (readiedPlayers.length % 4 !== 0) {
			console.log(readiedPlayers.length);
			const orphans = [];
			for (let j = numTables * 4; j < readiedPlayers.length; j++) {
				orphans.push(readiedPlayers[j]);
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
		fireGames(readiedPlayers, message);
	} catch (e) {
		waiting[guild] = false;
		interaction.reply(`**Button error:** ${e}`);
	}
}

// --------------------------------------------------------------------------
// * Fire games
// --------------------------------------------------------------------------

async function fireGames(playerList, message) {
	const guild = message.guildId;
	clearInterval(intervalLog[guild]);
	intervalLog[guild] = setInterval(parseMessage, 15000, guild);
	setPersistentTimeout(guild);
	const numTables = (playerList.length - (playerList.length % 4)) / 4;

	const startedTables = [];
	let retries = 0;

	// Get current lobby rules
	await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${CONFIG[guild].tenhou.lobby}`, { method: 'GET', headers: { 'Content-Type': 'text/plain' } })
		.then(res => res.text())
		.then((text) => {
			const ruleList = text.match(/"RULE":"[0-9a-f]{8,},[0-9a-f]{8,},[0-9a-f]{4,}/);
			if (ruleList) {
				const rules = ruleList[0].substring(ruleList[0].lastIndexOf(',') + 1);
				CONFIG[guild].tenhou.rules = rules;
				const ruleNumber = parseInt(rules, 16);
				CONFIG[guild].tenhou.shuugivalue = 0;
				if (ruleNumber & (1 << 9)) CONFIG[guild].tenhou.shuugivalue = 2;
				if (ruleNumber & (1 << 10)) CONFIG[guild].tenhou.shuugivalue = 5;
			}
		});

	while (startedTables.length < numTables) {
		for (let i = 0; i < numTables; i++) {
			if (startedTables.includes(i)) { continue; }
			const data = `L=C${CONFIG[guild].tenhou.lobby}&R2=${CONFIG[guild].tenhou.rules}&M=${playerList[4 * i + 0]}%0A${playerList[4 * i + 1]}%0A${playerList[4 * i + 2]}%0A${playerList[4 * i + 3]}&RND=default&WG=1&PW=`;
			console.log(data);
			try {
				await fetch('https://tenhou.net/cs/edit/cmd_start.cgi', { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })
					.then(res => res.text())
					.then((text) => {
						const prettyText = decodeURI(text);
						console.log(prettyText);

						if (prettyText.startsWith('MEMBER NOT FOUND')) {
							tables[i] = `<:sx:848707751382482974>${tables[i].substring(24)}`;
							const failedPlayers = prettyText.trim().split('\r\n');
							message.channel.send(`　**Failed to start game ${i + 1}**: ${failedPlayers.join(', ')}`);
						} else {
							tables[i] = `<:so:848707751408304138>${tables[i].substring(24)}`;
							startedTables.push(i);
						}
						message.edit(tables.join('\n'));
					});
			} catch (e) {
				message.channel.send(`**Error:** ${e} (Will retry shortly)`);
			}
			await new Promise(resolve => setTimeout(resolve, 1500));
		}
		await new Promise(resolve => setTimeout(resolve, 10000));
		if (startedTables.length < numTables) {
			if (++retries > 3) {
				message.channel.send('**Game timed out.**');
				break;
			}
			message.channel.send(`**Retrying failed tables** (Attempt ${retries}/3)...`);
		}
	}
}

// --------------------------------------------------------------------------
// * Manually parse log
// --------------------------------------------------------------------------

export async function parseInteraction(interaction) {
	const guild = interaction.guildId;
	const logId = interaction.options.getString('log').match(/\d{10}gm-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{8}/);
	if (!logId) {
		await interaction.reply({
			ephemeral: true,
			content: '**Error:** Invalid log identifier.',
		});
		return;
	}
	await interaction.deferReply();
	const level = interaction.options.getInteger('minimum') ?? (CONFIG[guild].display ?? -1);
	const output = await parseLog(logId, level, false, interaction.guildId);
	console.log(output);
	if (output.error) {
		await interaction.editReply({
			content: `**Error:*	* ${output.error}`,
		});
		return;
	}
	const final = [];
	const display = [];
	const usingShuugi = output.result.shuugi ? 1 : 0;
	const multiplier = 1;
	console.log(usingShuugi);

	for (let j = 0; j < 4; j++) {
		const i = output.result.rank[j] - 1;
		final[i] = (parseFloat(output.result.points[j]) + (usingShuugi ? (output.result.shuugi[j] * CONFIG[guild].tenhou.shuugivalue) : 0.0));
		display[i] = `${output.result.names[j]} **${final[i] > 0 ? '+' : '−'}${usingShuugi ? 'ℝ' : ''}${Math.abs(final[i] * multiplier).toFixed(1 + usingShuugi)}**`;
		if (usingShuugi) display[i] += ` (${output.result.points[j] > 0 ? '+' : ''}${parseFloat(output.result.points[j]).toFixed(1)} ${output.result.shuugi[j] > 0 ? '+' : ''}${output.result.shuugi[j]}枚)`;
	}
	const displayLine = display.join('<:dd:910815362776461312>');
	const text = `${displayLine}\n[**Game log (${output.count} hand${output.count > 1 ? 's' : ''}):**](http://tenhou.net/4/?log=${logId})\n${output.text}`;
	const message = Util.splitMessage(text);
	if (message.length === 1) {
		await interaction.editReply({ content: message[0], files: output.chart });
	} else {
		await interaction.editReply({ content: message[0] });
		await interaction.followUp({ content: message[1], files: output.chart });
	}
}


// --------------------------------------------------------------------------
// * Parse config
// --------------------------------------------------------------------------

export async function parseMessage(guild) {
	try {
		if (!CONFIG[guild].tenhou.lobby) return;
		const text = await fetch('https://tenhou.net/cs/edit/cmd_get_log.cgi', { method: 'POST', body: `L=C${CONFIG[guild].tenhou.lobby}&T=${CONFIG[guild].tenhou.lasttime}`, headers: { 'Content-Type': 'text/plain' } })
			.then(checkStatus)
			.then(res => res.text());
		const split = text.split('\r\n');
		for (const message of split) {
			// console.log(`${guild}: ${message}`);
			const rxTime = message.substring(1, 20);
			const rxLog = message.match(/\d{10}gm-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{8}/);
			let rxName = message.match(/&un=[^,]*,[^,]*,[^,]*,[^,&]*/);
			let rxScore = message.match(/&sc=[^,]*,[^,]*,[^,]*,[^,&]*/);
			let rxShuugi = message.match(/&chip=[^,]*,[^,]*,[^,]*,[^,&]*/);
			if (rxLog) {
				let rxLogNames = decodeURIComponent(message.match(/#START [^ ]* [^ ]* [^ ]* [^ "]*/));
				rxLogNames = rxLogNames.substring(7).split(' ').join(',');
				if (!CONFIG[guild].tenhou.activegames[rxLog]) {
					CONFIG[guild].tenhou.activegames[rxLog] = rxLogNames;
					clearInterval(intervalLog[guild]);
					intervalLog[guild] = setInterval(parseMessage, 15000, guild);
					setPersistentTimeout(guild);
					console.log(`${rxTime}: ${rxLog} / ${rxLogNames}`);
					exportFile();
				}
				CONFIG[guild].tenhou.lasttime = rxTime;
			}
			if (rxName) {
				rxName = decodeURIComponent(rxName).toString().substring(4).split(',');
				const rxJoined = rxName.join(',');
				rxScore = rxScore.toString().substring(4).split(',');
				const usingShuugi = rxShuugi ? true : false;
				rxShuugi = rxShuugi?.toString().substring(6).split(',') ?? [0, 0, 0, 0];
				const log = Object.keys(CONFIG[guild].tenhou.activegames).find(key => CONFIG[guild].tenhou.activegames[key] === rxJoined);
				if (log) {
					CONFIG[guild].tenhou.lasttime = rxTime;
					const gameScore = {
						players: [
							{ name: rxName[0], score: parseFloat(rxScore[0]), shuugi: parseInt(rxShuugi[0]) },
							{ name: rxName[1], score: parseFloat(rxScore[1]), shuugi: parseInt(rxShuugi[1]) },
							{ name: rxName[2], score: parseFloat(rxScore[2]), shuugi: parseInt(rxShuugi[2]) },
							{ name: rxName[3], score: parseFloat(rxScore[3]), shuugi: parseInt(rxShuugi[3]) },
						],
						log: log,
						shuugi: usingShuugi,
					};
					gameScore.players.sort(function(a, b) {
						return b.score - a.score;
					});
					delete CONFIG[guild].tenhou.activegames[log];
					if (Object.keys(CONFIG[guild].tenhou.activegames).length === 0) {
						clearInterval(intervalLog[guild]);
						intervalLog[guild] = setInterval(parseMessage, 1800000, guild);
						console.log(`${guild} interval now 30m`);
					}
					console.log(`${rxTime}: ${JSON.stringify(gameScore)}`);
					await score(gameScore, guild, true);
					exportFile();
				}
			}
		}
	} catch (e) {
		console.log(`**Log error:** ${e} (in ${guild})`);
		clearInterval(intervalLog[guild]);
		intervalLog[guild] = setInterval(parseMessage, 1800000, guild);
		console.log(`${guild} interval now 30m`);
	}
	/*
	[2021/11/16 09:04:27] lobby=18935&type=0241&dan=2,12,5,11&rate=1483.21,1819.10,1479.92,1435.22&wg=8c7be24b&log=2021111609gm-0241-18935-49c77eab&cmd=<CHAT text="#START %41%72%61%6E%6C%79%64%65 %70%6F%69%6E%74 %77%6F%6C%66%6F%73 %4C%59%31%6E%58"/>
	[2021/11/16 09:14:58] lobby=18935&cmd=<CHAT text="#END %4C%59%31%6E%58(%2B51.4,%2B2%E6%9E%9A) %70%6F%69%6E%74(%2B9.7,%2B2%E6%9E%9A) %77%6F%6C%66%6F%73(-15.2,-1%E6%9E%9A) %41%72%61%6E%6C%79%64%65(-45.9,-3%E6%9E%9A) " />
	[2021/11/16 09:14:59] lobby=18935&type=0241&un=%41%72%61%6E%6C%79%64%65,%70%6F%69%6E%74,%77%6F%6C%66%6F%73,%4C%59%31%6E%58&sc=-45.9,9.7,-15.2,51.4&chip=-3,2,-1,2
	*/
}


// --------------------------------------------------------------------------
// * Score games
// --------------------------------------------------------------------------

export async function addGame(interaction) {
	const guild = interaction.guildId;
	const uuid = interaction.options.getString('log').match(/\d{10}gm-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{8}/)?.[0];
	if (!uuid) {
		await interaction.reply({
			ephemeral: true,
			content: '**Error:** Invalid log identifier.',
		});
		return;
	}
	const output = await parseLog(uuid, -1, false, guild);
	console.log(output);
	if (output.error) {
		await interaction.reply({
			ephemeral: true,
			content: `**Error:** ${output.error}`,
		});
		return;
	}
	const gameScore = {
		players: [
			{ name: output.result.names[0], score: output.result.points[0], shuugi: output.result.shuugi?.[0] },
			{ name: output.result.names[1], score: output.result.points[1], shuugi: output.result.shuugi?.[1] },
			{ name: output.result.names[2], score: output.result.points[2], shuugi: output.result.shuugi?.[2] },
			{ name: output.result.names[3], score: output.result.points[3], shuugi: output.result.shuugi?.[3] },
		],
		log: uuid,
		shuugi: output.result.shuugi ? 1 : 0,
	};
	interaction.reply({
		ephemeral: true,
		content: 'Scoring...',
	});
	await score(gameScore, guild);
}

export async function formatScores(guild, sheet) {

	const NYC = (guild === '685470974577082377');

	const shiftCharCode = Δ => c => String.fromCharCode(c.charCodeAt(0) + Δ);

	let monthDisplay = ['__**`  　　　　　　　　    Gm   Total    枚 `**__'];
	let weekDisplay = ['__**`  　　　　　　　　    Gm   Total    枚 `**__'];

	if (NYC) {
		monthDisplay = ['__**`  　　　　　　　　    Gm   RatBux    枚 `**__'];
		weekDisplay = ['__**`  　　　　　　　　    Gm   RatBux    枚 `**__'];
	}

	for (let i = 2; i < 83; i++) {
		if (!sheet.getCell(i, 0).value) {
			break;
		}
		monthDisplay.push(`${i - 1}. \`${sheet.getCell(i, 1).value?.replace(/[!-~]/g, shiftCharCode(0xFEE0))}${'　'.repeat(8 - sheet.getCell(i, 1).value.length)}   ${sheet.getCell(i, 2).formattedValue}   ${sheet.getCell(i, 3).formattedValue}   ${sheet.getCell(i, 5).formattedValue}\``);
	}

	for (let i = 2; i < 83; i++) {
		if (!sheet.getCell(i, 9).value) {
			break;
		}
		weekDisplay.push(`${i - 1}. \`${sheet.getCell(i, 10).value?.replace(/[!-~]/g, shiftCharCode(0xFEE0))}${'　'.repeat(8 - sheet.getCell(i, 10).value.length)}   ${sheet.getCell(i, 11).formattedValue}   ${sheet.getCell(i, 12).formattedValue}   ${sheet.getCell(i, 14).formattedValue}\``);
	}

	return { monthDisplay, weekDisplay };
}

// --------------------------------------------------------------------------
// * Parse Tenhou log
// --------------------------------------------------------------------------

/*
	- who              The player who won.
	- fromwho          Who the winner won from: themselves for tsumo, someone else for ron.
	- hai              The closed hand of the winner as a list of tiles.
	- m                The open melds of the winner as a list of melds.
	- machi            The waits of the winner as a list of tiles.
	- doraHai          The dora as a list of tiles.
	- dorahaiUra       The ura dora as a list of tiles.
	- yaku             List of yaku and their han values.
	- yakuman          List of yakuman.
	- ten              Three element list:
							The fu points in the hand,
							The point value of the hand,
							The limit value of the hand:
								0 -> No limit
								1 -> Mangan
								2 -> Haneman
								3 -> Baiman
								4 -> Sanbaiman
								5 -> Yakuman
	- ba               Two element list of stick counts:
							The number of combo sticks,
							The number of riichi sticks.
	- sc               List of scores and the changes for each player.
	- owari            Final scores including uma at the end of the game.
*/

// 2021121520gm-0009-16253-1c4f451f

async function parseLog(log, minimum = -1, after = false) {
	try {
		const NYC = false; // (guild === "685470974577082377");
		const nycShuugiValue = CONFIG['685470974577082377'].tenhou.shuugivalue * 1000;
		const nycMultiplier = CONFIG['685470974577082377'].tenhou.multiplier;
		const startScore = 25000;
		let res = await fetch(`https://tenhou.net/0/log/?${log}`, { method: 'GET', headers: { 'Content-Type': 'text/plain' } });
		if (!res.ok && after) {
			await new Promise(resolve => setTimeout(resolve, 10000));
			res = await fetch(`https://tenhou.net/0/log/?${log}`, { method: 'GET', headers: { 'Content-Type': 'text/plain' } });
		}
		if (!res.ok) {
			return { error: `**HTTP ${res.status}:** ${res.statusText}` };
		}
		const text = await res.text();

		writeFileSync(`./logs/${log}.xml`, text);

		const paifu = convlog(text, log);
		const shuugi = paifu.shuugi && paifu.shuugi[0] !== undefined;
		// const json = JSON.stringify(paifu, null, 4);
		// fs.writeFileSync(`${log}.json`, json);

		const winds = ['東', '南', '西', '北'];
		const fullwidth = ['１', '２', '３', '４'];
		const output = [];
		const names = paifu.player;
		const result = { names: names, scores: paifu.scores, points: paifu.points, rank: paifu.rank };
		const scores = { names: names, round: [''], p1: [], p2: [], p3: [], p4: [] };
		if (shuugi) {
			result.shuugi = paifu.shuugi;
			scores.shuugi = { p1: [], p2: [], p3: [], p4: [] };
		}
		let hands = 0;
		let lastround = -1;
		for (const round of paifu.log) {
			let display;
			for (const event of round) {
				if (event.hand) {
					hands++;
					display = `${winds[event.hand.wind]}${fullwidth[event.hand.round]}-${event.hand.honba}`;
					if (event.hand.round !== lastround) {
						lastround = event.hand.round;
						event.hand.round === 0 ? scores.round.push(winds[event.hand.wind]) : scores.round.push(fullwidth[event.hand.round]);
					} else {
						scores.round.push('');
					}
					if (NYC && shuugi) {
						scores.p1.push(((event.hand.scores[0] - startScore) + (event.hand.shuugi[0] * nycShuugiValue)) / 1000 * nycMultiplier);
						scores.p2.push(((event.hand.scores[1] - startScore) + (event.hand.shuugi[1] * nycShuugiValue)) / 1000 * nycMultiplier);
						scores.p3.push(((event.hand.scores[2] - startScore) + (event.hand.shuugi[2] * nycShuugiValue)) / 1000 * nycMultiplier);
						scores.p4.push(((event.hand.scores[3] - startScore) + (event.hand.shuugi[3] * nycShuugiValue)) / 1000 * nycMultiplier);
					} else {
						scores.p1.push(event.hand.scores[0]);
						scores.p2.push(event.hand.scores[1]);
						scores.p3.push(event.hand.scores[2]);
						scores.p4.push(event.hand.scores[3]);
					}
					if (shuugi) {
						scores.shuugi.p1.push(event.hand.shuugi[0]);
						scores.shuugi.p2.push(event.hand.shuugi[1]);
						scores.shuugi.p3.push(event.hand.shuugi[2]);
						scores.shuugi.p4.push(event.hand.shuugi[3]);
					}
				} else if (event.agari) {
					const agari = event.agari;
					const payouts = agari.from === null ? `∀ → ${names[agari.who]}` : `${names[agari.from]} → ${names[agari.who]}`;
					const value = agari.value;
					const formattedValue = `\`${value < 10000 ? ' ' : ''}${value}${shuugi ? `+${agari.chip < 10 ? ' ' : ''}${agari.chip}枚` : ''}\``;
					const yaku = agari.yaku.map(o => o.display);
					const level = agari.han ? `**${agari.han}/${agari.fu}**` : '★'.repeat(yaku.length);
					const limit = agari.level > 0 ? `${LIMITVALUES[agari.level]} ` : '';
					const hand = `${formattedValue} \`${display}\` ${payouts}<:db:921259034319921203>${limit}${level} ${yaku.join(', ')}`;
					console.log(hand);
					if (agari.level >= minimum) output.push(hand);
				} else if (event.abort) {
					const draw = event.abort;
					const formattedValue = `\`     ${shuugi ? '   　' : ''}\``;
					let bonus = '';
					if (draw.name === 'ryuukyoku') {
						const extra = [];
						for (let i = 0; i < draw.hands.length; i++) {
							if (draw.hands[i] !== '') extra.push(names[i]);
						}
						bonus = ` (${extra.length === 0 ? 'all noten' : extra.join(', ')})`;
					} else {
						bonus = ' abort';
					}
					const hand = `${formattedValue} \`${display}\` *${draw.name}${bonus}*`;
					console.log(hand);
					if (minimum === -1) output.push(hand);
				}
			}
		}
		if (NYC && shuugi) {
			scores.p1.push(((paifu.scores[0] - startScore) + (paifu.shuugi[0] * nycShuugiValue)) / 1000 * nycMultiplier);
			scores.p2.push(((paifu.scores[1] - startScore) + (paifu.shuugi[1] * nycShuugiValue)) / 1000 * nycMultiplier);
			scores.p3.push(((paifu.scores[2] - startScore) + (paifu.shuugi[2] * nycShuugiValue)) / 1000 * nycMultiplier);
			scores.p4.push(((paifu.scores[3] - startScore) + (paifu.shuugi[3] * nycShuugiValue)) / 1000 * nycMultiplier);
		} else {
			scores.p1.push(paifu.scores[0]);
			scores.p2.push(paifu.scores[1]);
			scores.p3.push(paifu.scores[2]);
			scores.p4.push(paifu.scores[3]);
		}
		if (shuugi) {
			scores.shuugi.p1.push(paifu.shuugi[0]);
			scores.shuugi.p2.push(paifu.shuugi[1]);
			scores.shuugi.p3.push(paifu.shuugi[2]);
			scores.shuugi.p4.push(paifu.shuugi[3]);
		}
		const buffer = await makeChart(scores, NYC && shuugi);
		return { chart: buffer, text: output.join('\n'), count: hands, result: result };
	} catch (e) {
		console.log(`**Log error:** ${e}`);
		return { error: e };
	}
}

async function score(result, guild, upload = true) {
	const parsed = await parseLog(result.log, CONFIG[guild].display, true, guild);

	console.log(`SCORING ${result.log}`);
	if (scoredGames.includes(result.log)) return;
	scoredGames.push(result.log);

	const multiplier = CONFIG[guild].tenhou.multiplier;

	const final = [];
	const display = [];

	for (let i = 0; i < 4; i++) {
		final[i] = (result.players[i].score + (result.players[i].shuugi * CONFIG[guild].tenhou.shuugivalue));
		display[i] = `${result.players[i].name} **${final[i] > 0 ? '+' : '−'}${result.shuugi ? 'ℝ' : ''}${Math.abs(final[i] * multiplier).toFixed(1 + result.shuugi)}**`;
		if (result.shuugi) display[i] += ` (${result.players[i].score > 0 ? '+' : ''}${result.players[i].score.toFixed(1)} ${result.players[i].shuugi > 0 ? '+' : ''}${result.players[i].shuugi}枚)`;
	}
	console.log(`${display.join(' ・ ')}`);

	if (upload) {
		if (parsed.error) {
			const text = `${display.join('<:dd:910815362776461312>')}\nhttp://tenhou.net/4/?log=${result.log}`;
			await CHANNEL[guild].send(text);
		} else {
			const text = `${display.join('<:dd:910815362776461312>')}\nhttp://tenhou.net/4/?log=${result.log}\n${parsed.text}`;
			const message = Util.splitMessage(text);
			if (message.length === 1) {
				await CHANNEL[guild].send({ content: message[0], files: parsed.chart });
			} else {
				await CHANNEL[guild].send({ content: message[0] });
				await CHANNEL[guild].send({ content: message[1], files: parsed.chart });
			}
		}
	}
	const date = new Intl.DateTimeFormat('fr-ca').format(new Date());
	const sendData = {
		'Date': date,
		'1 Name': result.players[0].name, '1 Score': result.players[0].score, '1 Shuugi': result.players[0].shuugi, '1 Total': final[0],
		'2 Name': result.players[1].name, '2 Score': result.players[1].score, '2 Shuugi': result.players[1].shuugi, '2 Total': final[1],
		'3 Name': result.players[2].name, '3 Score': result.players[2].score, '3 Shuugi': result.players[2].shuugi, '3 Total': final[2],
		'4 Name': result.players[3].name, '4 Score': result.players[3].score, '4 Shuugi': result.players[3].shuugi, '4 Total': final[3],
	};
	sendToSpreadsheet(guild, 'Games', 'USER_ENTERED', sendData);
	await updatePersistentScores(guild);
}
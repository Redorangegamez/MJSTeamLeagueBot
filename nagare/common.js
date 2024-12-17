import { readFileSync, writeFileSync } from 'fs';
import { CONFIG, LEVELS, PERSISTENT } from './constants.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { google_email, google_key } from './config.js';
import { MessageEmbed, MessageActionRow, MessageButton } from 'discord.js';
import { setAsyncInterval, clearAsyncInterval } from './async_intervals.js';
import * as tenhou from './tenhou.js';
import * as majsoul from './majsoul.js';

export const sheets = {};
export const intervalObj = {};
export const timeoutObj = {};
export const intervalLog = {};
export const liveInteraction = {};
export const waiting = {};
export const persistentObj = {};
export const persistentTimeout = {};

export const timedout = [];

const width = 500; // px
const height = 300; // px
const shuugiHeight = 370; // px

const clients = {
	tenhou,
	majsoul,
};

const canvas = new ChartJSNodeCanvas({
	width, height, chartCallback: (ChartJS) => {
		ChartJS.defaults.color = 'grey';
	},
});

const shuugiCanvas = new ChartJSNodeCanvas({
	width, height: shuugiHeight, chartCallback: (ChartJS) => {
		ChartJS.defaults.color = 'grey';
	},
});

// --------------------------------------------------------------------------
// * Export config
// --------------------------------------------------------------------------

export function checkStatus(res) {
	if (res.ok) {
		return res;
	} else {
		throw new Error(`**HTTP ${res.status}** (${res.statusText})`);
	}
}

export async function readyCheck(interaction) {
	const guild = interaction.guildId;
	if (liveInteraction[guild]) {
		await interactionTimeout(guild);
	}
	waiting[guild] = false;
	const client = CONFIG[guild].client;
	await clients[client].pingReadiedPlayers(guild, interaction);

	intervalObj[guild] = setAsyncInterval(async () => {
		await clients[client].pingReadiedPlayers(guild, null);
	}, 10000);
	timeoutObj[guild] = setTimeout(interactionTimeout, 600000, guild);
}

export async function interactionTimeout(guild) {
	clearTimeout(timeoutObj[guild]);
	clearAsyncInterval(intervalObj[guild]);
	if (liveInteraction[guild]) {
		liveInteraction[guild].deleteReply();
		liveInteraction[guild] = null;
	}
	waiting[guild] = false;
}

export async function startListening(guild) {
	console.log(`Now listening to ${guild} on channel ${CONFIG[guild].persistent.channel}`);
	// start listening on persistent messages
	if (!CONFIG[guild].persistent.channel) {
		stopListening(guild);
		return;
	}

	timedout[guild] = false;
	const row = new MessageActionRow()
		.addComponents(
			new MessageButton()
				.setCustomId('shuffle')
				.setLabel('Shuffle')
				.setStyle('PRIMARY')
				.setEmoji('🎲'),
		);
	console.log(PERSISTENT[guild]);
	PERSISTENT[guild].list.edit({
		content: '*Fetching list...*',
		components: [row],
	});
	const client = CONFIG[guild].client;
	persistentObj[guild] = setAsyncInterval(async () => {
		await clients[client].pingReadiedPlayers(guild, null, true);
	}, 10000);

	// setAsyncInterval(clients[client].pingReadiedPlayers, 5000, guild, null, true);
	setPersistentTimeout(guild);
}

export async function stopListening(guild) {
	timedout[guild] = true;
	// stop listening on persistent messages, also called on restart.
	if (persistentObj[guild]) clearAsyncInterval(persistentObj[guild]);
	const row = new MessageActionRow()
		.addComponents(
			new MessageButton()
				.setCustomId('listen')
				.setLabel('Start Updating')
				.setStyle('SECONDARY')
				.setEmoji('▶️'),
		);
	PERSISTENT[guild].list.edit({
		content: '*Hit the button to start the ready check.*',
		components: [row],
	});

}

export function setPersistentTimeout(guild, time = 1200000) {
	if (CONFIG[guild].persistent.channel) {
		clearTimeout(persistentTimeout[guild]);
		persistentTimeout[guild] = setTimeout(stopListening, time, guild);
	}
}

export function clearPersistentTimeout(guild) {
	if (CONFIG[guild].persistent.channel) {
		clearTimeout(persistentTimeout[guild]);
		stopListening(guild);
	}
}

export async function handleButton(interaction) {
	const guild = interaction.guildId;
	console.log(interaction.customId);
	switch (interaction.customId) {
	case 'shuffle':
		if (waiting[guild]) {
			interaction.reply({
				ephemeral: true,
				content: '**The button is busy.** Someone must have just pressed it; wait a couple seconds and try again.',
			});
			return;
		} else {
			waiting[guild] = true;
			clients[CONFIG[guild].client].shufflePlayers(interaction);
		}
		break;
	case 'listen':
		if (!checkPermissions(interaction)) return;
		await interaction.deferUpdate();
		startListening(guild);
		break;
	}
}

export async function handleCommand(interaction) {
	const guild = interaction.guildId;
	const client = CONFIG[guild]?.client;
	if (!client) {
		await interaction.reply({
			content: '**Error**: Not initialized in this guild',
		});
	}
	console.log(`/${interaction.commandName} by ${interaction.member?.displayName}`);
	if (!interaction.member) {
		await interaction.reply({
			content: '**Sorry, I only respond to messages in guilds.**',
		});
		return;
	}
	console.log(`${guild} is in client ${client}`);
	switch (interaction.commandName) {
	case 'help':
		clients[client].showInfo(interaction);
		break;
	case 'rules':
		clients[client].showRules(interaction);
		break;
	case 'list':
		if (CONFIG[guild].persistent.channel) {
			interaction.reply({
				ephemeral: true,
				content: `Persistent list enabled. Please check it at https://discord.com/channels/${guild}/${CONFIG[guild].persistent.channel}/${CONFIG[guild].persistent.list}.`,
			});
		} else {
			readyCheck(interaction);
		}
		break;
	case 'pause':
		clients[client].pauseGame(interaction);
		break;
	case 'resume':
	case 'unpause':
		clients[client].resumeGame(interaction);
		break;
	case 'terminate':
		clients[client].terminateGame(interaction);
		break;
	case 'register':
		clients[client].registerPlayer(interaction);
		break;
	case 'lobby':
		if (interaction.options.getString('set')) {
			clients[client].setLobby(interaction);
		} else {
			clients[client].showLobby(interaction);
		}
		break;
	case 'client':
		setClient(interaction);
		break;
	case 'persistent':
		setPersistentMessages(interaction);
		break;
	case 'scores':
		showScores(interaction);
		break;
	case 'add':
		clients[client].addGame(interaction);
		break;
	case 'display':
		setDisplay(interaction);
		break;
	case 'filter':
		setFilter(interaction);
		break;
	case 'permissions':
		setPermissions(interaction);
		break;
	case 'parse':
		tenhou.parseInteraction(interaction);
		break;
	case 'restart':
		await interaction.reply({
			ephemeral: true,
			content: `**Restarting bot.** Should be ready for commands <t:${Math.floor(Date.now() / 1000) + 30}:R>.`,
		});
		process.exit();
		break;
	default:
		return;
	}
}

export async function checkPermissions(interaction) {
	const guild = interaction.guildId;
	if (!interaction.member.roles.cache.some(o => CONFIG[guild].permissions.includes(o.id))) {
		interaction.reply({
			ephemeral: true,
			content: 'Sorry, you do not have permissions to do this.',
		});
		return false;
	}
	return true;
}

export async function startChecks() {
	for (const guild in CONFIG) {
		const client = CONFIG[guild].client;
		clearInterval(intervalLog[guild]);
		intervalLog[guild] = setInterval(clients[client].parseMessage, 30000, guild);
		console.log(`${guild} interval now 30s`);
		clients[client].parseMessage(guild);
	}
}

export async function initSheets() {
	for (const id in sheets) {
		console.log(id);
		await sheets[id].useServiceAccountAuth({
			client_email: google_email,
			private_key: google_key,
		});
		await sheets[id].loadInfo();
		console.log(sheets[id].spreadsheetId);
	}
}

export async function exportFile() {
	const json = JSON.stringify(CONFIG, null, 2);
	writeFileSync('tenhouconfig.json', json, (err) => {
		if (err) {
			console.log(err);
			return;
		}
	});
	console.log('Exported');
}

export async function importFile() {
	try {
		const data = JSON.parse(readFileSync('tenhouconfig.json', 'utf8'));
		Object.keys(data).forEach(k => CONFIG[k] = data[k]);
		console.log(CONFIG);
	} catch (e) {
		console.log(e);
	}
}

export async function setClient(interaction) {
	const guild = interaction.guildId;
	CONFIG[guild].client = interaction.options.getString('client');
	await interaction.reply({
		ephemeral: true,
		content: `Now using client **${CONFIG[guild].client}**.`,
	});
	await exportFile();
	await updatePersistentScores(guild);
}

async function setPersistentMessages(interaction) {
	if (!interaction.member.permissions.has('MANAGE_MESSAGES')) {
		await interaction.reply({
			ephemeral: true,
			content: '**Error:** You do not have permission to use this command. (`MANAGE_MESSAGES` required)',
		});
		return;
	}
	await interaction.deferReply({
		ephemeral: true,
	});
	try {
		const guild = interaction.guildId;
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === 'on') {
			const list = await interaction.channel.send({
				content: 'Loading...',
			});
			const scoreEmbeds = await getScoreEmbeds(guild);
			const standings = await interaction.channel.send({
				embeds: [scoreEmbeds.month],
			});
			CONFIG[guild].persistent = {
				channel: interaction.channel.id,
				list: list.id,
				standings: standings.id,
			};
			PERSISTENT[guild] = {
				list: list,
				standings: standings,
			};
			exportFile();
			await interaction.editReply({
				ephemeral: true,
				content: 'Set persistent messages in this channel.',
			});
			await stopListening(guild);
		} else {
			CONFIG[guild].persistent = {};
			PERSISTENT[guild] = {};
			exportFile();
			await interaction.editReply({
				ephemeral: true,
				content: 'Removed persistent messages.',
			});
		}
	} catch (e) {
		await interaction.editReply({
			ephemeral: true,
			content: `Error: ${e}`,
		});
	}
}

export async function setDisplay(interaction) {
	const guild = interaction.guildId;
	const channel = interaction.options.getChannel('channel');
	CONFIG[guild].display = interaction.options.getInteger('minimum');
	if (channel) CONFIG[guild].channelid = channel.id;
	await interaction.reply({
		ephemeral: true,
		content: `Now displaying **${LEVELS[CONFIG[guild].display]}** in game results.`,
	});
	exportFile();
}

export function displayRule(check, rule, detailCheck = null, detailSuccess = null) {
	const ruleDetail = detailCheck ? `: **${detailSuccess}**` : '';
	return `${check ? '☑️' : '❎'} ${rule}${ruleDetail}`;
}


// --------------------------------------------------------------------------
// * Set permissions
// --------------------------------------------------------------------------

export async function setPermissions(interaction) {
	if (!interaction.member.permissions.has('MANAGE_MESSAGES')) {
		await interaction.reply({
			ephemeral: true,
			content: '**Error:** You do not have permission to use this command. (`MANAGE_MESSAGES` required)',
		});
		return;
	}
	const guild = interaction.guildId;
	const role = interaction.options.getRole('role');

	switch (interaction.options.getSubcommand()) {
	case 'add':
		if (!CONFIG[guild].permissions.includes(role.id)) {
			CONFIG[guild].permissions.push(role.id);
		}
		break;
	case 'remove':
		if (CONFIG[guild].permissions.includes(role.id)) {
			CONFIG[guild].permissions.splice(CONFIG[guild].permissions.indexOf(role.id), 1);
		}
		break;
	case 'view':
		break;
	default:
		return;
	}
	await showPermissions(interaction);
	exportFile();
}

export async function showPermissions(interaction) {
	const guild = interaction.guildId;
	const roleText = CONFIG[guild].permissions.map(o => `　<@&${o}>`);
	await interaction.reply({
		ephemeral: true,
		content: `**Current roles with game starting permission:**\n${roleText.join('\n')}`,
	});
}

// --------------------------------------------------------------------------
// * Display current scores
// --------------------------------------------------------------------------

export async function showScores(interaction) {
	const guild = interaction.guildId;

	const scoreEmbeds = await getScoreEmbeds(guild);

	let embeds;
	switch (interaction.options.getSubcommand()) {
	case 'monthly':
		embeds = [scoreEmbeds.month];
		break;
	case 'weekly':
		embeds = [scoreEmbeds.week];
		break;
	default:
		embeds = [scoreEmbeds.month, scoreEmbeds.week];
		break;
	}

	await interaction.reply({
		content: `**[Current standings](https://docs.google.com/spreadsheets/d/${CONFIG[guild].spreadsheet}/)**`, embeds: embeds,
	});
}

export async function updatePersistentScores(guild) {
	if (!CONFIG[guild].persistent.channel) return;
	const scoreEmbeds = await getScoreEmbeds(guild);
	PERSISTENT[guild].standings.edit({
		embeds: [scoreEmbeds.month],
	});
}

export async function getScoreEmbeds(guild) {
	const client = CONFIG[guild].client;

	const sheetIndex = await sheets[guild].sheetsByIndex.findIndex((i) => i.title === 'Results');
	const sheet = sheets[guild].sheetsByIndex[sheetIndex];
	await sheet.loadCells(['A1', 'H1:H2', 'A3:F83', 'J1', 'Q1:Q2', 'J3:O83']);

	const { monthDisplay, weekDisplay } = await clients[client].formatScores(guild, sheet);

	const monthEmbed = new MessageEmbed()
		.setColor('#274e13')
		.setTitle(sheet.getCell(0, 0).value)
		.setDescription(monthDisplay.join('\n'))
		.setFooter({ text: `From ${sheet.getCell(0, 7).formattedValue} to ${sheet.getCell(1, 7).formattedValue}` });

	const weekEmbed = new MessageEmbed()
		.setColor('#1c4587')
		.setTitle(sheet.getCell(0, 9).value)
		.setDescription(weekDisplay.join('\n'))
		.setFooter({ text: `From ${sheet.getCell(0, 16).formattedValue} to ${sheet.getCell(1, 16).formattedValue}` });

	return {
		month: monthEmbed,
		week: weekEmbed,
	};
}

// --------------------------------------------------------------------------
// * Set filter
// --------------------------------------------------------------------------

export async function setFilter(interaction) {
	const guild = interaction.guildId;
	const from = interaction.options.getString('from');
	const to = interaction.options.getString('to');
	const heading = interaction.options.getString('heading');
	let cellColumns;

	if (!from.match(/^\d{4}-\d{2}-\d{2}$/) || !to.match(/^\d{4}-\d{2}-\d{2}$/)) {
		await interaction.reply({
			ephemeral: true,
			content: '**Error:** Dates must be provided in YYYY-MM-DD format.',
		});
		return;
	}

	switch (interaction.options.getSubcommand()) {
	case 'monthly':
		cellColumns = [0, 7, 7];
		break;
	case 'weekly':
		cellColumns = [9, 16, 16];
		break;
	default:
		return;
	}

	const sheetIndex = await sheets[guild].sheetsByIndex.findIndex((i) => i.title === 'Results');
	const sheet = sheets[guild].sheetsByIndex[sheetIndex];
	await sheet.loadCells(['A1', 'H1:H2', 'J1', 'Q1:Q2']);

	sheet.getCell(0, cellColumns[1]).value = from;
	sheet.getCell(1, cellColumns[2]).value = to;
	if (heading) sheet.getCell(0, cellColumns[0]).value = heading;
	await sheet.saveUpdatedCells();

	await interaction.reply({
		ephemeral: true,
		content: `${sheet.getCell(0, cellColumns[0]).value} now filtering games from ${sheet.getCell(0, cellColumns[1]).formattedValue} to ${sheet.getCell(1, cellColumns[2]).formattedValue}`,
	});
	await updatePersistentScores(guild);
}

export async function makeChart(scores, ratbux = false) {

	const colors = {
		RED: 'rgb(255, 99, 132)',
		BLUE: 'rgb(54, 162, 235)',
		YELLOW: 'rgb(255, 205, 86)',
		GREEN: 'rgb(75, 192, 192)',
		PURPLE: 'rgb(153, 102, 255)',
	};

	const configuration = {
		type: 'line',
		data: {
			labels: scores.round,
			datasets: [{
				label: scores.names[0],
				data: scores.p1,
				borderColor: colors.RED,
				backgroundColor: colors.RED,
				radius: 0,
			}, {
				label: scores.names[1],
				data: scores.p2,
				borderColor: colors.GREEN,
				backgroundColor: colors.GREEN,
				radius: 0,
			}, {
				label: scores.names[2],
				data: scores.p3,
				borderColor: colors.YELLOW,
				backgroundColor: colors.YELLOW,
				radius: 0,
			}],
		},
		options: {
			plugins: {
				legend: {
					position: 'top',
					labels: {
						filter: function(legendItem, data) {
							const len = data.datasets[3]?.label ? 3 : 2;
							return legendItem.datasetIndex <= len;
						},
					},
				},
			},
			scales: {
				x: {
					grid: {
						color: function(context) {
							return context.tick.value === 0 ? 'rgba(128, 128, 128, 0)' : context.tick.label === '' ? 'rgba(128, 128, 128, 0.2)' : 'rgba(128, 128, 128, 0.75)';
						},
						drawTicks: false,
					},
					ticks: {
						autoSkip: false,
						minRotation: 0,
						maxRotation: 0,
					},
				},
				y: {
					grid: {
						color: function(context) {
							return context.tick.value === 0 ? 'rgba(128, 128, 128, 0.75)' : 'rgba(128, 128, 128, 0.2)';
						},
						tickLength: 5,
						drawBorder: false,
					},
					suggestedMin: -10000,
					suggestedMax: scores.p1[0] * 2,
					ticks: {
						stepSize: 10000,
						autoSkip: false,
						callback: function(value) {
							return value / 1000 + 'k';
						},
					},
					stack: 'shuugi',
					stackWeight: 3,
				},
			},
		},
	};
	if (ratbux) {
		const nycMultiplier = CONFIG['685470974577082377'].tenhou.multiplier;
		configuration.options.scales.y.suggestedMin = -30 * nycMultiplier;
		configuration.options.scales.y.suggestedMax = 30 * nycMultiplier;
		configuration.options.scales.y.ticks = {
			stepSize: 5,
			autoSkip: false,
			callback: function(value) {
				if (value === 0) return 'ℝ0';
				return `${value > 0 ? '+' : '−'}ℝ${Math.abs(value)}`;
			},
		};
	}
	if (scores.names[3]) {
		configuration.data.datasets.push({
			label: scores.names[3],
			data: scores.p4,
			borderColor: colors.PURPLE,
			backgroundColor: colors.PURPLE,
			radius: 0,
		});
	}

	if (scores.shuugi && !ratbux) {
		configuration.options.scales.y.ticks.callback = function(value, index, ticks) {
			return index !== ticks.length - 1 ? value / 1000 + 'k' : '';
		};
		// const scale = Math.ceil(Math.max(...[scores.shuugi.p1, scores.shuugi.p2, scores.shuugi.p3, scores.shuugi.p4].flat().map(Math.abs), 5) / 5) * 5;
		const four = scores.shuugi.p4 ?? 0;
		const scale = Math.max(...[scores.shuugi.p1, scores.shuugi.p2, scores.shuugi.p3, four].flat().map(Math.abs), 5);
		configuration.options.scales.y2 = {
			grid: {
				color: function(context) {
					return context.tick.value === 0 || context.index === 0 ? 'rgba(128, 128, 128, 0.75)' : 'rgba(128, 128, 128, 0.2)';
				},
				lineWidth: function(context) {
					return context.index === 0 ? 5 : 1;
				},
				tickLength: 5,
				drawBorder: false,
			},
			min: -scale,
			max: scale,
			ticks: {
				stepSize: scale,
				callback: function(value, index) {
					return index > 0 ? value + '枚' : '';
				},
			},
			stack: 'shuugi',
			stackWeight: 1,
		};
		const shuugiData = [{
			data: scores.shuugi.p1,
			borderColor: colors.RED,
			backgroundColor: colors.RED,
			radius: 0,
			yAxisID: 'y2',
		}, {
			data: scores.shuugi.p2,
			borderColor: colors.GREEN,
			backgroundColor: colors.GREEN,
			radius: 0,
			yAxisID: 'y2',
		}, {
			data: scores.shuugi.p3,
			borderColor: colors.YELLOW,
			backgroundColor: colors.YELLOW,
			radius: 0,
			yAxisID: 'y2',
		}];
		if (scores.names[3]) {
			shuugiData.push({
				data: scores.shuugi.p4,
				borderColor: colors.PURPLE,
				backgroundColor: colors.PURPLE,
				radius: 0,
				yAxisID: 'y2',
			});
		}
		configuration.data.datasets = configuration.data.datasets.concat(shuugiData);
	}

	if (scores.shuugi && !ratbux) {
		const imageBuffer = [await shuugiCanvas.renderToBuffer(configuration)];
		return imageBuffer;
	} else {
		const imageBuffer = [await canvas.renderToBuffer(configuration)];
		return imageBuffer;
	}
}

export async function sendToSpreadsheet(guild, range, valueInputOption, values) {
	const sheetIndex = await sheets[guild].sheetsByIndex.findIndex((i) => i.title === range);
	console.log(sheetIndex);
	await sheets[guild].sheetsByIndex[sheetIndex].addRow(values);
}

// --------------------------------------------------------------------------
// * React to message
// --------------------------------------------------------------------------

export function react(state, msg) {
	switch (state) {
	case 'closed':
	case 'invalid':
	case 'error':
		msg.react('❌');
		break;
	case 'success':
		msg.react('⭕');
		break;
	case 'warning':
	case 'alert':
		msg.react('‼️');
		break;
	}
}
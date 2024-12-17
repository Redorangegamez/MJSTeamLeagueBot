"use strict";

/*
TO ADD:
  [/about] for help and information (current lobby/channel/permissions/spreadsheet)
EVENTUAL:
  Multi-file command handling
  Automate procedures when added to new guild
  - Check if guild not in list and add
  Check for bot permissions before posting
  - Allow channel ID to be set (don't let games start without it)
  Move off Google Sheets to proper db
*/

//============================================================================
// ** Imports
//============================================================================

const Discord = require('discord.js');
const shuffle = require('shuffle-array');
const config = require('./config');
const convlog = require('./convlog');
const fetch = require('node-fetch');
const fs = require('fs');
//const chart = require('chart.js');
const xml2js = require('xml2js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { start } = require('repl');

const WINDEMOJI = ['<:xe:910816318784151552>', '<:xs:910366107041423390>', '<:xw:910366107121090650>', '<:xn:910366106995286037>'];
const LIMITVALUES = {
	'0': '',
	'1': '<:man:910813082006196264><:gan:910813812763033611>',
	'2': '<:hane:910813081658097705><:man:910813082006196264>',
	'3': '<:bai:910813082157211668><:man:910813082006196264>',
	'4': '<:san:910813082245296158><:bai:910813082157211668><:man:910813082006196264>',
	'5': '<:yak:910813083608416266><:uman:910813082757005342>',
}
const LEVELS = {
	'-1': 'all hands',
	'0': 'winning hands',
	'1': 'mangans or better',
	'2': 'hanemans or better',
	'3': 'baimans or better',
	'4': 'sanbaimans or better',
	'5': 'yakumans',
	'6': 'no hands',
}

const YAKU = ['tsumo', 'riichi', 'ippatsu', 'chankan', 'rinshan', 'haitei', 'houtei', 'pinfu', 'tanyao', 'iipeikou', 'ton', 'nan', 'shaa', 'pei', 'double ton', 'double nan', 'double shaa', 'double pei', 'haku', 'hatsu', 'chun', 'double riichi', 'chiitoi', 'chanta', 'itsuu', 'sanshoku doujun', 'sanshoku doukou', 'sankantsu', 'toitoi', 'sanankou', 'shousangen', 'honroutou', 'ryanpeikou', 'junchan', 'honitsu', 'chinitsu', '', '**tenhou**', '**chihou**', '**daisangen**', '**suuankou**', '**suuankou tanki**', '**tsuiisou**', '**ryuuiisou**', '**chinroutou**', '**chuuren**', '**9-sided chuuren**', '**kokushi**', '**13-sided kokushi**', '**daisuushi**', '**shousuushi**', '**suukantsu**', 'dora', 'ura', 'aka']

var CONFIG = {
	spreadsheet: {
		'685470974577082377': '1JKXsL5RV5zIp-eLnBfElVXYvaM8LmMvjwHi5ThKH6Tc',
		'244302077621305345': '1DwKhlmftW8tQLn8EKReKR-I9mSBmtDlzyCzIq8Vz068',
		'960387564655755364': '1SmIN6WJB2kjb6R43-y-tN7VbM44nphxN5L1JGVvl7Xk'
	},
	lobby: {
		'685470974577082377': 8935925113442672,
		'244302077621305345': 6253355348821887,
	},
	channelid: {
		'685470974577082377': '685471499691229269',
		'244302077621305345': '617587950791950364',
		'960387564655755364': '960387564655755370'

	},
	activegames: {
		'685470974577082377': {},
		'244302077621305345': {},
	},
	lasttime: {
		'685470974577082377': '',
		'244302077621305345': '',
	},
	rules: {
		'685470974577082377': '0241',
		'244302077621305345': '0009',
	},
	permissions: {
		'685470974577082377': ['685470974577082377'],
		'244302077621305345': ['244302077621305345'],
	},
	display: {
		'685470974577082377': -1,
		'244302077621305345': -1,
	}
}

var CHANNEL = {};

const PREFIX = 'nagare!';
const SHUUGIVALUE = 5;
var DATA;
var SOCKETPING;
var WAITING = false;

const SCOREDGAMES = [];

function checkStatus(res) {
	if (res.ok) {
		return res
	} else {
		throw new error(`**HTTP ${res.status}** (${res.statusText})`);
	}
}

function valueToArray(name) {
	if (name.includes(',')) {
		return name.split(',');
	} else {
		return name;
	}
}

//============================================================================
// ** Discord Client
//============================================================================

class DiscordClient {

	constructor() {
		this.lobbyNumber = config.tournamentId;
		this.tenhouRules;
		this.sheets = {};
		this.intervalObj = {};
		this.timeoutObj = {};
		this.intervalLog = {};
		this.liveInteraction = {};
		this.gameArray = [];
		this.tables = [];

		this.importFile();

		// Auth Google Sheet
		console.log(CONFIG.spreadsheet);
		for (const guild in CONFIG.spreadsheet) {
			this.sheets[guild] = new GoogleSpreadsheet(CONFIG.spreadsheet[guild]);
			console.log(guild)
		}
		this.initSheets();

		// Log in to Discord
		this.client = new Discord.Client({
			presence: {
				activities: [{
					name: 'Tenhou',
					type: 'WATCHING',
				}],
			},
			intents: ['GUILDS', 'GUILD_MESSAGES', 'GUILD_MESSAGE_REACTIONS', 'GUILD_INTEGRATIONS']
		});
		this.client.once('ready', () => {
			console.log('Discord Login');
			for (const guild in CONFIG.channelid) {
				CHANNEL[guild] = this.client.channels.cache.get(CONFIG.channelid[guild]);
			}
		});
		this.client.on('messageCreate', this.onMessage.bind(this));

		this.client.on('interactionCreate', interaction => {
			if (interaction.isCommand()) {
				this.handleCommand(interaction);
			} else if (interaction.isButton()) {
				if (WAITING) {
					interaction.reply({
						ephemeral: true,
						content: '**The button is busy.** Someone must have just pressed it; wait a couple seconds and try again.'
					})
					return;
				} else {
					WAITING = true;
					this.shufflePlayers(interaction);
				}
			} else {
				return;
			}
		});
		this.client.login(config.discordAuthToken);
		//this.openSocket();

		for (const guild in CONFIG.lobby) {
			this.intervalLog[guild] = (Object.keys(CONFIG.activegames[guild]).length === 0) ? setInterval(this.parseMessage.bind(this, guild), 1800000) : setInterval(this.parseMessage.bind(this, guild), 15000);
		}

		const width = 500; //px
		const height = 300; //px
		const shuugiHeight = 370; //px
		this.canvas = new ChartJSNodeCanvas({
			width, height, chartCallback: (ChartJS) => {
				ChartJS.defaults.color = 'grey';
			}
		});
		this.shuugiCanvas = new ChartJSNodeCanvas({
			width, height: shuugiHeight, chartCallback: (ChartJS) => {
				ChartJS.defaults.color = 'grey';
			}
		});

	}


	//--------------------------------------------------------------------------
	// * Set up websocket
	//--------------------------------------------------------------------------
	/*openSocket() {
		const ws = new WebSocket('wss://p.mjv.jp', {
			origin: 'http://tenhou.net',
		});

		ws.onopen = () => {
			console.log('connected');
			ws.send('{"tag":"HELO","name":config.tenhouUser,"sx":"F"}');
		};

		ws.onclose = () => {
			console.log('disconnected');
			clearInterval(SOCKETPING);
			this.openSocket();
		};

		const slowsend = (msg) => {
			setTimeout(() => {
				ws.send(msg);
			},
				1000);
		}

		const heloHandler = (heloMsg) => {
			slowsend('<PXR V="9">');
			slowsend(JSON.stringify({ tag: "CS", lobby: `C${this.lobbyNumber.toString().substring(0, 8)}` }));
		};

		const chatHandler = (chatMsg) => {
			let message = decodeURIComponent(chatMsg.text);
			console.log(message);
			if (message.startsWith('#END')) {
				this.score(message, '685470974577082377');
			}
			//#END %41%72%61%6E%6C%79%64%65(%2B23.0,%2B0%E6%9E%9A) %6E%54%6F%75%72%6E%65%79(%2B0.0,%2B0%E6%9E%9A) %74%65%73%74%78%79%7A%31(-23.0,%2B0%E6%9E%9A)
			//#END Aranlyde(+23.0,+2枚) nTourney(+0.0,+0枚) testxyz1(-23.0,+0枚) testxyz2(-23.0,-2枚)
		}

		ws.onmessage = (message) => {
			const msg = JSON.parse(message.data);
			// console.log({msg});
			switch (msg.tag) {
				case 'HELO':
					heloHandler(msg);
					break;
				case 'CHAT':
					chatHandler(msg);
					break;
				case 'LN':
					break;
				case 'ERR':
					this.client.channels.cache.get('906446058052276255').send(`**Tenhou error:**${msg}`);
					break;
				case 'CS':
					this.tenhouRules = msg.rule;
				default:
					console.log('Message:', { msg });
			}
		};

		ws.onerror = (err) => {
			console.log(err);
			clearInterval(SOCKETPING);
			this.openSocket();
		};

		ws.onupgrade = (req) => {
		};

		ws.onping = (data) => {
		};

		SOCKETPING = setInterval(
			function () {
				ws.send('<Z />');
			},
			10000);
	}*/


	//--------------------------------------------------------------------------
	// * Event Handlers
	//--------------------------------------------------------------------------

	onMessage(message) {

		if (!message.content.startsWith(PREFIX) || message.author.bot) return;

		const args = message.content.slice(PREFIX.length).trim().split(' ');
		const command = args.shift().toLowerCase();

		if (!message.member.permissions.has('MANAGE_MESSAGES') && message.author.id !== '339573014117220372') {
			return;
		}

		switch (command) {
			case 'riichi':
			case 'ping':
				this.sendPing(message.channel);
				break;
			case 'deploy':
			case 'slash':
				this.deployCommands(message, args[0]);
				break;
			case 'restart':
				process.exit();
				break;
			case 'init':
				this.initialize(message.guildId);
				break;
			case 'test':
				this.testFunction(message, args.join(' '));
				break;
			default:
				break;
		}
	}

	async initSheets() {
		for (const id in this.sheets) {
			console.log(id)
			await this.sheets[id].useServiceAccountAuth({
				client_email: config.google_email,
				private_key: config.google_key,
			});
			await this.sheets[id].loadInfo();
			console.log(this.sheets[id].spreadsheetId)
		}
	}

	async initialize(guild) {
		if (!CONFIG.spreadsheet[guild]) {
			// make new sheet
			this.sheets[guild] = new GoogleSpreadsheet(CONFIG.spreadsheet[guild]);
			await this.initSheets();

			// set data
			CONFIG.lobby[guild] = 0;
			CONFIG.channelid[guild] = '';
			CONFIG.lasttime[guild] = '';
			CONFIG.rules[guild] = '';
			CONFIG.activegames[guild] = {};
			CONFIG.permissions[guild] = [guild];
			CONFIG.display[guild] = -1;
			this.exportFile();
		}
	}

	async deployCommands(msg, args) {
		const data = [
			{
				name: 'list',
				description: 'List readied players and start games',
			},
			{
				name: 'help',
				description: "Show Nagare's configuration and functions in this guild"
			},
			{
				name: 'lobby',
				description: 'Display the Tenhou tournament lobby',
				options: [
					{
						name: 'set',
						type: 'STRING',
						description: 'Set the lobby number to watch and post results in this channel',
						required: false,
					},
				],
			},
			{
				name: 'scores',
				description: 'Display the current leaderboard',
				options: [
					{
						name: 'monthly',
						type: 'SUB_COMMAND',
						description: 'Display the monthly leaderboard'
					},
					{
						name: 'weekly',
						type: 'SUB_COMMAND',
						description: 'Display the weekly leaderboard'
					},
					{
						name: 'all',
						type: 'SUB_COMMAND',
						description: 'Display both leaderboards'
					},
				],
			},
			{
				name: 'parse',
				description: 'Parse and display a Tenhou game log',
				options: [
					{
						name: 'log',
						type: 'STRING',
						description: 'The Tenhou log ID to parse.',
						required: true
					},
					{
						name: 'minimum',
						type: 'INTEGER',
						description: 'The minimum hand value to show.',
						required: false,
						choices: [
							{
								name: 'All',
								value: -1,
							},
							{
								name: 'Agari',
								value: 0,
							},
							{
								name: 'Mangan',
								value: 1,
							},
							{
								name: 'Haneman',
								value: 2,
							},
							{
								name: 'Baiman',
								value: 3,
							},
							{
								name: 'Sanbaiman',
								value: 4,
							},
							{
								name: 'Yakuman',
								value: 5,
							},
							{
								name: 'None',
								value: 6,
							},
						],
					},
				],
			},
			{
				name: 'restart',
				description: 'Restarts the bot (in case of Tenhou connection issues)',
			},
			{
				name: 'permissions',
				description: 'Modifies permissions for starting games',
				options: [
					{
						name: 'add',
						type: 'SUB_COMMAND',
						description: 'Adds shuffle permissions to a role',
						options: [
							{
								name: 'role',
								type: 'ROLE',
								description: 'The role to give the permission to.',
								required: true,
							},
						],
					},
					{
						name: 'remove',
						type: 'SUB_COMMAND',
						description: 'Removes shuffle permissions from a role',
						options: [
							{
								name: 'role',
								type: 'ROLE',
								description: 'The role to remove the permission from.',
								required: true,
							},
						],
					},
					{
						name: 'view',
						type: 'SUB_COMMAND',
						description: 'Shows roles with shuffle permissions',
					},
				],
			},
			{
				name: 'display',
				description: 'Set end of game report display settings',
				options: [
					{
						name: 'minimum',
						type: 'INTEGER',
						description: 'The minimum hand value to show.',
						required: true,
						choices: [
							{
								name: 'All',
								value: -1,
							},
							{
								name: 'Agari',
								value: 0,
							},
							{
								name: 'Mangan',
								value: 1,
							},
							{
								name: 'Haneman',
								value: 2,
							},
							{
								name: 'Baiman',
								value: 3,
							},
							{
								name: 'Sanbaiman',
								value: 4,
							},
							{
								name: 'Yakuman',
								value: 5,
							},
							{
								name: 'None',
								value: 6,
							},
						],
					},
					{
						name: 'channel',
						type: 'CHANNEL',
						description: 'Which channel to post game results in.',
						required: false,
					},
				],
			},
			{
				name: 'filter',
				description: 'Sets the dates to filter games between.',
				options: [
					{
						name: 'monthly',
						type: 'SUB_COMMAND',
						description: 'Sets dates to filter the monthly leaderboard (green)',
						options: [
							{
								name: 'from',
								type: 'STRING',
								description: 'The starting date in YYYY-MM-DD format.',
								required: true,
							},
							{
								name: 'to',
								type: 'STRING',
								description: 'The ending date in YYYY-MM-DD format.',
								required: true,
							},
							{
								name: 'heading',
								type: 'STRING',
								description: 'The heading for the filter.',
								required: false,
							},
						],
					},
					{
						name: 'weekly',
						type: 'SUB_COMMAND',
						description: 'Sets dates to filter the weekly leaderboard (blue)',
						options: [
							{
								name: 'from',
								type: 'STRING',
								description: 'The starting date in YYYY-MM-DD format.',
								required: true,
							},
							{
								name: 'to',
								type: 'STRING',
								description: 'The ending date in YYYY-MM-DD format.',
								required: true,
							},
							{
								name: 'heading',
								type: 'STRING',
								description: 'The heading for the filter.',
								required: false,
							},
						],
					},
				],
			},
		];
		if (args === 'g') {
			await this.client.application.commands.set(data);
			console.log(`GLOBAL slash commands created`);
		} else if (args === 'd') {
			await this.client.guilds.cache.get(msg.guildId)?.commands.set([]);
			console.log(`Slash commands deleted in ${msg.guild.name}`);
		} else {
			await this.client.guilds.cache.get(msg.guildId)?.commands.set(data);
			console.log(`Slash commands created in ${msg.guild.name}`);
		}
		/*const openCommand = this.client.guilds.cache.get('334120110534950922')?.commands.cache.find(o => o.name === 'open');
		const permissions = [
			{
				id: '334120838468993025',
				type: 'ROLE',
				permission: true,
			},
		];
		await openCommand.permissions.set({ permissions });*/
	}

	async handleCommand(interaction) {
		console.log(`/${interaction.commandName} by ${interaction.member?.displayName}`);
		if (!interaction.member) {
			await interaction.reply({
				content: `**Sorry, I only respond to messages in guilds.**`
			});
			return;
		}
		switch (interaction.commandName) {
			case 'help':
				this.showInfo(interaction);
				break;
			case 'list':
				this.readyCheck(interaction);
				break;
			case 'lobby':
				if (interaction.options.getString('set')) {
					this.setLobby(interaction);
				} else {
					const guild = interaction.guildId;
					await interaction.reply({
						content: `**${CONFIG.lobby[guild].toString().substring(0, 8)}**\nhttps://tenhou.net/4/?C${CONFIG.lobby[guild].toString().substring(0, 8)}`
					});
				}
				break;
			case 'scores':
				this.showScores(interaction);
				break;
			case 'display':
				this.setDisplay(interaction);
				break;
			case 'filter':
				this.setFilter(interaction);
				break;
			case 'permissions':
				this.setPermissions(interaction);
				break;
			case 'parse':
				this.parseInteraction(interaction);
				break;
			case 'restart':
				await interaction.reply({
					ephemeral: true,
					content: '**Restarting bot.** Should be ready for commands in just a couple seconds.'
				})
				process.exit();
			default:
				return;
		}
	}


	//---------------------------------------------------------------------------
	// * Event Logic
	//---------------------------------------------------------------------------

	sendPing(channel) {
		const guild = channel.guildId;
		if (!CHANNEL[guild]) {
			channel.send(`Cannot find a results channel for guild ${channel.guild.name}. Use \`/display [minimum] [channel]\` to set it.`);
			return;
		} else {
			channel.send(`Hi! I'm Nagare!\N**　Results channel:** <#${CONFIG.channelid[guild]}>\N**　Tenhou lobby:** ${CONFIG.lobby[guild]}`);
		}
	}

	loadHelp(channel, user, admin) {
		if (admin) {
			channel.send(`***Hi! I'm Nagare!*** Use \`/\` for a list of commands.\N**　Results channel:** <#${CONFIG.channelid[guild]}>\N**　Tenhou lobby:** ${CONFIG.lobby[guild]}`);
		} else {
			channel.send(`***Hi! I'm Nagare!*** Use \`/\` for a list of commands.`);
		}
	}

	async sendMessage(channel, data) {
		this.client.channels.cache.get(channel).send(data);
	}

	async showInfo(interaction) {
		await interaction.deferReply({ ephemeral: true });
		let warning = false;
		const display = {};
		const guild = interaction.guildId;

		// Initialize if new guild
		//if (!CONFIG.spreadsheet[guild] || CONFIG.spreadsheet[guild] === '') await this.initialize(guild);

		// 0: Guild info
		display.guild = `**Hi! I'm Nagare!** I'm here to assist with your Tenhou league.\nDisplaying settings for guild **${interaction.guild.name}**.`

		// 1: Check lobby info
		if (!CONFIG.lobby[guild] || CONFIG.lobby[guild] === 0) {
			display.lobby = `⚠️ **Warning!** No lobby ID set!\nUse \`/lobby set\` to link a Tenhou lobby.`;
			warning = true;
		} else {
			const res = await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${CONFIG.lobby[guild]}`, { method: "GET", headers: { 'Content-Type': 'text/plain' } });
			if (!res.ok) {
				display.lobby = `⚠️ **Warning!** Error connecting to lobby ${CONFIG.lobby[guild].toString().substring(0, 8)}! (HTTP ${res.status})\nUse \`/lobby set\` to link a new lobby or try again later.`;
				warning = true;
			} else {
				const text = await res.text();
				console.log(text);
				if (text.indexOf('"RULE":""') > 0) {
					display.lobby = `⚠️ **Warning!** Lobby ${CONFIG.lobby[guild].toString().substring(0, 8)} does not exist!\nUse \`/lobby set\` to link a new lobby.`;
					warning = true;
				} else {
					const title = decodeURI(text.substring(13, text.indexOf('"RULE"') - 2));
					const expiry = text.substring(text.indexOf('"RULE"') + 21, text.indexOf('"RULE"') + 33);
					const date = Date.UTC(expiry.substring(0, 4), expiry.substring(4, 6) - 1, expiry.substring(6, 8), expiry.substring(8, 10), expiry.substring(10, 12)) / 1000 - 32400; //UTC+9
					display.lobby = `　　Connected to lobby [**${CONFIG.lobby[guild].toString().substring(0, 8)}**](https://tenhou.net/4/?C${CONFIG.lobby[guild].toString().substring(0, 8)}) (${title})\n　　Lobby expires <t:${date}:R> (<t:${date}>)`;
				}
			}
		}

		// 2: Starting games info
		display.starting = `　　Roles allowed to start games: ${CONFIG.permissions[guild].map(o => `<@&${o}>`).join(', ')}.`;

		// 3: Result display info
		if (!CONFIG.channelid[guild] || CONFIG.channelid[guild] === '') {
			display.result = `⚠️ **Warning!** No result channel set!\nUse \`/display [minimum] [channel]\` to set the result display channel.`;
			warning = true;
		} else {
			const permissions = interaction.guild.me.permissionsIn(CONFIG.channelid[guild]);
			if (!permissions.has('SEND_MESSAGES')) {
				display.result = `⚠️ **Warning!** ${this.client.user}> does not have permission to post in <#${CONFIG.channelid[guild]}>!\nGive permissions or use \`/display [minimum] [channel]\` to change the result display channel.`;
				warning = true;
			} else {
				display.result = `　　Game results will be displayed in <#${CONFIG.channelid[guild]}>.`;
			}
			display.result += `\n　　Hand details will be shown for **${LEVELS[CONFIG.display[guild]]}**.`;
		}

		// 4: Scoring info
		try {
			const sheetIndex = await this.sheets[guild].sheetsByIndex.findIndex((i) => i.title === 'Results');
			const sheet = this.sheets[guild].sheetsByIndex[sheetIndex];
			await sheet.loadCells(['A1', 'H1:H2', 'J1', 'Q1:Q2']);
			display.scoring = `　　All game results are posted [**here**](https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheet[guild]}/).\n　　**${sheet.getCell(0, 0).value}** showing games from ${sheet.getCell(0, 7).formattedValue} to ${sheet.getCell(1, 7).formattedValue}.\n　　**${sheet.getCell(0, 9).value}** showing games from ${sheet.getCell(0, 16).formattedValue} to ${sheet.getCell(1, 16).formattedValue}.`
		} catch (e) {
			console.log(e);
			display.scoring = `　　All game results are posted [**here**](https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheet[guild]}/).\n　　⚠️ **Error connecting to Google sheet.** Please try again later.`
		}

		const message = `${display.guild}${warning ? `\n\n⚠️ **CONFIGURATION NOT COMPLETE! Check below for how to fix.**` : ''}

**__TENHOU LOBBY__**
　**\`/lobby [?set]\`:** Show (or set) the current Tenhou lobby.
${display.lobby}

**__STARTING GAMES__**
　**\`/list\`:** List the current readied players and show a button to start games.
　**\`/permissions [add|remove|view] [role]\`:** Set (or show) roles that can hit the button to start games.
${display.starting}

**__GAME RESULTS__**
　**\`/display [minimum] [?channel]\`:** Set the minimum hand value to show in game reports.
${display.result}

**__LEADERBOARDS__**
　**\`/scores [all|weekly|monthly]\`:** Show the current leaderboard.
　**\`/filter [weekly|monthly] [from] [to] [?heading]\`:** Set the (inclusive) date ranges for the leaderboards.
${display.scoring}

**__MISCELLANEOUS FUNCTIONS__**
　**\`/help\`:** Shows this message.
　**\`/parse [log] [?minimum]\`:** Manually parse and display the results of a game log.
　**\`/restart\`:** Restarts the bot in case of misbehavior.

*I was created by Aranlyde#8711. Version 0.8.0, updated 2022.04.06*`;

		await interaction.editReply({
			content: message
		});
	}

	async setLobby(interaction) {
		const lobbyNumber = interaction.options.getString('set').match(/\d{16}/);
		const guild = interaction.guildId;

		if (!CONFIG.spreadsheet[guild] || CONFIG.spreadsheet[guild] === '') {
			interaction.reply({
				ephemeral: true,
				content: '**Error:** Nagare has not yet been initialized for this guild.\nPlease use `\help` first to get started.'
			});
			return;
		}

		if (!lobbyNumber) {
			interaction.reply({
				ephemeral: true,
				content: `**Error:** Please provide the full 16-digit Tenhou lobby ID.`
			});
			return;
		}
		await interaction.deferReply({ ephemeral: true });
		const res = await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${lobbyNumber}`, { method: "GET", headers: { 'Content-Type': 'text/plain' } });
		if (!res.ok) {
			interaction.editReply({
				content: `**Error:** Could not connect to Tenhou lobby (HTTP ${res.status}).\nPlease double check the lobby ID and try again.`
			});
			return;
		}
		const text = await res.text();
		console.log(text);
		if (text.indexOf('"RULE":""') > 0) {
			interaction.editReply({
				content: `**Error:** Could not load lobby administration page.\nPlease double check the lobby ID and try again.`
			});
			return;
		}
		CONFIG.lobby[guild] = lobbyNumber;
		interaction.editReply({
			content: `**${CONFIG.lobby[guild].toString().substring(0, 8)}**\nhttps://tenhou.net/4/?C${CONFIG.lobby[guild].toString().substring(0, 8)}`
		});
		this.exportFile();
	}

	async setDisplay(interaction) {
		const guild = interaction.guildId;
		CONFIG.display[guild] = interaction.options.getInteger('minimum');
		await interaction.reply({
			ephemeral: true,
			content: `Now displaying **${LEVELS[CONFIG.display[guild]]}** in game results.`
		});
		this.exportFile();
	}

	//--------------------------------------------------------------------------
	// * Get list of players who are readied
	//--------------------------------------------------------------------------

	async readyCheck(interaction) {
		const guild = interaction.guildId;
		if (this.liveInteraction[guild]) {
			await this.interactionTimeout(guild);
		}
		WAITING = false;
		await this.pingReadiedPlayers(guild, interaction);
		this.intervalObj[guild] = setInterval(() => {
			this.pingReadiedPlayers(guild, null);
		}, 5000);
		this.timeoutObj[guild] = setTimeout(() => {
			this.interactionTimeout(guild);
		}, 600000)
	}

	async interactionTimeout(guild) {
		clearTimeout(this.timeoutObj[guild]);
		clearInterval(this.intervalObj[guild]);
		if (this.liveInteraction[guild]) {
			this.liveInteraction[guild].deleteReply();
			this.liveInteraction[guild] = null;
		}
		WAITING = false;
	}

	async pingReadiedPlayers(guild, interaction = null) {

		if ((!this.liveInteraction[guild] || this.liveInteraction[guild]?.deleted) && !interaction) {
			this.interactionTimeout(guild);
			return;
		}
		const res = await fetch(`https://tenhou.net/cs/edit/cmd_get_players.cgi`, { method: "POST", body: `L=C${CONFIG.lobby[guild]}`, headers: { 'Content-Type': 'text/plain' } });
		let content;
		if (!res.ok) {
			content = `**HTTP ${res.status}**: ${res.statusText}`;
		} else {
			const text = await res.text();
			let readiedPlayers = decodeURI(text.substring(text.indexOf("IDLE=") + 5, text.lastIndexOf("&PLAY="))).trim().split(",");
			console.log(readiedPlayers);
			let playingPlayers = decodeURI(text.substring(text.indexOf("PLAY=") + 5)).split(",");
			const index = readiedPlayers.indexOf("nTourney"); // TODO: Replace with BotName string
			if (index > -1) { readiedPlayers.splice(index, 1) }
			const playingString = `\n**Playing (${playingPlayers.length}):** ${playingPlayers.join(', ')}`
			if (readiedPlayers.length === 0 || readiedPlayers[0] === "") {
				content = `Tenhou lobby **${CONFIG.lobby[guild].toString().substring(0, 8)}**\nhttps://tenhou.net/4/?C${CONFIG.lobby[guild].toString().substring(0, 8)}\n\n**Ready (0)**${playingPlayers.length < 2 ? "" : playingString}`;
			} else {
				readiedPlayers.sort(function (a, b) {
					return a.toLowerCase().localeCompare(b.toLowerCase());
				});
				content = `Tenhou lobby **${CONFIG.lobby[guild].toString().substring(0, 8)}**\nhttps://tenhou.net/4/?C${CONFIG.lobby[guild].toString().substring(0, 8)}\n\n**Ready (${readiedPlayers.length}):** ${readiedPlayers.join(', ')}${playingPlayers.length < 2 ? "" : playingString}`
			}
		}
		if (interaction) {
			const row = new Discord.MessageActionRow()
				.addComponents(
					new Discord.MessageButton()
						.setCustomId('shuffle')
						.setLabel('Shuffle')
						.setStyle('PRIMARY')
						.setEmoji('🎲')
				);
			this.liveInteraction[guild] = interaction;
			this.liveInteraction[guild].reply({
				content: content,
				components: [row]
			});
		} else {
			this.liveInteraction[guild].editReply(content);
		}
	}


	//--------------------------------------------------------------------------
	// * Shuffle players
	//--------------------------------------------------------------------------

	async shufflePlayers(interaction) {
		const guild = interaction.guildId;
		if (!interaction.member.roles.cache.some(o => CONFIG.permissions[guild].includes(o.id))) {
			interaction.reply({
				ephemeral: true,
				content: 'Sorry, you do not have permissions to shuffle players.'
			})
			WAITING = false;
			return;
		}
		try {
			let readiedPlayers;
			await fetch('https://tenhou.net/cs/edit/cmd_get_players.cgi', { method: "POST", body: `L=C${CONFIG.lobby[guild]}`, headers: { 'Content-Type': 'text/plain' } })
				.then(res => res.text())
				.then((text) => {
					console.log(text);
					readiedPlayers = decodeURI(text.substring(text.indexOf("IDLE=") + 5, text.lastIndexOf("&PLAY="))).split(",");
				});
			const index = readiedPlayers.indexOf("nTourney");
			if (index > -1) { readiedPlayers.splice(index, 1) }
			const numTables = (readiedPlayers.length - (readiedPlayers.length % 4)) / 4;

			if (readiedPlayers.length < 4) {
				interaction.reply({
					ephemeral: true,
					content: `Not enough players are ready to start a table. (${readiedPlayers.length})`
				});
				WAITING = false;
				return;
			}
			await this.interactionTimeout(guild);

			this.tables = [];

			shuffle(readiedPlayers);
			console.log(readiedPlayers);

			for (let i = 0; i < numTables; i++) {
				this.tables.push(`<:sw:848707751391920178>${WINDEMOJI[0]} ${readiedPlayers[4 * i]} ${WINDEMOJI[1]} ${readiedPlayers[4 * i + 1]} ${WINDEMOJI[2]} ${readiedPlayers[4 * i + 2]} ${WINDEMOJI[3]} ${readiedPlayers[4 * i + 3]}`);
			}
			if (readiedPlayers.length % 4 !== 0) {
				console.log(readiedPlayers.length)
				let orphans = [];
				for (let j = numTables * 4; j < readiedPlayers.length; j++) {
					orphans.push(readiedPlayers[j]);
				}
				this.tables.push(`**Unpaired: **${orphans.join(", ")}`);
			}
			await interaction.reply({
				ephemeral: false,
				content: this.tables.join('\n')
			})
			this.fireGames(readiedPlayers, interaction);
		} catch (e) {
			WAITING = false;
			interaction.reply(`**Button error:** ${e}`);
		}
	}


	//--------------------------------------------------------------------------
	// * Set permissions
	//--------------------------------------------------------------------------

	async setPermissions(interaction) {
		if (!interaction.member.permissions.has("MANAGE_MESSAGES")) {
			await interaction.reply({
				ephemeral: true,
				content: '**Error:** You do not have permission to use this command. (`Manage Messages` required)'
			})
			return;
		}
		const guild = interaction.guildId;
		const role = interaction.options.getRole('role');

		switch (interaction.options.getSubcommand()) {
			case 'add':
				if (!CONFIG.permissions[guild].includes(role.id)) {
					CONFIG.permissions[guild].push(role.id);
				}
				break;
			case 'remove':
				if (CONFIG.permissions[guild].includes(role.id)) {
					CONFIG.permissions[guild].splice(CONFIG.permissions[guild].indexOf(role.id), 1);
				}
				break;
			case 'view':
				break;
			default:
				return;
		}
		await this.showPermissions(interaction);
		this.exportFile();
	}

	async showPermissions(interaction) {
		const guild = interaction.guildId;
		const roleText = CONFIG.permissions[guild].map(o => `　<@&${o}>`);
		await interaction.reply({
			ephemeral: true,
			content: `**Current roles with game starting permission:**\n${roleText.join('\n')}`
		});
	}

	//--------------------------------------------------------------------------
	// * Fire games
	//--------------------------------------------------------------------------

	async fireGames(playerList, interaction) {
		const guild = interaction.guildId;
		clearInterval(this.intervalLog[guild]);
		this.intervalLog[guild] = setInterval(this.parseMessage.bind(this, guild), 15000);

		const numTables = (playerList.length - (playerList.length % 4)) / 4;

		var startedTables = [];
		var retries = 0;

		// Get current lobby rules
		await fetch(`https://tenhou.net/cs/edit/cmd_load.cgi?C${CONFIG.lobby[guild]}`, { method: "GET", headers: { 'Content-Type': 'text/plain' } })
			.then(res => res.text())
			.then((text) => {
				const ruleList = text.match(/"RULE":"[0-9a-f]{8,},[0-9a-f]{8,},[0-9a-f]{4,}/);
				if (ruleList) {
					const rules = ruleList[0].substring(ruleList[0].lastIndexOf(',') + 1);
					CONFIG.rules[guild] = rules;
					const ruleNumber = parseInt(rules, 16);
					CONFIG.shuugivalue[guild] = 0;
					if (ruleNumber & (1 << 9)) CONFIG.shuugivalue[guild] = 2;
					if (ruleNumber & (1 << 10)) CONFIG.shuugivalue[guild] = 5;
				}
			});
		//CONFIG.rules[guild] = '0009';

		while (startedTables.length < numTables) {
			for (let i = 0; i < numTables; i++) {
				if (startedTables.includes(i)) { continue; }
				const data = `L=C${CONFIG.lobby[guild]}&R2=${CONFIG.rules[guild]}&M=${playerList[4 * i + 0]}%0A${playerList[4 * i + 1]}%0A${playerList[4 * i + 2]}%0A${playerList[4 * i + 3]}&RND=default&WG=1&PW=`;
				console.log(data);
				try {
					await fetch(`https://tenhou.net/cs/edit/cmd_start.cgi`, { method: "POST", body: data, headers: { 'Content-Type': 'text/plain' } })
						.then(res => res.text())
						.then((text) => {
							const prettyText = decodeURI(text);
							console.log(prettyText);

							if (prettyText.startsWith("MEMBER NOT FOUND")) {
								this.tables[i] = `<:sx:848707751382482974>${this.tables[i].substring(24)}`;
								let failedPlayers = prettyText.trim().split("\r\n");
								interaction.channel.send(`　**Failed to start game ${i + 1}**: ${failedPlayers.join(', ')}`);
							} else {
								this.tables[i] = `<:so:848707751408304138>${this.tables[i].substring(24)}`;
								startedTables.push(i);
							}
							interaction.editReply(this.tables.join('\n'));
						});
				} catch (e) {
					interaction.channel.send(`**Error:** ${e} (Will retry shortly)`)
				}
				await new Promise(resolve => setTimeout(resolve, 1500));
			}
			await new Promise(resolve => setTimeout(resolve, 10000));
			if (startedTables.length < numTables) {
				if (++retries > 3) {
					interaction.channel.send('**Game timed out.**');
					break;
				}
				interaction.channel.send(`**Retrying failed tables** (Attempt ${retries}/3)...`);
			};
		}
	}

	//--------------------------------------------------------------------------
	// * Manually parse log
	//--------------------------------------------------------------------------

	async parseInteraction(interaction) {
		const logId = interaction.options.getString('log').match(/\d{10}gm-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{8}/);
		if (!logId) {
			await interaction.reply({
				ephemeral: true,
				content: '**Error:** Invalid log identifier.'
			});
			return;
		}
		const level = interaction.options.getInteger('minimum') ?? (CONFIG.display[interaction.guildId] ?? -1);
		const output = await this.parseLog(logId, level, false, interaction.guildId)
		console.log(output);
		if (output.error) {
			await interaction.reply({
				ephemeral: true,
				content: `**Error:** ${output.error}`
			});
			return;
		}
		let final = [];
		let display = [];
		const usingShuugi = output.result.shuugi ? 1 : 0;
		const multiplier = 1;
		console.log(usingShuugi);

		for (let j = 0; j < 4; j++) {
			const i = output.result.rank[j] - 1;
			final[i] = (parseFloat(output.result.points[j]) + (usingShuugi ? (output.result.shuugi[j] * CONFIG.shuugivalue[interaction.guildId]) : 0.0));
			display[i] = `${output.result.names[j]} **${final[i] > 0 ? '+' : '−'}${usingShuugi ? 'ℝ' : ''}${Math.abs(final[i] * multiplier).toFixed(1 + usingShuugi)}**`;
			if (usingShuugi) display[i] += ` (${output.result.points[j] > 0 ? '+' : ''}${parseFloat(output.result.points[j]).toFixed(1)} ${output.result.shuugi[j] > 0 ? '+' : ''}${output.result.shuugi[j]}枚)`;
		}
		const displayLine = display.join("<:dd:910815362776461312>")
		const text = `${displayLine}\n[**Game log (${output.count} hand${output.count > 1 ? 's' : ''}):**](http://tenhou.net/4/?log=${logId})\n${output.text}`;
		const message = Discord.Util.splitMessage(text);
		if (message.length === 1) {
			await interaction.reply({ content: message[0], files: output.chart });
		} else {
			await interaction.reply({ content: message[0] });
			await interaction.followUp({ content: message[1], files: output.chart });
		}
	}


	//--------------------------------------------------------------------------
	// * Parse config
	//--------------------------------------------------------------------------

	async parseMessage(guild) {
		try {
			const text = await fetch(`https://tenhou.net/cs/edit/cmd_get_log.cgi`, { method: "POST", body: `L=C${CONFIG.lobby[guild]}&T=${CONFIG.lasttime[guild]}`, headers: { 'Content-Type': 'text/plain' } })
				.then(checkStatus)
				.then(res => res.text());
			const split = text.split('\r\n');
			for (const message of split) {
				//console.log(`${guild}: ${message}`);
				let rxTime = message.substring(1, 20);
				let rxLog = message.match(/\d{10}gm-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{8}/);
				let rxName = message.match(/&un=[^,]*,[^,]*,[^,]*,[^,&]*/);
				let rxScore = message.match(/&sc=[^,]*,[^,]*,[^,]*,[^,&]*/);
				let rxShuugi = message.match(/&chip=[^,]*,[^,]*,[^,]*,[^,&]*/);
				if (rxLog) {
					let rxLogNames = decodeURIComponent(message.match(/#START [^ ]* [^ ]* [^ ]* [^ "]*/));
					rxLogNames = rxLogNames.substring(7).split(' ').join(',');
					if (!CONFIG.activegames[guild][rxLog]) {
						CONFIG.activegames[guild][rxLog] = rxLogNames;
						clearInterval(this.intervalLog[guild]);
						this.intervalLog[guild] = setInterval(this.parseMessage.bind(this, guild), 15000);
						console.log(`${rxTime}: ${rxLog} / ${rxLogNames}`);
						this.exportFile();
					}
					CONFIG.lasttime[guild] = rxTime;
				}
				if (rxName) {
					rxName = decodeURIComponent(rxName).toString().substring(4).split(',');
					let rxJoined = rxName.join(',');
					rxScore = rxScore.toString().substring(4).split(',');
					let usingShuugi = rxShuugi ? true : false;
					rxShuugi = rxShuugi?.toString().substring(6).split(',') ?? [0, 0, 0, 0];
					let log = Object.keys(CONFIG.activegames[guild]).find(key => CONFIG.activegames[guild][key] === rxJoined);
					if (log) {
						CONFIG.lasttime[guild] = rxTime;
						let gameScore = {
							players: [
								{ name: rxName[0], score: parseFloat(rxScore[0]), shuugi: parseInt(rxShuugi[0]) },
								{ name: rxName[1], score: parseFloat(rxScore[1]), shuugi: parseInt(rxShuugi[1]) },
								{ name: rxName[2], score: parseFloat(rxScore[2]), shuugi: parseInt(rxShuugi[2]) },
								{ name: rxName[3], score: parseFloat(rxScore[3]), shuugi: parseInt(rxShuugi[3]) },
							],
							log: log,
							shuugi: usingShuugi
						}
						gameScore.players.sort(function (a, b) {
							return b.score - a.score;
						});
						delete CONFIG.activegames[guild][log];
						if (Object.keys(CONFIG.activegames[guild]).length === 0) {
							clearInterval(this.intervalLog[guild]);
							this.intervalLog[guild] = setInterval(this.parseMessage.bind(this, guild), 1800000);
							console.log(`${guild} interval now 30m`);
						}
						console.log(`${rxTime}: ${JSON.stringify(gameScore)}`);
						await this.score(gameScore, guild, true);
						this.exportFile();
					}
				}
			}
		} catch (e) {
			console.log(`**Log error:** ${e}`);
		}
		/*
		[2021/11/16 09:04:27] lobby=18935&type=0241&dan=2,12,5,11&rate=1483.21,1819.10,1479.92,1435.22&wg=8c7be24b&log=2021111609gm-0241-18935-49c77eab&cmd=<CHAT text="#START %41%72%61%6E%6C%79%64%65 %70%6F%69%6E%74 %77%6F%6C%66%6F%73 %4C%59%31%6E%58"/>
		[2021/11/16 09:14:58] lobby=18935&cmd=<CHAT text="#END %4C%59%31%6E%58(%2B51.4,%2B2%E6%9E%9A) %70%6F%69%6E%74(%2B9.7,%2B2%E6%9E%9A) %77%6F%6C%66%6F%73(-15.2,-1%E6%9E%9A) %41%72%61%6E%6C%79%64%65(-45.9,-3%E6%9E%9A) " />
		[2021/11/16 09:14:59] lobby=18935&type=0241&un=%41%72%61%6E%6C%79%64%65,%70%6F%69%6E%74,%77%6F%6C%66%6F%73,%4C%59%31%6E%58&sc=-45.9,9.7,-15.2,51.4&chip=-3,2,-1,2
		*/
	}


	//--------------------------------------------------------------------------
	// * Score games
	//--------------------------------------------------------------------------

	async scoreGames(args, channel) {
		if (args.length == 0) {
			channel.send(`**Please provide a message to score (${PREFIX}score UUID)**`);
			return;
		} else {
			args.shift();
			this.score(args.join(' '), channel.guildId);
		}
	}

	//--------------------------------------------------------------------------
	// * Parse Tenhou log
	//--------------------------------------------------------------------------

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

	//2021121520gm-0009-16253-1c4f451f

	async parseLog(log, minimum = -1, after = false, guild = "") {
		try {
			const NYC = false; // (guild === "685470974577082377");
			const nycShuugiValue = CONFIG.shuugivalue["685470974577082377"] * 1000;
			const nycMultiplier = CONFIG.multiplier["685470974577082377"];
			const startScore = 25000;
			let res = await fetch(`https://tenhou.net/0/log/?${log}`, { method: "GET", headers: { 'Content-Type': 'text/plain' } });
			if (!res.ok && after) {
				await new Promise(resolve => setTimeout(resolve, 10000));
				res = await fetch(`https://tenhou.net/0/log/?${log}`, { method: "GET", headers: { 'Content-Type': 'text/plain' } });
			}
			if (!res.ok) {
				return { error: `**HTTP ${res.status}:** ${res.statusText}` }
			}
			const text = await res.text();

			fs.writeFileSync(`./logs/${log}.xml`, text);

			const paifu = convlog(text, log);
			const shuugi = paifu.shuugi && paifu.shuugi[0] !== undefined
			//const json = JSON.stringify(paifu, null, 4);
			//fs.writeFileSync(`${log}.json`, json);

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
							event.hand.round === 0 ? scores.round.push(winds[event.hand.wind]) : scores.round.push(fullwidth[event.hand.round])
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
						const level = `**${agari.han ?? '★'}${agari.fu ? `/${agari.fu}` : ''}**`;
						const limit = agari.level > 0 ? `${LIMITVALUES[agari.level]} ` : '';
						const hand = `${formattedValue} \`${display}\` ${payouts}<:db:921259034319921203>${limit}${level} ${yaku.join(', ')}`;
						console.log(hand);
						if (agari.level >= minimum) output.push(hand);
					} else if (event.abort) {
						const draw = event.abort;
						const formattedValue = `\`     ${shuugi ? '   　' : ''}\``;
						let bonus = '';
						if (draw.name === 'ryuukyoku') {
							let extra = [];
							for (let i = 0; i < draw.hands.length; i++) {
								if (draw.hands[i] !== '') extra.push(names[i]);
							}
							bonus = ` (${extra.length === 0 ? 'all noten' : extra.join(', ')})`
						} else {
							bonus = ' abort'
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
			const buffer = await this.makeChart(scores, NYC && shuugi);
			return { chart: buffer, text: output.join('\n'), count: hands, result: result };
		} catch (e) {
			console.log(`**Log error:** ${e}`);
			return { error: e };
		}
	}

	async makeChart(scores, ratbux = false) {

		const colors = {
			RED: 'rgb(255, 99, 132)',
			BLUE: 'rgb(54, 162, 235)',
			YELLOW: 'rgb(255, 205, 86)',
			GREEN: 'rgb(75, 192, 192)',
			PURPLE: 'rgb(153, 102, 255)',
		}

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
				}]
			},
			options: {
				plugins: {
					legend: {
						position: 'top',
						labels: {
							filter: function (legendItem, data) {
								const len = data.datasets[3]?.label ? 3 : 2
								return legendItem.datasetIndex <= len
							}
						}
					}
				},
				scales: {
					x: {
						grid: {
							color: function (context) {
								return context.tick.value === 0 ? 'rgba(128, 128, 128, 0)' : context.tick.label === '' ? 'rgba(128, 128, 128, 0.2)' : 'rgba(128, 128, 128, 0.75)';
							},
							drawTicks: false,
						},
						ticks: {
							autoSkip: false,
							minRotation: 0,
							maxRotation: 0,
						}
					},
					y: {
						grid: {
							color: function (context) {
								return context.tick.value === 0 ? 'rgba(128, 128, 128, 0.75)' : 'rgba(128, 128, 128, 0.2)';
							},
							tickLength: 5,
							drawBorder: false
						},
						suggestedMin: -10000,
						suggestedMax: scores.p1[0] * 2,
						ticks: {
							stepSize: 10000,
							autoSkip: false,
							callback: function (value) {
								return value / 1000 + 'k';
							},
						},
						stack: 'shuugi',
						stackWeight: 3,
					}
				}
			}
		};
		if (ratbux) {
			const nycMultiplier = CONFIG.multiplier["685470974577082377"];
			configuration.options.scales.y.suggestedMin = -30 * nycMultiplier;
			configuration.options.scales.y.suggestedMax = 30 * nycMultiplier;
			configuration.options.scales.y.ticks = {
				stepSize: 5,
				autoSkip: false,
				callback: function (value) {
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
			configuration.options.scales.y.ticks.callback = function (value, index, ticks) {
				return index != ticks.length - 1 ? value / 1000 + 'k' : '';
			};
			//const scale = Math.ceil(Math.max(...[scores.shuugi.p1, scores.shuugi.p2, scores.shuugi.p3, scores.shuugi.p4].flat().map(Math.abs), 5) / 5) * 5;
			const four = scores.shuugi.p4 ?? 0;
			const scale = Math.max(...[scores.shuugi.p1, scores.shuugi.p2, scores.shuugi.p3, four].flat().map(Math.abs), 5);
			configuration.options.scales.y2 = {
				grid: {
					color: function (context) {
						return context.tick.value === 0 || context.index === 0 ? 'rgba(128, 128, 128, 0.75)' : 'rgba(128, 128, 128, 0.2)';
					},
					lineWidth: function (context) {
						return context.index === 0 ? 5 : 1;
					},
					tickLength: 5,
					drawBorder: false
				},
				min: -scale,
				max: scale,
				ticks: {
					stepSize: scale,
					callback: function (value, index) {
						return index > 0 ? value + '枚' : '';
					},
				},
				stack: 'shuugi',
				stackWeight: 1,
			}
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
			},];
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
			let imageBuffer = [await this.shuugiCanvas.renderToBuffer(configuration)];
			return imageBuffer;
		} else {
			let imageBuffer = [await this.canvas.renderToBuffer(configuration)];
			return imageBuffer;
		}
	}

	async score(result, guild, upload = true) {
		const parsed = await this.parseLog(result.log, CONFIG.display[guild], true, guild);

		console.log(`SCORING ${result.log}`);
		if (SCOREDGAMES.includes(result.log)) return;
		SCOREDGAMES.push(result.log);

		const multiplier = CONFIG.multiplier[guild];

		const final = [];
		const display = [];

		for (let i = 0; i < 4; i++) {
			final[i] = (result.players[i].score + (result.players[i].shuugi * CONFIG.shuugivalue[guild]));
			display[i] = `${result.players[i].name} **${final[i] > 0 ? '+' : '−'}${result.shuugi ? 'ℝ' : ''}${Math.abs(final[i] * multiplier).toFixed(1 + result.shuugi)}**`;
			if (result.shuugi) display[i] += ` (${result.players[i].score > 0 ? '+' : ''}${result.players[i].score.toFixed(1)} ${result.players[i].shuugi > 0 ? '+' : ''}${result.players[i].shuugi}枚)`;
		}
		console.log(`${display.join(" ・ ")}`);

		if (upload) {
			if (parsed.error) {
				const text = `${display.join("<:dd:910815362776461312>")}\nhttp://tenhou.net/4/?log=${result.log}`;
				await CHANNEL[guild].send(text);
			} else {
				const text = `${display.join("<:dd:910815362776461312>")}\nhttp://tenhou.net/4/?log=${result.log}\n${parsed.text}`
				const message = Discord.Util.splitMessage(text);
				if (message.length === 1) {
					await CHANNEL[guild].send({ content: message[0], files: parsed.chart });
				} else {
					await CHANNEL[guild].send({ content: message[0] });
					await CHANNEL[guild].send({ content: message[1], files: parsed.chart });
				}
			}
		}
		const date = new Intl.DateTimeFormat('fr-ca').format(new Date());
		let sendData = {
			"Date": date,
			"1 Name": result.players[0].name, "1 Score": result.players[0].score, "1 Shuugi": result.players[0].shuugi, "1 Total": final[0],
			"2 Name": result.players[1].name, "2 Score": result.players[1].score, "2 Shuugi": result.players[1].shuugi, "2 Total": final[1],
			"3 Name": result.players[2].name, "3 Score": result.players[2].score, "3 Shuugi": result.players[2].shuugi, "3 Total": final[2],
			"4 Name": result.players[3].name, "4 Score": result.players[3].score, "4 Shuugi": result.players[3].shuugi, "4 Total": final[3]
		};
		this.sendToSpreadsheet(guild, 'Games', 'USER_ENTERED', sendData);
	}

	async sendToSpreadsheet(guild, range, valueInputOption, values) {
		const sheetIndex = await this.sheets[guild].sheetsByIndex.findIndex((i) => i.title === range);
		console.log(sheetIndex);
		const newRow = await this.sheets[guild].sheetsByIndex[sheetIndex].addRow(values);
	}

	//--------------------------------------------------------------------------
	// * Display current scores
	//--------------------------------------------------------------------------

	async showScores(interaction) {
		const guild = interaction.guildId;
		const sheetIndex = await this.sheets[guild].sheetsByIndex.findIndex((i) => i.title === 'Results');
		const sheet = this.sheets[guild].sheetsByIndex[sheetIndex];
		await sheet.loadCells(['A1', 'H1:H2', 'A3:F83', 'J1', 'Q1:Q2', 'J3:O83']);
		const NYC = (guild === "685470974577082377");

		var shiftCharCode = Δ => c => String.fromCharCode(c.charCodeAt(0) + Δ);

		let monthDisplay = ['__**`  　　　　　　　　   Gm   Total    枚 `**__'];
		let weekDisplay = ['__**`  　　　　　　　　   Gm   Total    枚 `**__'];

		if (NYC) {
			monthDisplay = ['__**`  　　　　　　　　   Gm   RatBux    枚 `**__'];
			weekDisplay = ['__**`  　　　　　　　　   Gm   RatBux    枚 `**__'];	
		}

		for (let i = 2; i < 83; i++) {
			if (!sheet.getCell(i, 0).value) {
				break;
			}
			monthDisplay.push(`${i-1}. \`${sheet.getCell(i, 1).value?.replace(/[!-~]/g, shiftCharCode(0xFEE0))}${'　'.repeat(8 - sheet.getCell(i, 1).value.length)}   ${sheet.getCell(i, 2).formattedValue}   ${sheet.getCell(i, 3).formattedValue}   ${sheet.getCell(i, 5).formattedValue}\``)
		}

		for (let i = 2; i < 83; i++) {
			if (!sheet.getCell(i, 9).value) {
				break;
			}
			weekDisplay.push(`${i-1}. \`${sheet.getCell(i, 10).value?.replace(/[!-~]/g, shiftCharCode(0xFEE0))}${'　'.repeat(8 - sheet.getCell(i, 10).value.length)}   ${sheet.getCell(i, 11).formattedValue}   ${sheet.getCell(i, 12).formattedValue}   ${sheet.getCell(i, 14).formattedValue}\``)
		}

		const monthEmbed = new Discord.MessageEmbed()
			.setColor('#274e13')
			.setTitle(sheet.getCell(0, 0).value)
			.setDescription(monthDisplay.join('\n'))
			.setFooter(`From ${sheet.getCell(0, 7).formattedValue} to ${sheet.getCell(1, 7).formattedValue}${NYC ? ' ・ RatBux have no monetary value' : ''}`);

		const weekEmbed = new Discord.MessageEmbed()
			.setColor('#1c4587')
			.setTitle(sheet.getCell(0, 9).value)
			.setDescription(weekDisplay.join('\n'))
			.setFooter(`From ${sheet.getCell(0, 16).formattedValue} to ${sheet.getCell(1, 16).formattedValue}${NYC ? ' ・ RatBux have no monetary value' : ''}`);

		let embeds;

		switch (interaction.options.getSubcommand()) {
			case 'monthly':
				embeds = [monthEmbed];
				break;
			case 'weekly':
				embeds = [weekEmbed];
				break;
			default:
				embeds = [monthEmbed, weekEmbed];
				break;
		}

		await interaction.reply({
			content: `**[Current standings](https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheet[guild]}/)**`, embeds: embeds
		});
	}

	//--------------------------------------------------------------------------
	// * Set filter
	//--------------------------------------------------------------------------

	async setFilter(interaction) {
		const guild = interaction.guildId;
		const from = interaction.options.getString('from');
		const to = interaction.options.getString('to');
		const heading = interaction.options.getString('heading');
		let cellColumns;

		if (!from.match(/^\d{4}-\d{2}-\d{2}$/) || !to.match(/^\d{4}-\d{2}-\d{2}$/)) {
			await interaction.reply({
				ephemeral: true,
				content: '**Error:** Dates must be provided in YYYY-MM-DD format.'
			})
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

		const sheetIndex = await this.sheets[guild].sheetsByIndex.findIndex((i) => i.title === 'Results');
		const sheet = this.sheets[guild].sheetsByIndex[sheetIndex];
		await sheet.loadCells(['A1', 'H1:H2', 'J1', 'Q1:Q2']);

		sheet.getCell(0, cellColumns[1]).value = from;
		sheet.getCell(1, cellColumns[2]).value = to;
		if (heading) sheet.getCell(0, cellColumns[0]).value = heading;
		await sheet.saveUpdatedCells();

		await interaction.reply({
			ephemeral: true,
			content: `${sheet.getCell(0, cellColumns[0]).value} now filtering games from ${sheet.getCell(0, cellColumns[1]).formattedValue} to ${sheet.getCell(1, cellColumns[2]).formattedValue}`
		});
	}

	async testFunction(msg = null, cmd = null) {
		const output = await this.parseLog(cmd, 0);
		await msg.channel.send({ content: `**Game log (${output.count} hands):**\n${output.text}`, files: [output.chart] });
	}


	//--------------------------------------------------------------------------
	// * Export config
	//--------------------------------------------------------------------------

	exportFile() {
		const json = JSON.stringify(CONFIG, null, 2);
		fs.writeFile('tenhouconfig.json', json, (err) => {
			if (err) {
				console.log(err);
				return;
			}
		});
		console.log('Exported');
	}

	async importFile() {
		try {
			const data = JSON.parse(fs.readFileSync('tenhouconfig.json', 'utf8'));
			CONFIG = data;
			console.log(CONFIG);
		} catch (e) {
			console.log(e);
		}
	}


	//--------------------------------------------------------------------------
	// * React to message
	//--------------------------------------------------------------------------

	react(state, msg) {
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
}

//============================================================================
// ** Exports
//============================================================================

module.exports = DiscordClient;
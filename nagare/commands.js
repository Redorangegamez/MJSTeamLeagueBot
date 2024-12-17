import { GoogleSpreadsheet } from 'google-spreadsheet';
import { CONFIG, CHANNEL, PREFIX } from './constants.js';
import * as common from './common.js';

export async function handleMessage(message) {

	if (!message.content.startsWith(PREFIX) || message.author.bot) return;

	const args = message.content.slice(PREFIX.length).trim().split(' ');
	const command = args.shift().toLowerCase();

	if (message.author.id !== '339573014117220372') {
		return;
	}

	switch (command) {
	case 'riichi':
	case 'ping':
		sendPing(message.channel);
		break;
	case 'deploy':
	case 'slash':
		deployCommands(message, args[0]);
		break;
	case 'restart':
		process.exit();
		break;
	case 'init':
		initialize(message, args[0]);
		break;
	default:
		break;
	}
}

export async function sendPing(channel) {
	const guild = channel.guildId;
	if (!CHANNEL[guild]) {
		channel.send(`Cannot find a results channel for guild ${channel.guild.name}. Use \`/display [minimum] [channel]\` to set it.`);
		return;
	} else {
		channel.send(`Hi! I'm Nagare!\n**　Results channel:** <#${CONFIG[guild].channelid}>\n**　Client:** ${CONFIG[guild].client}`);
	}
}

export async function initialize(message, spreadsheet) {
	const now = new Date().toISOString();
	const guild = message.guildId;
	if (!CONFIG[guild].spreadsheet) {
		CONFIG[guild] = {
			'client': 'tenhou',
			'spreadsheet': spreadsheet,
			'channelid': '',
			'persistent': {
				'channel': '',
				'list': '',
				'standings': '',
			},
			'permissions': [ guild ],
			'display': -1,
			'tenhou': {
				'lobby': '',
				'players': 4,
				'activegames': {},
				'lasttime': `${now.substring(0, 4)}/${now.substring(5, 7)}/${now.substring(8, 10)} ${now.substring(11, 19)}`,
				'rules': '',
				'shuugivalue': 0,
				'multiplier': 1,
			},
			'majsoul': {
				'lobby': 0,
				'room': 0,
				'players': 4,
				'season': 1,
				'lastgame': '',
			},
		};
		common.sheets[guild] = new GoogleSpreadsheet(CONFIG[guild].spreadsheet);
		await common.exportFile();
		await common.initSheets();
	}
}

export async function deployCommands(msg, args) {
	const client = msg.client;
	const data = [
		{
			name: 'list',
			description: 'List readied players and start games',
		},
		{
			name: 'help',
			description: 'Show Nagare\'s configuration and functions in this guild',
		},
		{
			name: 'rules',
			description: 'Show the rules for the lobby',
		},
		{
			name: 'lobby',
			description: 'Display the tournament lobby',
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
			name: 'register',
			description: 'Register a player into the lobby (Majsoul only)',
			options: [
				{
					name: 'code',
					type: 'INTEGER',
					description: 'In-game friend code',
					required: true,
				},
			],
		},
		{
			name: 'pause',
			description: 'Pause a match (Majsoul only)',
			options: [
				{
					name: 'player',
					type: 'STRING',
					description: 'In-game name to pause',
					required: true,
				},
			],
		},
		{
			name: 'unpause',
			description: 'Resume a match (Majsoul only)',
			options: [
				{
					name: 'player',
					type: 'STRING',
					description: 'In-game name to resume',
					required: true,
				},
			],
		},
		{
			name: 'resume',
			description: 'Resume a match (Majsoul only)',
			options: [
				{
					name: 'player',
					type: 'STRING',
					description: 'In-game name to resume',
					required: true,
				},
			],
		},
		{
			name: 'add',
			description: 'Adds an unscored game',
			options: [
				{
					name: 'log',
					type: 'STRING',
					description: 'Game ID or link',
					required: true,
				},
			],
		},
		{
			name: 'terminate',
			description: 'Terminates a game',
			options: [
				{
					name: 'player',
					type: 'STRING',
					description: 'In-game name to terminate',
					required: true,
				},
			],
		},
		{
			name: 'client',
			description: 'Set the client',
			options: [
				{
					name: 'client',
					type: 'STRING',
					description: 'Which client to use.',
					required: true,
					choices: [
						{
							name: 'Tenhou',
							value: 'tenhou',
						},
						{
							name: 'Mahjong Soul',
							value: 'majsoul',
						},
					],
				},
			],
		},
		{
			name: 'persistent',
			description: 'Sets persistent leaderboard and shuffle channel',
			options: [
				{
					name: 'on',
					type: 'SUB_COMMAND',
					description: 'Activates persistent leaderboard in this channel',
				},
				{
					name: 'off',
					type: 'SUB_COMMAND',
					description: 'Removes persistent leaderboard',
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
					description: 'Display the monthly leaderboard',
				},
				{
					name: 'weekly',
					type: 'SUB_COMMAND',
					description: 'Display the weekly leaderboard',
				},
				{
					name: 'all',
					type: 'SUB_COMMAND',
					description: 'Display both leaderboards',
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
					required: true,
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
		const res = await client.application.commands.set(data);
		console.log(res);
		console.log('GLOBAL slash commands created');
	} else if (args === 'd') {
		await client.guilds.cache.get(msg.guildId)?.commands.set([]);
		console.log(`Slash commands deleted in ${msg.guild.name}`);
	} else {
		await client.guilds.cache.get(msg.guildId)?.commands.set(data);
		console.log(`Slash commands created in ${msg.guild.name}`);
	}
}
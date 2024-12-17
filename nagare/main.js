'use strict';

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

import { Client } from 'discord.js';
import { discordAuthToken, mjsPassword, mjsUser } from './config.js';
import { CONFIG, CHANNEL, PERSISTENT } from './constants.js';
import { handleMessage } from './commands.js';
import { importFile, initSheets, sheets, handleCommand, handleButton,
	startChecks, stopListening, updatePersistentScores, exportFile } from './common.js';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { get_token } from './majsoul_api.js';

//============================================================================
// ** Discord Client
//============================================================================

await importFile();

const client = new Client({
	presence: {
		activities: [{
			name: 'Mahjong',
			type: 'WATCHING',
		}],
	},
	intents: ['GUILDS', 'GUILD_MESSAGES', 'GUILD_MESSAGE_REACTIONS', 'GUILD_INTEGRATIONS'],
});

client.once('ready', async () => {
	console.log('Discord Login');
	for (const guild in CONFIG) {
		sheets[guild] = new GoogleSpreadsheet(CONFIG[guild].spreadsheet);
		console.log(guild);
	}
	await initSheets();
	for (const guild in CONFIG) {
		CHANNEL[guild] = client.channels.cache.get(CONFIG[guild].channelid);
		if (CONFIG[guild].persistent.channel && CONFIG[guild].persistent.list && CONFIG[guild].persistent.standings) {
			const persistentChannel = client.channels.cache.get(CONFIG[guild].persistent.channel);
			const list = await persistentChannel.messages.fetch(CONFIG[guild].persistent.list);
			const standings = await persistentChannel.messages.fetch(CONFIG[guild].persistent.standings);
			PERSISTENT[guild] = { list, standings };
			try {
				await stopListening(guild);
				await updatePersistentScores(guild);
			} catch (e) {
				console.log(e);
				CONFIG[guild].persistent = {};
				await exportFile();
			}
		}
	}
	await get_token(mjsUser, mjsPassword);
	setInterval(get_token, 3 * 60 * 60 * 1000, mjsUser, mjsPassword);
	await startChecks();
});
client.on('messageCreate', message => {
	handleMessage(message);
});

client.on('interactionCreate', interaction => {
	if (interaction.isCommand()) {
		handleCommand(interaction);
	} else if (interaction.isButton()) {
		handleButton(interaction);
	} else {
		return;
	}
});

client.login(discordAuthToken);
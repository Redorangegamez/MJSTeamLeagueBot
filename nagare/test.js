import { start_default_game, get_token, active_games } from './majsoul_api.js';
import { mjsUser, mjsPassword } from './config.js';

const lobby = 48992072;
const season = 2;
const tablePlayers = [134335, 137471, 148706, 223719];

test();

async function test() {
	await get_token(mjsUser, mjsPassword);
	const res = await active_games(lobby, season);
	console.log(res);
}

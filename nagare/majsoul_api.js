import fetch from 'node-fetch';
let stored_token = '';
const contestPlayers = [];

const API = 'https://contest-gate-202411.maj-soul.com/api/';
const REALTIME_API = 'https://common-202411.maj-soul.com/api/';

async function return_json(url, params) {
	try {
		const res = await fetch(url, params);
		if (!res.ok) throw new Error(res.status);

		const json = await res.json();
		return json.data ?? json;
	} catch (e) {
		console.log(url);
		console.log(e);
		return { error: e };
	}
}

async function dhs_get(endpoint) {
	return await return_json(`${API}${endpoint}`,
		{
			method: 'GET',
			headers: {
				'Content-type': 'application/json; charset=UTF-8',
				'Authorization': stored_token,
			},
		});
}

async function dhs_post(endpoint, body) {
	return await return_json(`${API}${endpoint}`,
		{
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-type': 'application/json; charset=UTF-8',
				'Authorization': stored_token,
			},
		});
}

export async function get_token(user, pass) {
	const res = await return_json(
		`${API}login`,
		{
			method: 'POST',
			body: JSON.stringify({
				'account':user,
				'password':pass,
				'type':0,
			}),
			headers: {
				'Content-type': 'application/json; charset=UTF-8',
			},
		});

	if (!res.error) {
		stored_token = `Majsoul ${res.token}`;
	}
}

export async function live_update(uuid) {
	const res = await return_json(`${REALTIME_API}game/realtime/${uuid}/progress/latest`,
		{
			method: 'GET',
			headers: {
				'Content-type': 'application/json; charset=UTF-8',
			},
		});
	return res;
}

export async function contest_list() {
	const res = await dhs_get('contest/fetch_contest_list');
	return res;
}

export async function season_players(lobby, season) {
	let start = 0;
	let done = false;
	while (!done) {
		const players = await dhs_get(`contest/contest_season_player_list?unique_id=${lobby}&season_id=${season}&search=&state=2&offset=${start}&limit=100`);
		if (!players) return false;
		start += 100;
		if (start >= players.total) done = true;
		contestPlayers.push(...players.list);
	}
	return contestPlayers;
}

export async function search_players(lobby, season, id) {
	const internal_id = decode_id(id);
	const res = await dhs_get(`contest/contest_season_player_list?unique_id=${lobby}&season_id=${season}&search=${internal_id}&state=2&offset=0&limit=10`);
	return res;
}

export async function game_log(lobby, season, game) {
	const logs = await get_logs(lobby, season, 0, 50);
	for (const l of logs.record_list) {
		if (l.uuid === game) {
			const players = l.result.players;
			for (const p of players) {
				p.nickname = l.accounts[p.seat].nickname;
			}
			return {
				log: l.uuid,
				time: l.end_time - l.start_time,
				players,
			};
		}
	}
}

export async function get_logs(lobby, season, offset = 0, limit = 10) {
	const res = await dhs_get(`contest/fetch_contest_game_records?unique_id=${lobby}&season_id=${season}&offset=${offset}&limit=${limit}`);
	return res;
}

export async function get_yakuman(lobby, season, offset = 0, limit = 10) {
	const res = await dhs_get(`contest/fetch_marked_contest_game?unique_id=${lobby}&season_id=${season}&offset=${offset}&limit=${limit}`);
	return res;
}

export async function start_default_game(lobby, season, players, shuffle = false) {
	const res = await contest_details(lobby);
	const points = [res.game_mode.detail_rule.init_point, res.game_mode.detail_rule.init_point, res.game_mode.detail_rule.init_point, res.game_mode.detail_rule.init_point];
	return start_game(lobby, season, players, points, shuffle);
}

export async function start_game(lobby, season, players, init_points, shuffle = false) {
	const res = await dhs_post('contest/create_game_plan', {
		'unique_id':lobby,
		'season_id':season,
		'account_list':players,
		'init_points':init_points,
		'game_start_time':Math.floor(Date.now() / 1000),
		'shuffle_seats':shuffle,
		'ai_level':1,
	});
	return res;
}

export async function game_plan_list(lobby, season) {
	const res = await dhs_get(`contest/fetch_contest_game_plan_list?unique_id=${lobby}&season_id=${season}`);
	return res;
}

export async function remove_game_plan(lobby, season, uuid) {
	const res = await dhs_post('contest/remove_contest_plan_game', {
		'unique_id': lobby,
		'season_id': season,
		'uuid': uuid,
	});
	return res;
}

export async function contest_details(lobby) {
	const res = await dhs_get(`contest/fetch_contest_detail?unique_id=${lobby}`);
	return res;
}

export async function active_players(lobby, season) {
	const res = await dhs_get(`contest/ready_player_list?unique_id=${lobby}&season_id=${season}`);
	return res;
}

export async function search_accounts(account_id) {
	const internal_id = account_id.map(p => decode_id(p));
	const res = await dhs_post('contest/search_accounts', {
		'account_list': internal_id,
	});
	return res;
}

export async function add_player_by_id(lobby, season = 1, account_id) {
	const res = await search_accounts([account_id]);
	if (res.length > 0) {
		const player = await add_player(lobby, season, res[0].account_id, res[0].nickname);
		return player;
	}
	return null;
}

// public id to internal id
export function decode_id(id) {
	let e = id;
	if ((e -= 1e7) <= 0) return 0;
	let t = e & 67108863;
	return t = (131071 & t) << 9 | t >> 17,
	t = (131071 & t) << 9 | t >> 17,
	t = (131071 & t) << 9 | t >> 17,
	t = (131071 & t) << 9 | t >> 17,
	t = (131071 & t) << 9 | t >> 17,
	(e & -67108864) + t ^ 6139246;
}

// internal id to public id
export function encode_id(id) {
	let e = id;
	let t = (e ^= 6139246) & 67108863;
	return t = (511 & t) << 17 | t >> 9,
	t = (511 & t) << 17 | t >> 9,
	t = (511 & t) << 17 | t >> 9,
	t = (511 & t) << 17 | t >> 9,
	t = (511 & t) << 17 | t >> 9,
	(e & -67108864) + t + 1e7;
}

export async function add_player(lobby, season, account_id, nickname) {
	const res = await dhs_post('contest/add_contest_season_player', {
		'unique_id':lobby,
		'season_id':season,
		'account_list':[{ 'account_id':account_id, 'nickname':nickname }],
	});
	return res;
}

export async function find_player_game(lobby, season, nickname) {
	const games = await active_games(lobby, season);
	if (games.length === 0) return null;
	for (const g of games) {
		if (g.players.find(o => o.nickname === nickname)) return g.game_uuid;
	}
	return null;
}

export async function active_games(lobby, season) {
	const res = await dhs_get(`contest/contest_running_game_list?unique_id=${lobby}&season_id=${season}`);
	return res;
}

export async function live_status(lobby, season) {
	const status = [];
	const games = await active_games(lobby, season);
	for (const g of games) {
		const s = await live_update(g.game_uuid);
		if (s.uuid) {
			g.round = s.chang;
			g.wind = s.ju;
			g.honba = s.ben;
			for (let i = 0; i < s.scores.length; i++) g.players[i].score = s.scores[i];
		}
		status.push(g);
	}
	return status;
}

export async function pause_game(lobby, uuid, mode = 1) {
	const res = await dhs_post('contest/pause_contest_running_game', {
		'unique_id':lobby,
		'game_uuid':uuid,
		'resume':mode,
	});
	return res;
}

export async function resume_game(lobby, uuid) {
	const res = await pause_game(lobby, uuid, 2);
	return res;
}

export async function pause_player_game(lobby, season, player, mode = 1) {
	const game = await find_player_game(lobby, season, player);
	if (!game) return null;
	return pause_game(lobby, game, mode);
}

export async function terminate_game(lobby, uuid) {
	const res = await dhs_post('contest/terminate_contest_running_game', {
		'unique_id':lobby,
		'game_uuid':uuid,
	});
	return res;
}

export async function terminate_player_game(lobby, season, player) {
	const game = await find_player_game(lobby, season, player);
	if (!game) return null;
	return terminate_game(lobby, game);
}
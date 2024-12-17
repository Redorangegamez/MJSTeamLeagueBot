export function parseMajsoulRules(res) {
	const rules = res.game_mode.detail_rule;

	const game_rules = {
		starting_points: rules.init_point,
		min_points_to_win: rules.fandian,
		goal_points: rules.jingsuanyuandian,
		auto_win_points: rules.tianbian_value,
		busting_enabled: rules.can_jifei,
		uma: [
			rules.shunweima_2,
			rules.shunweima_3,
			rules.shunweima_4,
		],
		riichi_value: rules.liqibang_value,
		honba_value: rules.changbang_value,
		noten_payments: [
			rules.noting_fafu_1,
			rules.noting_fafu_2,
			rules.noting_fafu_3,
		],
		nagashi_mangan_enabled: rules.have_liujumanguan,
		kiriage_mangan_enabled: rules.have_qieshangmanguan,
		dora_enabled: rules.have_biao_dora,
		kan_dora_enabled: rules.have_gang_biao_dora,
		immediate_kan_dora: rules.ming_dora_immediately_open,
		ura_dora_enabled: rules.have_li_dora,
		kan_ura_dora_enabled: rules.have_gang_li_dora,
		four_kan_draw_enabled: rules.have_sigangsanle,
		four_wind_draw_enabled: rules.have_sifenglianda,
		four_riichi_draw_enabled: rules.have_sijializhi,
		nine_terminal_draw_enabled: rules.have_jiuzhongjiupai,
		triple_ron_draw_enabled: rules.have_sanjiahele,
		head_bump_enabled: rules.have_toutiao,
		dealer_win_repeat_enabled: rules.have_helelianzhuang,
		last_dealer_win_ends: rules.have_helezhongju,
		dealer_tenpai_repeat_enabled: rules.have_tingpailianzhuang,
		last_dealer_tenpai_ends: rules.have_tingpaizhongju,
		ippatsu_enabled: rules.have_yifa,
		extension_to_west: rules.have_nanruxiru,
		hints_enabled: rules.bianjietishi,
		tsumo_loss_enabled: rules.have_zimosun,
		local_yaku_enabled: rules.guyi_mode,
		kazoe_yakuman_enabled: !rules.disable_leijiyiman,
		double_yakuman_enabled: !rules.disable_double_yakuman,
		multiple_yakuman_enabled: !rules.disable_composite_yakuman,
		dora_dorara: rules.dora3_mode,
		asura: rules.xuezhandaodi,
		bloodshed: rules.chuanma,
		charleston_enabled: rules.huansanzhang,
		swap_calling_enabled: rules.enable_shiti,
		last_turn_riichi_enabled: rules.enable_nontsumo_liqi,
		double_wind_is_4_fu: !rules.disable_double_wind_four_fu,
		can_rob_ankan_for_13_orphans: !rules.disable_angang_guoshi,
		renhou_enabled: rules.enable_renhe,
		pao_mode: rules.enable_baopai_extend_settings,
		min_han: rules.fanfu,
		round_type: rules.round_type,
		open_tanyao_enabled: rules.shiduan,
		aka_count: rules.dora_count,
		thinking_type: rules.thinking_type,
		time_per_turn: rules.time_fixed,
		time_bank: rules.time_add,
		allow_emotes: !rules.emoji_switch,
		mode: res.game_mode.mode % 10,
		players: res.game_mode.mode > 10 ? 3 : 4,
	};
	return game_rules;
}

/* {
	"TITLE":"%E7%AC%AC%E2%97%8B%E2%97%8B%E5%9B%9E%E3%80%80%E2%97%8B%E2%97%8B%E2%97%8B%E2%97%8B%E2%97%8B%E6%9D%AF",
	"RULE":"202408052100,202408052300,034f,0,0,0,0",
	"CSRULE":"00000000,00000000,,,10000,20000,30000,40000,,,2000,300,,,,,500,1000,1500,,,2,-3,-4,12,-13,-14,22,-23,-24,32,-33,-34,42,-43,-44,1,52,53,2,55,56,3,58,59",
	"RANKING":"sc3m",
	"MEMBER":"%41%E3%81%95%E3%82%93,%42%E3%81%95%E3%82%93,%43%E3%81%95%E3%82%93,%44%E3%81%95%E3%82%93",
	"CHATMEMBER":"",
	"DISABLEGUESTID":1,
	"EDITAUTH":"173.160.167.118.0f59c7fc4a71485f65cb22d13bfc4e44"
} */

export async function parseTenhouRules(res) {
	const rules = res.match(/"RULE":"[0-9a-f]+,[0-9a-f]+,(?<base>[0-9a-f]+).*"CSRULE":"(?<cs1>[0-9a-f]+),(?<cs2>[0-9a-f]+),,,(?<cs3>[-,0-9]+)"/);
	const { base, cs1, cs2, cs3 } = rules.groups;
	const numbers = cs3.split(',').map(o => parseInt(o));

	const players = 4 - (base & (1 << 4));
	const base_uma = players === 4 ? [10, -10, -20] : [0, -20, undefined];
	const base_points = players === 4 ? [25000, 30000, 30000, 0, 1000, 100, 1000, 1500, 3000] : [35000, 40000, 40000, 0, 1000, 100, 1000, 2000, undefined];
	const base_rules = {
		starting_points: numbers[0] || base_points[0],
		min_points_to_win: numbers[1] || base_points[1],
		goal_points: numbers[2] || base_points[2],
		auto_win_points: numbers[3] || base_points[3],
		busting_enabled: !(cs1 & (1 << 2)),
		uma: [
			[numbers[17] || base_uma[0], numbers[18] || base_uma[1], numbers[19] || base_uma[2]],
			[numbers[20] || base_uma[0], numbers[21] || base_uma[1], numbers[22] || base_uma[2]],
			[numbers[23] || base_uma[0], numbers[24] || base_uma[1], numbers[25] || base_uma[2]],
			[numbers[26] || base_uma[0], numbers[27] || base_uma[1], numbers[28] || base_uma[2]],
			[numbers[29] || base_uma[0], numbers[30] || base_uma[1], numbers[31] || base_uma[2]],
		],
		riichi_value: numbers[6] || base_points[4],
		honba_value: (numbers[7] || base_points[5]) * (players - 1),
		noten_payments: [
			numbers[12] || base_points[6],
			numbers[13] || base_points[7],
			numbers[14] || base_points[8],
		],
		nagashi_mangan_enabled: !(cs1 & (1 << 0)),
		kiriage_mangan_enabled: (cs1 & (1 << 1)),
		dora_enabled: !(cs1 & (1 << 4)),
		kan_dora_enabled: !(cs1 & (1 << 5)),
		immediate_kan_dora: (cs1 & (1 << 3)),
		ura_dora_enabled: !(cs1 & (1 << 6)),
		kan_ura_dora_enabled: !(cs1 & (1 << 7)),
		four_kan_draw_enabled: !(cs1 & (1 << 9)),
		four_wind_draw_enabled: !(cs1 & (1 << 8)),
		four_riichi_draw_enabled: !(cs1 & (1 << 10)),
		nine_terminal_draw_enabled: !(cs1 & (1 << 11)),
		triple_ron_draw_enabled: !(cs1 & (1 << 12)),
		head_bump_enabled: (cs1 & (1 << 13)),
		dealer_win_repeat_enabled: !(cs1 & (1 << 16)),
		last_dealer_win_ends: !(cs1 & (1 << 14)),
		dealer_tenpai_repeat_enabled: !(cs1 & (1 << 17)),
		last_dealer_tenpai_ends: !(cs1 & (1 << 15)),
		ippatsu_enabled: !(cs1 & (1 << 19)),
		two_winds_per_round: (cs1 & (1 << 20)),
		extension_to_west: !(cs1 & (1 << 21)),
		tsumogiri_enabled: (base & (1 << 8)),
		nukidora: !(cs1 & (1 << 22)),
		tsumo_split_enabled: (cs1 & (1 << 23)),
		local_yaku_enabled: false,
		kazoe_yakuman_enabled: !(cs2 & (1 << 4)),
		double_yakuman_enabled: false,
		multiple_yakuman_enabled: true,
		swap_calling_enabled: false,
		last_turn_riichi_enabled: (cs1 & (1 << 25)),
		double_wind_is_4_fu: (cs2 & (1 << 0)),
		can_rob_ankan_for_13_orphans: true,
		renhou_enabled: (cs1 & (1 << 24)),
		pao_mode: (cs2 & (1 << 3)),
		split_ties: (cs2 & (1 << 1)),
		min_han: 1,
		open_tanyao_enabled: (base & (1 << 2)),
		aka_count: (1 - (base & (1 << 1))) * (players - 1),
		time_per_turn: (base & (1 << 6)) ? 3 : ((cs2 & (1 << 6)) ? 1 : 5),
		time_bank: (base & (1 << 6)) ? 5 : ((cs2 & (1 << 6)) ? 0 : 10),
		mode: 2 - !(base & (1 << 3)),
		players: players,
		shuugi_value: (base & (1 << 10)) ? 5 : ((base & (1 << 10)) ? 2 : 0),
	};
	if ((numbers[35] || numbers[32]) && (numbers[36] || numbers[33])) {
		base_rules.time_per_turn = numbers[35] || numbers[32];
		base_rules.time_bank = numbers[36] || numbers[33];
	}
}

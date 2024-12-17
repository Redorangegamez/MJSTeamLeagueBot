/*
 *  convlog
 */
'use strict';

let type;
let players = 4;
let usesShuugi = false;

function parse_type(str) {
	type = {};
	type.demo = !(0x01 & str);
	type.hongpai = !(0x02 & str);
	type.ariari = !(0x04 & str);
	type.dongfeng = !(0x08 & str);
	type.sanma = (0x10 & str);
	players = type.sanma ? 3 : 4;
	type.soku = (0x40 & str);
	type.level = (0x20 & str) >> 4 | (0x80 & str) >> 7;

	console.log(type);

	return (players === 3 ? '三' : '四')
        + ['般', '上', '特', '鳳'][type.level]
        + (type.dongfeng ? '東' : '南')
        + (type.ariari ? '喰' : '')
        + (type.hongpai ? '赤' : '')
        + (type.soku ? '速' : '')
        + (type.demo ? '－' : '');
}

const dan_name = [
	'新人', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級',
	'初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '十段',
	'天鳳位',
];

function parse_player(attr) {
	const name = ['n0', 'n1', 'n2', 'n3'].slice(0, players).map(n => decodeURIComponent(attr[n]));
	const dan = attr.dan.split(',').map(n => dan_name[n]);
	const rate = attr.rate.split(',').map(n => Math.floor(n));
	return [0, 1, 2, 3].slice(0, players).map(n => `${name[n]}`);
}

function pai(pai) {
	let paistr = '';
	let suit;
	if (!Array.isArray(pai)) pai = [pai];
	for (const pn of pai.sort((a, b) => a - b)) {
		const s = ['m', 'p', 's', 'z'][pn / 36 | 0];
		if (s != suit) paistr += s;
		suit = s;
		let n = (pn % 36 / 4 | 0) + 1;
		if (type.hongpai && s != 'z' && n == 5 && pn % 4 == 0) n = 0;
		paistr += n;
	}
	return paistr;
}

function mianzi(mc) {
	const d = ['', '+', '=', '-'][mc & 0x0003];
	if (mc & 0x0004) {
		const pt = (mc & 0xFC00) >> 10;
		const r = pt % 3;
		const pn = pt / 3 | 0;
		const s = ['m', 'p', 's'][pn / 7 | 0];
		const n = pn % 7 + 1;
		const nn = [n, n + 1, n + 2];
		const pp = [mc & 0x0018, mc & 0x0060, mc & 0x0180];
		for (let i = 0; i < 3; i++) {
			if (type.hongpai && nn[i] == 5 && pp[i] == 0) nn[i] = 0;
			if (i == r) nn[i] += d;
		}
		return s + nn.join('');
	} else if (mc & 0x0018) {
		const pt = (mc & 0xFE00) >> 9;
		const r = pt % 3;
		const pn = pt / 3 | 0;
		const s = ['m', 'p', 's', 'z'][pn / 9 | 0];
		const n = pn % 9 + 1;
		const nn = [n, n, n, n];
		if (type.hongpai && s != 'z' && n == 5) {
			if ((mc & 0x0060) == 0) nn[3] = 0;
			else if (r == 0) nn[2] = 0;
			else nn[1] = 0;
		}
		return (mc & 0x0010) ? s + nn.slice(0, 3).join('') + d + nn[3]
			: s + nn.slice(0, 3).join('') + d;
	} else {
		const pt = (mc & 0xFF00) >> 8;
		const r = pt % 4;
		const pn = pt / 4 | 0;
		const s = ['m', 'p', 's', 'z'][pn / 9 | 0];
		const n = pn % 9 + 1;
		const nn = [n, n, n, n];
		if (type.hongpai && s != 'z' && n == 5) {
			if (d == '') nn[3] = 0;
			else if (r == 0) nn[3] = 0;
			else nn[2] = 0;
		}
		return s + nn.join('') + d;
	}
}

function qipai(attr) {

	const seed = attr.seed.split(',');
	const ten = attr.ten.split(',').map(x => x * 100);
	const chip = attr.chip?.split(',');
	if (chip?.length > 1) usesShuugi = true;

	// ten = ten.concat(ten.splice(0, attr.oya));
	// hai = hai.concat(hai.splice(0, attr.oya));

	const winds = ['東', '南', '西', '北'];
	const fullwidth = ['１', '２', '３', '４'];

	const hand = {
		wind: seed[0] / 4 | 0,
		round: seed[0] % 4,
		honba: +seed[1],
		riichi: +seed[2],
		scores: ten,
		dora: pai(seed[5]),
		hai: [0, 1, 2, 3].slice(0, players).map(l => pai(attr[`hai${l}`].split(','))),
	};
	if (usesShuugi) hand.shuugi = chip;
	return { hand };
}

const yaku_name = [
	'tsumo', 'riichi', 'ippatsu', 'chankan', 'rinshan', 'haitei', 'houtei', 'pinfu', 'tanyao', 'iipeikou',
	'ton', 'nan', 'shaa', 'pei', 'ton', 'nan', 'shaa', 'pei', 'haku', 'hatsu', 'chun', 'double riichi',
	'chiitoi', 'chanta', 'ittsuu', 'sanshoku doujun', 'sanshoku doukou', 'sankantsu', 'toitoi', 'sanankou',
	'shousangen', 'honroutou', 'ryanpeikou', 'junchan', 'honitsu', 'chinitsu', '',
	'tenhou', 'chiihou', 'daisangen', 'suuankou', 'suuankou tanki', 'tsuiisou', 'ryuuiisou', 'chinroutou',
	'chuuren', '9-sided chuuren', 'kokushi', '13-sided kokushi', 'daisuushi', 'shousuushi', 'suukantsu',
	'dora', 'ura', 'aka',
];

function hule(attr, oya) {

	const ten = attr.ten.split(',');
	const ba = attr.ba.split(',');
	let sc = attr.sc.split(',').map(x => x * 100);
	const chip = attr.chip ? attr.chip.split(',') : [];
	const yaku = attr.yaku ? attr.yaku.split(',') : [];
	const yakuman = attr.yakuman ? attr.yakuman.split(',') : [];
	const chipyaku = chip.filter((element, index) => {
		return index % 2 === 0;
	});
	const chipshu = chip.reduce((sum, val, i) => (i & 1 ? +val + sum : sum), 0);

	let hupai = [], fanshu = 0;
	for (const y of yakuman) {
		const object = {
			id: y,
			name: yaku_name[y],
			display: `**${yaku_name[y]}**`,
			han: '*',
		};
		if (chipyaku.indexOf(y) > -1) {
			object.chip = +chip[chipyaku.indexOf(y) * 2 + 1];
		}
		hupai.push(object);
	}
	for (let i = 0; i < yaku.length; i += 2) {
		if (+yaku[i + 1] === 0) continue;
		const display = (yaku[i] > 51 && +yaku[i + 1] > 1) ? `${yaku_name[yaku[i]]} ${yaku[i + 1]}` : yaku_name[yaku[i]];
		const object = {
			id: yaku[i],
			name: yaku_name[yaku[i]],
			display: display,
			han: +yaku[i + 1],
		};
		if (chipyaku.indexOf(yaku[i]) > -1) {
			object.chip = +chip[chipyaku.indexOf(yaku[i]) * 2 + 1];
		}
		hupai.push(object);
		fanshu += +yaku[i + 1];
	}

	const hule = {
		who: attr.who,
		hand: [pai(attr.hai.split(',').filter(pn => pn != attr.machi))
            + pai(attr.machi),
		].concat(
			(attr.m ? attr.m.split(',') : [])
				.reverse()
				.map(mc => mianzi(mc)),
		).join(','),
		display: '',
		from: attr.who != attr.fromWho
			? attr.fromWho : null,
		uradora: attr.doraHaiUra
			? attr.doraHaiUra.split(',').map(pn => pai(pn))
			: null,
		value: +ten[1],
		honba: +ba[0],
		pot: +ba[1],
		yaku: hupai,
		scores: sc,
		level: +ten[2],
	};
	if (yakuman.length) {
		hule.yakuman = yakuman;
	} else {
		hule.fu = +ten[0];
		hule.han = fanshu;
	}
	// KIRIAGE
	if (((hule.han === 4 && hule.fu === 30) || (hule.han === 3 && hule.fu === 60)) && (hule.value === 8000 || hule.value === 12000)) hule.level = 1;

	if (usesShuugi) {
		hule.shuugi = [+sc[(2 * players) + 1] / 100, +sc[(2 * players) + 3] / 100, +sc[(2 * players) + 5] / 100, +sc[(2 * players) + 7] / 100].slice(0, players);
		hule.scores = [sc[1], sc[3], sc[5], sc[7]].slice(0, players);
		hule.chip = attr.who != attr.fromWho ? chipshu : chipshu * 3;
	}
	return { agari: hule };
}

/* const pingju_name = {
    nm:     '流し満貫',
    yao9:   '九種九牌',
    kaze4:  '四風連打',
    reach4: '四家立直',
    ron3:   '三家和了',
    kan4:   '四槓散了',
};*/

const pingju_name = {
	nm: 'nagashi mangan',
	yao9: 'nine terminal',
	kaze4: 'four wind',
	reach4: 'four riichi',
	ron3: 'triple ron',
	kan4: 'four kan',
};

function pingju(attr, oya, fulou) {

	const sc = attr.sc.split(',').map(x => x * 100);
	const hai = [0, 1, 2, 3].slice(0, players).map(i =>
		attr[`hai${i}`]
			? [pai(attr[`hai${i}`].split(','))]
				.concat(fulou[i]).join(',')
			: '',
	);
	const abort = {
		name: pingju_name[attr.type] || 'ryuukyoku',
		hands: hai,
		scores: sc,
	};

	if (usesShuugi) {
		if (players === 3) {
			abort.shuugi = [sc[7] / 100, sc[9] / 100, sc[11] / 100];
			abort.scores = [sc[1], sc[3], sc[5]];
		} else {
			abort.shuugi = [sc[9] / 100, sc[11] / 100, sc[13] / 100, sc[15] / 100];
			abort.scores = [sc[1], sc[3], sc[5], sc[7]];
		}
	}
	return { abort };
}

export function convlog(xml, log_id) {

	const paipu = {};

	let log, oya, zimo, gang, baopai, lizhi, fulou;

	for (const tag of xml.match(/<.*?>/g)) {
		const [, elem, attrlist] = tag.match(/^<(\/?\w+)(.*?)\/?>$/);
		const attr = {};
		for (const attrstr of attrlist.match(/\w+=".*?"/g) || []) {
			const [, key, value] = attrstr.match(/^(\w+)="(.*?)"$/);
			attr[key] = value;
		}

		if (elem == 'mjloggm') {
			if (attr.ver != 2.3) console.error('*** Unknown version', attr.ver);
		} else if (elem == 'GO') {
			paipu.title = parse_type(attr.type);
			if (log_id) {
				if (log_id[0] == ':') {paipu.title = log_id.substr(1);} else {paipu.title += `\n${log_id}`;}
			}
		} else if (elem == 'UN' && !paipu.player) {
			paipu.player = parse_player(attr);
		} else if (elem == 'TAIKYOKU') {
			paipu.qijia = +attr.oya;
			paipu.log = [];
		} else if (elem == 'INIT') {
			oya = +attr.oya;
			zimo = null;
			gang = false;
			baopai = null;
			lizhi = false;
			fulou = [[], [], [], []];
			log = [qipai(attr)];
			paipu.log.push(log);
		} else if (elem.match(/^[TUVW]\d+$/)) {
			const l = (elem[0].charCodeAt(0) - 'T'.charCodeAt(0));
			const p = pai(elem.substr(1));
			// let display = display(elem.substr(1));
			if (gang) {
				log.push({ rinshan: { l: l, p: p } });
				gang = false;
			} else {
				log.push({ draw: { l: l, p: p } });
			}
			zimo = elem.substr(1);
			if (baopai) {
				log.push({ kaigang: { baopai: baopai } });
				baopai = null;
			}
		} else if (elem.match(/^[DEFG]\d+$/)) {
			const l = (elem[0].charCodeAt(0) - 'D'.charCodeAt(0));
			let p = pai(elem.substr(1));
			if (elem.substr(1) == zimo) p += '_';
			if (lizhi) p += '*';
			log.push({ discard: { l: l, p: p } });
			lizhi = false;
			if (baopai) {
				log.push({ kandora: { dora: baopai } });
				baopai = null;
			}
		} else if (elem == 'N') {
			const l = attr.who;
			const m = mianzi(attr.m);
			if (m.match(/^[mpsz]\d{3}[\+\=\-]?\d$/)) {
				log.push({ ankan: { l: l, m: m } });
				gang = true;
			} else {
				log.push({ call: { l: l, m: m } });
				if (m.match(/^[mpsz]\d{4}/)) gang = true;
				else zimo = null;
			}
			if (m.match(/^[mpsz]\d{3}[\+\=\-]\d$/)) {
				const o = m.replace(/\d$/, '');
				fulou[+attr.who] = fulou[+attr.who].map(n => n == o ? m : n);
			} else {
				fulou[+attr.who].push(m);
			}
		} else if (elem == 'DORA') {
			if (baopai) {
				log.push({ kandora: { dora: baopai } });
				baopai = null;
			}
			baopai = pai(attr.hai);
		} else if (elem == 'REACH') {
			if (attr.step == 2) log.push({ reach: attr.who });
			lizhi = attr.step == 1;
		} else if (elem == 'AGARI') {
			log.push(hule(attr, oya));
		} else if (elem == 'RYUUKYOKU') {
			log.push(pingju(attr, oya, fulou));
		}
		if (attr.owari) {
			const owari = attr.owari.split(',');
			const rank = [1, 1, 1, 1].slice(0, players);
			const q = paipu.qijia;

			const defen = [owari[0], owari[2], owari[4], owari[6]].slice(0, players)
				.map(x => x * 100);
			const point = [owari[1], owari[3], owari[5], owari[7]].slice(0, players);

			for (let i = 0; i < players; i++) {
				for (let j = i + 1; j < players; j++) {
					if (defen[(i + q) % players] < defen[(j + q) % players]) rank[(i + q) % players]++;
					else rank[(j + q) % players]++;
				}
			}
			paipu.scores = defen;
			paipu.points = point;
			paipu.rank = rank;
			if (usesShuugi) paipu.shuugi = [owari[2 * (players + 0)], owari[2 * (players + 1)], owari[2 * (players + 2)], owari[2 * (players + 3)]].slice(0, players);
		}
	}

	return paipu;
}
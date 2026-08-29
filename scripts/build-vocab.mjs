#!/usr/bin/env node
/**
 * Builds the shipped word data in src/lib/data/ from the authoritative lists in reference/hsk/.
 * Deterministic and re-runnable: reference/ is the source of truth, src/lib/data/ is derived.
 *   node scripts/build-vocab.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'src/lib/data';
const LEVELS = [1, 2, 3, 4, 5];

/** Strip the source list's editorial notation down to hanzi a learner should see. */
function displayHanzi(simplified) {
	return simplified
		.split('|')[0]
		.replace(/[（(][^）)]*[）)]/g, '')
		.replace(/[0-9¹²³]$/, '')
		.replace(/…/g, '')
		.trim();
}

/** Official pinyin, minus the separable-verb marker and the neutral-tone dot. */
function displayPinyin(official, fallback) {
	const p = (official || fallback || '').replace(/∥/g, ' ').replace(/·/g, '').trim();
	return p.replace(/\s+/g, ' ');
}

const DROP = [
	/^see [^ ]/i,
	/^see also/i,
	/^variant of/i,
	/^old variant/i,
	/^abbr\. for/i,
	/^erhua variant/i,
	/^also written/i,
	/^used in/i,
	/^surname /i
];

const HANZI = /[㐀-鿿豈-﫿｜|]+/g;

/** CC-CEDICT senses are reference copy, not learner copy. Trim them into short glosses. */
function glosses(defs) {
	const out = [];
	for (const raw of defs || []) {
		let d = raw.trim();
		if (!d) continue;
		if (/^CL:/.test(d)) continue;
		if (DROP.some((re) => re.test(d))) continue;
		d = d.replace(/\s*CL:.*$/, '');
		d = d.replace(/\[[^\]]*\]/g, ''); // bracketed pinyin
		d = d.replace(HANZI, ''); // stray hanzi cross-refs
		d = d.replace(/\([^)]*\)/g, ' '); // register/usage notes
		d = d
			.replace(/\s{2,}/g, ' ')
			.replace(/\s+([,;])/g, '$1')
			.trim();
		d = d.replace(/^[,;\-–\s]+|[,;\-–\s]+$/g, '');
		if (!d || d.length > 42) continue;
		if (out.some((x) => x.toLowerCase() === d.toLowerCase())) continue;
		out.push(d);
		if (out.length === 3) break;
	}
	return out;
}

const all = [];
for (const L of LEVELS) {
	const rows = JSON.parse(readFileSync(`reference/hsk/hsk30-official-L${L}.json`, 'utf8'));
	for (const r of rows) {
		all.push({
			id: r.id,
			hanzi: displayHanzi(r.simplified),
			traditional: r.traditional && r.traditional.split('|')[0],
			pinyin: displayPinyin(r.officialPinyin, r.pinyin),
			meanings: glosses(r.cedictDefs),
			pos: (r.pos || '').split('/').filter(Boolean),
			level: L
		});
	}
}

// Same hanzi + same pinyin at two levels is one word to a learner. Keep the lowest
// level (that is where they first meet it) and union the meanings.
const byKey = new Map();
for (const w of all) {
	const k = `${w.hanzi} ${w.pinyin.toLowerCase()}`;
	const prev = byKey.get(k);
	if (!prev) {
		byKey.set(k, { ...w, alsoIds: [] });
		continue;
	}
	prev.alsoIds.push(w.id);
	for (const m of w.meanings) if (!prev.meanings.includes(m)) prev.meanings.push(m);
	for (const p of w.pos) if (!prev.pos.includes(p)) prev.pos.push(p);
	if (w.level < prev.level) {
		prev.level = w.level;
		prev.id = w.id;
	}
}

const merged = [...byKey.values()];
mkdirSync(OUT, { recursive: true });
const stats = { officialRows: all.length, shipped: merged.length, perLevel: {}, noMeaning: 0 };
for (const L of LEVELS) {
	const rows = merged
		.filter((w) => w.level === L)
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		.map(({ alsoIds, traditional, ...w }) => ({
			...w,
			...(traditional && traditional !== w.hanzi ? { traditional } : {})
		}));
	writeFileSync(`${OUT}/hsk${L}.json`, JSON.stringify(rows));
	stats.perLevel[L] = rows.length;
	stats.noMeaning += rows.filter((w) => !w.meanings.length).length;
}
console.log(JSON.stringify(stats, null, 2));
writeFileSync(
	`${OUT}/.build-report.json`,
	JSON.stringify({ ...stats, generated: 'scripts/build-vocab.mjs' }, null, 2)
);

#!/usr/bin/env node
/**
 * Builds the shipped word data in src/lib/data/ from the authoritative lists in reference/hsk/.
 *
 * reference/hsk/ is the source of truth; src/lib/data/*.json is derived and disposable.
 * The build is deterministic and re-runnable, and it verifies its own output against the
 * reference before writing, so a bad run fails loudly instead of shipping.
 *
 *   node scripts/build-vocab.mjs            build + verify + write scripts/vocab-audit.json
 *   node scripts/build-vocab.mjs --verify   verify the checked-in JSON without rewriting it
 *   node scripts/build-vocab.mjs --report   also dump gloss diagnostics to stderr
 *
 * Three things this build refuses to do, because loop 1 shipped all three:
 *
 *   1. Guess at syllable boundaries. `syllables` is parsed out of each reference row's
 *      CC-CEDICT key and aligned against the official pinyin character by character. A row
 *      that does not align is a build failure, never a silent fallback.
 *   2. Rank a register-flagged CC-CEDICT sense onto a flashcard. Slang, vulgar, dialect,
 *      figurative and variant-character senses are EXCLUDED, and the exclusion is tested on
 *      the raw sense — before the parenthetical stripper deletes the "(slang)" marker.
 *   3. Emit anything that trips one of the five gloss gates below, or let two cards in a level
 *      answer to the same English. `meanings[0]` is the quiz question
 *      (src/lib/components/quiz/quiz.ts), so a wrong primary sense is a wrong answer shipped
 *      to a learner. The gates fail the build; scripts/vocab-audit.json is the work list that
 *      clears them. What counts as "the same English" is src/lib/data/senses.ts, which the
 *      quiz's own distractor guard imports too — one implementation, not two copies.
 *
 * Authored glosses live in scripts/overrides/*.json, not in this file — see readOverrides().
 *
 * Glosses are derived from CC-CEDICT (CC-BY-SA 4.0, published by MDBG) and hand-edited.
 * Attribution ships in the app — see src/lib/data/attribution.ts.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import prettier from 'prettier';
// The app's own sense normaliser, not a copy of it — see the gates section. Node strips the
// types, so the build and the browser run byte-identical logic.
import { senseKeys, senseKey, intersects } from '../src/lib/data/senses.ts';

const OUT = 'src/lib/data';
const REF = 'reference/hsk';
const OVERRIDE_DIR = 'scripts/overrides';
const AUDIT_FILE = 'scripts/vocab-audit.json';
const LEVELS = [1, 2, 3, 4, 5];
const OFFICIAL_SIZES = { 1: 500, 2: 772, 3: 973, 4: 1000, 5: 1071 };

const argv = new Set(process.argv.slice(2));
const VERIFY_ONLY = argv.has('--verify');
const REPORT = argv.has('--report');

/* ------------------------------------------------------------------ hanzi */

/**
 * The official list carries editorial notation a learner must never see:
 *   爸爸|爸        variant forms, primary first
 *   第（第二）      bound form shown with an example
 *   有（一）点儿    optional syllable
 *   称1 / 面2      homograph disambiguation digits
 *   …极了          a slot for the rest of the construction
 * Reduce all of it to the form that belongs on a flashcard.
 */
function displayHanzi(simplified) {
	return simplified
		.split('|')[0]
		.replace(/[（(][^）)]*[）)]/g, '')
		.replace(/[0-9¹²³]+$/, '')
		.replace(/…/g, '')
		.trim();
}

/** Every variant spelling the official row lists, primary first. */
function variantHanzi(simplified) {
	return simplified
		.split('|')
		.map((s) =>
			s
				.replace(/[（(][^）)]*[）)]/g, '')
				.replace(/[0-9¹²³]+$/, '')
				.replace(/…/g, '')
				.trim()
		)
		.filter(Boolean);
}

/**
 * The traditional form the card should carry.
 *
 * The reference's own `traditional` column repeats the simplified column's notation, so for
 * 面2 it reads "面2" and the genuine traditional form 麵 survives only in the CC-CEDICT key
 * (`麵|面[mian4]`). That is the one row corpus-wide where the column loses a form, and taking
 * the key's left half as a fallback is what stops 面2 shipping without it.
 */
function traditionalOf(row, hanzi) {
	const fromColumn = variantHanzi(row.traditional || '')[0] || '';
	if (fromColumn && fromColumn !== hanzi) return fromColumn;
	const fromKey = (row.cedictKey || '').split('|')[0];
	return fromKey && fromKey !== hanzi ? fromKey : '';
}

/* ----------------------------------------------------------------- pinyin */

/**
 * Official pinyin, minus notation:
 *   bāng∥máng      separable-verb marker
 *   nǎ·lǐ          neutral-tone dot
 *   lǎo (Lǎo Wáng) the example that goes with a bound form
 *   bàba|bà        variant spellings
 */
function displayPinyin(official, fallback) {
	return (official || fallback || '')
		.split('|')[0]
		.replace(/[（(][^）)]*[）)]/g, ' ')
		.replace(/∥/g, ' ')
		.replace(/·/g, '')
		.replace(/…/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Source notation that must never reach a headword or its pinyin. */
const LEAKED = /[|｜（）()0-9¹²³…∥·[\]{}]/;
/** Source notation that must never reach a gloss. Digits are fine there ("100 million"). */
const LEAKED_GLOSS = /[|｜（）()¹²³…∥·[\]{}]/;

/* -------------------------------------------------------------- syllables */

/** Tone-marked vowels, tone 1 to 4, in the order the diacritics run. */
const TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };

/** Every tone-marked vowel, mapped back to its plain letter and its tone number. */
const MARKED = new Map();
for (const [plain, marks] of Object.entries(TONE_MARKS)) {
	[...marks].forEach((mark, i) => MARKED.set(mark, { plain, tone: i + 1 }));
}

/** Tone-marked pinyin to plain letters: `bāng` to `bang`, `lǜ` to `lü`. */
function stripTone(text) {
	return [...text].map((c) => MARKED.get(c)?.plain ?? c).join('');
}

/** The tone a printed syllable carries, or 0 when it carries no diacritic at all. */
function toneOfMarked(syllable) {
	for (const c of syllable) {
		const hit = MARKED.get(c);
		if (hit) return hit.tone;
	}
	return 0;
}

/**
 * Split a CC-CEDICT key's bracketed pinyin into one entry per character.
 *
 * `愛|爱[ai4]` gives one syllable; `爸爸|爸爸[ba4 ba5]` gives two, the second neutral.
 * CC-CEDICT writes ü as `u:` (and, in a few entries, `v`); tone 5 is the neutral tone.
 * Returns null when the key has no parseable bracket, which the caller turns into a failure.
 */
function keySyllables(cedictKey) {
	const bracket = /\[([^\]]*)\]\s*$/.exec(cedictKey || '');
	if (!bracket) return null;
	const out = [];
	for (const part of bracket[1].trim().split(/\s+/).filter(Boolean)) {
		const parsed = /^([a-zA-Zü:]+)([0-5])$/.exec(part);
		if (!parsed) return null;
		out.push({
			base: parsed[1].toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü'),
			tone: Number(parsed[2]) % 5
		});
	}
	return out.length ? out : null;
}

/**
 * Cut the official pinyin into the syllables the CC-CEDICT key says are there.
 *
 * The key supplies the boundaries — it is the only field in the corpus that segments an
 * unspaced compound like `xuéshēng` reliably — and the official string supplies the letters,
 * so `syllables.map(s => s.py).join(' ')` is always the pinyin the standard prints. The tone
 * is read off the printed diacritic rather than the key's digit: the standard applies tone
 * sandhi to 不 and 一 (`bú kèqì`, `yìqǐ`) and prints some syllables neutral where CC-CEDICT
 * gives them a full tone, and `py` and `tone` render together, so they must never disagree.
 *
 * Returns null when the two do not describe the same string of letters — three rows corpus
 * wide, all of which are in HAND_SYLLABLES.
 */
function alignSyllables(pinyin, cedictKey) {
	const key = keySyllables(cedictKey);
	if (!key) return null;
	const raw = pinyin.replace(/[\s'’\-·]/g, '');
	const lower = raw.toLowerCase();
	const out = [];
	let at = 0;
	for (const syllable of key) {
		const chunk = raw.slice(at, at + syllable.base.length);
		if (stripTone(lower.slice(at, at + syllable.base.length)) !== syllable.base) return null;
		at += syllable.base.length;
		out.push({ py: chunk, tone: toneOfMarked(chunk) });
	}
	return at === raw.length ? out : null;
}

/**
 * The rows where the machine cannot do it, written out so that "no cedictKey" can stay a
 * build failure everywhere else.
 *
 * The first eleven are the rows CC-CEDICT has no entry for at all (transparent compounds and
 * erhua forms whose headword lives elsewhere in the dictionary). The last three have a key
 * whose reading is not the reading the standard prints: 谁 and 熟 are listed with two
 * pronunciations and the card takes the first, and 血 is xiě on the HSK list but xue4 in
 * CC-CEDICT.
 */
const HAND_SYLLABLES = {
	'L1-0044': [
		['chē', 1],
		['shang', 0]
	], // 车上
	'L2-0034': [
		['bú', 2],
		['tài', 4]
	], // 不太
	'L2-0044': [
		['bù', 4],
		['yí', 2],
		['huì', 4],
		['r', 0]
	], // 不一会儿
	'L2-0264': [
		['jiàn', 4],
		['guo', 0]
	], // 见过
	'L2-0507': [
		['sòng', 4],
		['dào', 4]
	], // 送到
	'L2-0722': [
		['zhè', 4],
		['shí', 2],
		['hou', 0]
	], // 这时候
	'L3-0192': [
		['fàng', 4],
		['dào', 4]
	], // 放到
	'L3-0508': [
		['néng', 2],
		['bu', 0],
		['néng', 2]
	], // 能不能
	'L4-0853': [
		['yǎn', 3],
		['li', 0]
	], // 眼里
	'L4-0897': [
		['yǒu', 3],
		['jìn', 4],
		['r', 0]
	], // 有劲儿
	'L5-0108': [
		['chéng', 2],
		['lǐ', 3]
	], // 城里
	'L1-0325': [['shéi', 2]], // 谁 — the list prints "shéi/shuí"; the card takes shéi
	'L2-0500': [['shú', 2]], // 熟 — the list prints "shú/shóu"; the card takes shú
	'L3-0798': [['xiě', 3]] // 血 — xiě on the HSK list, xue4 in CC-CEDICT
};

/** `syllables` for one row, or a thrown error. There is no silent fallback here on purpose. */
function syllablesFor(row, hanzi, pinyin) {
	const characters = [...hanzi];
	const hand = HAND_SYLLABLES[row.id];
	if (hand) {
		if (hand.length !== characters.length) {
			throw new Error(
				`${row.id} ${hanzi}: HAND_SYLLABLES has ${hand.length} syllables for ${characters.length} characters`
			);
		}
		return hand.map(([py, tone]) => ({ py, tone }));
	}
	if (!row.cedictKey) {
		throw new Error(
			`${row.id} ${hanzi}: no cedictKey and no HAND_SYLLABLES entry — syllables cannot be derived`
		);
	}
	const key = keySyllables(row.cedictKey);
	if (!key) {
		throw new Error(`${row.id} ${hanzi}: cannot parse pinyin out of cedictKey "${row.cedictKey}"`);
	}
	if (key.length !== characters.length) {
		throw new Error(
			`${row.id} ${hanzi}: ${characters.length} character(s) but ${key.length} syllable(s) in "${row.cedictKey}"`
		);
	}
	const aligned = alignSyllables(pinyin, row.cedictKey);
	if (!aligned) {
		throw new Error(
			`${row.id} ${hanzi}: official pinyin "${pinyin}" does not align with "${row.cedictKey}" — add it to HAND_SYLLABLES`
		);
	}
	return aligned;
}

/* --------------------------------------------------------------- register */

/**
 * Register markers CC-CEDICT prints in front of a sense. A sense carrying one of these is
 * EXCLUDED outright, never merely ranked lower.
 *
 * This is tested against the RAW sense, before the parenthetical stripper runs. Loop 1
 * demoted rather than excluded and tested after stripping, so on any word with only two
 * senses the flagged one shipped with its own warning label deleted: HSK 1's 开车 shipped
 * "to post sexual content online", and 鸟, 玻璃 and 鸭子 shipped theirs too.
 */
const REGISTER_WORDS =
	'slang|vulg\\.|vulgar|taboo|derog\\.|derogatory|offensive|dialect|dial\\.|fig\\.|figurative|figuratively|variant|erhua';

/** A register marker in front of the whole sense condemns the whole sense. */
const EXCLUDE_LEADING = new RegExp(`^\\s*\\(?\\s*(?:[a-z]+\\s+)?(?:${REGISTER_WORDS})\\b`, 'i');

/** A register marker in front of one clause condemns only that clause. */
const EXCLUDE_CLAUSE = new RegExp(`\\b(?:${REGISTER_WORDS})`, 'i');

/**
 * "(lit. and fig.) deep" is not a figurative sense — it is a plain one that also reads
 * figuratively. Excluding it left 深, 舞台 and 污染 with no gloss at all, so it is neutralised
 * before the register test rather than caught by it.
 */
const LIT_AND_FIG = /\(?\s*lit\.\s+and\s+fig\.\s*\)?/gi;

/**
 * Content that must never reach a learner-facing gloss, whatever produced it — the machine
 * picker, a merge, or a hand-authored override. The register markers are in here as well as
 * in EXCLUDE_LEADING, because a gloss that still says "(slang)" is as broken as one that no
 * longer says it. Abbreviations are matched only with their period, so a card may still be
 * glossed "to dial" or "fig".
 */
const FORBIDDEN_GLOSS =
	/\b(?:fig|dial|vulg|derog|coll)\.|\b(slang|vulgar|taboo|derogatory|offensive|dialect|figurative|figuratively|variant|erhua|sexual|erotic|porn|pornography|pornographic|homosexual|prostitute|whore|slut|penis|vagina|genitals|genitalia|testicles|damn|damned|goddamn|fuck|fucking|shit|cunt|bastard|bitch)\b/i;

/* --------------------------------------------------------------- glossing */

/** CC-CEDICT senses that are dictionary plumbing, never a flashcard answer. */
const DROP_SENSE = [
	/^CL:/,
	/^see\b/i,
	/^see also/i,
	/^variant of/i,
	/^old variant/i,
	/^abbr\.? for/i,
	/^erhua variant/i,
	/^erhua form of/i,
	/^also pr\.?/i,
	/^colloquial pr\.?/i,
	/^also written/i,
	/^used in\b/i,
	/^surname\b/i,
	/^equivalent to\b/i,
	/^same as\b/i,
	/^\d+$/,
	/^Taiwan pr\./i
];

/** Register markers that survive the deny-list: keep the gloss, but rank it below a plain one. */
const DEMOTE = /^\((bound form|literary|coll\.|PRC|onom\.)/i;

/**
 * Markers that condemn a clause outright, the same way EXCLUDE_CLAUSE's register markers do.
 *
 * These are senses that are true of some other Chinese than the one HSK 3.0 tests: a
 * Taiwan-only reading, or one CC-CEDICT itself labels dead. Loop 1 merely DEMOTEd them and
 * `stripSense` then deleted the label, so seven cards shipped the marked sense with nothing
 * left to warn the learner: 土豆 "peanut" and 计算机 "calculator" are Taiwan readings, 出租车
 * "rental car" likewise, 家人 "servant" and 冰箱 "icebox" are (old), 权利 "power and wealth"
 * is (classical). This is the slang bug in a different coat — demoting is not excluding.
 *
 * `(literary)`, `(bound form)`, `(coll.)` and `(PRC)` stay merely demoted: literary and bound
 * forms are often a word's only sense, colloquial is fine on a flashcard, and PRC usage is
 * precisely what this list teaches.
 */
const EXCLUDE_REGIONAL = /\(\s*(?:Tw|Taiwan|old|archaic|classical|obsolete)\b[^)]*\)/i;

const HANZI_RUN = /[㐀-鿿豈-﫿｜|]+/g;

const MAX_LEN = 34;

/**
 * Turn one CC-CEDICT sense into flashcard alternatives, best first.
 *
 * `notes` collects what the picker had to throw away, so scripts/vocab-audit.json can say
 * why a card is worth a human's time rather than just that it is.
 */
function senseAlternatives(raw, notes) {
	const original = String(raw || '').trim();
	if (!original) return [];
	if (DROP_SENSE.some((re) => re.test(original))) return [];

	const graded = original.replace(LIT_AND_FIG, ' ');
	if (EXCLUDE_LEADING.test(graded)) {
		notes.add('register-sense-excluded');
		return [];
	}

	const demoted = DEMOTE.test(original);
	const clauses = topLevelClauses(graded);
	if (clauses.length > 1) notes.add('sense-clauses-dropped');

	const out = [];
	for (const clause of clauses) {
		if (EXCLUDE_CLAUSE.test(clause)) {
			notes.add('register-sense-excluded');
			continue;
		}
		if (EXCLUDE_REGIONAL.test(clause)) {
			notes.add('register-sense-excluded');
			continue;
		}
		const text = tidy(stripSense(clause));
		if (!text) continue;
		if (FORBIDDEN_GLOSS.test(text)) {
			notes.add('register-sense-excluded');
			continue;
		}
		out.push({ text, demoted });
	}
	return out;
}

/**
 * Split a CC-CEDICT sense on its top-level semicolons.
 *
 * Splitting before the parenthetical stripper runs is what lets a marker be read in the
 * position CC-CEDICT wrote it; a semicolon inside a parenthetical or a bracketed pinyin is
 * not a clause boundary, so the scan tracks depth rather than calling String.split.
 */
function topLevelClauses(text) {
	const out = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '(' || c === '[' || c === '{') depth++;
		else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
		else if (c === ';' && depth === 0) {
			out.push(text.slice(start, i));
			start = i + 1;
		}
	}
	out.push(text.slice(start));
	return out.map((c) => c.trim()).filter(Boolean);
}

/** Everything a dictionary needs and a flashcard does not. */
function stripSense(clause) {
	return clause
		.replace(/\s*\(?CL:.*$/, '') // trailing classifier list, with its wrapper if any
		.replace(/\[[^\]]*\]/g, ' ') // bracketed pinyin
		.replace(HANZI_RUN, ' ') // hanzi cross-references
		.replace(/\((?:[^()]|\([^()]*\))*\)/g, ' ') // parenthetical notes, one nesting deep
		.replace(/[()]/g, ' ') // any unbalanced remainder
		.replace(/\s*\bi\.e\.\s*/g, ' ')
		.replace(/\s*\betc\.?\b/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s,;:.\-\u2013\u2014]+|[\s,;:.\-\u2013\u2014]+$/g, '')
		.trim();
}

/** Learner-facing polish: no dictionary shorthand, no stray plumbing. */
function tidy(text) {
	let t = text
		.replace(/\bsth\.?\b/g, 'something')
		.replace(/\bsb\.?\b/g, 'someone')
		.replace(/\bs\.o\.\b/g, 'someone')
		.replace(/\blit\.\s*/g, '')
		.replace(/\bvar\.\s*/g, '')
		.replace(/\s+/g, ' ')
		.replace(/^["'`]+|["'`]+$/g, '')
		.trim();
	// "to X, to Y" inside one alternative is two glosses pretending to be one.
	if (/^to .+, to /.test(t)) t = t.split(/,\s*(?=to )/)[0];
	return t.replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '').trim();
}

/** How well a candidate gloss suits the official part of speech. */
function posScore(text, pos) {
	const isTo = /^to\b/.test(text);
	const isClassifier = /\bclassifier\b|\bmeasure word\b/i.test(text);
	const isParticle = /\bparticle\b|\bmarker\b|\bsuffix\b|\bprefix\b/i.test(text);
	let s = 0;
	if (pos.includes('M')) s += isClassifier ? 6 : -1;
	if (pos.includes('V')) s += isTo ? 3 : -1;
	if (pos.includes('N') && !pos.includes('V')) s += isTo ? -3 : 1;
	if (pos.includes('Adj')) s += isTo ? -3 : 1;
	if (pos.includes('Adv') || pos.includes('Conj') || pos.includes('Prep')) s += isTo ? -3 : 1;
	if (pos.includes('Aux') || pos.includes('Prefix') || pos.includes('Suffix'))
		s += isParticle ? 3 : 0;
	if (!pos.includes('M') && isClassifier) s -= 4;
	return s;
}

/**
 * Pick one or two short, distinct glosses. One alternative per CC-CEDICT sense, so the
 * result reads as "the meanings of this word" rather than a pile of synonyms.
 *
 * This is a SUGGESTION generator, not an authority. It cannot read a part of speech and it
 * cannot tell which sense a learner meets at this level, so every card it decides is listed
 * in scripts/vocab-audit.json for a human to confirm or replace.
 */
function pickGlosses(defs, pos) {
	const notes = new Set();
	/** @type {{text: string, rank: number, sense: number}[]} */
	const picked = [];
	const senses = (defs || []).map((raw) => senseAlternatives(raw, notes));

	senses.forEach((alts, senseIndex) => {
		if (!alts.length) return;
		const usable = alts.filter((a) => a.text.length <= MAX_LEN);
		if (!usable.length) {
			notes.add('sense-dropped-for-length');
			return;
		}
		// Within a sense, the first alternative is CC-CEDICT's headline reading.
		const best = usable[0];
		const score = posScore(best.text, pos) - senseIndex * 0.4 - (best.demoted ? 2.5 : 0);
		picked.push({ text: best.text, rank: score, sense: senseIndex });
	});

	// Two senses is a normal dictionary entry. Three or more is a pile the ranker had to
	// choose from blind, which is where the wrong-for-level primary glosses come from.
	if (picked.length > 2) notes.add('multi-sense-choice');
	picked.sort((a, b) => b.rank - a.rank);

	const out = [];
	let leadSense = -1;
	for (const { text, sense } of picked) {
		const key = text.toLowerCase();
		if (out.some((x) => x.toLowerCase() === key)) continue;
		if (out.some((x) => overlaps(x, text))) continue;
		if (!out.length) leadSense = sense;
		out.push(text);
		if (out.length === 2) break;
	}
	if (!out.length) notes.add('no-usable-cedict-sense');
	else if (leadSense > 0) notes.add('reordered-past-cedict-sense-1');
	return { meanings: out, notes: [...notes] };
}

/** "to like" vs "to like a lot" on one card is noise, not a second meaning. */
function overlaps(a, b) {
	const x = a.toLowerCase().replace(/^to /, '');
	const y = b.toLowerCase().replace(/^to /, '');
	return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ');
}

/* -------------------------------------------------------------- overrides */

/**
 * Hand-authored glosses, read from every .json file in scripts/overrides/.
 *
 * One file per author, keyed by official row id, shape:
 *
 *   { "L1-0051": { "meanings": ["to wear"], "note": "why this and not CC-CEDICT sense 1" } }
 *
 * File names and read order carry no meaning — several authors work the audit list in
 * parallel and each writes their own file — so the merge is order-independent and the same
 * id appearing in two files is a build failure, not a last-writer-wins.
 */
function readOverrides() {
	let files;
	try {
		files = readdirSync(OVERRIDE_DIR)
			.filter((name) => name.endsWith('.json'))
			.sort();
	} catch {
		return { byId: new Map(), files: [] };
	}
	const byId = new Map();
	const owner = new Map();
	for (const name of files) {
		const path = join(OVERRIDE_DIR, name);
		let parsed;
		try {
			parsed = JSON.parse(readFileSync(path, 'utf8'));
		} catch (err) {
			throw new Error(`${path}: not valid JSON — ${err.message}`, { cause: err });
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(`${path}: expected an object keyed by official row id`);
		}
		for (const [id, value] of Object.entries(parsed)) {
			if (!/^L[1-5]-\d{4}$/.test(id)) {
				throw new Error(`${path}: "${id}" is not an official row id`);
			}
			if (owner.has(id)) {
				throw new Error(
					`${id} is overridden twice: ${owner.get(id)} and ${name} — one id, one owner`
				);
			}
			const meanings = value && value.meanings;
			if (!Array.isArray(meanings) || !meanings.length || meanings.some((m) => !m || !m.trim())) {
				throw new Error(`${path}: ${id} needs a non-empty "meanings" array of strings`);
			}
			if (!value.note || !String(value.note).trim()) {
				throw new Error(`${path}: ${id} needs a "note" saying why this gloss and not CC-CEDICT's`);
			}
			owner.set(id, name);
			byId.set(id, { meanings: meanings.map((m) => m.trim()), note: String(value.note).trim() });
		}
	}
	return { byId, files };
}

/* ------------------------------------------------------------------ build */

function readOfficial() {
	const rows = [];
	for (const level of LEVELS) {
		const file = `${REF}/hsk30-official-L${level}.json`;
		const parsed = JSON.parse(readFileSync(file, 'utf8'));
		if (parsed.length !== OFFICIAL_SIZES[level]) {
			throw new Error(`${file}: expected ${OFFICIAL_SIZES[level]} rows, found ${parsed.length}`);
		}
		rows.push(...parsed);
	}
	return rows;
}

function build(official, overrides) {
	const entries = official.map((r) => {
		const hanzi = displayHanzi(r.simplified);
		const pinyin = displayPinyin(r.officialPinyin, r.pinyin);
		const pos = (r.pos || '').split('/').filter(Boolean);
		const traditional = traditionalOf(r, hanzi);
		const override = overrides.get(r.id);
		const picked = pickGlosses(r.cedictDefs, pos);
		return {
			ids: [r.id],
			id: r.id,
			hanzi,
			traditional: traditional || undefined,
			pinyin,
			syllables: syllablesFor(r, hanzi, pinyin),
			meanings: override ? override.meanings : picked.meanings,
			pos,
			level: r.level,
			// Diagnostics. Never shipped — toShipped() drops them.
			authored: Boolean(override),
			notes: picked.notes,
			suggested: picked.meanings,
			defs: [...(r.cedictDefs || [])],
			cedictKey: r.cedictKey || ''
		};
	});

	// Two official rows collapse into one card only when the standard is describing one word
	// twice — same level, same hanzi, same pinyin AND the same CC-CEDICT headword. That last
	// clause is what keeps 面1 (面|面[mian4], surface / classifier) and 面2 (麵|面[mian4],
	// noodles) apart: loop 1 fused them and shipped a card asserting that noodles is a measure
	// word for flat things. The eight surviving merges are all one word wearing two part-of-
	// speech labels (老, 省, 把, 初, 任, 为, 批, 品), which is not a difference a card can show.
	const byKey = new Map();
	for (const e of entries) {
		const key = `${e.level} ${e.hanzi} ${e.pinyin.toLowerCase()} ${e.cedictKey}`;
		const prev = byKey.get(key);
		if (!prev) {
			byKey.set(key, e);
			continue;
		}
		prev.ids.push(...e.ids);
		prev.notes = [...new Set([...prev.notes, ...e.notes, 'merged-rows'])];
		if (!prev.authored && e.authored) {
			prev.meanings = [...e.meanings];
			prev.authored = true;
		}

		// The second row is a second *official* row: it is there because the standard gives
		// this word a second part of speech, and that label is usually the only place its
		// second sense lives. Loop 2 dropped it whenever the surviving row was authored —
		// which is why 初 shipped "at the beginning, early" under `pos: [Adv, Prefix]` with
		// the lunar-date prefix (初一…初十) gone. An authored row now unions with an authored
		// row; a hand-written gloss is never overwritten by a machine-picked one, and when
		// that is what stops the union the card is flagged for a human.
		if (prev.authored === e.authored) {
			for (const m of e.meanings) {
				if (prev.meanings.length < 3 && !prev.meanings.some((x) => overlaps(x, m))) {
					prev.meanings.push(m);
				}
			}
		} else if (!e.authored && e.meanings.some((m) => !prev.meanings.some((x) => overlaps(x, m)))) {
			prev.notes = [...new Set([...prev.notes, 'merged-row-sense-not-authored'])];
		}
		for (const p of e.pos) if (!prev.pos.includes(p)) prev.pos.push(p);
	}

	return [...byKey.values()];
}

/* ------------------------------------------------------------------ gates */

/**
 * The gates compare glosses through `src/lib/data/senses.ts` — the same function the quiz's
 * distractor guard uses, imported rather than copied.
 *
 * Loop 2 had two hand-kept-identical copies of this normaliser, and they were identical in
 * the wrong way: both split senses on `;` and `/` only, so the house style's own "X or Y"
 * glosses hid 38 same-level pairs whose *primary* glosses answer to the same English. 衬衫
 * shipped "shirt" while 衬衣 shipped "a shirt or blouse", and nothing on either side of the
 * pipeline could see it. There is now one implementation; `node` reads the `.ts` directly.
 */
const senseSetKey = (word) => senseKey(senseKeys(word.meanings));

/** The word's own pinyin with the tones and the spacing taken off: 包子 becomes "baozi". */
function romanization(pinyin) {
	return stripTone(String(pinyin).toLowerCase())
		.replace(/ü/g, 'u')
		.replace(/[^a-z]/g, '');
}

const asLetters = (text) =>
	String(text)
		.toLowerCase()
		.replace(/[^a-z]/g, '');

/** Part-of-speech codes that only ever label a noun, an adjective or an adverb. */
const NOMINAL_ONLY = ['N', 'Adj', 'Adv'];

/** Suffixes that make an English word a noun and nothing else. */
const NOUN_SUFFIX = /(tion|sion|ment|ness|ity|ship|ance|ence|ism|ology|ics|ing)$/;

/** A gloss that names a thing rather than an action: "shopping", "a contest", "aviation". */
function isBareNounGloss(text) {
	const t = String(text).trim();
	// "to implement" is a verb gloss whose head happens to end in -ment. The `to` settles it.
	if (/^to\b/i.test(t)) return false;
	if (/^(a|an|the)\s/i.test(t)) return true;
	const words = t
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	if (!words.length) return false;
	const head = words[words.length - 1];
	if (/^(during|following|regarding|including|according|concerning|owing)$/.test(head))
		return false;
	return NOUN_SUFFIX.test(head);
}

/**
 * The four gates. Each one is a defect loop 1 shipped green, and each one is also a test in
 * src/lib/data/vocab.spec.ts so that the shipped JSON is checked even when nobody rebuilds.
 *
 * These fail the build. They are not tuneable: `meanings[0]` is the quiz question, so every
 * one of them is a wrong answer put in front of a learner.
 */
function gateProblems(shipped) {
	const problems = [];

	// (a) Register. No gloss carries slang, sexual, vulgar, dialect, figurative or
	//     variant-character content — whatever produced it.
	for (const w of shipped) {
		for (const m of w.meanings) {
			const hit = FORBIDDEN_GLOSS.exec(m);
			if (hit) {
				problems.push(`gate:register ${w.id} ${w.hanzi}: "${m}" carries "${hit[0]}"`);
			}
		}
	}

	// (b) No two cards sharing hanzi + pinyin across levels may answer to the same English.
	//     白, 才, 牛, 火, 头, 称, 好, 多, 一会儿 and 出口 all shipped identical primaries in
	//     loop 1, which makes the pair indistinguishable and guarantees one of the two is
	//     wrong for its level. Tested on *any* shared sense, not on the primary alone: 米 L2
	//     "meter" was L3 米's second gloss verbatim, and string inequality could not see it.
	const byWord = new Map();
	for (const w of shipped) {
		const key = `${w.hanzi} ${w.pinyin.toLowerCase()}`;
		if (!byWord.has(key)) byWord.set(key, []);
		byWord.get(key).push(w);
	}
	for (const [key, group] of byWord) {
		if (group.length < 2) continue;
		const senses = new Map(group.map((w) => [w.id, senseKeys(w.meanings)]));
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const [a, b] = [group[i], group[j]];
				if (a.level === b.level) continue;
				const shared = [...senses.get(a.id)].filter((s) => senses.get(b.id).has(s));
				if (shared.length) {
					problems.push(
						`gate:cross-level ${key}: L${a.level} ${a.id} and L${b.level} ${b.id} both mean "${shared[0]}"`
					);
				}
			}
		}
	}

	// (c) No gloss is the entry's own toneless romanization. 包子 glossed "baozi" makes the
	//     quiz question "baozi" with the answer 包子.
	for (const w of shipped) {
		const rom = romanization(w.pinyin);
		for (const m of w.meanings) {
			if (rom && asLetters(m) === rom) {
				problems.push(`gate:romanization ${w.id} ${w.hanzi} ${w.pinyin}: "${m}" is its own pinyin`);
			}
		}
	}

	// (d) Part of speech and primary gloss agree.
	for (const w of shipped) {
		const lead = w.meanings[0] || '';
		if (!w.pos.length) continue;
		if (w.pos.every((p) => NOMINAL_ONLY.includes(p)) && /^to\b/i.test(lead)) {
			problems.push(
				`gate:pos ${w.id} ${w.hanzi} [${w.pos.join('/')}]: leads with the verb gloss "${lead}"`
			);
		}
		if (w.pos.length === 1 && w.pos[0] === 'V' && isBareNounGloss(lead)) {
			problems.push(`gate:pos ${w.id} ${w.hanzi} [V]: leads with the noun gloss "${lead}"`);
		}
	}

	// (e) Punctuation closes. L3 老百姓 shipped `the "person in the street` straight onto an
	//     answer button — a sense truncated mid-quote — and every battery in loop 2 called
	//     the corpus clean, because nothing was counting quotation marks.
	for (const w of shipped) {
		for (const m of w.meanings) {
			if ((m.match(/"/g) ?? []).length % 2 || /[“”]/.test(m)) {
				problems.push(`gate:punctuation ${w.id} ${w.hanzi}: unclosed quotation in "${m}"`);
			}
		}
	}

	return problems;
}

/**
 * Every same-level pair whose *primary* glosses answer to one of the same senses.
 *
 * `meanings[0]` is the text on the answer button (src/lib/components/quiz/quiz.ts), so a
 * shared sense here is not a near-synonym worth arguing about: it is a card where the learner
 * reads "shirt", presses the button that says "shirt", and is marked wrong because the other
 * shirt was the answer. Testing *intersection* rather than string equality is the whole
 * point — 衬衫 "shirt" and 衬衣 "a shirt or blouse" are not equal strings and never were.
 *
 * Shared senses in the *secondary* glosses are left to the runtime guard in
 * `pickDistractors`, which simply never puts the two words on one card. Only the primary is
 * worth failing a build over, because only the primary is a question.
 */
function primaryCollisions(shipped) {
	const found = [];
	for (const level of LEVELS) {
		const bySense = new Map();
		const seenPairs = new Set();
		for (const w of shipped.filter((x) => x.level === level)) {
			for (const sense of senseKeys(w.meanings.slice(0, 1))) {
				const others = bySense.get(sense);
				if (!others) {
					bySense.set(sense, [w]);
					continue;
				}
				for (const other of others) {
					const pair = `${other.id} ${w.id}`;
					if (seenPairs.has(pair)) continue;
					seenPairs.add(pair);
					found.push({ level, sense, a: other, b: w });
				}
				others.push(w);
			}
		}
	}
	return found;
}

/**
 * Within a level, two cards must never answer to the same English — not a shared sense in
 * the primary gloss, and not the same set of glosses in a different order.
 */
function uniquenessProblems(shipped) {
	const problems = [];
	for (const { level, sense, a, b } of primaryCollisions(shipped)) {
		problems.push(
			`unique:primary L${level} "${sense}": ${a.hanzi} (${a.id}) "${a.meanings[0]}" / ${b.hanzi} (${b.id}) "${b.meanings[0]}"`
		);
	}
	for (const level of LEVELS) {
		const sets = new Map();
		for (const w of shipped.filter((x) => x.level === level)) {
			const s = senseSetKey(w);
			const twin = sets.get(s);
			if (twin) {
				problems.push(
					`unique:set L${level} "${s}": ${twin.hanzi} (${twin.id}) / ${w.hanzi} (${w.id})`
				);
			} else sets.set(s, w);
		}
	}
	return problems;
}

/**
 * Same-level pairs that share a sense somewhere *outside* the primary gloss.
 *
 * Not a build failure — the runtime guard keeps them off the same card, and forcing every
 * one apart would push authors into inventing paraphrases, which is what produced 听见 "to
 * catch a sound" in loop 1. It is a work list: `scripts/vocab-audit.json` carries the reason
 * so a human can decide whether the second gloss is earning its place.
 */
function secondarySharing(shipped) {
	const out = [];
	const primaries = new Set(primaryCollisions(shipped).map(({ a, b }) => `${a.id} ${b.id}`));
	for (const level of LEVELS) {
		const rows = shipped.filter((x) => x.level === level);
		const senses = new Map(rows.map((w) => [w.id, senseKeys(w.meanings)]));
		for (let i = 0; i < rows.length; i++) {
			for (let j = i + 1; j < rows.length; j++) {
				const pair = `${rows[i].id} ${rows[j].id}`;
				if (primaries.has(pair)) continue;
				if (intersects(senses.get(rows[i].id), senses.get(rows[j].id))) {
					out.push({ level, a: rows[i], b: rows[j] });
				}
			}
		}
	}
	return out;
}

/* ----------------------------------------------------------------- verify */

/**
 * Every one of the 4,316 official rows must be traceable to exactly one shipped entry,
 * with hanzi, pinyin, syllables and level unchanged from the standard.
 */
function verify(official, shipped) {
	const problems = [];
	const byId = new Map();
	for (const w of shipped) for (const id of w.ids) byId.set(id, w);

	for (const r of official) {
		const w = byId.get(r.id);
		if (!w) {
			problems.push(`${r.id} ${r.simplified}: not traceable to any shipped entry`);
			continue;
		}
		if (w.level !== r.level) problems.push(`${r.id}: level ${w.level} != official ${r.level}`);
		if (w.hanzi !== displayHanzi(r.simplified)) {
			problems.push(`${r.id}: hanzi "${w.hanzi}" != "${displayHanzi(r.simplified)}"`);
		}
		const expectPinyin = displayPinyin(r.officialPinyin, r.pinyin);
		if (w.pinyin.toLowerCase() !== expectPinyin.toLowerCase()) {
			problems.push(`${r.id}: pinyin "${w.pinyin}" != "${expectPinyin}"`);
		}
	}

	const seenIds = new Set();
	for (const w of shipped) {
		for (const id of w.ids) {
			if (seenIds.has(id)) problems.push(`${id}: claimed by two shipped entries`);
			seenIds.add(id);
		}
		if (LEAKED.test(w.hanzi)) problems.push(`${w.id}: source notation in hanzi "${w.hanzi}"`);
		if (LEAKED.test(w.pinyin)) problems.push(`${w.id}: source notation in pinyin "${w.pinyin}"`);
		if (!w.meanings.length) problems.push(`${w.id} ${w.hanzi}: no meaning`);
		for (const m of w.meanings) {
			if (LEAKED_GLOSS.test(m)) {
				problems.push(`${w.id} ${w.hanzi}: source notation in meaning "${m}"`);
			}
			if (m.length > MAX_LEN) problems.push(`${w.id} ${w.hanzi}: meaning too long "${m}"`);
		}
		if (w.meanings.length > 3) problems.push(`${w.id} ${w.hanzi}: ${w.meanings.length} meanings`);

		// Syllables: one per character, a real tone, and joining back to the printed pinyin.
		const characters = [...w.hanzi];
		if (!Array.isArray(w.syllables) || w.syllables.length !== characters.length) {
			problems.push(
				`${w.id} ${w.hanzi}: ${w.syllables?.length ?? 0} syllable(s) for ${characters.length} character(s)`
			);
			continue;
		}
		for (const s of w.syllables) {
			if (!s || typeof s.py !== 'string' || !s.py.trim()) {
				problems.push(`${w.id} ${w.hanzi}: empty syllable`);
			} else if (!Number.isInteger(s.tone) || s.tone < 0 || s.tone > 4) {
				problems.push(`${w.id} ${w.hanzi}: syllable "${s.py}" has tone ${s.tone}`);
			} else if (toneOfMarked(s.py) !== s.tone) {
				problems.push(
					`${w.id} ${w.hanzi}: syllable "${s.py}" is tone ${toneOfMarked(s.py)}, not ${s.tone}`
				);
			}
		}
		// 谁 and 熟 are printed with two readings ("shéi/shuí"); the card takes the first.
		const joined = w.syllables.map((s) => s.py).join('');
		const printed = w.pinyin.split('/')[0].replace(/[\s'’\-·]/g, '');
		if (joined.toLowerCase() !== printed.toLowerCase()) {
			problems.push(`${w.id} ${w.hanzi}: syllables "${joined}" != pinyin "${w.pinyin}"`);
		}
	}

	problems.push(...uniquenessProblems(shipped));
	problems.push(...gateProblems(shipped));
	return problems;
}

/* ------------------------------------------------------------------ audit */

/** Part-of-speech codes CC-CEDICT has no way to gloss — it can only describe them. */
const FUNCTION_POS = ['Adv', 'Prep', 'Conj', 'Aux', 'M', 'Prefix', 'Suffix', 'Num', 'Pron', 'Int'];

/**
 * scripts/vocab-audit.json — every card that needs a human-authored primary gloss.
 *
 * Deliberately generous. A card wrongly on this list costs an author a few seconds; a card
 * wrongly off it ships a wrong answer to a learner, which is exactly what loop 1 did about
 * 430 times over.
 */
function auditEntries(shipped) {
	const gateHits = new Map();
	const note = (id, reason) => {
		if (!gateHits.has(id)) gateHits.set(id, new Set());
		gateHits.get(id).add(reason);
	};
	const byId = new Map(shipped.map((w) => [w.id, w]));

	for (const problem of gateProblems(shipped)) {
		const reason = problem.startsWith('gate:register')
			? 'register-denied-gloss'
			: problem.startsWith('gate:cross-level')
				? 'cross-level-duplicate-gloss'
				: problem.startsWith('gate:romanization')
					? 'gloss-is-its-own-romanization'
					: problem.startsWith('gate:punctuation')
						? 'unclosed-punctuation'
						: 'pos-and-gloss-disagree';
		for (const m of problem.matchAll(/\b(L[1-5]-\d{4})\b/g)) if (byId.has(m[1])) note(m[1], reason);
	}
	for (const problem of uniquenessProblems(shipped)) {
		const reason = problem.startsWith('unique:primary')
			? 'primary-gloss-collision'
			: 'identical-meaning-set';
		for (const m of problem.matchAll(/\b(L[1-5]-\d{4})\b/g)) if (byId.has(m[1])) note(m[1], reason);
	}
	// Not a build failure — see secondarySharing(). Listed so it is work someone can see.
	for (const { a, b } of secondarySharing(shipped)) {
		note(a.id, 'shares-sense-with-level-mate');
		note(b.id, 'shares-sense-with-level-mate');
	}

	const out = [];
	for (const w of shipped) {
		const reasons = new Set(gateHits.get(w.id) ?? []);
		const lead = w.meanings[0] || '';
		const verbal = /^to\b/i.test(lead);
		const only = (...codes) => w.pos.length > 0 && w.pos.every((p) => codes.includes(p));

		// A softer read of the same disagreement the gate fails on. The gate has to be
		// certain; the audit only has to be worth a look, so a measure word that never says
		// "measure word" and a verb that never says "to" both land here.
		if (w.pos.includes('M') && !w.meanings.some((m) => /classifier|measure word/i.test(m))) {
			reasons.add('pos-and-gloss-disagree');
		}
		if (only('V') && !verbal) reasons.add('pos-and-gloss-disagree');
		if (only('N') && verbal) reasons.add('pos-and-gloss-disagree');
		if (only('Adj') && (verbal || /^(a|an|the)\s/i.test(lead))) {
			reasons.add('pos-and-gloss-disagree');
		}
		if (only('Adv') && verbal) reasons.add('pos-and-gloss-disagree');

		// A single character is where every confirmed wrong-sense failure lived: 穿, 上, 做,
		// 最, 正, 才, 让, 版, 棒, 岸, 牛. CC-CEDICT lists a character's senses across the whole
		// language; the card needs the one this level teaches.
		if ([...w.hanzi].length === 1) reasons.add('single-character');

		// The machine picker's own account of what it had to decide or throw away. Any of
		// these means the primary gloss is a guess, which is the ~430 the critic sampled.
		if (!w.authored) {
			if (w.notes.includes('multi-sense-choice')) reasons.add('ranked-among-several-senses');
			if (w.notes.includes('reordered-past-cedict-sense-1')) reasons.add('not-cedict-sense-1');
			if (w.notes.includes('sense-clauses-dropped')) reasons.add('sense-clauses-dropped');
			if (w.notes.includes('sense-dropped-for-length')) reasons.add('sense-dropped-for-length');
			if (w.notes.includes('register-sense-excluded')) reasons.add('register-sense-excluded');
			if (w.pos.some((p) => FUNCTION_POS.includes(p))) reasons.add('function-word-machine-gloss');
			if (!w.pos.length) reasons.add('no-official-pos');
		}
		if (w.notes.includes('no-usable-cedict-sense') || !w.defs.length) {
			reasons.add('no-usable-cedict-sense');
		}
		if (w.notes.includes('merged-rows')) reasons.add('merged-rows');
		if (w.notes.includes('merged-row-sense-not-authored')) {
			reasons.add('merged-row-sense-not-authored');
		}

		if (!reasons.size) continue;
		// Context, not a trigger: whether a human has been here yet.
		reasons.add(w.authored ? 'has-authored-override' : 'machine-picked');
		out.push({
			id: w.id,
			hanzi: w.hanzi,
			pinyin: w.pinyin,
			level: w.level,
			pos: w.pos,
			currentMeanings: w.meanings,
			cedictDefs: w.defs,
			reasons: [...reasons].sort()
		});
	}

	return out.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

/* --------------------------------------------------------------- shipping */

/** The exact JSON shape that ships, in official-id order. */
function toShipped(entries, level) {
	return entries
		.filter((w) => w.level === level)
		.sort((a, b) => a.ids[0].localeCompare(b.ids[0]))
		.map((w) => ({
			id: w.id,
			hanzi: w.hanzi,
			...(w.traditional ? { traditional: w.traditional } : {}),
			pinyin: w.pinyin,
			syllables: w.syllables,
			meanings: w.meanings,
			pos: w.pos,
			level: w.level,
			// Only present where two official rows collapsed into one card; keeps the
			// shipped data auditable row-for-row against the standard.
			...(w.ids.length > 1 ? { ids: w.ids } : {})
		}));
}

/**
 * Written through Prettier with the project's own config, so a rebuild never leaves
 * `npm run lint` failing on formatting and `--verify` can compare bytes.
 */
async function serialize(rows, filepath) {
	const config = await prettier.resolveConfig(filepath);
	return prettier.format(JSON.stringify(rows), { ...config, filepath, parser: 'json' });
}

function readCheckedIn() {
	const out = [];
	for (const level of LEVELS) {
		const rows = JSON.parse(readFileSync(`${OUT}/hsk${level}.json`, 'utf8'));
		for (const w of rows) out.push({ ...w, ids: w.ids ?? [w.id] });
	}
	return out;
}

/* ------------------------------------------------------------------- main */

/** Anything thrown out of readOverrides() or syllablesFor() is a build failure, not a stack. */
function fatal(err) {
	console.error(`\nbuild-vocab: ${err.message}`);
	process.exit(1);
}

const official = readOfficial();
let overrides;
let overrideFiles;
let built;
try {
	({ byId: overrides, files: overrideFiles } = readOverrides());
	built = build(official, overrides);
} catch (err) {
	fatal(err);
}

// The audit is the work list that clears the gates, so it is written whether or not the
// gates pass. A failing build that also refuses to say what to fix is not much use.
const audit = auditEntries(built);
if (!VERIFY_ONLY) {
	mkdirSync('scripts', { recursive: true });
	// Through Prettier like every other generated file, so `npm run lint` stays green.
	writeFileSync(AUDIT_FILE, await serialize(audit, AUDIT_FILE));
}

const problems = [];

if (VERIFY_ONLY) {
	// Audit what is actually checked in, and prove it is what a fresh build produces.
	let checkedIn;
	try {
		checkedIn = readCheckedIn();
	} catch (err) {
		console.error(`cannot read ${OUT}: ${err.message}`);
		process.exit(1);
	}
	problems.push(...verify(official, checkedIn));
	for (const level of LEVELS) {
		const file = `${OUT}/hsk${level}.json`;
		if ((await serialize(toShipped(built, level), file)) !== readFileSync(file, 'utf8')) {
			problems.push(`hsk${level}.json is not what scripts/build-vocab.mjs produces — rebuild it`);
		}
	}
} else {
	problems.push(...verify(official, built));
}

const shipped = VERIFY_ONLY ? readCheckedIn() : built;
const perLevel = {};
for (const level of LEVELS) perLevel[level] = shipped.filter((w) => w.level === level).length;

function tag(w) {
	return `${w.id} ${w.hanzi} ${w.pinyin} [${w.pos.join('/') || '-'}] :: ${w.meanings.join(' | ')}`;
}

if (REPORT) {
	console.error(`single-meaning entries: ${shipped.filter((w) => w.meanings.length === 1).length}`);
	console.error(`longest glosses:`);
	for (const { m, w } of [...shipped]
		.flatMap((w) => w.meanings.map((m) => ({ m, w })))
		.sort((a, b) => b.m.length - a.m.length)
		.slice(0, 20))
		console.error(`  ${m.length}  ${tag(w)}`);
}

const buckets = {};
for (const p of problems) {
	const kind = p.startsWith('gate:') || p.startsWith('unique:') ? p.split(' ')[0] : 'structure';
	buckets[kind] = (buckets[kind] ?? 0) + 1;
}

if (problems.length) {
	console.error(`\n${problems.length} problem(s):`);
	for (const p of problems.slice(0, 200)) console.error('  ' + p);
	if (problems.length > 200) console.error(`  … ${problems.length - 200} more`);
	console.error(`\nnothing written — fix the glosses in ${OVERRIDE_DIR}/ and rebuild.`);
	console.error(`${AUDIT_FILE} lists ${audit.length} card(s) that need a human-authored gloss.`);
}

const summary = {
	officialRows: official.length,
	shippedEntries: shipped.length,
	merged: official.length - shipped.length,
	perLevel,
	overrideFiles,
	overrides: overrides.size,
	auditEntries: audit.length,
	problems: problems.length,
	problemsByGate: buckets
};

if (!VERIFY_ONLY && !problems.length) {
	mkdirSync(OUT, { recursive: true });
	for (const level of LEVELS) {
		const file = `${OUT}/hsk${level}.json`;
		writeFileSync(file, await serialize(toShipped(built, level), file));
	}
}

console.log(JSON.stringify(summary, null, 2));
process.exit(problems.length ? 1 : 0);

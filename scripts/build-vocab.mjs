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
 * PINYIN IS SPELLED BY WORD, on the headword line and in the sentence under it — 汉语拼音正
 * 词法基本规则, and what Pleco prints. `displayPinyin` deletes the official list's notation
 * rather than spacing it (`bāng∥máng` is bāngmáng, not `bāng máng`), the CC-CEDICT tone digit
 * settles the neutral tone the diacritic cannot show (`[xue2 sheng5]` is xuésheng), and
 * `sentenceWordUnits` writes every example sentence in words rather than one token per
 * character — joining only spans the corpus itself ships as a card, and spelling them the way
 * that card spells them. `Example.spans` keeps the 1:1 alignment to the characters.
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
 *      Each meaning is also bound to the POS that labels it as `senses: {pos?, gloss}[]`,
 *      so a sheet can head a sense with its own chip instead of one banner over a mixed list.
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
import {
	senseKeys,
	senseKey,
	intersects,
	buttonKeys,
	qualifierOf,
	splitSenses,
	singularise
} from '../src/lib/data/senses.ts';

const OUT = 'src/lib/data';
const REF = 'reference/hsk';
const OVERRIDE_DIR = 'scripts/overrides';
const AUDIT_FILE = 'scripts/vocab-audit.json';
const SURVIVAL_ALLOW_FILE = 'scripts/gloss-survival-allow.json';
const SENTENCE_DIR = 'scripts/sentences';
const LEVELS = [1, 2, 3, 4, 5];
const OFFICIAL_SIZES = { 1: 500, 2: 772, 3: 973, 4: 1000, 5: 1071 };

const argv = new Set(process.argv.slice(2));
const VERIFY_ONLY = argv.has('--verify');
const REPORT = argv.has('--report');

/** How many problems to print. The whole list, when a triage pass needs to read it. */
const PROBLEM_LIMIT = argv.has('--all') ? Infinity : 200;

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
 *   yǒu(yì)xiē     optional syllable
 *   lǎo (Lǎo Wáng) the example that goes with a bound form
 *   bàba|bà        variant spellings
 *
 * EVERY ONE OF THOSE MARKS IS DELETED, NOT SPACED. Loop 0 turned `∥` and the optional-syllable
 * parenthetical into a space, which put a word boundary in 192 headwords that exists in no
 * source: 帮忙 printed `bāng máng`, 睡觉 `shuì jiào`, 值得 `zhí dé`, 出来 `chū lái`. `∥` marks
 * where a separable verb may be *split by something else* (帮了他的忙); it is not how the word
 * is written. The reference refutes the space on the same row — each entry carries a second,
 * already-clean `pinyin` column, and it reads bāngmáng, shuìjiào, zhíde, chūlái. Deleting
 * instead of spacing reproduces that column on all 189 `∥` rows, and 有些/有点儿/差点儿 lose the
 * optional syllable the same way the hanzi does (`displayHanzi` already drops 有（一）些 → 有些).
 *
 * The 113 spaces that remain are the official list's own — 岸上 `àn shang`, 不客气 `bú kèqì`,
 * 看起来 `kàn qǐlai` — and every one of them is in the reference's clean column too.
 */
function displayPinyin(official, fallback) {
	return (official || fallback || '')
		.split('|')[0]
		.replace(/[（(][^）)]*[）)]/g, '')
		.replace(/∥/g, '')
		.replace(/·/g, '')
		.replace(/…/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Source notation that must never reach a headword or its pinyin. */
const LEAKED = /[|｜（）()0-9¹²³…∥·[\]{}]/;
/**
 * Source notation that must never reach a gloss. Digits are fine there ("100 million"), and
 * so, since loop 4, are ASCII parentheses: they are how a card qualifies a sense it shares
 * with a level-mate — 衬衫 "shirt (dress shirt)" against 衬衣 "shirt (general word)" — instead
 * of abandoning the sense to it. Gate (e) checks they balance; the full-width pair stays
 * banned because it only ever arrives from the reference's own notation.
 */
const LEAKED_GLOSS = /[|｜（）¹²³…∥·[\]{}]/;

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

/** Anything the printed pinyin may put between two syllables, and never inside one. */
const PINYIN_SEP = /[\s'’\-·]/;

/**
 * One bracketed reading of a CC-CEDICT key, as written: `[ba4 ba5]` gives `ba`/4 and `ba`/5.
 *
 * The tone stays the RAW digit here — 5 is CC-CEDICT's neutral tone and 0 never occurs — so a
 * caller can tell "neutral" from "no tone recorded". CC-CEDICT writes ü as `u:` (and, in a few
 * entries, `v`). Returns null when the bracket does not parse.
 */
function parseReading(text) {
	const out = [];
	for (const part of text.trim().split(/\s+/).filter(Boolean)) {
		const parsed = /^([a-zA-Zü:]+)([0-5])$/.exec(part);
		if (!parsed) return null;
		out.push({
			base: parsed[1].toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü'),
			tone: Number(parsed[2])
		});
	}
	return out.length ? out : null;
}

/**
 * Split a CC-CEDICT key's bracketed pinyin into one entry per character.
 *
 * `愛|爱[ai4]` gives one syllable; `爸爸|爸爸[ba4 ba5]` gives two, the second neutral (5 comes
 * back as 0, the app's neutral tone). A key that lists two readings — `起來|起来[qi3 lai5]/起來|
 * 起来[qi5 lai5]` — is cut by the LAST one, which is the reading `alignSyllables` has always
 * used; `neutralSyllables` is the function that looks at all of them.
 * Returns null when the key has no parseable bracket, which the caller turns into a failure.
 */
function keySyllables(cedictKey) {
	const bracket = /\[([^\]]*)\]\s*$/.exec(cedictKey || '');
	if (!bracket) return null;
	const parsed = parseReading(bracket[1]);
	return parsed ? parsed.map((s) => ({ base: s.base, tone: s.tone % 5 })) : null;
}

/**
 * Which syllables of a key EVERY reading it lists writes with CC-CEDICT's neutral tone.
 *
 * This is the digit the build used to throw away. `keySyllables` parses `[xue2 sheng5]` to
 * segment 学生, and the shipped card then read its tones off the printed diacritic instead and
 * shipped `xuéshēng` — a full first tone on the syllable its own segmentation key calls
 * neutral. 42 cards did that (学生, 太阳, 关系, 值得, 小姐, 位置, 合同 …), 29 of them dotted
 * `xué·shēng` in the official list as well, so the card contradicted both authorities at once —
 * and `speak()` says the neutral form, so one card said two things.
 *
 * Two guards, because the digit is evidence and not a licence:
 *   - EVERY reading in the key has to agree. 起来 is `[qi3 lai5]/[qi5 lai5]`; 起 is neutral in
 *     one reading and third tone in the other, so only 来 is demoted and the card stays `qǐlai`.
 *   - The first syllable of a word is never demoted. A neutral syllable is an unstressed one,
 *     which is a thing a syllable can only be relative to the syllable in front of it — so the
 *     caller applies the same rule after a printed space (看上去 stays `kàn shàngqu`, never
 *     `kàn shangqu`, which would leave a written word with no stress in it at all).
 *
 * Demotion only, never promotion: the standard prints 27 cards neutral where CC-CEDICT gives a
 * full tone (岸上 `àn shang`, 学问 `xuéwen`), and those stay as the standard prints them.
 */
function neutralSyllables(cedictKey, count) {
	const out = new Array(count).fill(false);
	const readings = [];
	for (const bracket of String(cedictKey || '').matchAll(/\[([^\]]*)\]/g)) {
		const parsed = parseReading(bracket[1]);
		if (parsed && parsed.length === count) readings.push(parsed);
	}
	if (!readings.length) return out;
	for (let i = 1; i < count; i += 1) out[i] = readings.every((r) => r[i].tone === 5);
	return out;
}

/**
 * Cut the official pinyin into the syllables the CC-CEDICT key says are there, keeping the
 * text the source writes between them.
 *
 * The key supplies the boundaries — it is the only field in the corpus that segments an
 * unspaced compound like `xuéshēng` reliably — and the official string supplies the letters,
 * so the syllables always spell the pinyin the standard prints. `seps[i]` is whatever sits in
 * front of syllable `i` and `seps[length]` whatever trails the last, which is what lets the
 * caller rewrite a syllable (see `neutralSyllables`) and put the string back together with the
 * spaces, apostrophes and hyphens the official list wrote — `kàn qǐlai`, `Xī'ān`, `wǔyán-liùsè`.
 *
 * The tone is read off the printed diacritic, not the key's digit: the standard applies tone
 * sandhi to 不 and 一 (`bú kèqì`, `yìqǐ`), and `py` and `tone` render together so they must
 * never disagree. The one place the digit wins is a syllable the key marks neutral, which is
 * applied to `py` and `tone` together, above.
 *
 * Returns null when the two do not describe the same string of letters — three rows corpus
 * wide, all of which are in HAND_SYLLABLES.
 */
function alignSyllables(pinyin, cedictKey) {
	const key = keySyllables(cedictKey);
	if (!key) return null;
	const chars = [...pinyin];
	const out = [];
	const seps = [];
	let at = 0;
	let sep = '';
	for (const syllable of key) {
		while (at < chars.length && PINYIN_SEP.test(chars[at])) sep += chars[at++];
		const chunk = chars.slice(at, at + syllable.base.length).join('');
		if (stripTone(chunk.toLowerCase()) !== syllable.base) return null;
		at += syllable.base.length;
		seps.push(sep);
		sep = '';
		out.push({ py: chunk, tone: toneOfMarked(chunk) });
	}
	while (at < chars.length && PINYIN_SEP.test(chars[at])) sep += chars[at++];
	seps.push(sep);
	return at === chars.length ? { syllables: out, seps } : null;
}

/** A cut reading, put back together: the syllables with the source's own text between them. */
function joinSyllables(syllables, seps) {
	return syllables.map((s, i) => `${seps[i]}${s.py}`).join('') + seps[syllables.length];
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

/**
 * The reading one row ships: the printed pinyin and its syllables, settled together.
 *
 * They are one decision, not two. The syllables have to spell the printed string — the card,
 * the search index and the tone colours all read the pair — so the only way to correct a tone
 * is to correct the letters with it, and the only place that can happen is here.
 *
 * Returns `{ pinyin, syllables }`, or throws. There is no silent fallback on purpose.
 */
function reading(row, hanzi) {
	const printed = displayPinyin(row.officialPinyin, row.pinyin);
	const characters = [...hanzi];
	const hand = HAND_SYLLABLES[row.id];
	if (hand) {
		if (hand.length !== characters.length) {
			throw new Error(
				`${row.id} ${hanzi}: HAND_SYLLABLES has ${hand.length} syllables for ${characters.length} characters`
			);
		}
		return { pinyin: printed, syllables: hand.map(([py, tone]) => ({ py, tone })) };
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
	const aligned = alignSyllables(printed, row.cedictKey);
	if (!aligned) {
		throw new Error(
			`${row.id} ${hanzi}: official pinyin "${printed}" does not align with "${row.cedictKey}" — add it to HAND_SYLLABLES`
		);
	}
	const neutral = neutralSyllables(row.cedictKey, characters.length);
	const syllables = aligned.syllables.map((s, i) =>
		neutral[i] && s.tone !== 0 && !/\s/.test(aligned.seps[i]) ? { py: stripTone(s.py), tone: 0 } : s
	);
	return { pinyin: joinSyllables(syllables, aligned.seps), syllables };
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

/* ---------------------------------------------------------- sense binding */

/**
 * Bind each gloss to the part of speech that labels it.
 *
 * Official POS is a card-level list and `meanings` is the quiz-facing list; neither says
 * which label belongs to which gloss, which is how a row printed "ADJ. to shock". `senses`
 * is that pairing, in display order. `pos` contains only codes that label a shipped gloss
 * (for distractors), ordered so `pos[0]` belongs to `meanings[0]`.
 * Cards the official list gives no POS for stay chip-less: each sense is `{gloss}` only.
 *
 * An official code with no gloss under it is filled from CC-CEDICT when a short, strong
 * match exists. Otherwise it stays in the reference row until an authored `senses`
 * override supplies a gloss; shipping the unsupported code would mislabel the card.
 * The 386 untagged cards are not invented a chip.
 */
const MEASURE_GLOSS = /\bmeasure word\b|\bclassifier\b/i;
const UNIT_MEASURE = /\b(o['']clock|yuan|cents?|pages?)\b/i;
const PREFIX_GLOSS = /\bprefix\b|lunar month date|before a surname/i;
const SUFFIX_GLOSS = /\bsuffix\b/i;
const PARTICLE_GLOSS = /\b(particle|marker)\b/i;
const MODAL_GLOSS = /^(?:should|ought|must|may|might|can|will|shall|would|could|need)\b/i;
const ADJ_TAIL = /\b(?:ed|ous|ful|less|able|ible|al|ic|ive|ant|ent|ary|ing|y|like)$/i;

function glossFitsPos(text, code) {
	const t = unqualified(text);
	const isTo = /^to\b/i.test(t);
	const isMW = MEASURE_GLOSS.test(text);
	const isUnit = UNIT_MEASURE.test(t);
	const head =
		t
			.toLowerCase()
			.split(/[\s-]+/)
			.filter(Boolean)
			.pop() || '';
	switch (code) {
		case 'M':
			return isMW ? 10 : isUnit ? 8 : -6;
		case 'V':
			if (isTo) return 8;
			if (MODAL_GLOSS.test(t)) return 6;
			if (isMW) return -8;
			return -1;
		case 'N':
			if (isTo || isMW) return -5;
			if (/^(a|an|the)\s/i.test(t)) return 6;
			if (isBareNounGloss(t) || isNounWordGloss(t)) return 5;
			return 1;
		case 'Adj':
			if (isTo || isMW || isUnit) return -5;
			if (isAdverbGloss(t)) return -2;
			if (ADJ_TAIL.test(head)) return 4;
			return 2;
		case 'Adv':
			if (isTo || isMW) return -5;
			if (isAdverbGloss(t)) return 8;
			if (/^(as if|maybe|still|together|almost|entirely)\b/i.test(t)) return 5;
			return 1;
		case 'Prep':
			if (isTo) return -2;
			if (/^(than|from|with|to|at|in|for|by|as|on behalf of|according to|away from)\b/i.test(t))
				return 6;
			return 1;
		case 'Conj':
			if (isTo) return -2;
			if (/^(and|or|but|because|if|so that|even though)\b/i.test(t)) return 6;
			return 1;
		case 'Pron':
			if (isTo || isMW) return -4;
			return 2;
		case 'Num':
			if (isTo || isMW) return -4;
			return 2;
		case 'Aux':
			if (PARTICLE_GLOSS.test(t)) return 8;
			if (isTo) return -3;
			return 1;
		case 'Prefix':
			if (PREFIX_GLOSS.test(t)) return 10;
			return isTo ? -3 : 1;
		case 'Suffix':
			if (SUFFIX_GLOSS.test(t)) return 10;
			return isTo ? -3 : 1;
		case 'Intj':
		case 'Phonetic':
			return isTo || isMW ? -3 : 2;
		default:
			return 0;
	}
}

/** The POS a critic-style detector would read off a gloss, or null when it is ambiguous. */
function clearGlossKind(text) {
	if (MEASURE_GLOSS.test(text)) return 'M';
	if (/^to\b/i.test(unqualified(text))) return 'V';
	return null;
}

function uniquePos(senses) {
	const out = [];
	for (const sense of senses) {
		if (sense.pos && !out.includes(sense.pos)) out.push(sense.pos);
	}
	return out;
}

function assignSensePos(meanings, advertised) {
	if (!advertised.length) return meanings.map((gloss) => ({ gloss }));
	if (advertised.length === 1) {
		return meanings.map((gloss) => ({ pos: advertised[0], gloss }));
	}
	const used = new Set();
	return meanings.map((gloss) => {
		const ranked = advertised
			.map((code) => ({
				code,
				score:
					glossFitsPos(gloss, code) + (!used.has(code) && glossFitsPos(gloss, code) >= 0 ? 0.4 : 0)
			}))
			.sort((a, b) => b.score - a.score || advertised.indexOf(a.code) - advertised.indexOf(b.code));
		const pick = ranked[0].code;
		used.add(pick);
		return { pos: pick, gloss };
	});
}

/** A short CC-CEDICT sense that clearly wears `code` and is not already on the card. */
function cedictGlossForPos(defs, code, existing) {
	const notes = new Set();
	const candidates = [];
	for (const raw of defs || []) {
		for (const alt of senseAlternatives(raw, notes)) {
			if (!alt.text || alt.text.length > MAX_LEN) continue;
			if (
				existing.some((g) => overlaps(g, alt.text) || g.toLowerCase() === alt.text.toLowerCase())
			) {
				continue;
			}
			const score = glossFitsPos(alt.text, code);
			if (score >= 6) candidates.push({ text: alt.text, score });
		}
	}
	candidates.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
	return candidates[0]?.text;
}

function bindCardSenses(entry) {
	const advertised = [...entry.pos];
	if (entry.authoredSenses?.length) {
		entry.senses = entry.authoredSenses.map((s) =>
			s.pos ? { pos: s.pos, gloss: s.gloss } : { gloss: s.gloss }
		);
		entry.meanings = entry.senses.map((s) => s.gloss);
		entry.pos = advertised.length ? uniquePos(entry.senses) : [];
		return;
	}

	let senses = assignSensePos(entry.meanings, advertised);
	if (advertised.length) {
		const have = new Set(senses.map((s) => s.pos).filter(Boolean));
		for (const code of advertised) {
			if (have.has(code) || senses.length >= 3) continue;
			const extra = cedictGlossForPos(
				entry.defs,
				code,
				senses.map((s) => s.gloss)
			);
			if (!extra) continue;
			senses.push({ pos: code, gloss: extra });
			have.add(code);
		}
	}
	entry.senses = senses;
	entry.meanings = senses.map((s) => s.gloss);
	entry.pos = advertised.length ? uniquePos(senses) : [];
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
			const rawSenses = value && value.senses;
			const meanings = value && value.meanings;
			if (rawSenses !== undefined) {
				if (!Array.isArray(rawSenses) || !rawSenses.length) {
					throw new Error(`${path}: ${id} "senses" must be a non-empty array of {pos, gloss}`);
				}
				const senses = [];
				for (const sense of rawSenses) {
					const gloss = sense && typeof sense.gloss === 'string' ? sense.gloss.trim() : '';
					if (!gloss) {
						throw new Error(`${path}: ${id} each sense needs a non-empty "gloss"`);
					}
					if (sense.pos !== undefined && (typeof sense.pos !== 'string' || !sense.pos.trim())) {
						throw new Error(`${path}: ${id} sense pos must be a non-empty string when present`);
					}
					senses.push(sense.pos ? { pos: sense.pos.trim(), gloss } : { gloss });
				}
				const fromSenses = senses.map((s) => s.gloss);
				if (
					meanings !== undefined &&
					(!Array.isArray(meanings) ||
						meanings.map((m) => String(m).trim()).join('\0') !== fromSenses.join('\0'))
				) {
					throw new Error(`${path}: ${id} "meanings" must list the same glosses as "senses"`);
				}
				if (!value.note || !String(value.note).trim()) {
					throw new Error(
						`${path}: ${id} needs a "note" saying why this gloss and not CC-CEDICT's`
					);
				}
				owner.set(id, name);
				byId.set(id, {
					meanings: fromSenses,
					senses,
					note: String(value.note).trim()
				});
				continue;
			}
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

/**
 * Reviewed exemptions to gate (f), read from scripts/gloss-survival-allow.json.
 *
 * The gate asks whether a card still says what the reference says the word means. Most of
 * what it catches is a synonym a learner would accept — 美丽 "lovely" for "beautiful", 逐渐
 * "little by little" for "gradually" — and the point of the gate is not to ban those but to
 * isolate the handful that are not synonyms at all. Each exemption is one line saying which
 * it is, and an exemption whose card no longer needs it fails the build, so the list cannot
 * quietly turn back into a blanket.
 *
 *   { "L1-0123": "\"lovely\" is CC-CEDICT's \"beautiful\"; both answer the same prompt." }
 */
function readSurvivalAllow() {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(SURVIVAL_ALLOW_FILE, 'utf8'));
	} catch (err) {
		if (err.code === 'ENOENT') return new Map();
		throw new Error(`${SURVIVAL_ALLOW_FILE}: not valid JSON — ${err.message}`, { cause: err });
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${SURVIVAL_ALLOW_FILE}: expected an object keyed by official row id`);
	}
	const out = new Map();
	for (const [id, note] of Object.entries(parsed)) {
		if (!/^L[1-5]-\d{4}$/.test(id)) {
			throw new Error(`${SURVIVAL_ALLOW_FILE}: "${id}" is not an official row id`);
		}
		if (typeof note !== 'string' || !note.trim()) {
			throw new Error(
				`${SURVIVAL_ALLOW_FILE}: ${id} needs a one-line reason the rewrite is a synonym`
			);
		}
		out.set(id, note.trim());
	}
	return out;
}

/* ------------------------------------------------------------- sentences */

/** Every character class an example sentence may print: Han, plus four full-width marks. */
const SENTENCE_PUNCT = /[，。！？]/;
const SENTENCE_HAN = /[㐀-鿿豈-﫿]/;

/** The characters of a sentence that a learner reads aloud — punctuation is not one. */
function sentenceChars(hanzi) {
	return [...String(hanzi)].filter((c) => !SENTENCE_PUNCT.test(c));
}

/**
 * A sentence's pinyin, one whitespace-separated token per character.
 *
 * Authors split roughly two to one on whether to carry the hanzi's punctuation across into
 * the pinyin, and the word-level `pinyin` field never carries any, so the build settles it
 * the same way `displayPinyin` settles the notation on a headword: strip it. What is left is
 * countable against `sentenceChars` with no special cases.
 *
 * Erhua is one token per character HERE, `wán r` and not `wánr`, because that is what the
 * card's own `syllables` array already says 玩儿 is — 28 of the 29 authored erhua sentences
 * were written that way and the twenty-ninth is now too. What SHIPS is the word-unit reading
 * `sentenceWordUnits` builds out of this one, where 玩儿 is `wánr`.
 */
function sentencePinyin(pinyin) {
	return String(pinyin)
		.replace(/[.,!?;:]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const pinyinSyllables = (pinyin) => (pinyin ? sentencePinyin(pinyin).split(' ') : []);

/* ------------------------------------------------------ sentence word units */

/**
 * PINYIN IS WRITTEN IN WORDS, AND A SENTENCE IS NOT AN EXCEPTION.
 *
 * 汉语拼音正词法基本规则 sets pinyin by word: Pleco prints "Wǒ zài wùlǐxué fāngmiàn de zhīshi,
 * jīhū děngyú líng." and Du Chinese sets its ruby the same way. This app printed
 * "Qǐng dà jiā bǎo chí ān jìng." — one token per character, on all 4,308 sentences and all
 * 42,112 of their syllables, with the headword the sheet underlines split down the middle.
 *
 * The authored field stays one token per character, because that is the alignment the sheet
 * needs and the only thing 82 authors could be asked to get right. The build is what turns it
 * into words, and it does that by asking the corpus rather than by guessing:
 *
 *   - A span of characters may be joined only when THE CORPUS ITSELF ships it as one card.
 *     No dictionary of "common words", no statistics, no heuristics about particles.
 *   - And only when the sentence's own reading of that span spells the card's, letter for
 *     letter, once the tone marks are off. That is what keeps 睡着 `shuì zhe` (the aspect
 *     marker) from being joined into the card 睡着 `shuìzháo`, and 长 zhǎng out of 长期.
 *   - A join then prints THE CARD'S OWN STRING, so the sentence and the headword above it
 *     spell the word identically — 中国 was `Zhōngguó` on its card and `zhōng guó` in all 40
 *     sentences that used it, 汉语 `Hànyǔ` against `hàn yǔ` 28 times, 关上 `guānshang` against
 *     `guān shàng`. Nothing gated that before; the join is the gate.
 *   - Except that a card may not ADD a tone the sentence writes as neutral. An author writing
 *     `zhè ge rén` is saying 个 is unstressed there, so the card 个人 `gèrén` is not the word
 *     they wrote and 这个人 stays three tokens. This is what stops the segmenter turning
 *     一个人 into `yí gèrén`.
 *
 * The 1:1 syllable-to-character alignment is NOT lost — `Example.spans` carries it, one entry
 * per printed token saying how many characters that token covers. Every token is wholly inside
 * the headword or wholly outside it, so the sheet's underline still lands exactly on the word.
 */

/** Which characters of `chars` fall inside any occurrence of `target`. */
function headwordMarks(chars, target) {
	const marks = new Array(chars.length).fill(false);
	if (!target.length || target.length > chars.length) return marks;
	for (let i = 0; i + target.length <= chars.length; i += 1) {
		if (target.some((c, k) => chars[i + k] !== c)) continue;
		for (let k = 0; k < target.length; k += 1) marks[i + k] = true;
	}
	return marks;
}

/**
 * One card's printed reading, cut into the tokens it actually prints.
 *
 * `pinyin` is not always one token — 岸上 is `àn shang`, 中秋节 is `Zhōngqiū Jié`, 看起来 is
 * `kàn qǐlai` — so a word contributes as many tokens as the official list gives it, and each
 * one carries the number of characters it covers. Apostrophes and hyphens are inside a token
 * (`Xī'ān`, `wǔyán-liùsè`); only whitespace starts a new one.
 */
function readingTokens(pinyin, syllables) {
	const tokens = [];
	let at = 0;
	for (const syllable of syllables) {
		const found = pinyin.indexOf(syllable.py, at);
		if (found < 0) return null;
		const gap = pinyin.slice(at, found);
		at = found + syllable.py.length;
		const last = tokens[tokens.length - 1];
		if (!last || /\s/.test(gap)) tokens.push({ text: syllable.py, chars: 1 });
		else {
			last.text += gap + syllable.py;
			last.chars += 1;
		}
	}
	return at === pinyin.length && tokens.length ? tokens : null;
}

/** Letters alone: tone marks off, case folded. Two readings of one word share these exactly. */
const bareLetters = (text) => stripTone(text.toLowerCase());

/**
 * The card a span of a sentence is spelling, or null when the corpus cannot say it is one.
 *
 * Exact first — a card whose syllables are the sentence's syllables, mark for mark, is the
 * word beyond argument, and it is how 编辑 biānjí (the noun) and 编辑 biānji (the verb) are
 * told apart. Then the readings that differ only in ways the CARD is the authority on: case
 * (`zhōng` → `Zhōng`) and a syllable the card writes neutral (`shàng` → `shang`).
 */
function matchCard(cards, sentence) {
	for (const card of cards) {
		if (card.syllables.every((s, i) => s.py === sentence[i])) return card;
	}
	for (const card of cards) {
		const fits = card.syllables.every((s, i) => {
			if (s.py === sentence[i]) return true;
			if (bareLetters(s.py) !== bareLetters(sentence[i])) return false;
			return !(toneOfMarked(sentence[i]) === 0 && s.tone !== 0);
		});
		if (fits) return card;
	}
	return null;
}

/** The longest span the corpus recognises as one word: 四字成语 are four characters. */
const MAX_WORD = 4;

/** What one HSK level of rarity is worth. Small enough that it only ever breaks a tie. */
const LEVEL_COST = 0.01;

/**
 * Cut one clause into words, cheapest reading first.
 *
 * Fewest words wins; a character the corpus does not ship as a word of its own costs extra,
 * which is what makes 不同意 come out 不 + 同意 rather than 不同 + 意; and between two readings
 * of the same length the one built from lower-HSK words wins, because the levels ARE a
 * frequency order — that is what makes 很多年轻观众 come out 多 + 年轻 (L1 + L2) rather than
 * 多年 + 轻 (L5 + L3). Ties after all that go to the longer word at the earlier position, which
 * is what makes 晚上去 come out 晚上 + 去 rather than 晚 + 上去.
 */
function cutClause(chars, sentence, marks, lo, hi, lexicon, singles) {
	const best = new Array(hi - lo + 1).fill(null);
	best[hi - lo] = { cost: 0, groups: [] };
	for (let i = hi - lo - 1; i >= 0; i -= 1) {
		const at = lo + i;
		let pick = null;
		for (let len = Math.min(MAX_WORD, hi - at); len >= 1; len -= 1) {
			const rest = best[i + len];
			if (!rest) continue;
			let cost;
			let card = null;
			if (len === 1) {
				const level = singles.get(chars[at]);
				cost = (level === undefined ? 1.4 : 1) + LEVEL_COST * (level ?? LEVELS.length);
			} else {
				// A word may never straddle the headword's edge: the sheet underlines the
				// headword inside the sentence, and a token half in and half out cannot be drawn.
				let uniform = true;
				for (let k = 1; k < len; k += 1) if (marks[at + k] !== marks[at]) uniform = false;
				if (!uniform) continue;
				const cards = lexicon.get(chars.slice(at, at + len).join(''));
				if (!cards) continue;
				card = matchCard(cards, sentence.slice(at, at + len));
				if (!card) continue;
				cost = 1 + LEVEL_COST * card.level;
			}
			const total = cost + rest.cost;
			if (pick === null || total < pick.cost) {
				pick = { cost: total, groups: [{ len, card }, ...rest.groups] };
			}
		}
		best[i] = pick;
	}
	return best[0]?.groups ?? null;
}

/**
 * One authored sentence, rewritten in words: `{ pinyin, spans }`, or null when its pinyin and
 * its characters do not line up 1:1 (gate (g) is what reports that).
 *
 * Clauses are cut separately, because a comma is a word boundary the corpus cannot see:
 * 很好，看 would otherwise join 好看 across it.
 */
function sentenceWordUnits(example, headword, lexicon, singles) {
	const chars = [];
	const clauses = new Set([0]);
	for (const c of [...String(example.hanzi)]) {
		if (SENTENCE_HAN.test(c)) chars.push(c);
		else clauses.add(chars.length);
	}
	const sentence = pinyinSyllables(example.pinyin);
	if (!chars.length || sentence.length !== chars.length) return null;
	clauses.add(chars.length);

	const marks = headwordMarks(chars, [...headword]);
	const edges = [...clauses].filter((n) => n <= chars.length).sort((a, b) => a - b);
	const groups = [];
	for (let n = 0; n < edges.length - 1; n += 1) {
		if (edges[n] === edges[n + 1]) continue;
		const cut = cutClause(chars, sentence, marks, edges[n], edges[n + 1], lexicon, singles);
		if (!cut) return null;
		groups.push(...cut);
	}

	const tokens = [];
	let at = 0;
	for (const group of groups) {
		if (group.card) {
			for (const token of group.card.tokens) tokens.push({ ...token });
		} else {
			for (let k = 0; k < group.len; k += 1) tokens.push({ text: sentence[at + k], chars: 1 });
		}
		at += group.len;
	}

	// Erhua is a retroflex ending, not a syllable: 那儿 is `nàr`, never `nà r`. The card's own
	// syllables say so (`[nà, r]`) and `<Pinyin>` reads it off exactly this shape, so a bare `r`
	// that a word did not already absorb joins the token in front of it — the one place a token
	// may cover both sides of the headword's edge, which is the rule the sheet already follows.
	const joined = [];
	for (const token of tokens) {
		const last = joined[joined.length - 1];
		if (token.text === 'r' && last) {
			last.text += 'r';
			last.chars += 1;
		} else joined.push(token);
	}

	return { pinyin: joined.map((t) => t.text).join(' '), spans: joined.map((t) => t.chars) };
}

/**
 * Every card the segmenter may join a span into: the multi-character words by their hanzi, and
 * the levels of the single characters, which are what tells 多 (HSK 1) from 轻 (HSK 3).
 */
function wordLexicon(entries) {
	const lexicon = new Map();
	const singles = new Map();
	for (const e of entries) {
		const characters = [...e.hanzi];
		if (characters.length < 2) {
			singles.set(e.hanzi, Math.min(e.level, singles.get(e.hanzi) ?? e.level));
			continue;
		}
		const tokens = readingTokens(e.pinyin, e.syllables);
		if (!tokens) {
			throw new Error(`${e.id} ${e.hanzi}: syllables do not spell "${e.pinyin}" token for token`);
		}
		const list = lexicon.get(e.hanzi) ?? [];
		list.push({ id: e.id, level: e.level, syllables: e.syllables, tokens });
		lexicon.set(e.hanzi, list);
	}
	return { lexicon, singles };
}

/**
 * Hand-authored example sentences, read from every .json file in scripts/sentences/.
 *
 * One file per author, keyed by card id, shape:
 *
 *   { "L1-0001": { "hanzi": "我爱我的爸爸妈妈。", "pinyin": "wǒ ài …", "english": "I love …" } }
 *
 * Read order carries no meaning — 82 files, authored in parallel — so, exactly as with
 * scripts/overrides/, the merge is order-independent and one id appearing in two files is a
 * build failure rather than a last-writer-wins. `example` stays optional on `Word` even now
 * that all five levels are covered: a card with no sentence ships without the field rather
 * than with an empty one, and nothing in the app may assume the field is there.
 */
function readSentences() {
	let files;
	try {
		files = readdirSync(SENTENCE_DIR)
			.filter((name) => name.endsWith('.json'))
			.sort();
	} catch {
		return { byId: new Map(), files: [] };
	}
	const byId = new Map();
	const owner = new Map();
	for (const name of files) {
		const path = join(SENTENCE_DIR, name);
		let parsed;
		try {
			parsed = JSON.parse(readFileSync(path, 'utf8'));
		} catch (err) {
			throw new Error(`${path}: not valid JSON — ${err.message}`, { cause: err });
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(`${path}: expected an object keyed by card id`);
		}
		for (const [id, value] of Object.entries(parsed)) {
			if (!/^L[1-5]-\d{4}$/.test(id)) {
				throw new Error(`${path}: "${id}" is not a card id`);
			}
			if (owner.has(id)) {
				throw new Error(
					`${id} has an example in two files: ${owner.get(id)} and ${name} — one id, one sentence`
				);
			}
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				throw new Error(`${path}: ${id} must be an object with hanzi, pinyin and english`);
			}
			const extra = Object.keys(value).filter((k) => !['hanzi', 'pinyin', 'english'].includes(k));
			if (extra.length) {
				throw new Error(`${path}: ${id} has unexpected field(s) ${extra.join(', ')}`);
			}
			owner.set(id, name);
			byId.set(id, {
				hanzi: String(value.hanzi ?? '').trim(),
				pinyin: sentencePinyin(value.pinyin ?? ''),
				english: String(value.english ?? '').trim(),
				file: name
			});
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

function build(official, overrides, sentences) {
	const entries = official.map((r) => {
		const hanzi = displayHanzi(r.simplified);
		const { pinyin, syllables } = reading(r, hanzi);
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
			syllables,
			meanings: override ? override.meanings : picked.meanings,
			pos,
			level: r.level,
			// Diagnostics. Never shipped — toShipped() drops them.
			authored: Boolean(override),
			authoredSenses: override?.senses,
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
			prev.authoredSenses = e.authoredSenses;
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
		// Unioned meanings no longer match a single row's authored pairing.
		if (
			prev.authoredSenses &&
			prev.authoredSenses.map((s) => s.gloss).join('\0') !== prev.meanings.join('\0')
		) {
			prev.authoredSenses = undefined;
		}
	}

	const entriesOut = [...byKey.values()];

	// Example sentences are attached after the merge, because they are keyed on the card a
	// learner sees, not on an official row: 老1 and 老2 are one card and get one sentence.
	// An id with no card is not silently ignored — gate (g) reports it.
	// …and the pinyin is written in words here, not by the author: the lexicon it is segmented
	// against is these cards, so it cannot exist until they do. See `sentenceWordUnits`.
	const { lexicon, singles } = wordLexicon(entriesOut);
	for (const e of entriesOut) {
		const example = sentences?.get(e.id);
		if (!example) continue;
		const units = sentenceWordUnits(example, e.hanzi, lexicon, singles);
		e.example = {
			hanzi: example.hanzi,
			// The authored string, untouched, when it does not line up 1:1 with the characters —
			// so gate (g) reports that rather than this function papering over it.
			pinyin: units ? units.pinyin : example.pinyin,
			...(units ? { spans: units.spans } : {}),
			english: example.english
		};
	}

	for (const e of entriesOut) bindCardSenses(e);

	return entriesOut;
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
const senseSetKey = (word) => senseKey(buttonKeys(word.meanings));

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
 * Words ending in -ly that are not adverbs. Every one of these is a legitimate lead on an
 * adjective or a noun card, so the adverb test below has to know them by name.
 */
const NOT_ADVERB = new Set([
	'early',
	'only',
	'ugly',
	'silly',
	'lovely',
	'lonely',
	'friendly',
	'likely',
	'lively',
	'timely',
	'costly',
	'deadly',
	'orderly',
	'elderly',
	'curly',
	'burly',
	'jolly',
	'holy',
	'daily',
	'weekly',
	'monthly',
	'yearly',
	'hourly',
	'nightly',
	'quarterly',
	'leisurely',
	'smelly',
	'chilly',
	'hilly',
	'oily',
	'homely',
	'manly',
	'worldly',
	'kindly',
	'stately',
	'saintly',
	'sickly',
	'portly',
	'scholarly',
	'brotherly',
	'motherly',
	'fatherly',
	'sisterly',
	'cowardly',
	'miserly',
	'unruly',
	'surly',
	'wobbly',
	'prickly',
	'ghastly',
	'godly',
	'comely',
	'seemly',
	'family',
	'ally',
	'belly',
	'jelly',
	'rally',
	'tally',
	'bully',
	'folly',
	'fly',
	'butterfly',
	'dragonfly',
	'supply',
	'reply',
	'apply',
	'assembly',
	'monopoly',
	'anomaly',
	'melancholy',
	'italy',
	'july'
]);

/** A gloss that is one -ly adverb and nothing else: "recently", "generally", "frequently". */
function isAdverbGloss(text) {
	const words = String(text)
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	if (words.length !== 1) return false;
	return /ly$/.test(words[0]) && !NOT_ADVERB.has(words[0]);
}

/**
 * A gloss that is one unmistakable noun: "darkness", "longevity", "humor".
 *
 * Stricter than `isBareNounGloss`, which an adjective card trips constantly — "the same"
 * opens with an article, "outstanding" and "charming" end in -ing, "of fine quality" is a
 * phrase. Only a single word whose own suffix makes it a noun counts here.
 */
function isNounWordGloss(text) {
	const words = String(text)
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	if (words.length !== 1) return false;
	return NOUN_SUFFIX.test(words[0]) && !/ing$/.test(words[0]);
}

/** A gloss that names an action: the corpus writes every verb sense as "to …". */
const VERB_GLOSS = /^to\b/i;

/** A gloss with its qualifier dropped, the way gate (d) reads one. */
const unqualified = (text) =>
	String(text || '')
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * True when a card declares V in company that leaves it no excuse for having no verb gloss.
 *
 * V alongside N or M only. `[Adj,V]` is a Chinese stative verb, `[V,Prep]` a coverb, `[V,Adv]`
 * a formulaic phrase — none of the three has a natural "to …" reading in English, so this
 * would be measuring the gloss language, not the card.
 */
const verbNeedsVerbSense = (word) =>
	word.pos.length > 1 &&
	word.pos.includes('V') &&
	word.pos.every((code) => code === 'V' || code === 'N' || code === 'M');

/**
 * The gloss as the part-of-speech gate reads it: qualifier dropped.
 *
 * A qualifier describes the sense, it does not lead it — 该 "should (it is one's turn)" is a
 * modal gloss whose tag happens to open with a verb — so every test below runs on the part a
 * learner reads first.
 */
function leadOf(word) {
	return String(word.meanings[0] || '')
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * True when a gloss's parentheses are usable as a qualifier: balanced, never nested, never
 * empty, and never the whole gloss. `shirt (general word)` yes; `(general word)` no.
 */
function qualifierIsWellFormed(text) {
	let depth = 0;
	for (const c of String(text)) {
		if (c === '(') {
			depth++;
			if (depth > 1) return false;
		} else if (c === ')') {
			depth--;
			if (depth < 0) return false;
		}
	}
	if (depth !== 0) return false;
	if (!/\(/.test(text)) return true;
	if (/\(\s*\)/.test(text)) return false;
	return Boolean(
		String(text)
			.replace(/\([^)]*\)/g, ' ')
			.trim()
	);
}

/* -------------------------------------------------------- gloss survival */

/**
 * Words that carry no sense of their own, so they neither count toward a sense's length nor
 * have to survive on the card. Glue only: 那 means "that" and 一 means "one", so the
 * demonstratives and the numeral stay in, or the gate would have nothing to hold them to.
 */
const CORE_STOP = new Set([
	'to',
	'a',
	'an',
	'the',
	'of',
	'for',
	'in',
	'on',
	'at',
	'with',
	'by',
	'and',
	'or',
	'as',
	'from',
	'into',
	'be',
	'is',
	'sb',
	'sth'
]);

/**
 * A reference clause too entangled to hold the card to: a bracketed pinyin, a hanzi
 * cross-reference, a list comma, or a `sth`/`sb` placeholder is a dictionary construction
 * rather than a word a learner would answer with.
 *
 * Parentheses are handled separately, by `unscoped` below.
 */
const CORE_SKIP = /[[\]㐀-鿿,]|\b(?:sth|sb|s\.o\.|someone|something|oneself|one's|etc)\b/i;

/**
 * A clause with its scope marker taken off, or `null` if what is left is still hedged.
 *
 * The rule is "no parenthetical", and the reason is that a hedged sense is not a naming the
 * card can be held to. But CC-CEDICT writes its plainest namings hedged — `(of sth) to move`,
 * `to introduce (sb to sb)`, `to take a taxi (in China)` — and dropping those wholesale
 * leaves 动 obliged to say "to displace" and 打车 obliged to say "to hitch a lift", which
 * inverts the gate. One marker at either end comes off; anything else, or a marker in the
 * middle of the sense, still disqualifies the clause.
 */
function unscoped(clause) {
	const bare = String(clause)
		.replace(/^\s*\([^()]*\)\s*/, ' ')
		.replace(/\s*\([^()]*\)\s*$/, ' ')
		.trim();
	return /[()]/.test(bare) ? null : bare;
}

/** Grammar labels. True of the word, but never the English a learner answers with. */
const CORE_PLUMBING =
	/\b(?:particle|classifier|measure word|prefix|suffix|marker|abbr|surname|onom|interjection|used\b)/i;

/**
 * The reference senses a card is not allowed to lose: each one's wording, mapped to the words
 * that carry it.
 *
 * Short and unambiguous only — at most two content words, no parenthetical, no placeholder —
 * because those are the senses where CC-CEDICT is simply naming the word in English and no
 * amount of level-appropriate judgement makes the naming wrong. 听见's whole entry is
 * `["to hear"]`; whatever else the card says, it has to still say "hear".
 */
function coreSenses(defs, pinyin, pos) {
	const rom = romanization(pinyin || '');
	const out = new Map();
	for (const raw of defs ?? []) {
		const original = String(raw || '').trim();
		if (!original || DROP_SENSE.some((re) => re.test(original))) continue;
		const graded = original.replace(LIT_AND_FIG, ' ');
		if (EXCLUDE_LEADING.test(graded)) continue;
		for (const hedged of topLevelClauses(graded)) {
			if (EXCLUDE_CLAUSE.test(hedged) || EXCLUDE_REGIONAL.test(hedged)) continue;
			const clause = unscoped(hedged);
			if (clause === null) continue;
			if (CORE_SKIP.test(clause) || CORE_PLUMBING.test(clause)) continue;
			if (DROP_SENSE.some((re) => re.test(clause.trim()))) continue;
			const text = tidy(stripSense(clause));
			if (!text || FORBIDDEN_GLOSS.test(text)) continue;
			// Gate (c) forbids a card glossing itself with its own pinyin, so gate (f) must
			// not demand it: CC-CEDICT names 包子 "baozi" and the card may not repeat it.
			if (rom && asLetters(text) === rom) continue;
			if (!coreFitsPos(text, pos)) continue;
			const content = contentWords(text);
			if (!content.size || content.size > 2) continue;
			if (!out.has(text)) out.set(text, content);
		}
	}
	return out;
}

/** English glosses a verb card leads with that carry no `to`: the modals. */
const MODAL = /^(?:should|ought|must|may|might|can|will|shall|would|could|need)\b/i;

/**
 * Whether a reference sense is one *this* card could carry, given its official part of speech.
 *
 * 花 is listed at L2 as a verb and CC-CEDICT names the noun ("flower", "blossom"); 杯 is
 * listed as a measure word and CC-CEDICT names the cup. Holding those cards to a sense their
 * own part of speech rules out is gate (d) run backwards, so the sense is not an obligation.
 */
function coreFitsPos(text, pos) {
	if (!pos.length) return true;
	// A classifier reading is written "classifier for X" — filtered out as plumbing — so
	// everything CC-CEDICT has left to say about a measure word belongs to another reading.
	if (pos.includes('M')) return false;
	const isTo = /^to\b/i.test(text);
	if (pos.every((p) => NOMINAL_ONLY.includes(p)) && isTo) return false;
	// The mirror of gate (d): a verb-only card answers with a verb, so CC-CEDICT's nominal
	// and adjectival readings of the same character are somebody else's card. 是 is listed V
	// and CC-CEDICT also says "correct; right; true"; 花 is listed V and it says "flower".
	// Modals are the exception a `to` test cannot see — 该 answers "should", not "to should".
	if (pos.length === 1 && pos[0] === 'V' && !isTo && !MODAL.test(text)) return false;
	return true;
}

/** The words of a gloss that carry its sense, each folded to its singular. */
function contentWords(text) {
	const out = new Set();
	for (const sense of splitSenses(text)) {
		for (const word of sense.split(' ')) {
			const stem = singularise(word);
			if (stem && !CORE_STOP.has(stem)) out.add(stem);
		}
	}
	return out;
}

/**
 * The characters a sentence at each level is allowed to use.
 *
 * Built from the shipped corpus itself rather than from a separate character list, so it can
 * never disagree with what the app actually teaches: a character is allowed at level L when
 * some word at level L or below is written with it. The five sets nest, and come out at
 * 300 / 599 / 899 / 1200 / 1500 characters — the standard's own per-level character budget.
 */
function allowedCharacters(shipped) {
	const perLevel = new Map(LEVELS.map((level) => [level, new Set()]));
	for (const w of shipped) {
		const set = perLevel.get(w.level);
		if (set) for (const c of w.hanzi) if (SENTENCE_HAN.test(c)) set.add(c);
	}
	const cumulative = new Map();
	let seen = new Set();
	for (const level of LEVELS) {
		seen = new Set([...seen, ...perLevel.get(level)]);
		cumulative.set(level, new Set(seen));
	}
	return cumulative;
}

/** The longest sentence a card will show. Past this it stops being an example and becomes a text. */
const MAX_SENTENCE = 20;

/**
 * The eight gates. Each one is a defect a previous loop shipped green, and each one is also a
 * test in src/lib/data/vocab.spec.ts so that the shipped JSON is checked even when nobody
 * rebuilds.
 *
 * These fail the build. They are not tuneable: `meanings[0]` is the quiz question, so every
 * one of them is a wrong answer put in front of a learner.
 *
 * `refs` carries what the shipped card cannot: `defs`, the reference row's own CC-CEDICT
 * senses, keyed by official id, `allow`, the reviewed exemptions to gate (f), and
 * `sentences`, the authored example sentences gate (g) checks the card's `example` against.
 */
function gateProblems(shipped, refs) {
	const problems = [];
	const defsById = refs?.defs ?? new Map();
	const allow = refs?.allow ?? new Map();
	const sentences = refs?.sentences ?? new Map();

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

	// (d) Part of speech and primary gloss agree, in both directions.
	//
	//     Loop 3 tested two of the four shapes — a `to …` lead on an N/Adj/Adv card and a
	//     bare-noun lead on a V-only card — so an adjective or a noun card leading with an
	//     adverb was invisible: 最近 L2 [N] "recently", 近来 L5 [N] "recently", 原先 L5 [N]
	//     "originally", 一般 L2 [Adj] "generally", 频繁 L5 [Adj] "frequently" all shipped
	//     green. So was an adjective card leading with a noun (长寿 [Adj] "longevity").
	for (const w of shipped) {
		if (!w.pos.length) continue;
		const lead = leadOf(w);
		const pos = `[${w.pos.join('/')}]`;
		if (w.pos.every((p) => NOMINAL_ONLY.includes(p)) && /^to\b/i.test(lead)) {
			problems.push(`gate:pos ${w.id} ${w.hanzi} ${pos}: leads with the verb gloss "${lead}"`);
		}
		if (w.pos.length === 1 && w.pos[0] === 'V' && isBareNounGloss(lead)) {
			problems.push(`gate:pos ${w.id} ${w.hanzi} [V]: leads with the noun gloss "${lead}"`);
		}
		if (w.pos.every((p) => p === 'Adj') && isNounWordGloss(lead)) {
			problems.push(`gate:pos ${w.id} ${w.hanzi} [Adj]: leads with the noun gloss "${lead}"`);
		}
		if (w.pos.every((p) => p === 'N' || p === 'Adj') && isAdverbGloss(lead)) {
			problems.push(`gate:pos ${w.id} ${w.hanzi} ${pos}: leads with the adverb gloss "${lead}"`);
		}
		// The noun-lead test above only fires on a card whose *only* code is V, so a [V,N]
		// card escaped it entirely: 游泳 shipped "swimming", 决赛 "finals", 胜利 "victory" —
		// three cards that declare a verb and never gloss one. A noun lead is fine on a [V,N]
		// card, which is why this asks a different question: is there a verb sense *anywhere*
		// in the glosses? Scoped to V paired with N or M, because a stative verb ([Adj,V]:
		// 饿 "hungry", 安静 "quiet") and a coverb ([V,Prep]: 离 "away from", 替 "on behalf of")
		// both have no natural "to …" gloss, and demanding one would be an English artifact.
		if (verbNeedsVerbSense(w) && !w.meanings.some((m) => VERB_GLOSS.test(unqualified(m)))) {
			problems.push(`gate:pos ${w.id} ${w.hanzi} ${pos}: declares a verb and glosses none`);
		}
	}

	// (e) Punctuation closes. L3 老百姓 shipped `the "person in the street` straight onto an
	//     answer button — a sense truncated mid-quote — and every battery in loop 2 called
	//     the corpus clean, because nothing was counting quotation marks. Parentheses are
	//     checked the same way, and harder: a qualifier is only readable if it is balanced,
	//     unnested, non-empty and has a gloss in front of it.
	for (const w of shipped) {
		for (const m of w.meanings) {
			if ((m.match(/"/g) ?? []).length % 2 || /[“”]/.test(m)) {
				problems.push(`gate:punctuation ${w.id} ${w.hanzi}: unclosed quotation in "${m}"`);
			}
			if (!qualifierIsWellFormed(m)) {
				problems.push(`gate:punctuation ${w.id} ${w.hanzi}: unusable parentheses in "${m}"`);
			}
		}
	}

	// (f) The word's own English survived whatever was done to the card.
	//
	//     Loop 2 found 38 same-level pairs whose primary glosses answered to the same English
	//     and loop 3 "resolved" all 38 by moving BOTH cards off the shared word. 听见 shipped
	//     "to catch a sound" for CC-CEDICT's `["to hear"]`; 衬衣 shipped "underclothes" for
	//     `["shirt"]`. Nothing failed, because no gate had ever asked whether the word still
	//     means what it means — and the paraphrase is worse than the collision it hid, since
	//     `senseKeys(听见)` no longer meets `senseKeys(听到)` and the distractor guard will now
	//     happily offer 听到 as a wrong answer for 听见.
	//
	//     So: for every reference sense short and plain enough to be a naming rather than a
	//     reading (see `coreSenses`), at least one has to still be findable in `meanings`.
	//     A card may be re-glossed as far as this line and no further; past it, qualify the
	//     sense rather than replace it — 听见 "to hear (and catch it)" — or, where the rewrite
	//     really is a synonym a learner would accept, say so in the allow file, one line each.
	for (const w of shipped) {
		const defs = w.ids.flatMap((id) => defsById.get(id) ?? []);
		const core = coreSenses(defs.length ? defs : (w.defs ?? []), w.pinyin, w.pos);
		const exempt = allow.get(w.id);
		if (!core.size) {
			if (exempt) {
				problems.push(
					`gate:gloss-survival ${w.id} ${w.hanzi}: exempt but has no short reference sense — drop it from ${SURVIVAL_ALLOW_FILE}`
				);
			}
			continue;
		}
		const carried = contentWords(w.meanings.join('; '));
		const survived = [...core.values()].some((words) => intersects(words, carried));
		if (survived) {
			if (exempt) {
				problems.push(
					`gate:gloss-survival ${w.id} ${w.hanzi}: exempt but the reference sense is on the card — drop it from ${SURVIVAL_ALLOW_FILE}`
				);
			}
			continue;
		}
		if (exempt) continue;
		const wanted = [...core.keys()].map((t) => `"${t}"`).join(', ');
		const got = w.meanings.map((m) => `"${m}"`).join(', ');
		problems.push(
			`gate:gloss-survival ${w.id} ${w.hanzi}: reference says ${wanted}; card says ${got}`
		);
	}

	// (g) An example sentence is written at or below its own card's level.
	//
	//     A sentence exists to show the word working, so it has to be readable by the learner
	//     who is on that card. One HSK 5 character in an HSK 1 example does not teach 爱 in
	//     context; it replaces one unknown word with two. The allowed set is derived from the
	//     shipped corpus (see `allowedCharacters`), so it tracks whatever the app teaches
	//     rather than a list that can fall behind it.
	//
	//     The rest of the gate is the sentence being a sentence at all: pinyin that aligns
	//     one token to one character (which is also what makes it colourable syllable by
	//     syllable, the same way the headword is), the card's own word actually present, no
	//     empty field, and short enough to read on a phone.
	const allowed = allowedCharacters(shipped);
	const cardIds = new Set(shipped.map((w) => w.id));
	for (const [id, authored] of sentences) {
		if (!cardIds.has(id)) {
			problems.push(
				`gate:example-level ${id}: ${authored.file} writes a sentence for no such card`
			);
		}
	}
	for (const w of shipped) {
		const ex = w.example;
		if (!ex) continue;
		const where = `gate:example-level ${w.id} ${w.hanzi}`;
		if (!ex.hanzi || !ex.pinyin || !ex.english) {
			problems.push(`${where}: example is missing hanzi, pinyin or english`);
			continue;
		}
		const chars = sentenceChars(ex.hanzi);
		const stray = chars.filter((c) => !SENTENCE_HAN.test(c));
		if (stray.length) {
			problems.push(`${where}: "${ex.hanzi}" is not hanzi and punctuation — "${stray.join('')}"`);
		}
		const set = allowed.get(w.level) ?? new Set();
		const above = [...new Set(chars.filter((c) => SENTENCE_HAN.test(c) && !set.has(c)))];
		if (above.length) {
			problems.push(`${where}: "${ex.hanzi}" uses "${above.join(' ')}" — above HSK ${w.level}`);
		}
		// The pinyin is written in WORDS (see `sentenceWordUnits`) and `spans` is what keeps it
		// aligned to the characters anyway: one entry per printed token, saying how many
		// characters that token covers. Both halves are gated — the sum, so the reading still
		// accounts for every character exactly once, and the shape of every token — because the
		// sheet underlines the headword inside the sentence by walking this array.
		const tokens = pinyinSyllables(ex.pinyin);
		const spans = ex.spans;
		if (!Array.isArray(spans) || spans.length !== tokens.length) {
			problems.push(
				`${where}: "${ex.pinyin}" is ${tokens.length} token(s) but spans is ${spans?.length ?? 'absent'}`
			);
		} else if (spans.some((n) => !Number.isInteger(n) || n < 1)) {
			problems.push(`${where}: spans [${spans.join(' ')}] is not one positive count per token`);
		} else if (spans.reduce((sum, n) => sum + n, 0) !== chars.length) {
			const covered = spans.reduce((sum, n) => sum + n, 0);
			problems.push(
				`${where}: "${ex.hanzi}" is ${chars.length} character(s) but "${ex.pinyin}" covers ${covered}`
			);
		} else {
			const marks = headwordMarks(chars, [...w.hanzi]);
			let at = 0;
			for (let n = 0; n < spans.length; n += 1) {
				const erhua = spans[n] === 2 && tokens[n].endsWith('r') && chars[at + 1] === '儿';
				for (let k = 1; k < spans[n]; k += 1) {
					if (marks[at + k] === marks[at] || erhua) continue;
					problems.push(
						`${where}: "${tokens[n]}" is half inside the headword — the sheet cannot mark it`
					);
				}
				at += spans[n];
			}
			if (tokens.some((token, n) => n > 0 && token === 'r')) {
				problems.push(`${where}: "${ex.pinyin}" prints a bare "r" — erhua is not a syllable`);
			}
		}
		if (!ex.hanzi.includes(w.hanzi)) {
			problems.push(`${where}: "${ex.hanzi}" never uses the word it is an example of`);
		}
		if (chars.length > MAX_SENTENCE) {
			problems.push(`${where}: "${ex.hanzi}" is ${chars.length} characters, over ${MAX_SENTENCE}`);
		}
	}

	// (h) No two cards ship the same example sentence, or the same English for one.
	//
	//     Gate (b) already stops two cards answering to the same *gloss*; nothing stopped two
	//     cards answering to the same *sentence*. Authoring a word's example around a
	//     neighbouring word is the natural way to write one — 关 and 关上 both got
	//     "走的时候请关上门。" — and it is exactly the pair the distractor picker is most likely
	//     to put on one card, leaving the learner two buttons with the same sentence behind
	//     them. A shared English is the same defect one layer down: the sentences differ, the
	//     card still teaches nothing about which of the two words it is asking for.
	//
	//     Near-synonyms are the cases that most need separate sentences, not the cases that
	//     excuse a shared one: 关 vs 关上 is the resultative-complement distinction, and the
	//     example is where a learner can see it.
	const byExample = new Map();
	const byEnglish = new Map();
	for (const w of shipped) {
		if (!w.example?.hanzi) continue;
		const hanzi = w.example.hanzi;
		if (!byExample.has(hanzi)) byExample.set(hanzi, []);
		byExample.get(hanzi).push(w);
		const english = (w.example.english ?? '').trim().toLowerCase();
		if (!english) continue;
		if (!byEnglish.has(english)) byEnglish.set(english, []);
		byEnglish.get(english).push(w);
	}
	for (const [hanzi, group] of byExample) {
		if (group.length < 2) continue;
		const who = group.map((w) => `${w.id} ${w.hanzi}`).join(' and ');
		problems.push(`gate:example-shared ${who}: all ship the same sentence "${hanzi}"`);
	}
	for (const [english, group] of byEnglish) {
		if (group.length < 2) continue;
		// The same cards already reported above for sharing the sentence itself.
		if (new Set(group.map((w) => w.example.hanzi)).size === 1) continue;
		const who = group.map((w) => `${w.id} ${w.hanzi}`).join(' and ');
		problems.push(`gate:example-shared ${who}: all ship the same translation "${english}"`);
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
					found.push({ level, sense, a: other, b: w, qualified: qualifiedApart(other, w) });
				}
				others.push(w);
			}
		}
	}
	return found;
}

/**
 * True when two cards keep a shared sense but say on the button which one they are.
 *
 * This is the only resolution of a primary collision the build accepts besides genuinely
 * different senses, and it is deliberately the *easier* one to reach, because the alternative
 * authors kept choosing was to paraphrase both cards off the shared word — which hides the
 * collision from `senseKeys`, tells the distractor guard the two are unrelated, and deletes
 * the word from the app's own search. 衬衫 "shirt (dress shirt)" and 衬衣 "shirt (general
 * word)" still both answer to `shirt`, so the guard still refuses to put them on one card;
 * what changed is that a learner reading the two buttons can tell them apart.
 */
function qualifiedApart(a, b) {
	const qa = qualifierOf(a.meanings[0] || '');
	const qb = qualifierOf(b.meanings[0] || '');
	return Boolean(qa) && Boolean(qb) && qa !== qb;
}

/**
 * Within a level, two cards must never read the same on the button — not a shared sense in
 * the primary gloss, and not the same set of glosses in a different order.
 *
 * "Read the same" and "mean the same" are two questions, and this is the first one: a pair
 * that shares a sense but qualifies it on both sides is resolved, and passes. The second
 * question is still asked, at runtime, by the distractor guard, which keeps the pair off one
 * card precisely *because* the shared sense is still visible to `senseKeys`.
 */
function uniquenessProblems(shipped) {
	const problems = [];
	for (const { level, sense, a, b, qualified } of primaryCollisions(shipped)) {
		if (qualified) continue;
		problems.push(
			`unique:primary L${level} "${sense}": ${a.hanzi} (${a.id}) "${a.meanings[0]}" / ${b.hanzi} (${b.id}) "${b.meanings[0]}" — qualify both, do not move either off "${sense}"`
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
function verify(official, shipped, refs) {
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
		const expectPinyin = reading(r, displayHanzi(r.simplified)).pinyin;
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
		if (!Array.isArray(w.senses) || w.senses.length !== w.meanings.length) {
			problems.push(
				`${w.id} ${w.hanzi}: senses (${w.senses?.length ?? 0}) not aligned with meanings (${w.meanings.length})`
			);
		} else {
			for (let i = 0; i < w.meanings.length; i++) {
				if (w.senses[i]?.gloss !== w.meanings[i]) {
					problems.push(
						`${w.id} ${w.hanzi}: sense ${i + 1} "${w.senses[i]?.gloss}" != meaning "${w.meanings[i]}"`
					);
				}
			}
		}
		if (!w.pos.length) {
			if ((w.senses || []).some((s) => s.pos)) {
				problems.push(`${w.id} ${w.hanzi}: untagged card shipped a POS on a sense`);
			}
		} else {
			for (const code of w.pos) {
				if (!(w.senses || []).some((s) => s.pos === code)) {
					problems.push(
						`gate:pos ${w.id} ${w.hanzi} [${w.pos.join('/')}]: advertises ${code} with no gloss under it`
					);
				}
			}
			const firstPos = w.senses?.[0]?.pos;
			if (firstPos && w.pos[0] !== firstPos) {
				problems.push(
					`${w.id} ${w.hanzi}: pos[0] ${w.pos[0]} is not the first sense's ${firstPos}`
				);
			}
			const kind = clearGlossKind(w.meanings[0] || '');
			if (kind && firstPos && kind !== firstPos) {
				problems.push(
					`gate:pos ${w.id} ${w.hanzi}: chip ${firstPos} disagrees with "${w.meanings[0]}" (${kind})`
				);
			}
		}

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
	problems.push(...gateProblems(shipped, refs));
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
function auditEntries(shipped, refs) {
	const gateHits = new Map();
	const note = (id, reason) => {
		if (!gateHits.has(id)) gateHits.set(id, new Set());
		gateHits.get(id).add(reason);
	};
	const byId = new Map(shipped.map((w) => [w.id, w]));

	const GATE_REASON = {
		'gate:register': 'register-denied-gloss',
		'gate:cross-level': 'cross-level-duplicate-gloss',
		'gate:romanization': 'gloss-is-its-own-romanization',
		'gate:punctuation': 'unclosed-punctuation',
		'gate:gloss-survival': 'reference-sense-not-on-card',
		'gate:example-level': 'example-sentence-above-level',
		'gate:example-shared': 'example-sentence-shared-with-another-card',
		'gate:pos': 'pos-and-gloss-disagree'
	};
	for (const problem of gateProblems(shipped, refs)) {
		const reason = GATE_REASON[problem.split(' ')[0]] ?? 'pos-and-gloss-disagree';
		for (const m of problem.matchAll(/\b(L[1-5]-\d{4})\b/g)) if (byId.has(m[1])) note(m[1], reason);
	}
	for (const problem of uniquenessProblems(shipped)) {
		const reason = problem.startsWith('unique:primary')
			? 'primary-gloss-collision'
			: 'identical-meaning-set';
		for (const m of problem.matchAll(/\b(L[1-5]-\d{4})\b/g)) if (byId.has(m[1])) note(m[1], reason);
	}
	// A qualified pair passes the uniqueness gate on purpose — the two buttons read
	// differently — but it is still two cards in one level answering to one English word, so
	// it stays on the work list where a human can decide whether the tag is doing enough.
	for (const { a, b, qualified } of primaryCollisions(shipped)) {
		if (!qualified) continue;
		note(a.id, 'primary-gloss-qualified');
		note(b.id, 'primary-gloss-qualified');
	}
	// Not a build failure — see secondarySharing(). Listed so it is work someone can see.
	for (const { a, b } of secondarySharing(shipped)) {
		note(a.id, 'shares-sense-with-level-mate');
		note(b.id, 'shares-sense-with-level-mate');
	}

	const out = [];
	for (const w of shipped) {
		const reasons = new Set(gateHits.get(w.id) ?? []);
		// The official list may name a second part of speech that the card cannot yet explain.
		// Keep that editorial work visible without printing an unsupported label to learners.
		if (
			w.ids.some((id) => (refs.officialPos.get(id) ?? []).some((code) => !w.pos.includes(code)))
		) {
			reasons.add('official-pos-awaits-gloss');
		}
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
			senses: (w.senses || []).map((s) =>
				s.pos ? { pos: s.pos, gloss: s.gloss } : { gloss: s.gloss }
			),
			// Optional, and absent rather than empty where no sentence has been authored.
			// All 4,308 cards carry one today; nothing in the app may assume the field is there.
			...(w.example ? { example: w.example } : {}),
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

/** Anything thrown out of readOverrides() or reading() is a build failure, not a stack. */
function fatal(err) {
	console.error(`\nbuild-vocab: ${err.message}`);
	process.exit(1);
}

const official = readOfficial();
let overrides;
let overrideFiles;
let sentences;
let sentenceFiles;
let built;
let refs;
try {
	({ byId: overrides, files: overrideFiles } = readOverrides());
	({ byId: sentences, files: sentenceFiles } = readSentences());
	built = build(official, overrides, sentences);
	// What the shipped card cannot carry: the reference row's own senses, the reviewed list
	// of cards allowed to have re-glossed past them, and the authored sentences. Gate (f)
	// reads the first two, gate (g) the third.
	refs = {
		defs: new Map(official.map((r) => [r.id, r.cedictDefs || []])),
		officialPos: new Map(official.map((r) => [r.id, (r.pos || '').split('/').filter(Boolean)])),
		allow: readSurvivalAllow(),
		sentences
	};
} catch (err) {
	fatal(err);
}

// The audit is the work list that clears the gates, so it is written whether or not the
// gates pass. A failing build that also refuses to say what to fix is not much use.
const audit = auditEntries(built, refs);
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
	problems.push(...verify(official, checkedIn, refs));
	for (const level of LEVELS) {
		const file = `${OUT}/hsk${level}.json`;
		if ((await serialize(toShipped(built, level), file)) !== readFileSync(file, 'utf8')) {
			problems.push(`hsk${level}.json is not what scripts/build-vocab.mjs produces — rebuild it`);
		}
	}
} else {
	problems.push(...verify(official, built, refs));
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
	for (const p of problems.slice(0, PROBLEM_LIMIT)) console.error('  ' + p);
	if (problems.length > PROBLEM_LIMIT) console.error(`  … ${problems.length - PROBLEM_LIMIT} more`);
	console.error(
		`\nnothing written — fix the glosses in ${OVERRIDE_DIR}/ or the sentences in ${SENTENCE_DIR}/, then rebuild.`
	);
	console.error(`${AUDIT_FILE} lists ${audit.length} card(s) that need a human-authored gloss.`);
}

const summary = {
	officialRows: official.length,
	shippedEntries: shipped.length,
	merged: official.length - shipped.length,
	perLevel,
	overrideFiles,
	overrides: overrides.size,
	sentenceFiles: sentenceFiles.length,
	examples: shipped.filter((w) => w.example).length,
	examplesPerLevel: Object.fromEntries(
		LEVELS.map((level) => [level, shipped.filter((w) => w.level === level && w.example).length])
	),
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

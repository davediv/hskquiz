#!/usr/bin/env node
/**
 * Builds the shipped word data in src/lib/data/ from the authoritative lists in reference/hsk/.
 *
 * reference/hsk/ is the source of truth; src/lib/data/*.json is derived and disposable.
 * The build is deterministic and re-runnable, and it verifies its own output against the
 * reference before writing (see `verify()`), so a bad run fails loudly instead of shipping.
 *
 *   node scripts/build-vocab.mjs            build + verify
 *   node scripts/build-vocab.mjs --verify   verify the checked-in JSON without rewriting it
 *   node scripts/build-vocab.mjs --report   build, verify, and dump gloss diagnostics
 *
 * Glosses are derived from CC-CEDICT (CC-BY-SA 4.0, published by MDBG) and hand-edited.
 * Attribution ships in the app — see src/lib/data/attribution.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import prettier from 'prettier';

const OUT = 'src/lib/data';
const REF = 'reference/hsk';
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

/** Register markers: keep the gloss, but rank it below a plain one. */
const DEMOTE = /^\((bound form|literary|archaic|dialect|old|coll\.|slang|Tw|Taiwan|PRC|onom\.)/i;

const HANZI_RUN = /[㐀-鿿豈-﫿｜|]+/g;

/** Turn one CC-CEDICT sense into flashcard alternatives, best first. */
function senseAlternatives(raw) {
	let d = String(raw || '').trim();
	if (!d) return [];
	if (DROP_SENSE.some((re) => re.test(d))) return [];

	const demoted = DEMOTE.test(d);

	d = d
		.replace(/\s*\(?CL:.*$/, '') // trailing classifier list, with its wrapper if any
		.replace(/\[[^\]]*\]/g, ' ') // bracketed pinyin
		.replace(HANZI_RUN, ' ') // hanzi cross-references
		.replace(/\((?:[^()]|\([^()]*\))*\)/g, ' ') // parenthetical notes, one nesting deep
		.replace(/[()]/g, ' ') // any unbalanced remainder
		.replace(/\s*\bi\.e\.\s*/g, ' ')
		.replace(/\s*\betc\.?\b/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();

	if (!d) return [];

	return d
		.split(';')
		.map((part) =>
			part
				.replace(/\s+/g, ' ')
				.replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '')
				.trim()
		)
		.filter(Boolean)
		.map((text) => ({ text: tidy(text), demoted }))
		.filter((c) => c.text);
}

/** Learner-facing polish: no dictionary shorthand, no stray plumbing. */
function tidy(text) {
	let t = text
		.replace(/\bsth\.?\b/g, 'something')
		.replace(/\bsb\.?\b/g, 'someone')
		.replace(/\bs\.o\.\b/g, 'someone')
		.replace(/\bfig\.\s*/g, '')
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

const MAX_LEN = 34;

/**
 * Pick one or two short, distinct glosses. One alternative per CC-CEDICT sense, so the
 * result reads as "the meanings of this word" rather than a pile of synonyms.
 *
 * Two, not three: CC-CEDICT orders senses by breadth of usage, and its third sense is
 * reliably the one a learner at this level will never meet (奶奶 "breasts", 后天
 * "acquired", 好看 "in an embarrassing situation"). A hand-written override may still
 * carry three where all three earn their place.
 */
function glosses(defs, pos) {
	/** @type {{text: string, rank: number}[]} */
	const picked = [];
	const senses = (defs || []).map(senseAlternatives);

	senses.forEach((alts, senseIndex) => {
		const usable = alts.filter((a) => a.text.length <= MAX_LEN);
		if (!usable.length) return;
		// Within a sense, the first alternative is CC-CEDICT's headline reading.
		const best = usable[0];
		const score = posScore(best.text, pos) - senseIndex * 0.4 - (best.demoted ? 2.5 : 0);
		picked.push({ text: best.text, rank: score });
	});

	picked.sort((a, b) => b.rank - a.rank);

	const out = [];
	for (const { text } of picked) {
		const key = text.toLowerCase();
		if (out.some((x) => x.toLowerCase() === key)) continue;
		if (out.some((x) => overlaps(x, text))) continue;
		out.push(text);
		if (out.length === 2) break;
	}
	return out;
}

/** "to like" vs "to like a lot" on one card is noise, not a second meaning. */
function overlaps(a, b) {
	const x = a.toLowerCase().replace(/^to /, '');
	const y = b.toLowerCase().replace(/^to /, '');
	return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ');
}

/* -------------------------------------------------------------- overrides */

/**
 * Hand-authored glosses, keyed by official id. Used wherever CC-CEDICT is the wrong
 * register for a learner (particles, measure words, bound forms), wherever it gives
 * nothing at all, and wherever two words would otherwise collide on one meaning.
 * These are the flashcard answers, so they are short, concrete and mutually distinct.
 */
const OVERRIDES = {
	/* Particles, pronouns and other grammar that CC-CEDICT can only describe, not gloss. */
	'L1-0005': ['suggestion particle', 'right?'],
	'L1-0024': ['to compare', 'than'],
	'L1-0054': ['from', 'starting at'],
	'L1-0066': ['adverb particle, before a verb'],
	'L1-0067': ['possessive particle', 'of'],
	'L1-0075': ['prefix for ordinal numbers'],
	'L1-0121': ['to give', 'for'],
	'L1-0122': ['with', 'to follow'],
	'L1-0133': ['or, in a question', 'still'],
	'L1-0145': ['and', 'with'],
	'L1-0165': ['how many', 'a few'],
	'L1-0210': ['completed-action particle', 'marks a change of state'],
	'L1-0216': ['zero'],
	'L1-0227': ['yes-no question particle'],
	'L1-0241': ['plural marker for people'],
	'L1-0250': ['which'],
	'L1-0251': ['where'],
	'L1-0252': ['where, colloquial'],
	'L1-0254': ['that', 'those'],
	'L1-0255': ['that side', 'over there'],
	'L1-0256': ['there'],
	'L1-0257': ['there, colloquial'],
	'L1-0269': ['softening question particle', 'marks an ongoing state'],
	'L1-0271': ['you'],
	'L1-0272': ['you all'],
	'L1-0274': ['you, politely'],
	'L1-0325': ['who'],
	'L1-0328': ['what'],
	'L1-0354': ['he', 'him'],
	'L1-0355': ['they', 'them'],
	'L1-0356': ['she', 'her'],
	'L1-0357': ['they, all women'],
	'L1-0380': ['I', 'me'],
	'L1-0381': ['we', 'us'],
	'L1-0427': ['one'],
	'L1-0442': ['some of them'],
	'L1-0445': ['certain ones', 'somewhat'],
	'L1-0455': ['at', 'to be at'],
	'L1-0464': ['this', 'these'],
	'L1-0465': ['this side', 'over here'],
	'L1-0466': ['here'],
	'L1-0467': ['here, colloquial'],
	'L1-0469': ['ongoing-action particle'],
	'L1-0489': ['noun suffix'],
	'L2-0001': ['exclamatory particle', 'ah!'],
	'L2-0107': ['to serve as', 'when'],
	'L2-0117': ['if, at the end of a clause'],
	'L2-0118': ['particle before a complement'],
	'L2-0120': ['and so on'],
	'L2-0121': ['by the time', 'to wait until'],
	'L2-0145': ['towards', 'to treat'],
	'L2-0210': ['past-experience particle'],
	'L2-0257': ['suffix for a specialist'],
	'L2-0339': ['always', 'prefix before a surname'],
	'L2-0344': ['away from'],
	'L2-0387': ['then', 'in that case'],
	'L2-0550': ['noun suffix on place words'],
	'L2-0570': ['for', 'for the sake of'],
	'L2-0574': ['hello, on the phone', 'hey'],
	'L2-0602': ['friendly prefix before a name'],
	'L3-0032': ['marks the passive', 'by'],
	'L3-0083': ['towards', 'dynasty'],
	'L3-0102': ['at the beginning', 'early'],
	'L3-0223': ['why on earth?', 'what for?'],
	'L3-0280': ['ha ha'],
	'L3-0301': ['suffix meaning -ization'],
	'L3-0355': ['by, marking the passive'],
	'L3-0598': ['to appoint', 'no matter'],
	'L3-0751': ['to act as', 'to serve as'],
	'L3-0810': ['suffix meaning -ness'],
	'L3-0869': ['suffix for a person in a role'],
	'L3-0885': ['suffix meaning one who'],
	'L4-0002': ['ah!', 'oh!'],
	'L4-0242': ['out of, forming fractions'],
	'L4-0531': ['emphatic sentence particle'],
	'L4-0840': ['softening sentence particle'],
	'L4-0987': ['from', 'since'],
	'L4-0999': ['as', 'to act as'],
	'L5-0153': ['from, as in from here'],
	'L5-0389': ['will', 'shall'],
	'L5-0437': ['but', 'indeed'],
	'L5-0540': ['side', 'other'],
	'L5-0558': ['to taste carefully', 'suffix for products'],
	'L5-0779': ['and then', 'afterwards'],
	'L5-0880': ['that works too', 'may as well'],

	/* Measure words. The classifier reading is the one a learner is being tested on. */
	'L1-0009': ['class', 'work shift'],
	'L1-0015': ['bag', 'to wrap'],
	'L1-0017': ['measure word: cups, glasses'],
	'L1-0022': ['measure word: books'],
	'L1-0053': ['measure word: times'],
	'L1-0076': ["o'clock", 'a little', 'to order food'],
	'L1-0109': ['minute', 'point in a score'],
	'L1-0120': ['measure word: general purpose'],
	'L1-0143': ['day of the month', 'number'],
	'L1-0169': ['home', 'family'],
	'L1-0172': ['measure word: rooms'],
	'L1-0202': ['mouth', 'measure word: family members'],
	'L1-0203': ['piece', 'yuan, in speech'],
	'L1-0221': ['road', 'route'],
	'L1-0231': ['ten cents'],
	'L1-0238': ['door', 'measure word: school subjects'],
	'L1-0273': ['year'],
	'L1-0353': ['years of age'],
	'L1-0359': ['day', 'sky'],
	'L1-0426': ['page'],
	'L1-0450': ['yuan', 'Chinese currency unit'],
	'L2-0020': ['pen', 'measure word: sums of money'],
	'L2-0027': ['measure word: times through'],
	'L2-0052': ['floor of a building', 'layer'],
	'L2-0058': ['measure word: events, matches'],
	'L2-0112': ['measure word: dishes, questions'],
	'L2-0139': ['degree', 'extent'],
	'L2-0167': ['minute'],
	'L2-0168': ['measure word: portions, copies'],
	'L2-0169': ['measure word: letters'],
	'L2-0190': ['kilogram'],
	'L2-0191': ['kilometer'],
	'L2-0243': ['measure word: occurrences'],
	'L2-0265': ['measure word: clothes, matters'],
	'L2-0273': ['corner', 'ten cents'],
	'L2-0293': ['half a kilogram', 'catty'],
	'L2-0307': ['measure word: sentences'],
	'L2-0323': ['gram'],
	'L2-0324': ['quarter of an hour'],
	'L2-0356': ['50 grams', 'a Chinese ounce'],
	'L2-0358': ['measure word: vehicles'],
	'L2-0376': ['meter'],
	'L2-0380': ['name', 'measure word: people'],
	'L2-0407': ['row', 'measure word: rows'],
	'L2-0413': ['measure word: articles, essays'],
	'L2-0415': ['measure word: slices, flat pieces'],
	'L2-0434': ['kilogram, scientific term'],
	'L2-0521': ['measure word: sets'],
	'L2-0534': ['measure word: long thin things'],
	'L2-0549': ['head', 'measure word: large animals'],
	'L2-0572': ['measure word: people, polite'],
	'L2-0589': ['measure word: brief actions'],
	'L2-0634': ['eye', 'a glance'],
	'L2-0742': ['week'],
	'L2-0768': ['measure word: large structures'],
	'L3-0006': ['marks the object of a verb', 'measure word: handled things'],
	'L3-0066': ['step', 'pace'],
	'L3-0067': ['department', 'measure word: films, books'],
	'L3-0170': ['measure word: meals'],
	'L3-0283': ['line', 'line of work'],
	'L3-0337': ['shelf', 'measure word: planes, machines'],
	'L3-0435': ['category', 'kind'],
	'L3-0544': ['period of time', 'measure word: issues, terms'],
	'L3-0683': ['measure word: bunches, bouquets'],
	'L3-0685': ['pair', 'measure word: pairs'],
	'L3-0691': ['measure word: institutions', 'place'],
	'L3-0693': ['platform', 'measure word: machines'],
	'L3-0883': ['measure word: flat sheets', 'to open'],
	'L3-0902': ['measure word: pens, sticks'],
	'L3-0905': ['measure word: animals'],
	'L3-0931': ['kind', 'measure word: types'],
	'L4-0032': ['times, as a multiple'],
	'L4-0096': ['a Chinese foot', 'ruler'],
	'L4-0134': ['dozen'],
	'L4-0156': ['bag', 'measure word: bags'],
	'L4-0192': ['top', 'measure word: hats'],
	'L4-0274': ['root', 'measure word: long thin things'],
	'L4-0313': ['millimeter'],
	'L4-0314': ['milliliter'],
	'L4-0325': ['household', 'measure word: households'],
	'L4-0341': ['measure word: groups of people'],
	'L4-0429': ['measure word: rolls, volumes'],
	'L4-0438': ['measure word: plants, trees'],
	'L4-0468': ['centimeter'],
	'L4-0483': ['to line up', 'measure word: trains'],
	'L4-0548': ['plate', 'measure word: dishes, games'],
	'L4-0555': ['measure word: batches', 'to mark or approve'],
	'L4-0559': ['square meter', 'squared'],
	'L4-0660': ['measure word: songs, poems'],
	'L4-0799': ['box', 'measure word: boxes'],
	'L4-0803': ['item', 'measure word: items, projects'],
	'L4-0812': ['some', 'a few'],
	'L4-0942': ['a burst of', 'measure word: spells'],
	'L5-0079': ['measure word: volumes, copies'],
	'L5-0149': ['a Chinese inch'],
	'L5-0215': ['to pile up', 'a pile'],
	'L5-0218': ['ton'],
	'L5-0219': ['measure word: flowers, clouds'],
	'L5-0251': ['measure word: paintings, cloth'],
	'L5-0319': ['small box', 'measure word: boxes'],
	'L5-0402': ['measure word: sessions, classes'],
	'L5-0435': ['measure word: small round things'],
	'L5-0505': ['second of time'],
	'L5-0552': ['measure word: horses'],
	'L5-0645': ['measure word: doors, windows'],
	'L5-0674': ['sound', 'voice'],

	/* Words CC-CEDICT has no usable gloss for: erhua and variant spellings whose
	   headword lives elsewhere in the dictionary, plus transparent compounds. */
	'L1-0021': ['Beijing'],
	'L1-0044': ['in the car', 'on the bus'],
	'L1-0105': ['to finish school for the day'],
	'L1-0142': ['fun', 'amusing'],
	'L1-0213': ['inside', 'in'],
	'L1-0244': ['noodles'],
	'L1-0289': ['to get up', 'to stand up'],
	'L1-0338': ['is it or not?'],
	'L1-0433': ['together'],
	'L1-0437': ['a little', 'a bit'],
	'L2-0028': ['watch', 'form to fill in'],
	'L2-0034': ['not very', 'not too'],
	'L2-0044': ['before long', 'in a moment'],
	'L2-0171': ['to revise', 'to review for an exam'],
	'L2-0180': ['to do manual work'],
	'L2-0264': ['to have met before'],
	'L2-0330': ['hurry up', 'a bit faster'],
	'L2-0507': ['to deliver to'],
	'L2-0555': ['other parts of the country'],
	'L2-0627': ['full name'],
	'L2-0722': ['at this moment', 'just then'],
	'L2-0739': ['Chinese medicine'],
	'L3-0150': ['television station'],
	'L3-0192': ['to put onto'],
	'L3-0245': ['to announce publicly'],
	'L3-0324': ['record', 'best result so far'],
	'L3-0432': ['old man'],
	'L3-0485': ['US dollar'],
	'L3-0508': ['can you or not?'],
	'L3-0591': ['renminbi', 'Chinese currency'],
	'L4-0099': ['to rush', 'to rinse', 'to brew'],
	'L4-0106': ['to smoke a cigarette'],
	'L4-0213': ['disgusting', 'to feel sick'],
	'L4-0328': ['to row a boat', 'to scratch'],
	'L4-0337': ['to report to', 'a report'],
	'L4-0342': ['partner', 'companion'],
	'L4-0428': ['to roll up'],
	'L4-0482': ['to understand well', 'to find out about'],
	'L4-0507': ['American dollars'],
	'L4-0704': ['medical check-up'],
	'L4-0809': ['young man', 'lad'],
	'L4-0853': ['in the eyes of someone'],
	'L4-0897': ['full of energy'],
	'L5-0087': ['almost', 'nearly'],
	'L5-0094': ['to taste'],
	'L5-0108': ['in the city', 'downtown'],
	'L5-0123': ['to go on a business trip'],
	'L5-0139': ['dictionary of words'],
	'L5-0162': ['everyone', 'we all'],
	'L5-0224': ['to release', 'to issue'],
	'L5-0406': ['as far as possible'],
	'L5-0489': ['dock', 'wharf'],
	'L5-0655': ['to be willing to part with'],
	'L5-0793': ['to express sympathy to'],
	'L5-0816': ['brightly colored', 'vivid'],
	'L5-1023': ['Mid-Autumn Festival'],

	/* Near-synonyms. Two words in one level must never answer to the same English, or the
	   multiple-choice question has two right answers. Each pair is split on what actually
	   separates them in Chinese: the bare morpheme vs. the compound, the direction word vs.
	   the "-side" noun, the colour vs. the colour-word, the act vs. its result. */
	'L1-0002': ['hobby', 'to be fond of'],
	'L1-0388': ['to like'],
	'L1-0010': ['half'],
	'L1-0431': ['one half'],
	'L1-0013': ['to help'],
	'L1-0014': ['to lend a hand', 'to do a favor'],
	'L1-0019': ['north'],
	'L1-0020': ['the north side'],
	'L1-0023': ['notebook'],
	'L1-0341': ['book'],
	'L1-0028': ['illness', 'to fall ill'],
	'L1-0329': ['to get sick'],
	'L1-0042': ['vehicle', 'car'],
	'L1-0290': ['car', 'automobile'],
	'L1-0043': ['travel ticket'],
	'L1-0240': ['entry ticket'],
	'L1-0285': ['ticket'],
	'L1-0048': ['to exit', 'to produce'],
	'L1-0050': ['to go out'],
	'L1-0059': ['to open up', 'to switch on'],
	'L1-0188': ['to open', 'to start'],
	'L1-0070': ['location', 'site'],
	'L1-0071': ['place', 'area'],
	'L1-0084': ['east'],
	'L1-0085': ['the east side'],
	'L1-0092': ['correct', 'right'],
	'L1-0447': ['right, the direction'],
	'L1-0098': ['two'],
	'L1-0215': ['two, before a measure word'],
	'L1-0108': ['extremely'],
	'L1-0146': ['very'],
	'L1-0125': ['to shut', 'to turn off'],
	'L1-0126': ['to close up'],
	'L1-0128': ['nation'],
	'L1-0129': ['country'],
	'L1-0135': ['child'],
	'L1-0402': ['kid', 'little one'],
	'L1-0404': ['youngster'],
	'L1-0136': ['the Chinese language'],
	'L1-0479': ['Chinese, especially written'],
	'L1-0158': ['to come back'],
	'L1-0159': ['to go back'],
	'L1-0167': ['to remember'],
	'L1-0168': ['to memorize', 'to bear in mind'],
	'L1-0170': ['at home'],
	'L1-0173': ['to meet with'],
	'L1-0192': ['to look at', 'to watch'],
	'L1-0194': ['to catch sight of'],
	'L1-0195': ['to see', 'to notice'],
	'L1-0209': ['teacher'],
	'L1-0398': ['Mr', 'gentleman'],
	'L1-0214': ['the inside', 'in there'],
	'L1-0233': ["it doesn't matter"],
	'L1-0234': ["it's nothing", 'never mind'],
	'L1-0262': ['boy'],
	'L1-0278': ['girl'],
	'L1-0434': ['briefly', 'once'],
	'L1-0266': ['south'],
	'L1-0267': ['the south side'],
	'L1-0291': ['front', 'before'],
	'L1-0292': ['the front side', 'ahead'],
	'L1-0296': ['please', 'to invite'],
	'L1-0379': ['to ask'],
	'L1-0306': ['to know someone', 'to recognize'],
	'L1-0474': ['to know a fact'],
	'L1-0308': ['sun', 'day of the month'],
	'L1-0333': ['moment', 'the time when'],
	'L1-0334': ['time'],
	'L1-0349': ['to say'],
	'L1-0350': ['to talk'],
	'L1-0362': ['to hear'],
	'L1-0363': ['to catch a sound'],
	'L1-0367': ['outside', 'foreign'],
	'L1-0368': ['the outside', 'out there'],
	'L1-0372': ['late'],
	'L1-0374': ['evening', 'at night'],
	'L1-0377': ['to forget'],
	'L1-0378': ['to forget about'],
	'L1-0384': ['west'],
	'L1-0385': ['the west side'],
	'L1-0414': ['Sunday'],
	'L1-0415': ['Sunday, colloquial'],
	'L1-0418': ['to learn'],
	'L1-0420': ['to study'],
	'L1-0439': ['some'],
	'L1-0470': ['true', 'real'],
	'L1-0471': ['really', 'truly'],
	'L1-0490': ['to walk', 'to leave'],
	'L1-0491': ['to go on foot'],
	'L1-0496': ['left'],
	'L1-0497': ['the left side'],
	'L2-0008': ['to handle', 'to set up'],
	'L2-0718': ['to look after', 'to take care of'],
	'L2-0009': ['a way to do something'],
	'L2-0771': ['a method of making'],
	'L2-0018': ['for example'],
	'L2-0019': ['for instance'],
	'L2-0349': ['such as'],
	'L2-0024': ['side', 'edge'],
	'L2-0377': ['noodles', 'surface', 'measure word: flat things'],
	'L2-0025': ['to change'],
	'L2-0173': ['to correct', 'to alter'],
	'L2-0174': ['to transform'],
	'L2-0030': ['not bad', 'pretty good'],
	'L2-0727': ['correct'],
	'L2-0033': ['but then', 'merely'],
	'L2-0730': ['only', 'just'],
	'L2-0040': ['quite a few'],
	'L2-0148': ['many', 'much'],
	'L2-0216': ['a great many'],
	'L2-0629': ['a lot of'],
	'L2-0067': ['again, from the start'],
	'L2-0688': ['again'],
	'L2-0081': ['word'],
	'L2-0083': ['words and phrases'],
	'L2-0087': ['to plan to'],
	'L2-0253': ['a plan', 'to map out'],
	'L2-0091': ['the great majority'],
	'L2-0151': ['the majority'],
	'L2-0095': ['main gate'],
	'L2-0469': ['entrance'],
	'L2-0104': ['but'],
	'L2-0105': ['however'],
	'L2-0321': ['yet'],
	'L2-0108': ['at that time'],
	'L2-0459': ['and then', 'afterwards'],
	'L2-0109': ['to fall over'],
	'L2-0129': ['to drop', 'to fall'],
	'L2-0115': ['to obtain'],
	'L2-0116': ['to arrive at a result'],
	'L2-0134': ['to understand'],
	'L2-0135': ['to know how to'],
	'L2-0142': ['paragraph', 'section'],
	'L2-0288': ['measure word: class periods', 'joint'],
	'L2-0599': ['in the direction of', 'to face'],
	'L2-0150': ['how, in exclamations'],
	'L2-0711': ['in what way'],
	'L2-0166': ['a score', 'a mark'],
	'L2-0399': ['school year', 'grade'],
	'L2-0176': ['to feel'],
	'L2-0178': ['a feeling', 'to sense'],
	'L2-0177': ['to be moved', 'touching'],
	'L2-0702': ['sport', 'to exercise'],
	'L2-0223': ['black'],
	'L2-0225': ['the color black'],
	'L2-0226': ['red'],
	'L2-0227': ['the color red'],
	'L2-0236': ['a painting', 'a drawing'],
	'L2-0552': ['picture', 'image'],
	'L2-0241': ['yellow'],
	'L2-0242': ['the color yellow'],
	'L2-0245': ['to be able to', 'a meeting'],
	'L2-0322': ['may', 'to be allowed'],
	'L2-0279': ['classroom'],
	'L2-0326': ['a class in progress'],
	'L2-0282': ['to answer a call', 'to meet someone'],
	'L2-0283': ['to receive'],
	'L2-0494': ['to collect', 'to put away'],
	'L2-0495': ['to receive something sent'],
	'L2-0498': ['to be subjected to'],
	'L2-0284': ['to accept'],
	'L2-0285': ['next', 'coming up'],
	'L2-0295': ['to enter'],
	'L2-0756': ['to walk into'],
	'L2-0336': ['blue'],
	'L2-0337': ['the color blue'],
	'L2-0343': ['constantly'],
	'L2-0352': ['to drill'],
	'L2-0353': ['to practice', 'an exercise'],
	'L2-0485': ['to intern', 'field work'],
	'L2-0360': ['to stay', 'to keep'],
	'L2-0757': ['to go away'],
	'L2-0367': ['passenger'],
	'L2-0682': ['tourist'],
	'L2-0368': ['to travel'],
	'L2-0369': ['to tour', 'tourism'],
	'L2-0370': ['green'],
	'L2-0371': ['the color green'],
	'L2-0381': ['the name of a thing'],
	'L2-0388': ['at that moment'],
	'L2-0390': ['back then'],
	'L2-0422': ['measure word: bottles'],
	'L2-0423': ['bottle'],
	'L2-0440': ['clear', 'to understand fully'],
	'L2-0441': ['sunny', 'fine weather'],
	'L2-0444': ['to request'],
	'L2-0638': ['to demand', 'a requirement'],
	'L2-0447': ['sports field', 'court'],
	'L2-0531': ['stadium'],
	'L2-0452': ['entirely'],
	'L2-0458': ['everyone as a body'],
	'L2-0514': ['all of'],
	'L2-0465': ['to think that'],
	'L2-0594': ['to believe'],
	'L2-0477': ['to give birth to'],
	'L2-0715': ['to grow'],
	'L2-0487': ['really', 'honestly'],
	'L2-0488': ['solid', 'down to earth'],
	'L2-0526': ['to put forward'],
	'L2-0528': ['to improve', 'to raise'],
	'L2-0636': ['to raise a child', 'to keep a pet'],
	'L2-0537': ['to hear that'],
	'L2-0576': ['to smell'],
	'L2-0541': ['quite', 'rather'],
	'L2-0663': ['all along', 'straight on'],
	'L2-0548': ['the same'],
	'L2-0660': ['generally', 'so-so'],
	'L2-0579': ['lunch'],
	'L2-0734': ['Chinese food'],
	'L2-0611': ['a joke'],
	'L2-0684': ['to have free time'],
	'L2-0625': ['behavior'],
	'L2-0767': ['effect', 'function'],
	'L2-0635': ['eyes'],
	'L2-0650': ['have a safe trip'],
	'L2-0651': ['bon voyage'],
	'L2-0665': ['opinion', 'a complaint'],
	'L2-0666': ['meaning', 'idea'],
	'L2-0676': ['English, in writing'],
	'L2-0677': ['English'],
	'L2-0693': ['courtyard', 'institution'],
	'L2-0695': ['a yard'],
	'L2-0759': ['to form a group', 'a group'],
	'L2-0760': ['to make up', 'to compose'],
	'L3-0002': ['to arrange'],
	'L3-0891': ['to tidy up', 'to sort out'],
	'L3-0004': ['to press', 'to push'],
	'L3-0822': ['to press down', 'to hold down'],
	'L3-0005': ['according to'],
	'L3-0884': ['in accordance with', 'to shine'],
	'L3-0015': ['to go through formalities'],
	'L3-0108': ['to deal with'],
	'L3-0018': ['to maintain'],
	'L3-0021': ['to hold back', 'to reserve'],
	'L3-0020': ['to protect'],
	'L3-0186': ['to guard against'],
	'L3-0035': ['skill', 'capability'],
	'L3-0250': ['kung fu', 'skill from practice'],
	'L3-0037': ['fairly', 'to compare'],
	'L3-0786': ['compared with'],
	'L3-0042': ['change', 'to vary'],
	'L3-0950': ['to shift', 'to turn into'],
	'L3-0047': ['a form to fill in'],
	'L3-0807': ['shape'],
	'L3-0050': ['to show', 'performance'],
	'L3-0779': ['to display', 'to indicate'],
	'L3-0051': ['to perform'],
	'L3-0826': ['to play a role'],
	'L3-0052': ['and', 'moreover'],
	'L3-0053': ['as well as', 'and also'],
	'L3-0054': ['to air'],
	'L3-0055': ['to play a recording'],
	'L3-0270': ['to broadcast'],
	'L3-0068': ['branch', 'division'],
	'L3-0070': ['talent'],
	'L3-0587': ['a talented person'],
	'L3-0079': ['plant', 'works'],
	'L3-0239': ['factory'],
	'L3-0084': ['noisy', 'to quarrel'],
	'L3-0085': ['to have a row'],
	'L3-0086': ['shirt'],
	'L3-0087': ['a shirt or blouse'],
	'L3-0090': ['achievement'],
	'L3-0796': ['effect', 'result'],
	'L3-0092': ['to found', 'to be set up'],
	'L3-0343': ['to construct'],
	'L3-0344': ['to complete building'],
	'L3-0345': ['to establish'],
	'L3-0094': ['a member'],
	'L3-0309': ['a club member'],
	'L3-0099': ['to last', 'sustained'],
	'L3-0327': ['to continue'],
	'L3-0110': ['to spread'],
	'L3-0818': ['to publicize', 'propaganda'],
	'L3-0115': ['to create'],
	'L3-0116': ['to compose', 'a creative work'],
	'L3-0117': ['ever', 'never, with a negative'],
	'L3-0966': ['always'],
	'L3-0121': ['to store', 'to deposit'],
	'L3-0122': ['to exist'],
	'L3-0630': ['to survive'],
	'L3-0124': ['to reach a level'],
	'L3-0143': ['to arrive at'],
	'L3-0125': ['to break', 'to smash'],
	'L3-0164': ['to snap', 'to cut off'],
	'L3-0135': ['to lead the way'],
	'L3-0918': ['to instruct', 'to coach'],
	'L3-0149': ['TV drama'],
	'L3-0450': ['a serial'],
	'L3-0155': ['to book', 'to order'],
	'L3-0721': ['to agree'],
	'L3-0169': ['partner', 'target'],
	'L3-0498': ['goal', 'objective'],
	'L3-0171': ['to publish'],
	'L3-0172': ['to give out', 'to send out'],
	'L3-0187': ['to prevent'],
	'L3-0866': ['to take precautions'],
	'L3-0189': ['housing', 'buildings'],
	'L3-0766': ['a room'],
	'L3-0199': ['plentiful', 'rich'],
	'L3-0211': ['wealthy'],
	'L3-0207': ['to pay'],
	'L3-0904': ['to pay out'],
	'L3-0232': ['each'],
	'L3-0236': ['each on their own'],
	'L3-0479': ['every'],
	'L3-0238': ['even more'],
	'L3-0377': ['a step further'],
	'L3-0241': ['time spent', 'effort'],
	'L3-0263': ['to watch an event'],
	'L3-0668': ['to watch on TV'],
	'L3-0268': ['light', 'only'],
	'L3-0269': ['bright', 'brightness'],
	'L3-0298': ['each other'],
	'L3-0789': ['mutual', 'mutually'],
	'L3-0303': ['topic of conversation'],
	'L3-0702': ['a question set', 'heading'],
	'L3-0334': ['price'],
	'L3-0335': ['the price asked'],
	'L3-0360': ['to receive guests'],
	'L3-0675': ['to endure', 'to be given'],
	'L3-0363': ['to combine'],
	'L3-0451': ['to join together', 'joint'],
	'L3-0370': ['only'],
	'L3-0371': ['no more than'],
	'L3-0390': ['quiet', 'calm'],
	'L3-0602': ['yet', 'to remain'],
	'L3-0603': ['still, as before'],
	'L3-0406': ['to open up', 'to exploit'],
	'L3-0446': ['to make use of'],
	'L3-0436': ['similar'],
	'L3-0790': ['alike', 'resembling'],
	'L3-0438': ['inside'],
	'L3-0505': ['within', 'inner'],
	'L3-0443': ['force', 'strength'],
	'L3-0444': ['power', 'might'],
	'L3-0456': ['to collect', 'to lead'],
	'L3-0457': ['a leader'],
	'L3-0458': ['to be ahead'],
	'L3-0480': ['beautiful'],
	'L3-0481': ['fine', 'happy'],
	'L3-0482': ['lovely'],
	'L3-0484': ['fine art'],
	'L3-0839': ['art'],
	'L3-0489': ['area in size'],
	'L3-0570': ['district', 'zone'],
	'L3-0507': ['inner heart'],
	'L3-0799': ['heart', 'mind'],
	'L3-0513': ['age of a person'],
	'L3-0642': ['era', 'epoch'],
	'L3-0520': ['nice and warm'],
	'L3-0758': ['warm'],
	'L3-0531': ['to fit together', 'to coordinate'],
	'L3-0720': ['to correspond by letter'],
	'L3-0533': ['to approve officially'],
	'L3-0597': ['to accept', 'approval'],
	'L3-0555': ['strong'],
	'L3-0558': ['intense', 'powerful'],
	'L3-0584': ['a crowd', 'measure word: crowds, flocks'],
	'L3-0731': ['a lump', 'a ball'],
	'L3-0733': ['organization', 'a team'],
	'L3-0593': ['a human life'],
	'L3-0628': ['raw', 'unfamiliar'],
	'L3-0632': ['life'],
	'L3-0594': ['personnel'],
	'L3-0870': ['staff', 'employees'],
	'L3-0613': ['commerce'],
	'L3-0633': ['business dealings'],
	'L3-0634': ['to grow up'],
	'L3-0881': ['to increase'],
	'L3-0636': ['to defeat'],
	'L3-0849': ['to win'],
	'L3-0638': ['to lose something'],
	'L3-0678': ['to lose a game'],
	'L3-0644': ['in fact'],
	'L3-0659': ['as a matter of fact'],
	'L3-0647': ['an experiment'],
	'L3-0662': ['a trial', 'to test out'],
	'L3-0650': ['to cause', 'to make someone'],
	'L3-0877': ['to build'],
	'L3-0926': ['to make'],
	'L3-0681': ['to be classed as'],
	'L3-0682': ['to belong to'],
	'L3-0692': ['head of an institute'],
	'L3-0938': ['director', 'head'],
	'L3-0772': ['faculty', 'system'],
	'L3-0924': ['system of rules'],
	'L3-0800': ['to believe', 'to trust'],
	'L3-0802': ['to have confidence in'],
	'L3-0812': ['personality'],
	'L3-0961': ['nature', 'natural'],
	'L3-0837': ['since then'],
	'L3-0958': ['ever since'],
	'L3-0859': ['to swim'],
	'L3-0861': ['swimming'],
	'L3-0889': ['whole', 'in good order'],
	'L3-0890': ['the entire'],
	'L3-0893': ['as a whole'],
	'L3-0895': ['a full', 'as much as'],
	'L3-0896': ['upright', 'just now'],
	'L3-0906': ['straight'],
	'L3-0898': ['certificate', 'to prove'],
	'L3-0899': ['an ID document'],
	'L3-0951': ['situation'],
	'L3-0952': ['state', 'condition'],
	'L4-0009': ['on time'],
	'L4-0984': ['punctual'],
	'L4-0010': ['dark', 'dim'],
	'L4-0319': ['darkness', 'pitch dark'],
	'L4-0014': ['to lay out', 'to sway'],
	'L4-0056': ['to arrange', 'to assign'],
	'L4-0015': ['to swing'],
	'L4-0196': ['to waver'],
	'L4-0017': ['to suffer defeat'],
	'L4-0136': ['to defeat'],
	'L4-0018': ['to run errands'],
	'L4-0207': ['to cope with'],
	'L4-0020': ['to contain'],
	'L4-0307': ['to have in it'],
	'L4-0045': ['to commend'],
	'L4-0086': ['to praise'],
	'L4-0060': ['material'],
	'L4-0985': ['reference material', 'records'],
	'L4-0069': ['to survey'],
	'L4-0477': ['to measure'],
	'L4-0070': ['to test'],
	'L4-0377': ['to detect', 'to test for'],
	'L4-0073': ['product'],
	'L4-0344': ['goods'],
	'L4-0079': ['tide', 'moist'],
	'L4-0080': ['a current', 'the tide of fashion'],
	'L4-0088': ['honest'],
	'L4-0462': ['well-behaved', 'frank'],
	'L4-0091': ['to admit'],
	'L4-0493': ['to admit to a school'],
	'L4-0092': ['to bear'],
	'L4-0256': ['a burden', 'to shoulder'],
	'L4-0109': ['to offer for sale'],
	'L4-0807': ['to sell', 'sales'],
	'L4-0115': ['window'],
	'L4-0117': ['window, colloquial'],
	'L4-0128': ['coarse', 'thick, of a rod'],
	'L4-0447': ['wide'],
	'L4-0448': ['broad', 'vast'],
	'L4-0164': ['separately'],
	'L4-0200': ['alone'],
	'L4-0168': ['to go bankrupt'],
	'L4-0564': ['to be ruined financially'],
	'L4-0175': ['to check in', 'to register'],
	'L4-0176': ['to log in'],
	'L4-0183': ['status'],
	'L4-0758': ['position', 'place'],
	'L4-0186': ['typical', 'a typical case'],
	'L4-0526': ['a fashion model'],
	'L4-0527': ['a scale model'],
	'L4-0822': ['model number'],
	'L4-0193': ['to settle', 'to fix'],
	'L4-0285': ['fixed', 'to fasten'],
	'L4-0215': ['and', 'yet'],
	'L4-0876': ['as well as'],
	'L4-0222': ['method', 'way'],
	'L4-0224': ['the law'],
	'L4-0232': ['square', 'upright'],
	'L4-0238': ['to be distributed'],
	'L4-0239': ['to disperse'],
	'L4-0608': ['to scatter'],
	'L4-0248': ['to seal off'],
	'L4-0289': ['to shut down'],
	'L4-0252': ['madam', 'Mrs'],
	'L4-0543': ['lady', 'Ms'],
	'L4-0269': ['to be separated by'],
	'L4-0270': ['to separate'],
	'L4-0281': ['internal structure'],
	'L4-0403': ['structure'],
	'L4-0292': ['official, from the government'],
	'L4-0946': ['government'],
	'L4-0297': ['a regular pattern'],
	'L4-0299': ['a rule'],
	'L4-0316': ['a number'],
	'L4-0670': ['digital', 'figures'],
	'L4-0323': ['to breathe'],
	'L4-0774': ['to suck in', 'to absorb'],
	'L4-0327': ['patterned', 'blurred'],
	'L4-0791': ['fresh flowers'],
	'L4-0356': ['extremely', 'pole'],
	'L4-0357': ['exceedingly'],
	'L4-0364': ['to tie', 'to fasten'],
	'L4-0402': ['to knot', 'to bear fruit'],
	'L4-0383': ['gradually'],
	'L4-0968': ['little by little'],
	'L4-0391': ['to lower'],
	'L4-0693': ['to shrink'],
	'L4-0427': ['a gathering', 'to get together'],
	'L4-0909': ['to run into'],
	'L4-0910': ['to meet by chance'],
	'L4-0459': ['husband, informal'],
	'L4-0933': ['husband'],
	'L4-0461': ['wife, informal'],
	'L4-0565': ['wife'],
	'L4-0467': ['calm and level-headed'],
	'L4-0560': ['calm', 'peaceful'],
	'L4-0473': ['interest on money'],
	'L4-0824': ['interest in something'],
	'L4-0495': ['measure word: rounds', 'to take turns'],
	'L4-0498': ['wheel'],
	'L4-0509': ['a dream'],
	'L4-1000': ['to dream'],
	'L4-0520': ['to describe'],
	'L4-0521': ['to depict in writing'],
	'L4-0819': ['to characterize'],
	'L4-0530': ['even if'],
	'L4-0634': ['even', 'so much so that'],
	'L4-0551': ['to train'],
	'L4-0553': ['to cultivate'],
	'L4-0856': ['to form a habit'],
	'L4-0706': ['on behalf of', 'in place of'],
	'L4-0707': ['to substitute for'],
	'L4-0790': ['delicious', 'bright'],
	'L4-0816': ['fresh'],
	'L4-0794': ['marked', 'striking'],
	'L4-0895': ['outstanding'],
	'L4-0804': ['project', 'item'],
	'L4-0833': ['academic study'],
	'L4-0834': ['knowledge', 'scholarship'],
	'L4-0870': ['to move over'],
	'L4-0871': ['to move', 'mobile'],
	'L4-0923': ['to care about'],
	'L4-0924': ['to lie in', 'to depend on'],
	'L4-0927': ['to sponsor'],
	'L4-0952': ['to prop up', 'to pay out'],
	'L4-0964': ['to plant'],
	'L4-0965': ['to cultivate crops'],
	'L5-0012': ['packaging', 'to wrap up'],
	'L5-0155': ['to pack up', 'to take away'],
	'L5-0037': ['to fluctuate', 'a change'],
	'L5-1047': ['to transform'],
	'L5-1048': ['to switch over'],
	'L5-0056': ['to make up for'],
	'L5-0543': ['to compensate for a loss'],
	'L5-0057': ['a subsidy'],
	'L5-1055': ['to fund'],
	'L5-0070': ['to guess'],
	'L5-0071': ['to speculate'],
	'L5-0081': ['to cross'],
	'L5-0082': ['fork'],
	'L5-0097': ['a scene', 'occasion'],
	'L5-0245': ['scenery'],
	'L5-0333': ['the picture on screen'],
	'L5-0410': ['a sight'],
	'L5-0109': ['to ride', 'to multiply'],
	'L5-0110': ['to take a vehicle'],
	'L5-0112': ['to travel by'],
	'L5-0538': ['to film'],
	'L5-0970': ['to pick', 'to take off'],
	'L5-0122': ['to publish a book'],
	'L5-0227': ['to issue', 'to distribute'],
	'L5-0138': ['to found'],
	'L5-0612': ['to establish firmly'],
	'L5-0151': ['to answer'],
	'L5-0152': ['a reply', 'to reply formally'],
	'L5-0908': ['to respond'],
	'L5-0154': ['to dress up'],
	'L5-1051': ['to decorate'],
	'L5-0156': ['to strike a blow'],
	'L5-0595': ['to knock', 'to tap'],
	'L5-0158': ['to bother'],
	'L5-0259': ['to interfere with'],
	'L5-0166': ['lobby', 'a large hall'],
	'L5-0765': ['hall', 'living room'],
	'L5-0171': ['blank', 'to stay put'],
	'L5-0642': ['silly', 'foolish'],
	'L5-0173': ['the price paid'],
	'L5-0371': ['price', 'value'],
	'L5-0187': ['to arrive'],
	'L5-1017': ['up to'],
	'L5-0205': ['to transfer someone'],
	'L5-0392': ['to explain', 'to brief'],
	'L5-1049': ['to make over to another'],
	'L5-0206': ['to lose', 'to throw away'],
	'L5-0454': ['to lose out', 'to be short of'],
	'L5-0736': ['a loss', 'to suffer damage'],
	'L5-0217': ['to correspond'],
	'L5-0826': ['corresponding'],
	'L5-0226': ['to launch'],
	'L5-0659': ['to shoot'],
	'L5-0660': ['to fire a gun'],
	'L5-0235': ['to enlarge'],
	'L5-0965': ['to grow bigger'],
	'L5-0242': ['to share with others'],
	'L5-0286': ['to share in common'],
	'L5-0252': ['range', 'extent'],
	'L5-0452': ['width'],
	'L5-0281': ['a public notice'],
	'L5-1010': ['a post', 'duties'],
	'L5-0301': ['broad', 'extensive'],
	'L5-0302': ['widespread'],
	'L5-0326': ['alley', 'lane'],
	'L5-0840': ['thief'],
	'L5-0893': ['all at once', 'in an instant'],
	'L5-0348': ['vitality'],
	'L5-0526': ['energy'],
	'L5-0376': ['tough', 'arduous'],
	'L5-0377': ['difficult'],
	'L5-0384': ['to construct'],
	'L5-0385': ['architecture', 'a building'],
	'L5-0390': ['to be about to'],
	'L5-0903': ['willpower'],
	'L5-0412': ['a contest'],
	'L5-0413': ['to compete', 'competition'],
	'L5-0448': ['to control'],
	'L5-1004': ['to have control of', 'to allocate'],
	'L5-0458': ['rotten', 'mushy'],
	'L5-0634': ['soft'],
	'L5-0468': ['standpoint'],
	'L5-1009': ['a job position'],
	'L5-0488': ['to put into practice'],
	'L5-0776': ['to carry forward'],
	'L5-1005': ['to carry out'],
	'L5-0516': ['appearance'],
	'L5-0671': ['facial expression'],
	'L5-0517': ['gaze', 'sight'],
	'L5-0876': ['insight', 'vision'],
	'L5-0539': ['to rule out'],
	'L5-0835': ['to eliminate'],
	'L5-0575': ['to play a role'],
	'L5-0912': ['to own'],
	'L5-0929': ['to have'],
	'L5-0975': ['to occupy', 'to hold'],
	'L5-0581': ['a signature', 'to autograph'],
	'L5-0584': ['to sign a document'],
	'L5-0603': ['plot', 'details'],
	'L5-0604': ['circumstances'],
	'L5-0613': ['a group of people'],
	'L5-0658': ['community', 'neighborhood'],
	'L5-0621': ['a public figure'],
	'L5-0622': ['a character', 'a person of note'],
	'L5-0623': ['to endure'],
	'L5-0625': ['to put up with'],
	'L5-0640': ['to remove a virus'],
	'L5-0836': ['to disinfect'],
	'L5-0646': ['fan'],
	'L5-0650': ['to go up'],
	'L5-0976': ['to rise'],
	'L5-0977': ['to raise the price'],
	'L5-0676': ['to be left over'],
	'L5-0677': ['to remain'],
	'L5-0714': ['to command'],
	'L5-1034': ['to dominate', 'leading'],
	'L5-0726': ['to search'],
	'L5-0727': ['to search for online'],
	'L5-0744': ['to flee'],
	'L5-0746': ['to run away'],
	'L5-0752': ['characteristic'],
	'L5-0805': ['real estate'],
	'L5-1054': ['assets'],
	'L5-0756': ['to prompt', 'a hint'],
	'L5-1015': ['to instruct', 'an instruction'],
	'L5-0789': ['the only one'],
	'L5-1011': ['it is just that'],
	'L5-0848': ['to appreciate'],
	'L5-0853': ['performance of a device'],
	'L5-1008': ['function', 'role'],
	'L5-0886': ['on the basis of', 'grounds'],
	'L5-0944': ['to restrain'],
	'L5-1019': ['to condition', 'to restrict'],
	'L5-0950': ['calamity'],
	'L5-0952': ['disaster'],
	'L5-0963': ['to add'],
	'L5-0966': ['to grow in number'],
	'L5-0967': ['to strengthen'],
	'L5-0999': ['within'],
	'L5-1002': ['among', 'in the midst of'],
	'L5-1033': ['to host'],
	'L5-1067': ['to organize', 'an organization'],
	'L5-1038': ['an assistant'],
	'L5-1039': ['a helper'],
	'L1-0154': ['to return', 'to reply'],
	'L3-0346': ['to build up', 'construction'],
	'L4-0068': ['to gauge'],
	'L4-0378': ['to subtract', 'to decrease'],
	'L4-0554': ['to nurture'],
	'L4-0522': ['famous brand', 'name tag'],
	'L5-0951': ['a natural disaster'],
	'L1-0151': ['words', 'speech', 'language'],
	'L2-0397': ['unpleasant to hear', 'coarse'],
	'L3-0798': ['blood'],
	'L4-0754': ['tail'],
	'L4-0413': ['classic', 'the classics'],
	'L5-0669': ['nerve', 'mental state'],
	'L1-0034': ['not', 'no'],
	'L2-0457': ['the whole body'],
	'L3-0101': ['again', 'to repeat'],
	'L3-0526': ['to send', 'a faction'],
	'L5-0782': ['lasting', 'by a set date'],
	'L1-0064': ['to reach', 'to arrive at'],
	'L2-0569': ['bound for', 'to go towards'],
	'L1-0160': ['to know how to', 'will'],
	'L4-0651': ['whether or not'],
	'L1-0056': ['to hit', 'to strike'],
	'L1-0392': ['to get off a vehicle'],
	'L1-0456': ['to be at home'],
	'L2-0039': ['not as good as'],
	'L3-0623': ['identity card', 'ID card'],
	'L3-0756': ['bathroom', 'toilet'],
	'L4-0076': ['a record', 'a music album'],
	'L4-0277': ['AD', 'the Common Era'],
	'L1-0389': ['to go down', 'below'],
	'L1-0186': ['then, right away', 'only'],
	'L1-0001': ['to love', 'affection'],
	'L2-0172': ['should', 'ought to'],
	'L3-0259': ['to hang', 'to hang up a phone'],
	'L5-0913': ['to have no need for'],
	'L4-0997': ['at first', 'initially'],
	'L5-0058': ['never before', 'has not yet'],
	'L3-0503': ['surely not', 'could it be that?'],
	'L5-0546': ['to spray', 'to spurt'],
	'L1-0099': ['cooked rice', 'a meal'],
	'L1-0411': ['new', 'newly'],
	'L2-0051': ['lawn', 'meadow'],
	'L2-0375': ['cat'],
	'L3-0256': ['ancient', 'olden'],
	'L3-0392': ['old', 'second-hand'],
	'L3-0486': ['to be fascinated', 'an enthusiast'],
	'L3-0569': ['a sports fan'],
	'L4-0236': ['not', 'wrong'],
	'L5-0304': ['ghost', 'sly'],
	'L5-0687': ['to pick up', 'ten, on a cheque'],
	'L2-0518': ['sun', 'sunlight'],
	'L2-0431': ['anger', 'gas'],
	'L2-0481': ['province', 'to save', 'to economize'],
	'L2-0106': ['egg'],
	'L4-0503': ['hat', 'cap'],
	'L2-0302': ['hotel'],
	'L2-0128': ['shop', 'store'],
	'L2-0211': ['sea', 'ocean'],
	'L2-0092': ['the open sea'],
	'L5-0307': ['pot', 'pan'],
	'L2-0564': ['bowl'],
	'L4-0237': ['fat', 'loose-fitting'],
	'L1-0358': ['too', 'excessively'],
	'L1-0304': ['hot', 'to heat up'],
	'L2-0704': ['we, including you'],
	'L2-0703': ['I', 'we'],
	'L3-0511': ['a decade', 'an era'],
	'L5-0222': ['ear'],
	'L4-0287': ['strange', 'rather'],
	'L4-0764': ['without', 'to not have'],
	'L1-0089': ['all', 'both'],
	'L1-0055': ['a mistake', 'wrong'],
	'L1-0265': ['male student', 'schoolboy'],
	'L1-0264': ['man', 'men'],
	'L3-0811': ['gender', 'sex'],
	'L5-0330': ['slippery', 'to slide'],
	'L2-0467': ['a day', 'daily life'],
	'L4-0528': ['the end', 'final stage'],
	'L1-0111': ['dry', 'dried'],
	'L4-0360': ['to gather together', 'to assemble'],
	'L4-0475': ['the two of them'],
	'L5-0387': ['a key on a keyboard', 'button'],
	'L3-0420': ['empty', 'hollow'],
	'L1-0207': ['old', 'aged'],
	'L1-0061': ['big', 'large'],
	'L2-0123': ['low', 'to lower'],
	'L4-0003': ['short in height'],
	'L1-0270': ['can', 'to be able to'],
	'L2-0398': ['to be capable of'],
	'L1-0094': ['many', 'a lot of'],
	'L5-0419': ['an act', 'behavior'],
	'L1-0208': ['an old person', 'the elderly'],
	'L3-0010': ['Chinese cabbage'],
	'L3-0141': ['knife'],
	'L3-0183': ['anyway', 'in any case'],
	'L3-0596': ['to recognize', 'to know'],
	'L4-0600': ['lively', 'bustling'],
	'L5-0456': ['to leave behind', 'to be missing'],
	'L1-0219': ['upstairs'],
	'L2-0086': ['to work a casual job'],
	'L2-0096': ['adult', 'grownup'],
	'L2-0208': ['to celebrate New Year'],
	'L2-0733': ['paper'],
	'L2-0741': ['to value', 'to take seriously'],
	'L5-0014': ['to look after', 'to maintain'],
	'L5-0016': ['to call the police'],
	'L5-0188': ['actually', 'as it happens'],
	'L5-0473': ['to associate ideas'],
	'L2-0219': ['a good deed', 'a happy event'],
	'L4-0153': ['the public', 'the masses'],
	'L2-0586': ['habit', 'to be used to'],
	'L3-0763': ['an article', 'an essay'],
	'L4-0973': ['a written work', 'a book']
};

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

function build(official) {
	const entries = official.map((r) => {
		const hanzi = displayHanzi(r.simplified);
		const pinyin = displayPinyin(r.officialPinyin, r.pinyin);
		const pos = (r.pos || '').split('/').filter(Boolean);
		const traditional = variantHanzi(r.traditional || '')[0] || '';
		return {
			ids: [r.id],
			id: r.id,
			hanzi,
			traditional: traditional && traditional !== hanzi ? traditional : undefined,
			pinyin,
			meanings: OVERRIDES[r.id] ?? glosses(r.cedictDefs, pos),
			pos,
			level: r.level
		};
	});

	// Two official rows with the same hanzi AND the same pinyin at the same level are
	// indistinguishable on a card — a multiple-choice question containing both has two
	// right answers. Collapse those (and only those); every other official row ships as
	// its own entry so the level a word belongs to stays the level the standard gives it.
	const byKey = new Map();
	for (const e of entries) {
		const key = `${e.level} ${e.hanzi} ${e.pinyin.toLowerCase()}`;
		const prev = byKey.get(key);
		if (!prev) {
			byKey.set(key, e);
			continue;
		}
		prev.ids.push(...e.ids);
		if (!OVERRIDES[prev.id]) {
			for (const m of e.meanings) {
				if (prev.meanings.length < 3 && !prev.meanings.some((x) => overlaps(x, m))) {
					prev.meanings.push(m);
				}
			}
		}
		for (const p of e.pos) if (!prev.pos.includes(p)) prev.pos.push(p);
	}

	return [...byKey.values()];
}

/* ----------------------------------------------------------------- verify */

/**
 * Every one of the 4,316 official rows must be traceable to exactly one shipped entry,
 * with hanzi, pinyin and level unchanged from the standard.
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
	}

	// Within a level, two words must never share a primary meaning: the quiz would have
	// two correct answers.
	const byLevel = new Map();
	for (const w of shipped) {
		const m = (byLevel.get(w.level) ?? new Map()).set(
			w.meanings[0]?.toLowerCase(),
			(byLevel.get(w.level)?.get(w.meanings[0]?.toLowerCase()) ?? []).concat(w)
		);
		byLevel.set(w.level, m);
	}
	for (const [level, m] of byLevel) {
		for (const [meaning, ws] of m) {
			if (ws.length > 1) {
				problems.push(
					`L${level}: "${meaning}" is the primary meaning of ${ws.map((w) => w.hanzi).join(' / ')}`
				);
			}
		}
	}

	return problems;
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

const official = readOfficial();
const built = build(official);
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
	const suspicious = shipped.filter((w) =>
		w.meanings.some((m) => /\b(used|indicat|denot|literary|dialect|bound form|pr\.)\b/i.test(m))
	);
	console.error(`single-meaning entries: ${shipped.filter((w) => w.meanings.length === 1).length}`);
	console.error(`longest glosses:`);
	for (const { m, w } of [...shipped]
		.flatMap((w) => w.meanings.map((m) => ({ m, w })))
		.sort((a, b) => b.m.length - a.m.length)
		.slice(0, 20))
		console.error(`  ${m.length}  ${tag(w)}`);
	console.error(`glosses that still read like a dictionary: ${suspicious.length}`);
	for (const w of suspicious.slice(0, 40)) console.error(`  ${tag(w)}`);
}

if (problems.length) {
	console.error(`\n${problems.length} problem(s):`);
	for (const p of problems.slice(0, 200)) console.error('  ' + p);
	if (problems.length > 200) console.error(`  … ${problems.length - 200} more`);
}

const summary = {
	officialRows: official.length,
	shippedEntries: shipped.length,
	merged: official.length - shipped.length,
	perLevel,
	overrides: Object.keys(OVERRIDES).length,
	problems: problems.length
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

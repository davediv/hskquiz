import { describe, expect, it } from 'vitest';
import type { Direction, Word } from '../types';
import {
	CHOICE_COUNT,
	isAmbiguousWith,
	isUsable,
	makePool,
	pickDistractors,
	senseSet,
	sharesSense
} from './distractors';
import { mulberry32 } from './rng';
import { makeLevel } from './test-fixtures';

const DIRECTIONS: Direction[] = ['hanzi-to-meaning', 'meaning-to-hanzi'];

function word(over: Partial<Word> & Pick<Word, 'id'>): Word {
	return {
		hanzi: '字',
		pinyin: 'zì',
		syllables: [{ py: 'zì', tone: 4 }],
		meanings: ['thing'],
		pos: ['N'],
		level: 1,
		...over
	};
}

describe('senseSet', () => {
	it('splits a semicolon-joined gloss into separate senses', () => {
		expect([...senseSet(word({ id: 'a', meanings: ['to love; to be fond of; to like'] }))]).toEqual(
			['love', 'be fond of', 'like']
		);
	});

	it('strips articles, case, parentheticals and punctuation so senses compare', () => {
		const a = senseSet(word({ id: 'a', meanings: ['A Quilt.'] }));
		const b = senseSet(word({ id: 'b', meanings: ['quilt (bedding)'] }));
		expect([...a]).toEqual([...b]);
	});

	it('is empty for an entry with no gloss', () => {
		expect(senseSet(word({ id: 'a', meanings: [] })).size).toBe(0);
	});
});

describe('sharesSense', () => {
	it('catches synonyms that only overlap on a secondary sense', () => {
		const a = word({ id: 'a', hanzi: '帮', meanings: ['to help'] });
		const b = word({ id: 'b', hanzi: '帮忙', meanings: ['to lend a hand; to help'] });
		expect(sharesSense(a, b)).toBe(true);
	});

	it('does not fire on unrelated glosses', () => {
		const a = word({ id: 'a', hanzi: '猫', meanings: ['cat'] });
		const b = word({ id: 'b', hanzi: '狗', meanings: ['dog'] });
		expect(sharesSense(a, b)).toBe(false);
	});
});

describe('isUsable', () => {
	it('rejects entries the app could not render on a card', () => {
		expect(isUsable(word({ id: 'a' }))).toBe(true);
		expect(isUsable(word({ id: 'b', meanings: [] }))).toBe(false);
		expect(isUsable(word({ id: 'c', meanings: [''] }))).toBe(false);
		expect(isUsable(word({ id: 'd', hanzi: '' }))).toBe(false);
	});
});

describe('isAmbiguousWith', () => {
	const answer = word({ id: 'a', hanzi: '打', meanings: ['to hit'] });
	const homograph = word({ id: 'b', hanzi: '打', meanings: ['dozen'] });
	const synonym = word({ id: 'c', hanzi: '击', meanings: ['to strike; to hit'] });
	const clean = word({ id: 'd', hanzi: '猫', meanings: ['cat'] });
	const pool = makePool([answer, homograph, synonym, clean]);

	it('rejects a homograph — the prompt hanzi would have two right answers', () => {
		expect(isAmbiguousWith(pool, answer, homograph)).toBe(true);
	});

	it('rejects a synonym — the prompt gloss would have two right answers', () => {
		expect(isAmbiguousWith(pool, answer, synonym)).toBe(true);
	});

	it('accepts an unrelated word, and always rejects the answer itself', () => {
		expect(isAmbiguousWith(pool, answer, clean)).toBe(false);
		expect(isAmbiguousWith(pool, answer, answer)).toBe(true);
	});

	// Real, at HSK 3: 高速 ships ["high speed","expressway"] and 快速 ["high-speed","rapid"].
	// `senseSet` keeps the hyphen, so the two do not intersect and both could sit on one card —
	// prompt "high-speed · rapid", with "high speed" among the wrong answers.
	it('reads a hyphen as a space, so "high-speed" and "high speed" are one sense', () => {
		const hyphened = word({ id: 'e', hanzi: '快速', meanings: ['high-speed', 'rapid'] });
		const spaced = word({ id: 'f', hanzi: '高速', meanings: ['high speed', 'expressway'] });
		const folded = makePool([hyphened, spaced]);
		expect(isAmbiguousWith(folded, hyphened, spaced)).toBe(true);
		expect(isAmbiguousWith(folded, spaced, hyphened)).toBe(true);
		// The raw sense sets still differ — this is the picker fixing it, not the data.
		expect(sharesSense(hyphened, spaced)).toBe(false);
	});
});

describe('pickDistractors', () => {
	const words = makeLevel(1, 160);
	const pool = makePool(words);
	const rng = mulberry32(4242);

	it('drops entries with no gloss from the pool entirely', () => {
		expect(words.length).toBeGreaterThan(pool.words.length);
		expect(pool.words.every(isUsable)).toBe(true);
	});

	it('never produces a choice set with two defensible answers', () => {
		for (const direction of DIRECTIONS) {
			for (const answer of pool.words) {
				const picks = pickDistractors(pool, answer, direction, CHOICE_COUNT - 1, rng);
				expect(picks).toHaveLength(CHOICE_COUNT - 1);
				for (const pick of picks) {
					expect(pick.id).not.toBe(answer.id);
					expect(pick.hanzi).not.toBe(answer.hanzi);
					expect(sharesSense(pick, answer)).toBe(false);
				}
				// …and the wrong answers must not collide with each other either.
				for (let i = 0; i < picks.length; i++) {
					for (let j = i + 1; j < picks.length; j++) {
						expect(picks[i].hanzi).not.toBe(picks[j].hanzi);
						expect(sharesSense(picks[i], picks[j])).toBe(false);
					}
				}
			}
		}
	});

	it('honours the exclusion list', () => {
		const answer = pool.words[0];
		const banned = new Set(pool.words.slice(1, 40).map((w) => w.id));
		const picks = pickDistractors(pool, answer, 'hanzi-to-meaning', 3, rng, banned);
		expect(picks.length).toBeGreaterThan(0);
		expect(picks.some((p) => banned.has(p.id))).toBe(false);
	});

	it('prefers same part of speech when the answer has one', () => {
		let matched = 0;
		let total = 0;
		for (const answer of pool.words) {
			if (answer.pos.length === 0) continue;
			for (const pick of pickDistractors(pool, answer, 'hanzi-to-meaning', 3, rng)) {
				total++;
				if (pick.pos.some((p) => answer.pos.includes(p))) matched++;
			}
		}
		expect(total).toBeGreaterThan(50);
		expect(matched / total).toBeGreaterThan(0.9);
	});

	it('prefers similar headword length when the headwords are what is on screen', () => {
		const len = (w: Word) => [...w.hanzi].length;
		let close = 0;
		let total = 0;
		for (const answer of pool.words) {
			for (const pick of pickDistractors(pool, answer, 'meaning-to-hanzi', 3, rng)) {
				total++;
				if (Math.abs(len(pick) - len(answer)) <= 1) close++;
			}
		}
		expect(total).toBeGreaterThan(50);
		expect(close / total).toBeGreaterThan(0.95);
	});

	it('prefers similar gloss length when the glosses are what is on screen', () => {
		const bucket = (w: Word) => {
			const n = (w.meanings[0] ?? '').split(/\s+/).filter(Boolean).length;
			return n <= 2 ? 0 : n <= 5 ? 1 : 2;
		};
		let close = 0;
		let total = 0;
		for (const answer of pool.words) {
			for (const pick of pickDistractors(pool, answer, 'hanzi-to-meaning', 3, rng)) {
				total++;
				if (bucket(pick) === bucket(answer)) close++;
			}
		}
		expect(total).toBeGreaterThan(50);
		expect(close / total).toBeGreaterThan(0.9);
	});

	it('varies the wrong answers instead of showing the same three every time', () => {
		// The fixture is deliberately uniform, so its best-scoring bucket is small and only a
		// handful of combinations exist. `real-data.spec.ts` makes the stronger claim against
		// the shipped list, where every seed yields a different set.
		const answer = pool.words[3];
		const seen = new Set<string>();
		for (let seed = 0; seed < 25; seed++) {
			const picks = pickDistractors(pool, answer, 'hanzi-to-meaning', 3, mulberry32(seed));
			seen.add(picks.map((p) => p.id).join('|'));
		}
		expect(seen.size).toBeGreaterThan(3);
	});

	it('returns what it can rather than throwing when the level is tiny', () => {
		const tiny = makePool([
			word({ id: 'a', hanzi: '猫', meanings: ['cat'] }),
			word({ id: 'b', hanzi: '狗', meanings: ['dog'] })
		]);
		expect(pickDistractors(tiny, tiny.words[0], 'hanzi-to-meaning', 3, rng)).toHaveLength(1);
	});
});

describe('pickDistractors — register', () => {
	// 第 "makes 'one' into 'first'" against "it is raining", "half a year", "please come in":
	// the answer is the only button describing a grammatical function, so the card is free
	// without reading the hanzi. Nothing else in `plausibility` can see it — 第 is the only
	// `Prefix` in HSK 1, so the part-of-speech signal has nothing to match on.
	const grammar = [
		word({ id: 'g0', hanzi: '第', meanings: ["makes 'one' into 'first'"], pos: ['Prefix'] }),
		word({ id: 'g1', hanzi: '吗', meanings: ['makes a sentence a yes-no question'], pos: ['Aux'] }),
		word({ id: 'g2', hanzi: '本', meanings: ['measure word: books'], pos: ['M'] }),
		word({ id: 'g3', hanzi: '别', meanings: ["don't ...!"], pos: ['Adv'] }),
		word({ id: 'g4', hanzi: '着', meanings: ['shows a continuing state'], pos: ['Aux'] })
	];
	const ordinary = [
		word({ id: 'o0', hanzi: '下雨', meanings: ['it is raining'], pos: ['V'] }),
		word({ id: 'o1', hanzi: '半年', meanings: ['half a year'], pos: ['N'] }),
		word({ id: 'o2', hanzi: '请进', meanings: ['please come in'], pos: ['V'] }),
		word({ id: 'o3', hanzi: '天气', meanings: ['weather'], pos: ['N'] }),
		word({ id: 'o4', hanzi: '苹果', meanings: ['apple'], pos: ['N'] })
	];
	const pool = makePool([...grammar, ...ordinary]);
	const isGrammar = (w: Word) => w.id.startsWith('g');

	it('answers a grammar gloss with grammar glosses, on every seed', () => {
		for (let seed = 0; seed < 30; seed++) {
			const picks = pickDistractors(pool, grammar[0], 'hanzi-to-meaning', 3, mulberry32(seed));
			expect(picks).toHaveLength(3);
			expect(picks.every(isGrammar)).toBe(true);
		}
	});

	it('keeps a grammar gloss off an ordinary card, where it is an obvious throwaway', () => {
		for (let seed = 0; seed < 30; seed++) {
			const picks = pickDistractors(pool, ordinary[0], 'hanzi-to-meaning', 3, mulberry32(seed));
			expect(picks.some(isGrammar)).toBe(false);
		}
	});

	it('does not apply in meaning-to-hanzi, where the buttons hold characters', () => {
		// A pool built so register is the *only* thing separating the candidates: one hanzi
		// each, one part of speech, five-word non-verbal glosses throughout. In hanzi-to-meaning
		// that makes the three grammar glosses win outright; in meaning-to-hanzi the glosses are
		// the prompt rather than the buttons, nothing distinguishes the five, and the shuffle
		// reaches the ordinary ones. Asserted as "not always the grammar three", which is what
		// the absence of a partition looks like.
		const flat = makePool([
			word({ id: 'f0', hanzi: '甲', meanings: ['marks the first of two'], pos: ['Adv'] }),
			word({ id: 'g5', hanzi: '乙', meanings: ['shows a continuing state of'], pos: ['Adv'] }),
			word({ id: 'g6', hanzi: '丙', meanings: ['makes a sentence a question'], pos: ['Adv'] }),
			word({ id: 'g7', hanzi: '丁', meanings: ['marks a change of situation'], pos: ['Adv'] }),
			word({ id: 'f1', hanzi: '戊', meanings: ['very early in the morning'], pos: ['Adv'] }),
			word({ id: 'f2', hanzi: '己', meanings: ['the road outside my house'], pos: ['Adv'] })
		]);
		const answer = flat.words[0];
		let allGrammar = 0;
		let mixed = 0;
		for (let seed = 0; seed < 30; seed++) {
			const picks = pickDistractors(flat, answer, 'hanzi-to-meaning', 3, mulberry32(seed));
			if (picks.every(isGrammar)) allGrammar++;
			if (!pickDistractors(flat, answer, 'meaning-to-hanzi', 3, mulberry32(seed)).every(isGrammar))
				mixed++;
		}
		expect(allGrammar).toBe(30);
		expect(mixed).toBeGreaterThan(0);
	});

	it('degrades to ordinary candidates rather than shortening the card', () => {
		const thin = makePool([grammar[0], grammar[1], ...ordinary]);
		const picks = pickDistractors(thin, grammar[0], 'hanzi-to-meaning', 3, mulberry32(9));
		expect(picks).toHaveLength(3);
	});
});

describe('isAmbiguousWith — the modal auxiliaries', () => {
	// 会 "to know how to" and 能 "to be able to" are both *can*; loop 4 put 能's gloss on a 会
	// card as a wrong answer that was not wrong. `sharesSense` cannot see it — the two strings
	// have no word in common — so `comparableSenses` folds the closed modal class onto one key.
	const hui = word({ id: 'h', hanzi: '会', meanings: ['to know how to', 'will or is likely to'] });
	const neng = word({ id: 'n', hanzi: '能', meanings: ['to be able to', 'to be allowed to'] });
	const keyi = word({ id: 'k', hanzi: '可以', meanings: ['may', 'to be allowed to'] });
	const bixu = word({ id: 'b', hanzi: '必须', meanings: ['must', 'have to'] });
	const yinggai = word({ id: 'y', hanzi: '应该', meanings: ['should'] });
	const cat = word({ id: 'c', hanzi: '猫', meanings: ['cat'] });
	const pool = makePool([hui, neng, keyi, bixu, yinggai, cat]);

	it('will not put two spellings of "can" on one card', () => {
		expect(isAmbiguousWith(pool, hui, neng)).toBe(true);
		expect(isAmbiguousWith(pool, neng, keyi)).toBe(true);
	});

	it('will not put two spellings of "must" on one card', () => {
		expect(isAmbiguousWith(pool, bixu, yinggai)).toBe(true);
	});

	it('keeps the two families apart, and leaves ordinary words alone', () => {
		expect(isAmbiguousWith(pool, neng, bixu)).toBe(false);
		expect(isAmbiguousWith(pool, hui, cat)).toBe(false);
		expect(isAmbiguousWith(pool, bixu, cat)).toBe(false);
	});

	it('folds a whole sense only, never a word inside a longer gloss', () => {
		const tin = word({ id: 't', hanzi: '罐头', meanings: ['a tin or can'] });
		const carry = word({ id: 'r', hanzi: '搬', meanings: ['to move something you can lift'] });
		const wide = makePool([tin, carry, neng]);
		expect(isAmbiguousWith(wide, carry, neng)).toBe(false);
	});
});

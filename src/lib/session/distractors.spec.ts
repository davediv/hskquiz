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

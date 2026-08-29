/**
 * The sense normaliser is the single point where the build's gates and the quiz's distractor
 * guard agree on what "the same answer" means, so it is tested against the exact glosses that
 * got past loop 2 — and against the shapes that must *not* be split, because a splitter that
 * invents senses is how a card ends up excluding a perfectly good distractor for no reason.
 */
import { describe, expect, it } from 'vitest';
import {
	buttonKeys,
	intersects,
	primarySenses,
	qualifierOf,
	senseKey,
	senseKeys,
	senseSet,
	sharesSense,
	singularise,
	splitSenses,
	withQualifiers
} from './senses';

describe('splitSenses', () => {
	it('splits the joiners CC-CEDICT uses', () => {
		expect(splitSenses('to love; to be fond of')).toEqual(['love', 'be fond of']);
		expect(splitSenses('shore/coast')).toEqual(['shore', 'coast']);
	});

	it('splits the house style’s own "or"', () => {
		// The whole loop-3 gap: 衬衫 ships "shirt", 衬衣 ships "a shirt or blouse", and until
		// this line existed nothing could tell that both answer to the prompt "shirt".
		expect(splitSenses('a shirt or blouse')).toEqual(['shirt', 'blouse']);
		expect(splitSenses('a restaurant or dining hall')).toEqual(['restaurant', 'dining hall']);
		expect(splitSenses('to adopt or carry out')).toEqual(['adopt', 'carry out']);
		expect(splitSenses('rat or mouse')).toEqual(['rat', 'mouse']);
	});

	it('leaves "or" alone when it coordinates objects, not senses', () => {
		// 戴 "to wear glasses or a hat" lists two things one verb takes. Splitting it would
		// hand 戴 the sense "hat" and put it in permanent conflict with 帽子.
		expect(splitSenses('to wear glasses or a hat')).toEqual(['wear glasses or a hat']);
		expect(splitSenses('to close a book or the eyes')).toEqual(['close a book or the eye']);
		expect(splitSenses('to pass a test or a vote')).toEqual(['pass a test or a vote']);
	});

	it('leaves fixed phrases that merely contain "or" intact', () => {
		expect(splitSenses('whether or not')).toEqual(['whether or not']);
		expect(splitSenses('more or less')).toEqual(['more or less']);
		expect(splitSenses('that amount or more')).toEqual(['that amount or more']);
	});

	it('folds contractions, so an apostrophe cannot hide a collision', () => {
		expect(splitSenses("it's just that")).toEqual(splitSenses('it is just that'));
		expect(splitSenses("I'm afraid that")).toEqual(splitSenses('I am afraid that'));
		expect(splitSenses("can't be helped")).toEqual(['cannot be helped']);
	});

	it('keeps a possessive out of the contraction table', () => {
		// 该 ships "to be one's turn". Expanding that `'s` would read "one is turn".
		expect(splitSenses("to be one's turn")).toEqual(['be ones turn']);
	});

	it('strips the leading article and the verbal "to"', () => {
		expect(splitSenses('a crowd')).toEqual(splitSenses('crowd'));
		expect(splitSenses('to run')).toEqual(['run']);
	});

	it('drops parentheticals before it splits, not after', () => {
		expect(splitSenses('bao (a steamed bun; stuffed)')).toEqual(['bao']);
	});
});

describe('singularise', () => {
	it('folds a regular plural head word', () => {
		expect(splitSenses('emotions')).toEqual(splitSenses('emotion'));
		expect(splitSenses('strong points')).toEqual(splitSenses('strong point'));
		expect(['boxes', 'babies', 'houses', 'photos', 'ideas', 'potatoes'].map(singularise)).toEqual([
			'box',
			'baby',
			'house',
			'photo',
			'idea',
			'potato'
		]);
	});

	it('leaves words whose plural is a different word alone', () => {
		expect(['glasses', 'goods', 'news', 'series', 'gas', 'physics'].map(singularise)).toEqual([
			'glasses',
			'goods',
			'news',
			'series',
			'gas',
			'physics'
		]);
	});

	it('knows the irregulars whose singular is on another card', () => {
		expect(['children', 'mice', 'buses', 'lives'].map(singularise)).toEqual([
			'child',
			'mouse',
			'bus',
			'life'
		]);
	});

	it('folds only the head word, so the rest of a phrase is untouched', () => {
		expect(splitSenses('measure word: flat things')).toEqual(['measure word flat thing']);
	});
});

describe('sense sets', () => {
	it('collects every sense a word answers to', () => {
		expect([...senseSet({ meanings: ['a shirt or blouse', 'underclothes'] })]).toEqual([
			'shirt',
			'blouse',
			'underclothes'
		]);
	});

	it('survives a word with no meanings at all', () => {
		expect([...senseKeys(undefined)]).toEqual([]);
		expect([...senseSet({})]).toEqual([]);
	});

	it('reads only the primary gloss for primarySenses', () => {
		expect([...primarySenses({ meanings: ['zone', 'a belt of terrain'] })]).toEqual(['zone']);
	});

	it('finds two words that would both be right for one prompt', () => {
		expect(sharesSense({ meanings: ['shirt'] }, { meanings: ['a shirt or blouse'] })).toBe(true);
		expect(sharesSense({ meanings: ['shore', 'coast'] }, { meanings: ['a riverbank'] })).toBe(
			false
		);
	});

	it('keys a set independently of the order it was written in', () => {
		expect(senseKey(senseKeys(['calm', 'quiet']))).toBe(senseKey(senseKeys(['quiet', 'calm'])));
	});

	it('walks the smaller set when intersecting', () => {
		expect(intersects(new Set(['a']), new Set(['a', 'b', 'c']))).toBe(true);
		expect(intersects(new Set(['a', 'b', 'c']), new Set(['z']))).toBe(false);
	});
});

describe('qualifiers', () => {
	// The two questions the app asks about one gloss. "Would both be right?" must ignore the
	// parenthetical, or the distractor guard stops seeing a collision that is still real and
	// starts offering 听到 as a wrong answer for 听见. "Do the two buttons read the same?" must
	// not, or a resolved pair looks like an unresolved one to the uniqueness gate.
	it('ignores the qualifier when asking what a gloss answers to', () => {
		expect(splitSenses('shirt (dress shirt)')).toEqual(['shirt']);
		expect(splitSenses('to hear (and catch it)')).toEqual(['hear']);
		expect(
			sharesSense({ meanings: ['shirt (dress shirt)'] }, { meanings: ['shirt (general word)'] })
		).toBe(true);
	});

	it('reads the qualifier when asking what the button says', () => {
		expect(withQualifiers('shirt (dress shirt)')).toBe('shirt  dress shirt ');
		expect([...buttonKeys(['shirt (dress shirt)'])]).toEqual(['shirt dress shirt']);
		expect(senseKey(buttonKeys(['shirt (dress shirt)']))).not.toBe(
			senseKey(buttonKeys(['shirt (general word)']))
		);
	});

	it('normalises the tag itself, and reports none when there is none', () => {
		expect(qualifierOf("should (it is one's turn)")).toBe('it is ones turn');
		expect(qualifierOf('should (ought to)')).toBe('ought to');
		expect(qualifierOf('shirt')).toBe('');
	});
});

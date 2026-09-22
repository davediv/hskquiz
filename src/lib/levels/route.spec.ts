import { describe, expect, it } from 'vitest';
import { readRoute } from '$lib/components/shell/route';
import { parseLevelSegment } from './route';

describe('level route identity', () => {
	it('accepts only the canonical HSK 1–5 segments', () => {
		for (const level of [1, 2, 3, 4, 5] as const) {
			expect(parseLevelSegment(String(level))).toBe(level);
		}
		for (const alias of ['01', '1.0', ' 1', '1 ', '0', '6', '', 'nope']) {
			expect(parseLevelSegment(alias)).toBeNull();
		}
	});

	it('uses level chrome only on complete route paths', () => {
		expect(readRoute('/quiz/1').mode).toBe('quiz');
		expect(readRoute('/browse/5').mode).toBe('browse');
		expect(readRoute('/quiz/1/extra').mode).toBe('other');
		expect(readRoute('/browse/01').mode).toBe('other');
		expect(readRoute('/app/quiz/1', '/app').mode).toBe('quiz');
	});
});

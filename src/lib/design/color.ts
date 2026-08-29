/**
 * Colour measurement for the design system's own contract.
 *
 * `layout.css` makes two claims about every colour it declares — that text clears 4.5:1 on the
 * surfaces it is allowed on, and that no tone hue is a colour some other token already holds.
 * Loop 2 shipped both claims as prose, and both were false: `--hq-tone-1` was byte-identical to
 * `--hq-accent` and `--hq-tone-0` to `--hq-ink-subtle`, so a fifth of the corpus printed in the
 * red that means "wrong". Prose cannot fail a test run. This module exists so `palette.spec.ts`
 * can compute the claims off the stylesheet instead.
 *
 * Nothing at runtime imports this — the app reads `var(--color-*)` and never a hex — so it is
 * deliberately absent from `index.ts`.
 */

/** Three ordered components — sRGB 0–255 out of `parseHex`, L*a*b* out of `lab`. */
export type Triple = readonly [number, number, number];

/** `#rgb` or `#rrggbb`, case-insensitive. Throws rather than guessing at anything else. */
export function parseHex(hex: string): Triple {
	const body = hex.trim().replace(/^#/u, '');
	const full = body.length === 3 ? [...body].map((c) => c + c).join('') : body;
	if (!/^[0-9a-f]{6}$/iu.test(full)) throw new Error(`not a hex colour: ${hex}`);
	return [
		Number.parseInt(full.slice(0, 2), 16),
		Number.parseInt(full.slice(2, 4), 16),
		Number.parseInt(full.slice(4, 6), 16)
	];
}

/** sRGB transfer function, undone — WCAG 2 and CIE both want linear light. */
function linear(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The same colour in linear light. */
function linearRgb(hex: string): Triple {
	const [r, g, b] = parseHex(hex);
	return [linear(r), linear(g), linear(b)];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
	const [r, g, b] = linearRgb(hex);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1–21. Order of the arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
	const one = luminance(a);
	const two = luminance(b);
	const hi = Math.max(one, two);
	const lo = Math.min(one, two);
	return (hi + 0.05) / (lo + 0.05);
}

/** CIE L*a*b* under D65, the white point sRGB is defined against. */
export function lab(hex: string): Triple {
	const [r, g, b] = linearRgb(hex);
	const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
	const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
	const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
	const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
	const [fx, fy, fz] = [f(x), f(y), f(z)];
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const RAD = Math.PI / 180;

/**
 * CIEDE2000 colour difference — how far apart two colours look, rather than how far apart their
 * numbers are. Roughly: 1 is the just-noticeable step, ~5 is "a different shade", ~10+ is "a
 * different colour" to someone not comparing them side by side. Used instead of a plain hex
 * comparison because `#c8102e` and `#c9112f` are different tokens and the same colour.
 */
export function deltaE00(a: string, b: string): number {
	const [l1, a1, b1] = lab(a);
	const [l2, a2, b2] = lab(b);

	const c1 = Math.hypot(a1, b1);
	const c2 = Math.hypot(a2, b2);
	const cBar = (c1 + c2) / 2;
	const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));

	const ap1 = (1 + g) * a1;
	const ap2 = (1 + g) * a2;
	const cp1 = Math.hypot(ap1, b1);
	const cp2 = Math.hypot(ap2, b2);

	const hue = (im: number, re: number): number => {
		if (im === 0 && re === 0) return 0;
		const deg = Math.atan2(im, re) / RAD;
		return deg < 0 ? deg + 360 : deg;
	};
	const hp1 = hue(b1, ap1);
	const hp2 = hue(b2, ap2);

	const dL = l2 - l1;
	const dC = cp2 - cp1;

	let dh = 0;
	if (cp1 * cp2 !== 0) {
		dh = hp2 - hp1;
		if (dh > 180) dh -= 360;
		else if (dh < -180) dh += 360;
	}
	const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * RAD);

	const lBar = (l1 + l2) / 2;
	const cpBar = (cp1 + cp2) / 2;

	let hBar = hp1 + hp2;
	if (cp1 * cp2 !== 0) {
		if (Math.abs(hp1 - hp2) > 180) hBar += hBar < 360 ? 360 : -360;
		hBar /= 2;
	}

	const t =
		1 -
		0.17 * Math.cos((hBar - 30) * RAD) +
		0.24 * Math.cos(2 * hBar * RAD) +
		0.32 * Math.cos((3 * hBar + 6) * RAD) -
		0.2 * Math.cos((4 * hBar - 63) * RAD);

	const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
	const sC = 1 + 0.045 * cpBar;
	const sH = 1 + 0.015 * cpBar * t;

	const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
	const rC = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7));
	const rT = -Math.sin(2 * dTheta * RAD) * rC;

	return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

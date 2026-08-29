#!/usr/bin/env node
// Screenshot helper. Usage:
//   node tools/shot.mjs <url> <outPathPrefix> [--viewports=mobile,desktop] [--wait=ms] [--full] [--click=sel] [--seq=sel,sel,...]
// Writes <prefix>-mobile.png / <prefix>-desktop.png. Prints JSON: paths, console errors, title.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
const prefix = args[1];
if (!url || !prefix) {
	console.error('usage: node tools/shot.mjs <url> <outPrefix> [flags]');
	process.exit(2);
}
const flag = (n, d) => {
	const a = args.find((x) => x.startsWith(`--${n}=`));
	return a ? a.slice(n.length + 3) : d;
};
const has = (n) => args.includes(`--${n}`);

const VP = {
	mobile: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	desktop: { width: 1440, height: 900, deviceScaleFactor: 2 }
};
const want = flag('viewports', 'mobile,desktop')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const waitMs = Number(flag('wait', '1200'));
const clicks = (flag('seq', flag('click', '')) || '').split(',').filter(Boolean);

mkdirSync(dirname(prefix), { recursive: true });
const browser = await chromium.launch();
const out = { url, shots: {}, consoleErrors: [], pageErrors: [], title: null };

for (const name of want) {
	const ctx = await browser.newContext({ ...VP[name], colorScheme: 'light' });
	const page = await ctx.newPage();
	page.on('console', (m) => {
		if (m.type() === 'error') out.consoleErrors.push(`[${name}] ${m.text()}`.slice(0, 400));
	});
	page.on('pageerror', (e) => out.pageErrors.push(`[${name}] ${String(e).slice(0, 400)}`));
	try {
		await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
	} catch {
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
	}
	await page.waitForTimeout(waitMs);
	for (const sel of clicks) {
		try {
			await page.locator(sel).first().click({ timeout: 6000 });
			await page.waitForTimeout(500);
		} catch {
			out.consoleErrors.push(`[${name}] click failed: ${sel}`);
		}
	}
	out.title = await page.title().catch(() => null);
	const p = `${prefix}-${name}.png`;
	await page.screenshot({ path: p, fullPage: has('full') });
	out.shots[name] = p;
	await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA_DIR = join(ROOT, 'data');
const DATA_FILE = join(DATA_DIR, 'characters.json');

const MIN_MAJOR = 15;
const REGISTRY_URL = 'https://registry.npmjs.org/ecmarkup';
const UCD = 'https://www.unicode.org/Public/UCD/latest/ucd';

// Mirrors ecmarkup's formatter filter: whitespace, default-ignorable code points
// (variation selectors, ZWJ, …), marks, and controls aren't standalone copyable
// characters, so they're excluded even when a tracked spec's source contains them.
const EXCLUDE = /\p{White_Space}|\p{Default_Ignorable_Code_Point}|\p{M}|\p{C}/u;

interface Spec {
	id: string;
	label: string;
	kind: 'single' | 'multi';
	url?: string;
	indexUrl?: string;
	baseUrl?: string;
}

interface CharRecord {
	char: string;
	cp: number[];
	hex: string;
	name: string;
	block: string;
	entities: string[];
	producible: boolean;
	usage: Record<string, number>;
	inLatest: boolean;
	firstSeen: string;
	lastSeen: string;
	versions: string[];
}

const SPECS: Spec[] = [
	{
		id: 'ecma262',
		label: 'ECMA-262',
		kind: 'single',
		url: 'https://raw.githubusercontent.com/tc39/ecma262/main/spec.html',
	},
	{
		id: 'ecma402',
		label: 'ECMA-402',
		kind: 'multi',
		indexUrl: 'https://raw.githubusercontent.com/tc39/ecma402/main/spec/index.html',
		baseUrl: 'https://raw.githubusercontent.com/tc39/ecma402/main/spec/',
	},
	{
		id: 'ecma404',
		label: 'ECMA-404',
		kind: 'single',
		url: 'https://raw.githubusercontent.com/tc39/ecma404/main/spec.html',
	},
	{
		id: 'ecma426',
		label: 'ECMA-426',
		kind: 'single',
		url: 'https://raw.githubusercontent.com/tc39/source-map/main/spec.emu',
	},
];

function log(...a: unknown[]): void {
	console.log('[collect]', ...a);
}

async function fetchText(url: string, label: string): Promise<string | null> {
	try {
		const res = await fetch(url, { headers: { 'user-agent': 'speccy-collect (https://github.com/tc39/speccy)' } });
		if (!res.ok) {
			log(`! ${label}: HTTP ${res.status} (${url}) - skipping`);
			return null;
		}
		return await res.text();
	} catch (e) {
		log(`! ${label}: ${e instanceof Error ? e.message : String(e)} - skipping`);
		return null;
	}
}

async function fetchJSON(url: string, label: string): Promise<unknown> {
	const t = await fetchText(url, label);
	if (t == null) { return null; }
	try { return JSON.parse(t); } catch { log(`! ${label}: bad JSON`); return null; }
}

async function fetchSpecSource(spec: Spec): Promise<string | null> {
	if (spec.kind === 'single') { return fetchText(spec.url!, spec.label); }
	const index = await fetchText(spec.indexUrl!, `${spec.label} index`);
	if (index == null) { return null; }
	const hrefs = [...index.matchAll(/<emu-import\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
	const parts = await Promise.all(hrefs.map((href) => fetchText(new URL(href, spec.baseUrl).href, `${spec.label}:${href}`)));
	if (parts.some((p) => p == null)) { return null; }
	return [index, ...parts].join('\n');
}

function countNonAscii(text: string): Map<string, number> {
	const counts = new Map<string, number>();
	Array.from(text).forEach((ch) => {
		if (ch.codePointAt(0)! > 0x7f) { counts.set(ch, (counts.get(ch) || 0) + 1); }
	});
	return counts;
}

function cmpVer(a: string, b: string): number {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	return [0, 1, 2].reduce((acc, i) => acc || (pa[i] || 0) - (pb[i] || 0), 0);
}

function minVer(a: string | undefined, b: string | undefined): string | undefined {
	return !a ? b : !b ? a : cmpVer(a, b) <= 0 ? a : b;
}

function maxVer(a: string | undefined, b: string | undefined): string | undefined {
	return !a ? b : !b ? a : cmpVer(a, b) >= 0 ? a : b;
}

function cpsOf(s: string): number[] {
	return Array.from(s).map((c) => c.codePointAt(0)!);
}

function hex(n: number): string {
	return n.toString(16).toUpperCase().padStart(4, '0');
}

function produciblesFromEntities(entities: Record<string, string | null>): Map<string, Set<string>> {
	const byChar = new Map<string, Set<string>>();
	function ensure(ch: string): Set<string> {
		const found = byChar.get(ch);
		if (found) { return found; }
		const s = new Set<string>();
		byChar.set(ch, s);
		return s;
	}
	Object.entries(entities).forEach(([name, val]) => {
		if (val == null) { return; }
		if (name.endsWith(';')) { ensure(val).add(name); } else { ensure(val); }
	});
	Object.entries(entities).forEach(([name, val]) => {
		if (val == null) { return; }
		const s = ensure(val);
		if (s.size === 0) { s.add(name.endsWith(';') ? name : `${name};`); }
	});
	return byChar;
}

function entitiesFileForLocalEcmarkup(): { version: string; file: string } {
	const pkg = require.resolve('ecmarkup/package.json');
	const file = join(dirname(pkg), 'entities-processed.json');
	return { version: require(pkg).version, file };
}

const FALLBACK_BLOCKS: [number, number, string][] = [
	[0x0000, 0x007f, 'Basic Latin'],
	[0x0080, 0x00ff, 'Latin-1 Supplement'],
	[0x0100, 0x017f, 'Latin Extended-A'],
	[0x0180, 0x024f, 'Latin Extended-B'],
	[0x0250, 0x02af, 'IPA Extensions'],
	[0x02b0, 0x02ff, 'Spacing Modifier Letters'],
	[0x0370, 0x03ff, 'Greek and Coptic'],
	[0x0400, 0x04ff, 'Cyrillic'],
	[0x1e00, 0x1eff, 'Latin Extended Additional'],
	[0x2000, 0x206f, 'General Punctuation'],
	[0x2070, 0x209f, 'Superscripts and Subscripts'],
	[0x20a0, 0x20cf, 'Currency Symbols'],
	[0x2100, 0x214f, 'Letterlike Symbols'],
	[0x2150, 0x218f, 'Number Forms'],
	[0x2190, 0x21ff, 'Arrows'],
	[0x2200, 0x22ff, 'Mathematical Operators'],
	[0x2300, 0x23ff, 'Miscellaneous Technical'],
	[0x2400, 0x243f, 'Control Pictures'],
	[0x2460, 0x24ff, 'Enclosed Alphanumerics'],
	[0x2500, 0x257f, 'Box Drawing'],
	[0x2580, 0x259f, 'Block Elements'],
	[0x25a0, 0x25ff, 'Geometric Shapes'],
	[0x2600, 0x26ff, 'Miscellaneous Symbols'],
	[0x2700, 0x27bf, 'Dingbats'],
	[0x27c0, 0x27ef, 'Miscellaneous Mathematical Symbols-A'],
	[0x27f0, 0x27ff, 'Supplemental Arrows-A'],
	[0x2900, 0x297f, 'Supplemental Arrows-B'],
	[0x2980, 0x29ff, 'Miscellaneous Mathematical Symbols-B'],
	[0x2a00, 0x2aff, 'Supplemental Mathematical Operators'],
	[0x2b00, 0x2bff, 'Miscellaneous Symbols and Arrows'],
	[0xfb00, 0xfb4f, 'Alphabetic Presentation Forms'],
	[0x1d400, 0x1d7ff, 'Mathematical Alphanumeric Symbols'],
];

function makeBlockLookup(blocksText: string | null): (cp: number) => string {
	let ranges: [number, number, string][] = FALLBACK_BLOCKS;
	if (blocksText) {
		const parsed: [number, number, string][] = [];
		blocksText.split('\n').forEach((line) => {
			const m = line.match(/^([0-9A-Fa-f]+)\.\.([0-9A-Fa-f]+);\s*(.+?)\s*$/);
			if (m) { parsed.push([parseInt(m[1], 16), parseInt(m[2], 16), m[3]]); }
		});
		if (parsed.length) { ranges = parsed; }
	}
	ranges = ranges.slice().sort((a, b) => a[0] - b[0]);
	return (cp: number): string => {
		let lo = 0;
		let hi = ranges.length - 1;
		let ans = 'Other';
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const [s, e, name] = ranges[mid];
			if (cp < s) { hi = mid - 1; } else if (cp > e) { lo = mid + 1; } else { ans = name; break; }
		}
		return ans;
	};
}

function makeNameLookup(ucdText: string | null): (cp: number) => string {
	const names = new Map<number, string>();
	if (ucdText) {
		ucdText.split('\n').forEach((line) => {
			if (!line) { return; }
			const f = line.split(';');
			const cp = parseInt(f[0], 16);
			let name = f[1];
			if (name && name.startsWith('<')) { name = ''; }
			if (name) { names.set(cp, name); }
		});
	}
	return (cp: number): string => names.get(cp) || '';
}

async function main(): Promise<void> {
	await mkdir(DATA_DIR, { recursive: true });

	let prev: { chars?: CharRecord[] } = { chars: [] };
	if (existsSync(DATA_FILE)) {
		try { prev = JSON.parse(await readFile(DATA_FILE, 'utf8')); } catch { /* start fresh */ }
	}
	const union = new Map<string, CharRecord>();
	(prev.chars || []).forEach((c) => union.set(c.char, { ...c }));

	const { version: latestVersion, file: localEntitiesFile } = entitiesFileForLocalEcmarkup();
	log(`local ecmarkup: ${latestVersion}`);
	const localEntities = JSON.parse(await readFile(localEntitiesFile, 'utf8'));
	const localProducibles = produciblesFromEntities(localEntities);
	log(`local producible characters: ${localProducibles.size}`);

	const versionsToScan = new Map<string, Map<string, Set<string>>>([
		[latestVersion, localProducibles],
	]);

	const registry = await fetchJSON(REGISTRY_URL, 'npm registry') as { versions?: Record<string, unknown> } | null;
	let scannedHistory: string[] = [];
	if (registry?.versions) {
		const latestPatchByMajor = new Map<number, string>();
		Object.keys(registry.versions).forEach((v) => {
			if (!/^\d+\.\d+\.\d+$/.test(v)) { return; }
			const major = Number(v.split('.')[0]);
			if (major < MIN_MAJOR) { return; }
			const cur = latestPatchByMajor.get(major);
			if (!cur || cmpVer(v, cur) > 0) { latestPatchByMajor.set(major, v); }
		});
		scannedHistory = latestPatchByMajor.values().toArray().filter((v) => v !== latestVersion).sort(cmpVer);
		log(`historical versions to scan: ${scannedHistory.join(', ') || '(none)'}`);

		const fetched = await Promise.all(scannedHistory.map(async (v) => ({
			v,
			ent: await fetchJSON(`https://unpkg.com/ecmarkup@${v}/entities-processed.json`, `ecmarkup@${v}`),
		})));
		fetched.forEach(({ v, ent }) => {
			if (ent) { versionsToScan.set(v, produciblesFromEntities(ent as Record<string, string | null>)); }
		});
	}

	const seen = new Map<string, { entities: Set<string>; versions: Set<string> }>();
	versionsToScan.forEach((producibles, ver) => {
		producibles.forEach((ents, ch) => {
			const rec = seen.get(ch) ?? { entities: new Set<string>(), versions: new Set<string>() };
			seen.set(ch, rec);
			rec.versions.add(ver);
			ents.forEach((e) => rec.entities.add(e));
		});
	});

	seen.forEach((rec, ch) => {
		const scanned = rec.versions.values().toArray().sort(cmpVer);
		const thisFirst = scanned[0];
		const thisLast = scanned[scanned.length - 1];
		const existing: Partial<CharRecord> = union.get(ch) || {};
		const mergedVersions = new Set([...(existing.versions || []), ...scanned]);
		union.set(ch, {
			char: ch,
			entities: new Set([...(existing.entities || []), ...rec.entities]).values().toArray().sort(),
			versions: mergedVersions.values().toArray().sort(cmpVer),
			firstSeen: minVer(existing.firstSeen, thisFirst)!,
			lastSeen: maxVer(existing.lastSeen, thisLast)!,
			inLatest: rec.versions.has(latestVersion),
			producible: true,
			cp: existing.cp ?? [],
			hex: existing.hex ?? '',
			name: existing.name ?? '',
			block: existing.block ?? '',
			usage: existing.usage ?? {},
		});
	});
	union.forEach((rec, ch) => {
		if (!seen.has(ch)) { rec.inLatest = false; rec.producible = rec.versions.length > 0; }
	});

	const [blocksText, ucdText] = await Promise.all([
		fetchText(`${UCD}/Blocks.txt`, 'Unicode Blocks.txt'),
		fetchText(`${UCD}/UnicodeData.txt`, 'Unicode UnicodeData.txt'),
	]);
	const blockOf = makeBlockLookup(blocksText);
	const nameOf = makeNameLookup(ucdText);
	union.forEach((rec) => {
		const cps = cpsOf(rec.char);
		rec.cp = cps;
		rec.hex = cps.map(hex).join(' ');
		rec.block = blocksText ? blockOf(cps[0]) : (rec.block || blockOf(cps[0]));
		const names = cps.map(nameOf).filter(Boolean);
		if (names.length) { rec.name = names.join(' + '); } else if (!rec.name) { rec.name = ''; }
	});

	union.forEach((rec) => { rec.usage ||= {}; });
	const specTexts = await Promise.all(SPECS.map(async (spec) => ({ spec, text: await fetchSpecSource(spec) })));
	specTexts.forEach(({ spec, text }) => {
		if (text == null) {
			log(`keeping previously recorded ${spec.label} usage (source fetch failed)`);
			return;
		}
		const counts = countNonAscii(text);
		union.forEach((rec) => { delete rec.usage[spec.id]; });
		let producibleHits = 0;
		counts.forEach((n, ch) => {
			if (EXCLUDE.test(ch)) { return; }
			let rec = union.get(ch);
			if (!rec) {
				// A character the spec uses that no ecmarkup version produces from an entity
				// (e.g. IPA letters, an emoji); keep it so the spec is fully represented, copyable
				// as the literal character even though it has no HTML entity.
				const cps = cpsOf(ch);
				rec = {
					char: ch,
					cp: cps,
					hex: cps.map(hex).join(' '),
					name: cps.map(nameOf).filter(Boolean).join(' + '),
					block: blockOf(cps[0]),
					entities: [],
					producible: false,
					usage: {},
					inLatest: false,
					firstSeen: '',
					lastSeen: '',
					versions: [],
				};
				union.set(ch, rec);
			}
			rec.usage[spec.id] = n;
			if (rec.producible) { producibleHits += 1; }
		});
		log(`${spec.label} uses ${counts.size} distinct non-ASCII characters; ${producibleHits} producible`);
	});

	const chars = union.values().toArray().filter((c) => !EXCLUDE.test(c.char)).sort((a, b) => (a.cp[0] - b.cp[0]) || (a.char < b.char ? -1 : 1));
	const allScanned = [latestVersion, ...scannedHistory].sort(cmpVer);
	function sortUsage(u: Record<string, number>): Record<string, number> {
		return Object.fromEntries(SPECS.map((s): [string, number] => [s.id, u[s.id]]).filter(([, n]) => n > 0));
	}
	const out = {
		note: 'Generated by src/collect.ts. The non-ASCII characters that ecmarkup’s formatter produces from HTML entities; a monotonic union across ecmarkup versions.',
		ecmarkup: { latest: latestVersion, minMajorScanned: MIN_MAJOR, versionsScanned: allScanned },
		specs: SPECS.map((s) => ({
			id: s.id,
			label: s.label,
			source: s.kind === 'single' ? s.url : s.indexUrl,
			usedCount: chars.filter((c) => c.usage[s.id] > 0).length,
		})),
		counts: {
			total: chars.length,
			producible: chars.filter((c) => c.producible).length,
			inLatest: chars.filter((c) => c.inLatest).length,
			removed: chars.filter((c) => c.producible && !c.inLatest).length,
			nonProducible: chars.filter((c) => !c.producible).length,
		},
		chars: chars.map((c) => ({
			char: c.char,
			hex: c.hex,
			cp: c.cp,
			name: c.name || '',
			block: c.block || 'Other',
			entities: c.entities,
			producible: !!c.producible,
			usage: sortUsage(c.usage),
			inLatest: !!c.inLatest,
			firstSeen: c.firstSeen,
			lastSeen: c.lastSeen,
			versions: c.versions,
		})),
	};
	await writeFile(DATA_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
	log(`wrote ${DATA_FILE}`);
	log(`total ${out.counts.total} | inLatest ${out.counts.inLatest} | removed ${out.counts.removed} | `
		+ out.specs.map((s) => `${s.label} ${s.usedCount}`).join(' | '));
}

main().catch((e) => { console.error(e); process.exit(1); });

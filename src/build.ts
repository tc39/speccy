import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PURPOSES } from './purposes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA_FILE = join(ROOT, 'data', 'characters.json');
const BUILD_DIR = join(ROOT, 'build');
const SRC_FILE = join(BUILD_DIR, 'index.src.html');
const DIST_DIR = join(ROOT, 'dist');
const OUT_FILE = join(DIST_DIR, 'index.html');

interface CharRecord {
	char: string;
	hex: string;
	cp: number[];
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

interface SpecMeta {
	id: string;
	label: string;
	home: string;
	source: string;
	usedCount: number;
}

interface CharacterData {
	chars: CharRecord[];
	specs?: SpecMeta[];
	ecmarkup?: { latest?: string; minMajorScanned?: number; versionsScanned?: string[] };
	counts: { total: number };
}

interface GroupItem {
	rec: CharRecord;
	note: string;
}

interface PurposeGroup {
	id: string;
	title: string;
	description: string;
	items: GroupItem[];
}

function escText(s: unknown): string {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: unknown): string {
	return escText(s).replace(/"/g, '&quot;');
}

function slug(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function primaryEntity(entities: string[]): string {
	return [...entities].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0] || '';
}

function clause(id: string, heading: string, inner: string): string {
	return `<emu-clause id="${escAttr(id)}">\n<h1>${escText(heading)}</h1>\n${inner}\n</emu-clause>`;
}

const STYLE = `<style>
.speccy-tools{position:sticky;top:0;z-index:10;margin:0 0 1rem;padding:.75rem 0;
  background:var(--page-background,#fff);border-bottom:1px solid rgba(127,127,127,.3)}
.speccy-tools label{display:block;font-weight:600;margin-bottom:.25rem}
#speccy-q{width:100%;box-sizing:border-box;font-size:1rem;padding:.55rem .7rem;
  border:1px solid rgba(127,127,127,.5);border-radius:8px;background:inherit;color:inherit}
.speccy-count{font-size:.85rem;opacity:.7;margin-top:.4rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:.5rem;margin:1rem 0}
.grid.detailed{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:.15rem;
  min-height:74px;padding:.5rem .3rem;border:1px solid rgba(127,127,127,.35);border-radius:10px;
  background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:center;
  transition:transform .08s ease,border-color .12s ease,background-color .12s ease}
.cell:hover{border-color:#3a7afe;background:rgba(58,122,254,.08)}
.cell:focus-visible{outline:2px solid #3a7afe;outline-offset:2px}
.cell.copied{transform:scale(.94);border-color:#1f9d55;background:rgba(31,157,85,.16)}
.cell.used{border-color:rgba(31,157,85,.5)}
.cell.removed{border-style:dashed;opacity:.85}
.cell.noentity{border-style:dotted}
.cell .glyph{font-size:1.7rem;line-height:1.15}
.cell .ent{font-size:.66rem;opacity:.85;word-break:break-all;cursor:copy;
  background:rgba(127,127,127,.14);border-radius:4px;padding:0 .2rem}
.cell .cp{font-size:.6rem;opacity:.55;letter-spacing:.02em}
.cell .keys{flex-basis:100%;font-size:.6rem;opacity:.6;letter-spacing:.01em}
.speccy-platform{margin:.4rem 0 0;font-size:.85rem}
.speccy-platform select{font:inherit;margin-left:.35rem;padding:.1rem .3rem;
  border:1px solid rgba(127,127,127,.5);border-radius:6px;background:inherit;color:inherit}
.cell .uses{display:flex;flex-wrap:wrap;gap:.2rem;justify-content:center}
.use{font-size:.58rem;line-height:1.5;padding:0 .35rem;border-radius:999px;white-space:nowrap;
  background:rgba(127,127,127,.18)}
.use-262{background:rgba(31,157,85,.22)}
.use-402{background:rgba(58,122,254,.22)}
.use-404{background:rgba(150,90,200,.24)}
.use-424{background:rgba(20,150,150,.24)}
.use-426{background:rgba(230,130,40,.24)}
.use-427{background:rgba(200,70,150,.24)}
.use-428{background:rgba(120,90,200,.24)}
.grid.detailed .cell{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start;
  text-align:left;gap:.25rem .5rem;padding:.6rem .7rem}
.grid.detailed .glyph{font-size:2rem;min-width:1.6em;text-align:center}
.grid.detailed .uses{justify-content:flex-start}
.cell .note{flex-basis:100%;font-size:.74rem;opacity:.85;line-height:1.3}
.speccy-hidden{display:none !important}
.speccy-legend{font-size:.85rem;opacity:.85;margin:.5rem 0 0}
.speccy-legend .chip{display:inline-block;margin-right:1rem}
#speccy-toast{position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%) translateY(160%);
  background:#1f2933;color:#fff;padding:.6rem 1rem;border-radius:10px;font-size:.95rem;
  box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .2s ease;z-index:100;pointer-events:none;max-width:90vw}
#speccy-toast.show{transform:translateX(-50%) translateY(0)}
#speccy-toast.err{background:#b00020}
@media (prefers-color-scheme:dark){
  .speccy-tools{background:var(--page-background,#1a1a1a)}
  .cell:hover{background:rgba(120,160,255,.14)}
}
</style>`;

const SCRIPT = `<script>\n${readFileSync(new URL('./client.js', import.meta.url), 'utf8')}</script>`;

function buildSource(data: CharacterData): string {
	const all = data.chars;
	const specsList = (data.specs || []).map((s) => ({ id: s.id, label: s.label, home: s.home, short: s.label.replace(/^ECMA-/, '') }));
	const charByLiteral = new Map(all.map((c) => [c.char, c] as [string, CharRecord]));

	function specUsed(c: CharRecord): boolean {
		return specsList.some((s) => (c.usage[s.id] || 0) > 0);
	}

	const curatedGroups: PurposeGroup[] = PURPOSES.map((g) => ({
		id: g.id,
		title: g.title,
		description: g.description,
		items: g.members.flatMap((m): GroupItem[] => {
			const rec = charByLiteral.get(m.char);
			return rec ? [{ rec, note: m.note }] : [];
		}),
	})).filter((g) => g.items.length);
	const curatedChars = new Set(curatedGroups.flatMap((g) => g.items.map((x) => x.rec.char)));
	const extraItems: GroupItem[] = all
		.filter((c) => specUsed(c) && !curatedChars.has(c.char))
		.sort((a, b) => a.cp[0] - b.cp[0])
		.map((c) => ({ rec: c, note: c.name || '' }));
	const purposeGroups: PurposeGroup[] = [...curatedGroups];
	if (extraItems.length) {
		purposeGroups.push({
			id: 'examples',
			title: 'Used in examples',
			description: 'Other characters that a tracked spec uses but that have no dedicated notation - letters and symbols appearing in examples such as case mapping, normalization, collation, locale data, and the IPA pronunciation of "JSON". Some have no HTML entity, so only the literal character is copyable.',
			items: extraItems,
		});
	}

	const purposeIndex = new Map<string, { title: string; note: string }>();
	purposeGroups.forEach((g) => {
		g.items.forEach((x) => {
			if (!purposeIndex.has(x.rec.char)) { purposeIndex.set(x.rec.char, { title: g.title, note: x.note }); }
		});
	});

	function renderCell(c: CharRecord, note = ''): string {
		const entity = primaryEntity(c.entities);
		const usedSpecs = specsList.filter((s) => (c.usage[s.id] || 0) > 0);
		const usageChips = usedSpecs
			.map((s) => `<span class="use use-${s.short}">${escText(s.short)}·${c.usage[s.id]}</span>`)
			.join('');
		const pi = purposeIndex.get(c.char);

		let title = `Copy ${c.char}` + (c.name ? ` - ${c.name}` : '') + ` (U+${c.hex}${entity ? `, ${entity}` : ''})`;
		usedSpecs.forEach((s) => { title += ` · ${c.usage[s.id]}× in ${s.label}`; });
		if (!c.producible) {
			title += ' · no HTML entity (copy the character itself)';
		} else if (!c.inLatest) {
			title += ` · no longer produced by current ecmarkup (last ${c.lastSeen})`;
		}

		const search = [
			c.char,
			c.entities.join(' '),
			c.name,
			`u+${c.hex}`,
			pi ? `${pi.title} ${pi.note}` : '',
			usedSpecs.flatMap((s) => [s.id, s.short, s.label]).join(' '),
		].join(' ').toLowerCase();

		const cls = ([] as string[]).concat(
			'cell',
			usedSpecs.length ? 'used' : [],
			!c.producible ? 'noentity' : [],
			c.producible && !c.inLatest ? 'removed' : [],
		);

		return `<button type="button" class="${cls.join(' ')}"`
			+ ` data-c="${escAttr(c.char)}" data-e="${escAttr(entity)}" data-h="${escAttr(c.hex)}"`
			+ ` data-s="${escAttr(search)}"`
			+ ` title="${escAttr(title)}" aria-label="${escAttr(title)}">`
			+ `<span class="glyph">${escText(c.char)}</span>`
			+ (entity ? `<code class="ent" title="Copy the HTML entity ${escAttr(entity)}">${escText(entity)}</code>` : '')
			+ `<span class="cp">U+${escText(c.hex)}</span>`
			+ (usageChips ? `<span class="uses">${usageChips}</span>` : '')
			+ (note ? `<span class="note">${escText(note)}</span>` : '')
			+ '</button>';
	}

	function renderGrid(records: CharRecord[], noteFor?: (c: CharRecord) => string, detailed?: boolean): string {
		return `<div class="grid${detailed ? ' detailed' : ''}" role="list">\n`
			+ records.map((c) => renderCell(c, noteFor ? noteFor(c) : '')).join('\n')
			+ '\n</div>';
	}

	const latest = data.ecmarkup?.latest || '?';
	const scanned = (data.ecmarkup?.versionsScanned || []).join(', ');
	const removed = all.filter((c) => c.producible && !c.inLatest).sort((a, b) => a.cp[0] - b.cp[0]);

	const sections: string[] = [];

	const groupClauses = purposeGroups.map((g) => {
		const noteByChar = new Map(g.items.map((x) => [x.rec.char, x.note] as [string, string]));
		const gridHtml = renderGrid(g.items.map((x) => x.rec), (c) => noteByChar.get(c.char) ?? '', true);
		return clause(`purpose-${g.id}`, g.title, `<p>${escText(g.description)}</p>\n${gridHtml}`);
	}).join('\n');
	sections.push(clause('by-purpose', 'By purpose',
		`<p>The characters grouped by what they mean when writing spec text; the notational descriptions follow ECMA-262’s conventions. Every character that any tracked spec currently uses appears in a group here.</p>\n${groupClauses}`));

	const usedBySpec = new Map<string, number>();
	specsList.forEach((s) => {
		const usedChars = all
			.filter((c) => (c.usage[s.id] || 0) > 0)
			.sort((a, b) => (b.usage[s.id] - a.usage[s.id]) || a.cp[0] - b.cp[0]);
		usedBySpec.set(s.id, usedChars.length);
		if (usedChars.length) {
			sections.push(clause(`used-in-${s.id}`, `Used in ${s.label}`,
				`<p>The ${usedChars.length} characters that ${s.label} currently uses, most frequent first.</p>\n${renderGrid(usedChars)}`));
		}
	});

	const byBlock = new Map<string, CharRecord[]>();
	all.forEach((c) => {
		const arr = byBlock.get(c.block);
		if (arr) { arr.push(c); } else { byBlock.set(c.block, [c]); }
	});
	const blocks = [...byBlock.entries()]
		.map(([name, chars]) => ({ name, chars: chars.sort((a, b) => a.cp[0] - b.cp[0]) }))
		.sort((a, b) => a.chars[0].cp[0] - b.chars[0].cp[0]);
	const blockClauses = blocks
		.map((b) => clause(`blk-${slug(b.name)}`, `${b.name} (${b.chars.length})`, renderGrid(b.chars)))
		.join('\n');
	sections.push(clause('all-characters', 'All characters',
		`<p>Every character ecmarkup’s formatter can produce from an HTML entity, plus the few extra characters the tracked specs use, grouped by Unicode block.</p>\n${blockClauses}`));

	if (removed.length) {
		sections.push(clause('removed', 'No longer produced by current ecmarkup',
			`<p>These characters were producible by an older ecmarkup release but are not produced by the current one (${escText(latest)}). They are kept here so nothing that ever appeared in the spec disappears from this picker.</p>\n${renderGrid(removed)}`));
	}

	const usageSummary = specsList
		.filter((s) => (usedBySpec.get(s.id) || 0) > 0)
		.map((s) => `<strong>${escText(s.short)}·N</strong> = times used in ${escText(s.label)}`)
		.join('; ');
	const specLinks = specsList.map((s) => {
		const link = `<a href="${escAttr(s.home)}">${escText(s.label)}</a>`;
		return (usedBySpec.get(s.id) || 0) > 0 ? link : `${link} (none producible)`;
	});
	const intro = `<emu-intro id="introduction">
<h1 style="display:none">Speccy</h1>
<p>A click-to-copy grid of the characters that <a href="https://github.com/tc39/ecmarkup">ecmarkup</a>’s formatter produces from HTML entities - the non-ASCII characters you use when writing Ecma spec text. Tracks ${specLinks.join(', ')}. Built for <a href="https://github.com/tc39/ecma262/issues/3882">tc39/ecma262#3882</a>.</p>
<div class="speccy-tools">
<label for="speccy-q">Search characters</label>
<input id="speccy-q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="purpose, name, entity, character, or U+XXXX - e.g. “number”, “list”, “laquo”, “𝔽”, “U+2264”">
<p class="speccy-count" id="speccy-count" aria-live="polite"></p>
<p class="speccy-platform"><label for="speccy-platform">Keystrokes for</label><select id="speccy-platform"><option value="auto">Auto</option><option value="mac">macOS</option><option value="win">Windows</option><option value="linux">Linux</option></select></p>
</div>
<p class="speccy-legend">
<span class="chip"><strong>Tap a glyph</strong> → copy the character (e.g. <code>𝔽</code>).</span>
<span class="chip"><strong>Tap the entity</strong> below it → copy the HTML entity (e.g. <code>&amp;Fopf;</code>).</span>
</p>
<p class="speccy-legend">Chips show usage: ${usageSummary}. Start with <a href="#by-purpose">By purpose</a> for the common ones.</p>
<p class="speccy-legend">Derived from ecmarkup <strong>${escText(latest)}</strong>; the character union also covers ${escText(scanned || 'earlier releases')}. <strong>${data.counts.total}</strong> characters total.</p>
</emu-intro>`;

	return `<!DOCTYPE html>
<meta charset="utf-8">
<pre class="metadata">
title: Speccy - ECMAScript spec characters
stage: ∞
copyright: false
</pre>
${STYLE}
${intro}
${sections.join('\n')}
<div id="speccy-toast" role="status" aria-live="polite"></div>
${SCRIPT}
`;
}

async function main(): Promise<void> {
	if (!existsSync(DATA_FILE)) {
		console.error(`[build] missing ${DATA_FILE} - run \`npm run collect\` first.`);
		process.exit(1);
	}
	const data: CharacterData = JSON.parse(await readFile(DATA_FILE, 'utf8'));
	await mkdir(BUILD_DIR, { recursive: true });
	await mkdir(DIST_DIR, { recursive: true });

	const source = buildSource(data);
	await writeFile(SRC_FILE, source, 'utf8');
	console.log(`[build] wrote ecmarkup source (${(source.length / 1024).toFixed(0)} KiB) -> ${SRC_FILE}`);

	const bin = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'ecmarkup.cmd' : 'ecmarkup');
	const args = [SRC_FILE, OUT_FILE, '--assets', 'external', '--assets-dir', DIST_DIR];
	console.log(`[build] ecmarkup ${args.join(' ')}`);
	const res = spawnSync(bin, args, { stdio: 'inherit', cwd: ROOT });
	if (res.error) { console.error('[build] failed to run ecmarkup:', res.error.message); process.exit(1); }
	if (res.status !== 0) { console.error(`[build] ecmarkup exited ${res.status}`); process.exit(res.status || 1); }
	console.log(`[build] rendered -> ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

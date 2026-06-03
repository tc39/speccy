# Speccy - ECMAScript spec character picker

A static, GitHub Pages–hostable web page that shows an **easy grid of the non‑ASCII
characters used when writing ECMAScript spec text**, where every character is normal
copyable text and can be **clicked or tapped to copy it to the clipboard**.

It exists to scratch the itch in
[tc39/ecma262#3882](https://github.com/tc39/ecma262/issues/3882): "an easy place where to
copy & paste from while writing spec text" (`«`, `𝔽`, `ℝ`, `×`, `≤`, curly quotes, em dashes,
…). Instead of a hand‑maintained list, Speccy derives its character set **directly from
ecmarkup** and keeps it up to date automatically.

## What counts as a "spec character"?

When you write spec source you type HTML entities (`&laquo;`, `&Fopf;`, `&times;`, …) and
then run **`emu-format`** (ecmarkup's formatter), which normalizes each entity into the
actual Unicode character - see bakkot's note in #3882: *"memorize the HTML entities and then
run the formatter."*

So the authoritative set of spec characters is exactly **the set of characters that
ecmarkup's formatter will normalize an HTML entity into**. That is precisely the non‑`null`
values of ecmarkup's [`entities-processed.json`](https://github.com/tc39/ecmarkup), filtered
by the formatter to exclude whitespace, marks, and control characters
(`ecmarkup/lib/formatter/text.js`). That's ~1420 characters today.

The page is itself **built with actual ecmarkup**, so the characters render with the same
fonts and styling they have in the spec, and the page tracks whatever ecmarkup does.

## How it stays current (and never loses a character)

- A daily **GitHub Action** (`.github/workflows/pages.yml`) bumps ecmarkup to `@latest`,
  regenerates `data/characters.json` and the page, commits the refreshed data, and deploys
  to GitHub Pages.
- `data/characters.json` is a **monotonic union**: `src/collect.ts` scans the latest
  ecmarkup *and* the latest patch of every historical major (≥ 15.0.0, the first to ship the
  entity table) via the npm registry / unpkg, and merges into the committed dataset. A
  character is **never removed** once seen. Each entry records `firstSeen` / `lastSeen` /
  `inLatest`.
- So if a future ecmarkup drops a character that older versions produced, it still appears in
  the grid - flagged in a **"No longer produced by current ecmarkup"** section - exactly as
  requested in the issue.
- `collect.ts` also fetches the live sources of **ECMA‑262** (`tc39/ecma262` `spec.html`),
  **ECMA‑402** (`tc39/ecma402`, whose multi‑file source is assembled by following its
  `<emu-import>`s), and **ECMA‑426** (`tc39/source-map` `spec.emu`), recording how many times
  each character appears in each (`usage`) and surfacing a **"Used in …"** group per spec. Adding
  another spec is one entry in the `SPECS` array in `collect.ts`.

Every network step degrades gracefully: if a fetch fails the previously committed union and
metadata are kept, so the build is reproducible offline.

## Grouped and described by purpose

The page leads with a **By purpose** section that groups the common characters by what they
*mean* when writing spec text, with a short description for each - e.g. **Numeric values and
conversions** (`𝔽`, `ℝ`, `ℤ`), **Lists** (`«` … `»`), **Comparisons**, **Sets**, **Arithmetic**,
**Prose typography**. These descriptions are curated in `src/purposes.ts`, grounded in
ECMA‑262's notational conventions - the one bit of editorial knowledge ecmarkup itself does not
carry. The search box matches these descriptions too, so searching "number" finds `𝔽`/`ℝ` and
"list" finds the guillemets.

**Every** character that any tracked spec actually uses is guaranteed to land in some group:
after the curated groups, `build.ts` appends a computed **"Used in examples"** group containing
any remaining spec‑used character (the accented letters, `ω`, `½`, etc. that appear in case‑mapping,
normalization, collation, and locale examples), labelled by its Unicode name. Because it's computed
from live usage, it stays complete as the specs evolve.

## Usage on the page

- **Click / tap a glyph** → copies the character (e.g. `𝔽`).
- **Click the small entity code** under it → copies the HTML entity instead (e.g. `&Fopf;`),
  for people who prefer to type entities and run the formatter.
- Each cell shows **usage chips** (`262·N` / `402·N` / `426·N`) counting how often the character
  appears in each spec.
- **Search box** filters by purpose/description, character, entity name, Unicode name, spec, or
  `U+XXXX` code point.

## Developing locally

```sh
npm install
npm run collect   # refresh data/characters.json from ecmarkup + the live specs
npm run build     # render the page into dist/ with ecmarkup
npm run serve     # preview dist/ at http://localhost:8080 (or the next free port)
npm run lint      # run linter and typechecker
# or: npm run dev  (regen + serve)
```

The build/dev scripts are TypeScript run directly by Node's type stripping (no build step),
so they require Node ≥ 22.18 (they also use built‑in `fetch`). None of these scripts ship: the
deployed artifact is the static `dist/` output. The browser code lives in `src/client.js`
(plain JS with TSDoc type annotations, so it can be linted and type-checked); the build inlines
it into the page.

## Deploying

The workflow deploys via `actions/deploy-pages`, so set the repository's
**Settings → Pages → Source** to **GitHub Actions**. No build output is committed; only
`data/characters.json` (the durable character union) and the ecmarkup version bump are.

## Layout

| Path | Purpose |
| --- | --- |
| `src/collect.ts` | Builds the monotonic character union from ecmarkup + per‑spec usage + Unicode metadata. |
| `src/purposes.ts` | Curated purpose groups and per‑character descriptions (the editorial layer). |
| `src/build.ts` | Generates the ecmarkup source page (inlining `client.js`) and renders it to `dist/`. |
| `src/client.js` | Browser code: search/filter + click‑to‑copy. Plain JS so it can be linted. |
| `src/serve.ts` | Tiny zero‑dependency static server for local preview. |
| `data/characters.json` | The committed, monotonic character dataset (source of truth for the page). |
| `.github/workflows/pages.yml` | Daily ecmarkup update + build + Pages deploy. |

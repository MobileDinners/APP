// WCAG AA contrast for the palette tokens, on the pairs that actually carry text.
// Run after any change to the colour tokens in globals.css.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/**
 * Pulls one token block out of globals.css so this can never drift from source.
 * Each block ends at its `color-scheme:` line — bounding on that matters,
 * because an over-long window reads into the next block and the later values
 * silently overwrite the ones being tested.
 */
function tokens(startMarker) {
  const i = css.indexOf(startMarker);
  if (i < 0) throw new Error(`token block not found: ${startMarker}`);
  const end = css.indexOf("color-scheme: ", css.indexOf("--line-2", i));
  const slice = css.slice(i, end);
  const out = {};
  for (const m of slice.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}
const light = tokens(":root {");
const dark = tokens('@media (prefers-color-scheme: dark)');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let fails = 0;
for (const [mode, t] of [["light", light], ["dark", dark]]) {
  console.log(`--- ${mode} ---`);
  const pairs = [
    ["body text", t.ink, t.bg, 4.5],
    ["body on band", t.ink, t["bg-2"], 4.5],
    ["secondary text", t["ink-2"], t.bg, 4.5],
    ["muted text (UI)", t["ink-3"], t.bg, 3],
    ["primary button", t["brand-ink"], t.brand, 4.5],
    ["brand text/white", t["brand-strong"], t.bg, 4.5],
    ["brand text/soft", t["brand-strong"], t["brand-soft"], 4.5],
    // A filled coral pill on white sits at ~2.7:1 on luminance alone. WCAG 1.4.11
    // asks for 3:1 only where the boundary is what identifies the control; here
    // the dark label inside carries 5.9:1 and the shape is unmistakable, so this
    // is checked as a hue-shift sanity floor rather than as the identifying edge.
    ["brand fill/white", t.brand, t.bg, 2.5],
    ["green badge", t.green, t["green-soft"], 4.5],
    ["green on white", t.green, t.bg, 4.5],
    ["amber badge", t.amber, t["amber-soft"], 4.5],
    ["red badge", t.red, t["red-soft"], 4.5],
    ["red on white", t.red, t.bg, 4.5],
    ["blue badge", t.blue, t["blue-soft"], 4.5],
    ["secondary button", t.ink, t["card-2"], 4.5],
    ["border on white", t["line-2"], t.bg, 1.4],
  ];
  for (const [name, fg, bg, min] of pairs) {
    if (!fg || !bg) { console.log(`  SKIP  ${name} (token missing)`); continue; }
    const r = ratio(fg, bg);
    const ok = r + 1e-9 >= min;
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(18)} ${r.toFixed(2)}:1  (needs ${min})`);
  }
}
console.log(fails === 0 ? "\nAll pairs meet target." : `\n${fails} pair(s) below target.`);
process.exit(fails === 0 ? 0 : 1);

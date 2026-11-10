#!/usr/bin/env node
/* Theme guard: fail when a new hardcoded light surface is added to the
   authenticated app. Intentional bright accents (lime CTAs, category
   chips, source icons) are allowed. Existing light rules are baselined
   so the guard protects new work without blocking the current tree. */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const PUBLIC_THEMES = new Set(["landing.css", "auth.css", "tokens.css"]);
const files = readdirSync(join(root, "src/styles"))
  .filter(name => name.endsWith(".css") && !PUBLIC_THEMES.has(name))
  .map(name => `src/styles/${name}`)
  .sort();
const baselinePath = join(root, "scripts/theme-light-baseline.json");
const write = process.argv.includes("--write-baseline");

const ACCENT = /(?:^|[.\s:])(?:btn-lime|badge\.lime|chip\.active|lime|db-delta|db-prop-ic|src-kind|mm-kind|mm-chip\.on|dc-type\.on|sx-chip\.on|sx-roleseg\s+button\.on|hza-pick\.on|hza-mini:hover|ag-pick\.on|highlight|toggle|switch)/i;

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function colorIsLight(raw) {
  const value = raw.trim().toLowerCase();
  if (value === "white") return true;
  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return a > 0.3 && luminance(r, g, b) > 0.72;
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1].split(",").map(x => parseFloat(x.trim()));
    const a = p[3] === undefined ? 1 : p[3];
    return a > 0.3 && luminance(p[0], p[1], p[2]) > 0.72;
  }
  return false;
}

function lightBackground(decl) {
  if (!/^background(?:-color)?$/.test(decl.prop)) return null;
  const colors = decl.value.match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)|\bwhite\b/gi) || [];
  const light = colors.filter(colorIsLight);
  return light.length ? light.join(" ") : null;
}

function scan(file) {
  let src;
  try { src = readFileSync(join(root, file), "utf8"); } catch { return []; }
  src = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [];
  const stack = [];
  let buf = "";
  for (const ch of src) {
    if (ch === "{") { stack.push(buf.trim()); buf = ""; }
    else if (ch === "}") {
      const selector = stack.pop() || "";
      const ancestors = [...stack];
      if (!selector.startsWith("@") && !ancestors.some(s => s.startsWith("@keyframes"))) {
        for (const part of buf.split(";")) {
          const idx = part.indexOf(":");
          if (idx < 0) continue;
          const prop = part.slice(0, idx).trim().toLowerCase();
          const value = part.slice(idx + 1).trim();
          if (!prop || !value) continue;
          const light = lightBackground({ prop, value });
          if (!light) continue;
          if (ACCENT.test(selector)) continue;
          found.push({ file, selector, value });
        }
      }
      buf = "";
    } else buf += ch;
  }
  return found;
}

const violations = files.flatMap(scan);
const key = v => `${v.file}::${v.selector}::${v.value.replace(/\s+/g, " ")}`;
const current = [...new Map(violations.map(v => [key(v), v])).values()].sort((a, b) => key(a).localeCompare(key(b)));

if (write || !existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify(current.map(key), null, 2) + "\n");
  console.log(`theme:check — wrote ${current.length} baseline light rules to scripts/theme-light-baseline.json`);
  process.exit(0);
}

const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")));
const added = current.filter(v => !baseline.has(key(v)));
if (added.length) {
  console.error(`theme:check — ${added.length} new hardcoded light surface(s) found:`);
  for (const v of added) console.error(`  ${v.file}  ${v.selector}  ${v.value}`);
  console.error("Darken the surface or add an intentional accent allowlist entry in scripts/check-dark-theme.mjs.");
  process.exit(1);
}
console.log(`theme:check — ok (${current.length} baselined light rules, 0 new)`);

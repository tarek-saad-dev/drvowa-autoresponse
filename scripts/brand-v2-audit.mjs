#!/usr/bin/env node
/**
 * Read-only audit of brand migration candidates in UI source.
 * Run: node scripts/brand-v2-audit.mjs [--json]
 * This is an inventory, not a release gate. Semantic statuses and third-party
 * colors are allowed exceptions until individually reviewed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const scanRoots = ["src/app", "src/components", "src/constants"];
const extensions = /\.(?:css|tsx|ts)$/i;
const excludedFolders = new Set(["api", "node_modules", ".next", ".git"]);
const staleDecorative = /#(?:00759a|0b8bb5|38c6ed|3de7ff|0ba8d4|149bc7|005f80|004a66)\b/gi;

function visit(dir, collected = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludedFolders.has(entry.name)) visit(full, collected);
    } else if (entry.isFile() && extensions.test(entry.name)) {
      collected.push(full);
    }
  }
  return collected;
}

function count(text, regex) {
  return [...text.matchAll(regex)].length;
}

const files = [];
for (const dir of scanRoots) {
  const abs = join(root, dir);
  try {
    if (!statSync(abs).isDirectory()) continue;
  } catch {
    console.error(`Missing source directory: ${dir}`);
    process.exitCode = 1;
    continue;
  }
  for (const absolutePath of visit(abs)) {
    const content = readFileSync(absolutePath, "utf8");
    const record = {
      path: relative(root, absolutePath).split(sep).join("/"),
      lines: content.split(/\r?\n/).length,
      hexColors: count(content, /#[\da-fA-F]{3,8}\b/g),
      legacyPalette: count(content, staleDecorative),
      legacyProductName: count(content, /AutoResponse\b/g),
      fontDeclarations: count(content, /(?:font-family\s*:|next\/font\/google|@font-face)/g),
      customColorUtilities: count(
        content,
        /\b(?:bg|text|border|ring|from|via|to)-(?:teal|cyan|sky|blue|emerald|green)-\d{2,3}\b/g,
      ),
    };
    if (
      record.hexColors ||
      record.legacyPalette ||
      record.legacyProductName ||
      record.fontDeclarations ||
      record.customColorUtilities
    ) files.push(record);
  }
}

files.sort((a, b) =>
  (b.hexColors + b.legacyPalette * 3 + b.legacyProductName * 3) -
  (a.hexColors + a.legacyPalette * 3 + a.legacyProductName * 3) ||
  a.path.localeCompare(b.path),
);

const sum = (key) => files.reduce((total, item) => total + item[key], 0);
const totals = {
  candidateFiles: files.length,
  hexColors: sum("hexColors"),
  legacyPalette: sum("legacyPalette"),
  legacyProductName: sum("legacyProductName"),
  fontDeclarations: sum("fontDeclarations"),
  customColorUtilities: sum("customColorUtilities"),
};

if (process.argv.includes("--review")) {
  console.log("# Brand V2 remaining legacy-name and palette matches");
  console.log("# Read-only: review each match; internal identifiers and third-party brands may be intentional.");
  console.log(JSON.stringify(totals));
  for (const candidate of files) {
    if (!candidate.legacyProductName && !candidate.legacyPalette) continue;
    const lines = readFileSync(join(root, candidate.path), "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/AutoResponse\b/.test(line) && !staleDecorative.test(line)) return;
      staleDecorative.lastIndex = 0;
      console.log(`${candidate.path}:${index + 1}: ${line.trim().slice(0, 250)}`);
    });
  }
} else if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ totals, files }, null, 2));
} else {
  console.log("# Brand V2 source audit (read-only)\n");
  console.log("> Counts are candidates for human review, not automatic defects. Some colors/legacy strings may be intentional (e.g. statuses, API identifiers).\n");
  console.log("| Metric | Count |\n|---|---:|");
  for (const [key, value] of Object.entries(totals)) {
    console.log(`| ${key} | ${value} |`);
  }
  console.log("\n| File | Hex | Old palette | Old name | Custom color utilities |\n|---|---:|---:|---:|---:|");
  for (const f of files) {
    console.log(`| \`${f.path}\` | ${f.hexColors} | ${f.legacyPalette} | ${f.legacyProductName} | ${f.customColorUtilities} |`);
  }
}

/**
 * Shared .env parser for E2E scripts (NCF-17) — single source of truth.
 *
 * Ports the M-05-grade parser from e2e/support/env.ts (which cannot be
 * imported here: plain node scripts, no TS loader). Values are either a
 * quoted string (any internal content) OR a bare token (no spaces, no #);
 * inline comments are stripped. Empty-after-trim values normalize to
 * `undefined` so `KEY=` behaves as unset (not as factory "").
 *
 * e2e/support/env.ts keeps its own copy (TS) — if you change the grammar
 * here, mirror it there (comment cross-reference in both files).
 */

export function parseEnvText(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /^\s*([A-Z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^#\s][^#]*))\s*(?:#.*)?$/
    );
    if (!m) continue;
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    out[m[1]] = value === "" ? undefined : value;
  }
  return out;
}

export function parseEnvFile(absPath, readFileSync) {
  try {
    return parseEnvText(readFileSync(absPath, "utf8"));
  } catch {
    return {};
  }
}

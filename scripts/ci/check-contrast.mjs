#!/usr/bin/env node
/**
 * Contrast regression guard — prevents low-contrast tokens from being
 * reintroduced into components/. Runs as part of CI and can be invoked
 * locally via `node scripts/ci/check-contrast.mjs`.
 *
 * Forbidden patterns:
 *   1. text-amber-[4567]00          (must be amber-800)
 *   2. text-foreground/[1-7]0       (must be full opacity, unless hover-only)
 *   3. text-muted-foreground/[1-7]0 (must be full opacity, unless hover-only)
 *   4. bg-destructive/10            (must be destructive/15)
 *
 * Hover-only exemption: if the SAME className string also contains
 * "opacity-0" and "hover:" or "group-hover:" or "peer-hover:", the
 * text-opacity match is ignored (the element starts invisible and
 * only becomes visible on hover — acceptable).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(process.cwd(), "components");
const FILE_EXT = ".tsx";

/** @type {Array<{pattern: RegExp, label: string, allowHoverOnly?: boolean}>} */
const RULES = [
  {
    pattern: /\btext-amber-[4567]00\b/g,
    label: "Low-contrast amber (use text-amber-800 dark:text-amber-300)",
  },
  {
    pattern: /\btext-foreground\/[1-7]0\b/g,
    label: "text-foreground with reduced opacity (use text-foreground)",
    allowHoverOnly: true,
  },
  {
    pattern: /\btext-muted-foreground\/[1-7]0\b/g,
    label:
      "text-muted-foreground with reduced opacity (use text-muted-foreground)",
    allowHoverOnly: true,
  },
  {
    pattern: /\bbg-destructive\/10\b/g,
    label: "bg-destructive/10 (use bg-destructive/15)",
  },
];

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (extname(full) === FILE_EXT) {
      results.push(full);
    }
  }
  return results;
}

const files = walk(ROOT);
let totalIssues = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      const matches = [...line.matchAll(rule.pattern)];
      for (const match of matches) {
        // Hover-only exemption: skip if line has opacity-0 + hover prefix
        if (rule.allowHoverOnly) {
          const hasHover =
            /\b(hover:|group-hover:|peer-hover:)/.test(line) ||
            /\b(hover:|group-hover:|peer-hover:)/.test(
              lines.slice(Math.max(0, i - 3), i + 4).join(" ")
            );
          const hasOpacityZero = /\bopacity-0\b/.test(
            lines.slice(Math.max(0, i - 3), i + 4).join(" ")
          );
          if (hasHover && hasOpacityZero) continue;
        }
        issues.push({
          line: i + 1,
          match: match[0],
          rule: rule.label,
        });
      }
    }
  }

  if (issues.length > 0) {
    const rel = file.replace(ROOT, "components").replace(/\\/g, "/");
    console.error(`\n❌ ${rel}`);
    for (const issue of issues) {
      console.error(`   line ${issue.line}: ${issue.match} — ${issue.rule}`);
    }
    totalIssues += issues.length;
  }
}

if (totalIssues === 0) {
  console.log("✅ Contrast check passed — no low-contrast tokens found.");
} else {
  console.error(
    `\n🔍 Contrast regression check failed: ${totalIssues} violation(s) found.\n` +
      "Fix the listed lines before committing."
  );
  process.exit(1);
}

import { readFileSync } from "node:fs";

const data = readFileSync(
  ".next/diagnostics/analyze/data/analyze.data",
  "utf8"
);

// Look for route patterns
const routePattern = /"\/docs[^"]*"/g;
const matches = data.match(routePattern);
if (matches) {
  console.log("Found route patterns:", [...new Set(matches)].slice(0, 10));
}

// Look for size patterns
const sizePattern = /size["':\s]+(\d+)/g;
const sizeMatches = data.match(sizePattern);
if (sizeMatches) {
  console.log("Found size patterns:", [...new Set(sizeMatches)].slice(0, 10));
}

// Look for First Load patterns
const firstLoadPattern = /first[_-]?load/gi;
const firstLoadMatches = data.match(firstLoadPattern);
if (firstLoadMatches) {
  console.log("Found First Load patterns:", [...new Set(firstLoadMatches)]);
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

const dataDir = ".next/diagnostics/analyze/data";

// Read the main analyze data
const analyzeData = readFileSync(join(dataDir, "analyze.data"), "utf8");

// Find routes.json content
const routesPath = join(dataDir, "routes.json");
try {
  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  console.log("Routes found:", routes.length);

  // For each route, check if there's size data
  for (const route of routes.slice(0, 10)) {
    console.log("Route:", route);
  }
} catch (e) {
  console.log("Error reading routes:", e.message);
}

// Look for size patterns in the analyze data
const sizePattern = /(\d+\.?\d*)\s*(KB|MB|bytes)/gi;
const matches = analyzeData.match(sizePattern);
if (matches) {
  console.log("\nSize patterns found:", [...new Set(matches)].slice(0, 20));
}

// Look for gzip patterns
const gzipPattern = /gzip[:\s]+(\d+)/gi;
const gzipMatches = analyzeData.match(gzipPattern);
if (gzipMatches) {
  console.log("\nGzip patterns found:", [...new Set(gzipMatches)].slice(0, 20));
}

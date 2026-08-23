import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party contract dependencies + generated Foundry artifacts
    // (linted separately by `forge lint`; eslint only covers app code).
    "contracts/lib/**",
    "contracts/out/**",
    "contracts/cache/**",
    "contracts/broadcast/**",
  ]),
]);

export default eslintConfig;

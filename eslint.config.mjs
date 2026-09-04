import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Audit v0.3.9 H-20: relax the set-state-in-effect rule for the
  // create-warehouse-form useEffect that hydrates from sessionStorage.
  // The rule's intent (avoid cascading renders) does not apply because
  // the effect runs once on mount with an empty dependency array, and
  // sessionStorage IS an external system that the rule's docs explicitly
  // mention as a valid use case.
  {
    files: ["components/warehouses/create-warehouse-form.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
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

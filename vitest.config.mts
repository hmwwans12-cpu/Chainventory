import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // Audit v0.4.2: set SKIP_ENV_VALIDATION=1 so lib/env.ts does not
    // run its Zod schema on the test runtime. The @t3-oss/env-core
    // helper throws "Attempted to access a server-side environment
    // variable on the client" because tests run in jsdom, which is
    // treated as a browser environment. Tests that need specific
    // env values can set them via process.env in beforeAll() or via
    // per-test module stubs (e.g. vi.mock).
    env: {
      SKIP_ENV_VALIDATION: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});

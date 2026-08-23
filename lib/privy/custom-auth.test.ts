import { describe, expect, it } from "vitest";

import {
  isPrivyConfigured,
  PRIVY_CUSTOM_AUTH_METHOD,
} from "@/lib/privy/custom-auth";

describe("privy custom-auth", () => {
  it("exposes the custom-auth method constant", () => {
    expect(PRIVY_CUSTOM_AUTH_METHOD).toBe("privy-custom-auth-v1");
  });

  it("reports unconfigured when env vars are absent (vitest has no .env.local)", () => {
    expect(process.env.NEXT_PUBLIC_PRIVY_APP_ID).toBeUndefined();
    expect(isPrivyConfigured()).toBe(false);
  });
});

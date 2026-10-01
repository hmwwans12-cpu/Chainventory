import { describe, expect, it } from "vitest";

import { authMessageKey, translateAuthMessage } from "@/lib/auth/auth-errors";

const t = (key: string) => `t:${key}`;

describe("authMessageKey", () => {
  it("maps known validator literals", () => {
    expect(authMessageKey("Enter a valid email address.")).toBe(
      "auth.error_email"
    );
    expect(authMessageKey("Password must be at least 8 characters.")).toBe(
      "auth.error_password"
    );
    expect(authMessageKey("Passwords do not match.")).toBe(
      "auth.reset_mismatch"
    );
  });

  it("returns null for unknown or empty messages", () => {
    expect(authMessageKey("DB exploded")).toBeNull();
    expect(authMessageKey(undefined)).toBeNull();
    expect(authMessageKey("")).toBeNull();
  });
});

describe("translateAuthMessage", () => {
  it("translates known literals and passes through the rest", () => {
    expect(translateAuthMessage(t, "Invalid email or password.")).toBe(
      "t:auth.error_invalid_credentials"
    );
    // Sudah terjemahan (dari server action) atau tak dikenal → apa adanya.
    expect(translateAuthMessage(t, "Email atau kata sandi salah.")).toBe(
      "Email atau kata sandi salah."
    );
    expect(translateAuthMessage(t, "weird db output")).toBe("weird db output");
  });

  it("falls back when empty", () => {
    expect(translateAuthMessage(t, undefined, "FB")).toBe("FB");
    expect(translateAuthMessage(t, undefined)).toBe("");
  });
});

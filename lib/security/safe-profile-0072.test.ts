import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "0072_safe_profile_projection.sql"
  ),
  "utf8"
);

describe("safe profile projection (0072, static)", () => {
  it("removes direct sensitive-column reads from authenticated clients", () => {
    expect(sql).toContain(
      "revoke select on public.users from anon, authenticated;"
    );
    expect(sql).toContain("grant select (id, email, display_name, avatar_url)");
    expect(sql).toContain("get_my_profile");
    expect(sql).toContain("privy_user_id text");
    expect(sql).toContain("notification_preferences jsonb");
  });
});

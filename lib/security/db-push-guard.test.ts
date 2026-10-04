import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-7: `db:push:verify --push` wajib dijaga allowlist ref proyek.
 *
 * Skrip sebelumnya hanya meminta kredensial ada — kredensial prod yang
 * keliru (atau ref salah ketik) langsung `supabase db push` ke DB yang
 * salah. Guard: `DB_PUSH_ALLOWED_REFS` (koma-dipisah) wajib di-set dan
 * `SUPABASE_PROJECT_REF` harus cocok, SEBELUM `supabase link`.
 *
 * PERUBAHAN PERILAKU: `--push` tanpa allowlist / ref tak cocok kini exit 1.
 */
const SCRIPT = join(process.cwd(), "scripts", "db", "push-verify.mjs");

function src(): string {
  return readFileSync(SCRIPT, "utf8");
}

describe("R-7 guard db:push:verify (static)", () => {
  it("skrip membaca DB_PUSH_ALLOWED_REFS dan menolak bila kosong/tak cocok", () => {
    const s = src();
    expect(s).toContain("DB_PUSH_ALLOWED_REFS");
    expect(s).toMatch(/allowedRefs.*includes|includes.*allowedRefs/s);
  });

  it("guard berjalan sebelum supabase link", () => {
    const s = src();
    expect(s.indexOf("DB_PUSH_ALLOWED_REFS")).toBeLessThan(
      s.indexOf("supabase link")
    );
  });
});

describe("R-7 guard db:push:verify (runtime, tanpa DB)", () => {
  it("--push + allowlist kosong → exit 1 sebelum link (aman, tanpa DB)", () => {
    let err: unknown = null;
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [SCRIPT, "--push"], {
        encoding: "utf8",
        env: {
          ...process.env,
          SUPABASE_PROJECT_REF: "dummy-ref",
          SUPABASE_ACCESS_TOKEN: "dummy-token",
          SUPABASE_DB_PASSWORD: "dummy-password",
          DB_PUSH_ALLOWED_REFS: "",
        },
      });
    } catch (e) {
      err = e;
    }
    expect(err, `skrip lolos tanpa allowlist (out: ${stdout})`).not.toBeNull();
    const output = `${stdout}${(err as { stdout?: string })?.stdout ?? ""}${(err as { message?: string })?.message ?? ""}`;
    expect(output).toMatch(/DB_PUSH_ALLOWED_REFS/);
  }, 120_000);
});

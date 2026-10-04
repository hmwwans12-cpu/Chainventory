import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-1 + R-2: semua fungsi SECURITY DEFINER live harus punya search_path
 * terkunci (static + drop/overload-aware).
 *
 * Serangan search_path: DEFINER dengan `search_path = public` (atau tanpa
 * SET) mengeksekusi referensi tak-terkualifikasi memakai path penelepon —
 * penyerang dengan CREATE di skema awal path bisa membajak tabel/fungsi.
 * Migrasi 0079 mengunci fungsi live yang terverifikasi aman (semua
 * referensi terkualifikasi skema / builtin pg_catalog / CTE) via
 * referensi terkualifikasi skema / builtin pg_catalog / CTE) via
 * `ALTER FUNCTION ... SET search_path = ''`.
 *
 * Guard: DEFINER live BARU dengan path lemah (tidak terkunci dan tidak ada
 * di daftar DEFERRED yang didokumentasikan) membuat test ini gagal → wajib
 * triase eksplisit. Parser drop/overload-aware: CREATE terakhir per
 * signature menang; DROP setelahnya menghapus (pelajaran M-7: 5 false alarm
 * dari harness yang tidak overload-aware).
 */
const DIR = join(process.cwd(), "supabase", "migrations");

/** Fungsi yang SADAR dikecualikan (dengan alasan). */
const DEFERRED: { sig: string; reason: string }[] = [
  {
    sig: "public.purge_expired_idempotency_keys(interval,integer)",
    reason:
      "TIDAK ADA di staging sebagai DEFINER (atau sama sekali) — ALTER akan gagal. " +
      "Bila muncul kembali, hapus entri ini agar test menuntut kunci. " +
      "Drift 0053 diselidiki terpisah.",
  },
];

function normTypes(argstr: string): string {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let inStr = false;
  for (let i = 0; i < argstr.length; i++) {
    const c = argstr[i]!;
    if (c === "'") inStr = !inStr;
    if (!inStr && c === "(") depth++;
    if (!inStr && c === ")") depth--;
    if (!inStr && depth === 0 && c === ",") {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((p) => {
      let s = p.trim().replace(/\s+/g, " ");
      s = s.replace(/\s+default\s+.*$/i, "").trim();
      const m = s.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
      if (
        m &&
        /^(uuid|text|bigint|integer|int|numeric|boolean|bool|jsonb|json|timestamptz|timestamp|date|interval|bytea|void|trigger|real|double|character|char|varchar|smallint)/i.test(
          m[2]!
        )
      ) {
        return m[2]!.toLowerCase().replace(/\s+/g, " ");
      }
      return s.toLowerCase().replace(/\s+/g, " ");
    })
    .join(",");
}

type Ev =
  | { kind: "def"; sig: string; sp: string | null; definer: boolean }
  | { kind: "drop"; sig: string };

function events(): Ev[] {
  const out: Ev[] = [];
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), "utf8");
    const re =
      /(create\s+(or\s+replace\s+)?function\s+|drop\s+function\s+(?:if\s+exists\s+)?)([a-zA-Z0-9_."]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const isDrop = /^drop/i.test(m[1]!);
      const fname = m[3]!.replace(/"/g, "").toLowerCase();
      let depth = 0;
      let args = "";
      const k = m.index + m[0].length - 1;
      for (let j = k; j < sql.length; j++) {
        const c = sql[j]!;
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) {
            args = sql.slice(k + 1, j);
            break;
          }
        }
      }
      const sig = `${fname}(${normTypes(args)})`;
      if (isDrop) {
        out.push({ kind: "drop", sig });
        continue;
      }
      const tagM = sql
        .slice(m.index, m.index + 6000)
        .match(/\$[a-zA-Z0-9_]*\$/);
      if (!tagM) continue;
      const tag = tagM[0];
      const bs = m.index + sql.slice(m.index).indexOf(tag) + tag.length;
      const be = sql.indexOf(tag, bs);
      if (be < 0) continue;
      const header = sql.slice(m.index, bs);
      const spm = header.match(
        /set\s+search_path\s*(?:=|to)\s*['"]?([a-z_, ]*)['"]?/i
      );
      let sp: string | null = spm
        ? spm[1]!
            .trim()
            .replace(/\s+/g, " ")
            .replace(/\s+as$/, "")
        : null;
      if (sp === "") sp = "''";
      out.push({
        kind: "def",
        sig,
        sp,
        definer: /security\s+definer/i.test(header),
      });
    }
  }
  return out;
}

function liveDefiner(): { sig: string; sp: string | null }[] {
  const live = new Map<string, { sp: string | null }>();
  for (const e of events()) {
    if (e.kind === "drop") live.delete(e.sig);
    else if (e.definer) live.set(e.sig, { sp: e.sp });
  }
  return [...live.entries()].map(([sig, v]) => ({ sig, sp: v.sp }));
}

function altersIn079(): Set<string> {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql") && /^0079/.test(f))
    .sort();
  const found = new Set<string>();
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), "utf8");
    const re = /alter\s+function\s+([a-zA-Z0-9_."]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      let depth = 0;
      let args = "";
      const k = m.index + m[0].length - 1;
      for (let j = k; j < sql.length; j++) {
        const c = sql[j]!;
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) {
            args = sql.slice(k + 1, j);
            break;
          }
        }
      }
      const tail = sql.slice(k + args.length + 1, k + args.length + 120);
      if (!/set\s+search_path\s*(?:=|to)\s*['"]?\s*''/i.test(tail)) continue;
      found.add(`${m[1]!.replace(/"/g, "").toLowerCase()}(${normTypes(args)})`);
    }
  }
  return found;
}

describe("M-1+R-2 search_path terkunci (static)", () => {
  it("migrasi 0079 mengunci semua DEFINER live ber-path lemah", () => {
    const weak = liveDefiner().filter((d) => d.sp !== "''");
    expect(weak.length).toBeGreaterThan(0);
    const alters = altersIn079();
    const deferred = new Set(DEFERRED.map((d) => d.sig));
    const missing = weak
      .map((d) => d.sig)
      .filter((s) => !alters.has(s) && !deferred.has(s));
    expect(
      missing,
      `DEFINER tanpa kunci & tanpa defer:\n${missing.join("\n")}`
    ).toEqual([]);
  });
});

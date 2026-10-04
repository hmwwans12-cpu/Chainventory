import { describe, expect, it } from "vitest";

import { getClientIp } from "@/lib/security/rate-limit";

/**
 * R-3: dimensi IP rate-limit bergantung header (tidak terpercaya penuh).
 *
 * `x-forwarded-for[0]` dapat di-spoof client → bucket `ip:` mudah dirotasi.
 * `x-real-ip` (ditulis platform/Vercel dari koneksi TCP) diprioritaskan;
 * IP hanya sinyal lunak — mutasi terautentikasi mengandalkan dimensi
 * `user:` yang tak dapat di-spoof (lihat komentar getClientIp + BE-19).
 * Test ini mengunci precedence header tersebut.
 */
function req(headers: Record<string, string>): Request {
  return new Request("https://x.test/", { headers });
}

describe("R-3 getClientIp precedence (unit)", () => {
  it("x-real-ip menang atas x-forwarded-for", () => {
    expect(
      getClientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))
    ).toBe("1.1.1.1");
  });

  it("fallback ke entri pertama x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe(
      "2.2.2.2"
    );
  });

  it("null bila header absen; whitespace di-trim", () => {
    expect(getClientIp(req({}))).toBeNull();
    expect(getClientIp(req({ "x-real-ip": "  1.1.1.1  " }))).toBe("1.1.1.1");
  });
});

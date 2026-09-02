/**
 * Shared client helpers untuk Route Handler (BFF).
 *
 * Thin typed wrapper: JSON request → parse respons → hasil terstruktur
 * `ApiResult`. Server tetap satu-satunya sumber validasi (zod di
 * `lib/validators/*`); klien hanya memetakan HTTP → hasil. Mirip pola
 * `lib/warehouses/join-client.ts`, dipakai lintas modul klien.
 */

export type ApiSuccess<T> = { ok: true; status: number; data: T };
export type ApiFailure = {
  ok: false;
  status: number;
  error: string;
  errorCode?: string;
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type Fetcher = typeof fetch;

export type { Fetcher };

export function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export async function sendJson(
  path: string,
  init: { method?: string; body?: unknown },
  fetcher: Fetcher = fetch
): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetcher(path, {
      method: init.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(init.body ?? {}),
    });
  } catch {
    // M-08: network down / DNS / reset — jangan biarkan exception membuat
    // UI hang; petakan ke failure standar (status 0).
    return {
      status: 0,
      json: {
        ok: false,
        error: "Network error. Please check your connection and try again.",
      },
    };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

export function toFailure<T>(status: number, json: unknown): ApiResult<T> {
  const payload =
    json && typeof json === "object" && "error" in json
      ? (json as { error?: unknown; errorCode?: unknown })
      : {};
  return {
    ok: false,
    status,
    error:
      typeof payload.error === "string"
        ? payload.error
        : "Something went wrong. Please try again.",
    errorCode:
      typeof payload.errorCode === "string" ? payload.errorCode : undefined,
  };
}

export function parseSuccess<T>(status: number, json: unknown): ApiResult<T> {
  if (status >= 200 && status < 300) {
    const body = json as { ok?: boolean; data?: T };
    // Audit v0.3.0 §1.4: BFF kadang mengembalikan { ok: true } tanpa
    // `data` (mis. RPC yang return void). Jika caller menggunakan
    // `created.data.id` dll, akan crash. Tangani sebagai failure.
    if (body?.ok === true && "data" in body) {
      return { ok: true, status, data: body.data as T };
    }
    if (body?.ok === true) {
      return toFailure<T>(
        status,
        { error: "Server returned success without a payload." }
      );
    }
    return { ok: true, status, data: body?.data as T };
  }
  return toFailure<T>(status, json);
}

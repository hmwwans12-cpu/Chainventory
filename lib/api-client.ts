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
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const value = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(12, 15)}-8${value.slice(15, 18)}-${value.slice(18, 30)}`.padEnd(
    36,
    "0"
  );
}

export function isRetryableApiFailure(result: {
  ok: boolean;
  status: number;
}): boolean {
  return (
    result.status === 0 ||
    result.status === 202 ||
    result.status === 408 ||
    result.status === 429 ||
    result.status >= 500
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
    const body =
      json !== null && typeof json === "object"
        ? (json as { ok?: boolean; data?: T })
        : null;
    if (body?.ok === false) {
      return toFailure<T>(status, json);
    }
    if (body?.ok === true && "data" in body) {
      return { ok: true, status, data: body.data as T };
    }
    if (body?.ok === true) {
      return toFailure<T>(status, {
        error: "Server returned success without a payload.",
      });
    }
    return { ok: true, status, data: body?.data as T };
  }
  return toFailure<T>(status, json);
}

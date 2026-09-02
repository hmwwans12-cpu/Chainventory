/**
 * Join Warehouse — client helpers (DESIGN §30, route `/api/warehouses/membership`).
 *
 * Thin typed wrapper over POST action=request (RPC `request_join`). Pure fetch
 * (testable via injected `fetcher`). Server tetap satu-satunya sumber validasi
 * (zod di `lib/validators/membership.ts`); klien hanya memetakan HTTP → hasil.
 */

export const REQUEST_JOIN_ROUTE = "/api/warehouses/membership";

export type JoinRequestResult = {
  id: string;
  status: string;
  /** Audit v0.3.3 §2.20: warehouse name dari warehouse_summaries. */
  warehouse_name?: string;
};

export type ApiSuccess<T> = { ok: true; status: number; data: T };
export type ApiFailure = {
  ok: false;
  status: number;
  error: string;
  errorCode?: string;
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type Fetcher = typeof fetch;

async function postJson(
  path: string,
  body: unknown,
  fetcher: Fetcher
): Promise<{ status: number; json: unknown }> {
  const res = await fetcher(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function toFailure<T>(status: number, json: unknown): ApiResult<T> {
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

export async function requestJoin(
  warehouseCode: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<JoinRequestResult>> {
  const { status, json } = await postJson(
    `${REQUEST_JOIN_ROUTE}?action=request`,
    { warehouseCode },
    fetcher
  );
  if (status === 200) {
    const body = json as { ok: boolean; data: JoinRequestResult };
    return { ok: true, status, data: body.data };
  }
  return toFailure<JoinRequestResult>(status, json);
}

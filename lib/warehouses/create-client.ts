/**
 * Create Warehouse — client helpers (DESIGN §27–28, route `/api/warehouses/create`).
 *
 * Thin typed wrappers over POST prepare/submit. Pure fetch (testable via injected
 * `fetcher`). Server tetap satu-satunya sumber validasi (zod di
 * `lib/validators/warehouse.ts`); klien hanya memetakan HTTP → hasil terstruktur.
 */

export const CREATE_WAREHOUSE_ROUTE = "/api/warehouses/create";

export type CreateWarehouseMeta = {
  name: string;
  companyName?: string;
  warehouseType?: string;
};

/** Bentuk `typedData` persis seperti di-return route (semua numeric string). */
export type DeploymentTypedData = {
  domain: {
    name: string;
    version: string;
    chainId: string;
    verifyingContract: string;
  };
  types: { DeploymentAuthorization: { name: string; type: string }[] };
  primaryType: "DeploymentAuthorization";
  message: {
    owner: string;
    warehouseCodeHash: string;
    deploymentNonce: string;
    expiry: string;
  };
};

export type PreparedDeployment = {
  owner: string;
  warehouseCode: string;
  idempotencyKey: string;
  expiresAt: number;
  deploymentNonce: string;
  typedData: DeploymentTypedData;
};

export type SubmitResult = {
  status: "confirmed" | "submitted";
  warehouseId: string;
  deploymentId: string;
  warehouseCode: string;
  contractAddress: string | null;
  txHash: string | null;
};

export type SubmitPayload = CreateWarehouseMeta & {
  idempotencyKey: string;
  warehouseCode: string;
  signature: string;
  owner: string;
  warehouseCodeHash: string;
  deploymentNonce: string;
  expiry: string;
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

export async function prepareDeployment(
  meta: CreateWarehouseMeta,
  fetcher: Fetcher = fetch
): Promise<ApiResult<PreparedDeployment>> {
  const { status, json } = await postJson(
    `${CREATE_WAREHOUSE_ROUTE}?action=prepare`,
    meta,
    fetcher
  );
  if (status === 200) {
    const body = json as { ok: boolean; data: PreparedDeployment };
    return { ok: true, status, data: body.data };
  }
  return toFailure<PreparedDeployment>(status, json);
}

export async function submitDeployment(
  payload: SubmitPayload,
  fetcher: Fetcher = fetch
): Promise<ApiResult<SubmitResult>> {
  const { status, json } = await postJson(
    `${CREATE_WAREHOUSE_ROUTE}?action=submit`,
    payload,
    fetcher
  );
  if (status === 200 || status === 202) {
    const body = json as { ok: boolean; data: SubmitResult };
    return { ok: true, status, data: body.data };
  }
  return toFailure<SubmitResult>(status, json);
}

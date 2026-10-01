import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StartupHealthBanner } from "@/components/shared/startup-health-banner";

vi.mock("@/components/providers/locale-provider", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

describe("StartupHealthBanner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when every check passes", async () => {
    mockFetchOnce(200, {
      ok: true,
      checks: [{ key: "factory", ok: true, detail: "v1" }],
    });
    const { container } = render(<StartupHealthBanner />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("shows failed checks with an alert role", async () => {
    mockFetchOnce(503, {
      ok: false,
      checks: [
        { key: "factory", ok: false, detail: "No contract code." },
        { key: "jwks", ok: true, detail: "2 keys." },
      ],
    });
    render(<StartupHealthBanner />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("factory");
    expect(alert.textContent).toContain("No contract code.");
    expect(alert.textContent).not.toContain("jwks");
  });

  it("stays silent when the endpoint itself is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const { container } = render(<StartupHealthBanner />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.firstChild).toBeNull();
  });
});

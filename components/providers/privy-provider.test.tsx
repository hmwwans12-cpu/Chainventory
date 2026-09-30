import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authSyncStarted: false,
  createWallet: vi.fn(),
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: { children: React.ReactNode }) => children,
  SUPPORTED_CHAINS: [{ id: 84532 }],
  useCreateWallet: () => ({ createWallet: state.createWallet }),
  useLogout: () => ({ logout: vi.fn().mockResolvedValue(undefined) }),
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    user: { id: "privy-user" },
    error: null,
  }),
  useSubscribeToJwtAuthWithFlag: (options: {
    isAuthenticated?: boolean;
    onAuthenticated?: (event: {
      user: {
        id: string;
        linkedAccounts: Array<{ type: string; customUserId?: string }>;
      };
    }) => void;
  }) => {
    if (options.isAuthenticated && !state.authSyncStarted) {
      state.authSyncStarted = true;
      queueMicrotask(() =>
        options.onAuthenticated?.({
          user: {
            id: "did:privy:supabase-user",
            linkedAccounts: [
              { type: "custom_auth", customUserId: "supabase-user" },
            ],
          },
        })
      );
    }
    return { state: { status: "done" } };
  },
  useWallets: () => ({ wallets: [], ready: true }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => state.supabase,
}));

vi.mock("@/lib/wallets/use-wallet-sync", () => ({
  useWalletSync: () => ({
    syncing: false,
    synced: [],
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  PrivyProvider,
  usePrivySession,
} from "@/components/providers/privy-provider";

function Consumer() {
  const { walletState, retryWallet } = usePrivySession();
  return (
    <button type="button" onClick={retryWallet}>
      {walletState}
    </button>
  );
}

describe("PrivyProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    state.authSyncStarted = false;
    vi.clearAllMocks();
  });

  it("does not retry wallet creation in a loop after a quota error", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app");
    state.createWallet.mockRejectedValue(new Error("User limit reached"));
    state.supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "test-token",
          user: { id: "supabase-user" },
        },
      },
      error: null,
    });
    state.supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(
      <PrivyProvider>
        <Consumer />
      </PrivyProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("error")
    );
    expect(state.createWallet).toHaveBeenCalledTimes(1);
  });
});

"use client";

import {
  PrivyProvider as PrivyReactProvider,
  SUPPORTED_CHAINS,
  useCreateWallet,
  useLogout,
  usePrivy,
  useSubscribeToJwtAuthWithFlag,
  useWallets,
} from "@privy-io/react-auth";
import type { User as PrivyUser } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import {
  useWalletSync,
  type WalletSyncState,
} from "@/lib/wallets/use-wallet-sync";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

const BASE_SEPOLIA = SUPPORTED_CHAINS.find(
  (chain) => chain.id === BASE_SEPOLIA_CHAIN_ID
) as (typeof SUPPORTED_CHAINS)[number];

type WalletState = "idle" | "creating" | "ready" | "error";
type WalletRuntime = {
  userId: string | null;
  state: WalletState;
  error: string | null;
};

type PrivySessionContextValue = {
  supabaseUserId: string | null;
  supabaseLoading: boolean;
  authError: string | null;
  retryAuth: () => void;
  privyReady: boolean;
  privyAuthenticated: boolean;
  walletState: WalletState;
  walletError: string | null;
  walletAddress: string | null;
  walletSync: WalletSyncState;
  retryWallet: () => void;
};

const PrivySessionContext = createContext<PrivySessionContextValue | null>(
  null
);

const EMPTY_PRIVY_SESSION: PrivySessionContextValue = {
  supabaseUserId: null,
  supabaseLoading: false,
  authError: null,
  retryAuth: () => undefined,
  privyReady: false,
  privyAuthenticated: false,
  walletState: "error",
  walletError: "Wallet service is not configured.",
  walletAddress: null,
  walletSync: {
    syncing: false,
    synced: [],
    error: null,
    retry: () => undefined,
  },
  retryWallet: () => undefined,
};

function getWalletError(error: unknown): string {
  if (error instanceof Error && /user limit reached/i.test(error.message)) {
    return "Wallet capacity is currently unavailable. Please try again later.";
  }
  return "Your wallet could not be created. Please try again.";
}

function isCurrentSupabaseUser(
  privyUser: PrivyUser,
  supabaseUserId: string | null
): boolean {
  if (!supabaseUserId) return false;
  return privyUser.linkedAccounts.some(
    (account) =>
      account.type === "custom_auth" && account.customUserId === supabaseUserId
  );
}

function JwtAuthBridge({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [resettingPrivy, setResettingPrivy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [privySyncedUserId, setPrivySyncedUserId] = useState<string | null>(
    null
  );
  const userIdRef = useRef<string | null>(null);
  const resetInFlightRef = useRef(false);

  const { ready, authenticated, user, error: privyError } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { logout } = useLogout();
  const walletSync = useWalletSync(
    undefined,
    Boolean(supabaseUserId) &&
      !supabaseLoading &&
      privySyncedUserId === supabaseUserId,
    supabaseUserId
  );
  const { retry: retryWalletSync } = walletSync;
  const walletSyncRefreshRef = useRef(false);
  const [walletRuntime, setWalletRuntime] = useState<WalletRuntime>({
    userId: null,
    state: "idle",
    error: null,
  });
  const walletAttemptRef = useRef<{
    userId: string | null;
    attempted: boolean;
  }>({ userId: null, attempted: false });
  const walletUserId = user?.id ?? null;
  const hasEmbeddedWallet = wallets.some(
    (wallet) =>
      wallet.type === "ethereum" &&
      wallet.connectorType === "embedded" &&
      wallet.walletClientType !== "guest"
  );
  // Display: embedded diutamakan, fallback ke external non-guest agar user
  // connect external tidak lagi terlihat "tidak punya wallet".
  const walletAddress =
    wallets.find(
      (wallet) =>
        wallet.type === "ethereum" &&
        wallet.connectorType === "embedded" &&
        wallet.walletClientType !== "guest"
    )?.address ??
    wallets.find(
      (wallet) =>
        wallet.type === "ethereum" && wallet.walletClientType !== "guest"
    )?.address ??
    null;
  const currentWalletRuntime: WalletRuntime =
    walletRuntime.userId === walletUserId
      ? walletRuntime
      : { userId: walletUserId, state: "idle", error: null };
  const walletState = hasEmbeddedWallet ? "ready" : currentWalletRuntime.state;
  const walletError = hasEmbeddedWallet ? null : currentWalletRuntime.error;

  const applySupabaseSession = useCallback(
    (nextUserId: string | null) => {
      const previousUserId = userIdRef.current;
      if (previousUserId !== nextUserId) setPrivySyncedUserId(null);
      if (previousUserId && nextUserId && previousUserId !== nextUserId) {
        if (resetInFlightRef.current) return;
        resetInFlightRef.current = true;
        setResettingPrivy(true);
        setSupabaseUserId(null);
        setSupabaseLoading(true);
        setAuthError(null);
        void logout()
          .then(() => {
            userIdRef.current = nextUserId;
            setSupabaseUserId(nextUserId);
            setSupabaseLoading(false);
          })
          .catch(() => {
            userIdRef.current = null;
            setSupabaseUserId(null);
            setSupabaseLoading(false);
            setAuthError("Privy session reset failed. Please try again.");
          })
          .finally(() => {
            resetInFlightRef.current = false;
            setResettingPrivy(false);
          });
        return;
      }

      userIdRef.current = nextUserId;
      setSupabaseUserId(nextUserId);
      setSupabaseLoading(false);
    },
    [logout]
  );

  useEffect(() => {
    let active = true;
    const readSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          setSupabaseLoading(false);
          setAuthError("Supabase session is temporarily unavailable.");
          return;
        }
        applySupabaseSession(data.session?.user.id ?? null);
      } catch {
        if (!active) return;
        setSupabaseLoading(false);
        setAuthError("Supabase session is temporarily unavailable.");
      }
    };

    void readSession();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySupabaseSession(session?.user.id ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySupabaseSession, supabase]);

  const getExternalJwt = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) return undefined;
      return data.session?.access_token;
    } catch {
      return undefined;
    }
  }, [supabase]);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setPrivySyncedUserId(null);
    setSupabaseUserId(null);
    setSupabaseLoading(true);
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setSupabaseLoading(false);
          setAuthError("Supabase session is temporarily unavailable.");
          return;
        }
        applySupabaseSession(data.session?.user.id ?? null);
      })
      .catch(() => {
        setSupabaseLoading(false);
        setAuthError("Supabase session is temporarily unavailable.");
      });
  }, [applySupabaseSession, supabase]);

  const { state: jwtState } = useSubscribeToJwtAuthWithFlag({
    isAuthenticated: Boolean(supabaseUserId) && !supabaseLoading,
    isLoading: supabaseLoading || resettingPrivy,
    getExternalJwt,
    onAuthenticated: ({ user: privyUser }) => {
      if (isCurrentSupabaseUser(privyUser, supabaseUserId)) {
        setPrivySyncedUserId(supabaseUserId);
        setAuthError(null);
        return;
      }
      setPrivySyncedUserId(null);
      setAuthError("Privy identity does not match the current account.");
      void logout();
    },
    onUnauthenticated: () => {
      setPrivySyncedUserId(null);
      if (supabaseUserId) {
        setAuthError("Privy authentication is temporarily unavailable.");
      }
    },
    onError: () => {
      setPrivySyncedUserId(null);
      setAuthError("Privy authentication is temporarily unavailable.");
    },
  });

  useEffect(() => {
    walletSyncRefreshRef.current = false;
  }, [supabaseUserId]);

  useEffect(() => {
    if (walletSyncRefreshRef.current || walletSync.synced.length === 0) return;
    walletSyncRefreshRef.current = true;
    router.refresh();
  }, [router, walletSync.synced]);

  useEffect(() => {
    if (walletAttemptRef.current.userId !== walletUserId) {
      walletAttemptRef.current = { userId: walletUserId, attempted: false };
    }
  }, [walletUserId]);

  useEffect(() => {
    if (
      !supabaseUserId ||
      privySyncedUserId !== supabaseUserId ||
      !ready ||
      !authenticated ||
      !walletsReady ||
      hasEmbeddedWallet
    ) {
      return;
    }
    if (walletAttemptRef.current.attempted || walletState === "error") return;

    walletAttemptRef.current = {
      userId: walletUserId,
      attempted: true,
    };
    void createWallet()
      .then(() => {
        setWalletRuntime({
          userId: walletUserId,
          state: "creating",
          error: null,
        });
      })
      .catch((error: unknown) => {
        setWalletRuntime({
          userId: walletUserId,
          state: "error",
          error: getWalletError(error),
        });
      });
  }, [
    authenticated,
    createWallet,
    hasEmbeddedWallet,
    privySyncedUserId,
    ready,
    supabaseUserId,
    walletState,
    walletUserId,
    walletsReady,
  ]);

  const retryWallet = useCallback(() => {
    if (!ready || !authenticated) return;
    walletAttemptRef.current = { userId: walletUserId, attempted: false };
    retryWalletSync();
    setWalletRuntime({ userId: walletUserId, state: "idle", error: null });
  }, [authenticated, ready, retryWalletSync, walletUserId]);

  const contextValue = useMemo<PrivySessionContextValue>(
    () => ({
      supabaseUserId,
      supabaseLoading,
      authError:
        authError ?? (privyError ? "Privy is temporarily unavailable." : null),
      retryAuth,
      privyReady: ready,
      privyAuthenticated: authenticated,
      walletState,
      walletError,
      walletAddress,
      walletSync,
      retryWallet,
    }),
    [
      authenticated,
      authError,
      privyError,
      ready,
      retryAuth,
      retryWallet,
      supabaseLoading,
      supabaseUserId,
      walletAddress,
      walletError,
      walletState,
      walletSync,
    ]
  );

  return (
    <PrivySessionContext.Provider value={contextValue}>
      {children}
      <span hidden data-privy-jwt-state={jwtState.status} />
    </PrivySessionContext.Provider>
  );
}

export function usePrivySession() {
  return useContext(PrivySessionContext) ?? EMPTY_PRIVY_SESSION;
}

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;

  return (
    <PrivyReactProvider
      appId={appId}
      config={{
        supportedChains: [BASE_SEPOLIA],
        defaultChain: BASE_SEPOLIA,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "off",
          },
        },
      }}
    >
      <JwtAuthBridge>{children}</JwtAuthBridge>
    </PrivyReactProvider>
  );
}

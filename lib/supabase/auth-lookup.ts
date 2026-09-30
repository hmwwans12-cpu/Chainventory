import type { SupabaseClient, User } from "@supabase/supabase-js";

type AuthErrorLike = {
  name?: string;
  code?: string;
  status?: number;
};

export type AuthLookup =
  | { status: "authenticated"; user: User }
  | { status: "missing" }
  | { status: "unavailable"; error: unknown };

function isMissingAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as AuthErrorLike;
  return (
    authError.name === "AuthSessionMissingError" ||
    authError.name === "AuthInvalidJwtError" ||
    authError.code === "invalid_jwt" ||
    authError.status === 401
  );
}

export function classifyAuthLookup(
  user: User | null,
  error: unknown
): AuthLookup {
  if (user) return { status: "authenticated", user };
  if (!error || isMissingAuthError(error)) return { status: "missing" };
  return { status: "unavailable", error };
}

export async function getAuthLookup(
  supabase: Pick<SupabaseClient, "auth">
): Promise<AuthLookup> {
  try {
    const { data, error } = await supabase.auth.getUser();
    return classifyAuthLookup(data.user, error);
  } catch (error) {
    return { status: "unavailable", error };
  }
}

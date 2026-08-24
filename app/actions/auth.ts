"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { loginSchema, signupSchema } from "@/lib/validators/auth";

/**
 * Server actions for authentication (Auth Foundation).
 *
 * DESIGN §25 flow:
 *   Warehouse Code → Continue → Supabase Auth (email/Google) → session →
 *   Privy custom-auth (wallet layer) → embedded wallet.
 *
 * Privy wallet wiring is added in the wallet phase (P1); here we establish
 * the Supabase session that Privy custom-auth will consume.
 */

/**
 * Whitelist tujuan post-login (audit H-01): hanya path internal relatif,
 * tanpa protokol/double-slash — mencegah open redirect.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/dashboard";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

export async function loginAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string | null }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  // H-01: hormati tujuan awal user (?next=) — sudah di-whitelist.
  redirect(safeNext(formData.get("next")));
}

export async function signupAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string | null }> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    gender: formData.get("gender"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.name,
        gender: parsed.data.gender,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}

export async function resetPasswordAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string | null; success?: boolean }> {
  const email = formData.get("email");
  if (!email || typeof email !== "string") {
    return { error: "Please enter your email address." };
  }

  // H-02: recovery code dari email ditukar sesi lewat /auth/confirm
  // (exchangeCodeForSession) SEBELUM halaman reset-password dipakai.
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null, success: true };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Google OAuth (DESIGN §25/§28): Supabase Auth sebagai identitas utama.
 * PKCE flow - verifier disimpan di cookie oleh server client, kode
 * ditukar di /auth/callback. Provider Google diaktifkan di dashboard.
 */
export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
  }

  redirect(data.url);
}

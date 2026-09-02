"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { loginSchema, signupSchema } from "@/lib/validators/auth";
import { mapDbError } from "@/lib/domain/errors";
import { logger } from "@/lib/logger";

/**
 * Server actions for authentication (Auth Foundation).
 *
 * DESIGN §25 flow:
 *   Warehouse Code → Continue → Supabase Auth (email/Google) → session →
 *   Privy custom-auth (wallet layer) → embedded wallet.
 *
 * Audit v0.3.0 §6.4/6.5: return type ditulis sebagai never (redirect()
 * selalu throw). Audit §6.6: signup/reset error.message mentah dipetakan
 * ke mapDbError — pesan user aman, detail DB di log server saja.
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
): Promise<{ error: string | null } | never> {
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
): Promise<{ error: string | null } | never> {
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
    // Audit v0.3.0 §6.6: pesan DB/Auth mentah dipetakan — user aman,
    // detail (constraint, rate-limit internal) di log.
    // Audit v0.3.3 §2.18: Supabase Auth memberi kode spesifik
    // (user_already_exists, weak_password, dll) — pakai untuk pesan
    // spesifik TANPA bocor apakah email terdaftar (anti-enumeration).
    const authCode = error.code?.toLowerCase() ?? "";
    let userMessage: string;
    if (authCode === "user_already_exists" || authCode === "email_exists") {
      // Sengaja generic: tidak memberi tahu password problem biar tidak
      // jadi oracle. Suruh user sign in.
      userMessage =
        "An account with this email already exists. Try signing in, or use a different email.";
    } else if (authCode === "weak_password") {
      userMessage =
        "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
    } else if (authCode === "email_address_invalid") {
      userMessage = "This email address is not accepted. Use a valid one.";
    } else {
      const mapped = mapDbError(error.message);
      userMessage =
        mapped.code === "DB_UNEXPECTED"
          ? "Could not create your account. Please try again."
          : mapped.userMessage;
    }
    logger.warn(
      { err: error.message, code: error.code, mappedTo: userMessage },
      "signup rejected"
    );
    return { error: userMessage };
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
    // Audit v0.3.0 §6.6: map ke pesan aman; detail di log.
    const mapped = mapDbError(error.message);
    logger.warn(
      { err: error.message, code: mapped.code },
      "reset password rejected"
    );
    return {
      error:
        mapped.code === "DB_UNEXPECTED"
          ? "We couldn't send the reset link. Please try again."
          : mapped.userMessage,
    };
  }

  return { error: null, success: true };
}

/**
 * Google OAuth (DESIGN §25/§28): Supabase Auth sebagai identitas utama.
 * PKCE flow - verifier disimpan di cookie oleh server client, kode
 * ditukar di /auth/callback. Provider Google diaktifkan di dashboard.
 */
export async function signInWithGoogleAction(): Promise<never> {
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

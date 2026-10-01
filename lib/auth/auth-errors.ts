/**
 * Pemetaan pesan error auth Inggris → key i18n (pola translateError
 * product-form, dipusatkan agar keempat form auth konsisten).
 *
 * Skema zod + server action memakai literal Inggris sebagai pesan; helper
 * ini memetakannya ke `auth.*`. Pesan yang SUDAH terjemahan (dari server
 * action yang memakai t() langsung) atau pesan tak dikenal (mapDbError,
 * Supabase mentah) dilewatkan apa adanya — jangan pernah menampilkan
 * key mentah ke user.
 */

const KEY_BY_MESSAGE: Record<string, string> = {
  "Enter a valid email address.": "auth.error_email",
  "Password must be at least 8 characters.": "auth.error_password",
  "Name must be at least 2 characters.": "auth.error_name",
  "Select your gender.": "auth.error_gender",
  "Invalid input.": "auth.error_invalid_input",
  "Invalid email or password.": "auth.error_invalid_credentials",
  "An account with this email already exists. Try signing in, or use a different email.":
    "auth.error_user_exists",
  "Password is too weak. Use at least 8 characters with a mix of letters and numbers.":
    "auth.error_weak_password",
  "This email address is not accepted. Use a valid one.":
    "auth.error_email_invalid",
  "Could not create your account. Please try again.":
    "auth.error_signup_failed",
  "Check your email to confirm your account, then return here to sign in.":
    "auth.error_confirm_email",
  "Please enter your email address.": "auth.error_enter_email",
  "We couldn't send the reset link. Please try again.":
    "auth.error_reset_failed",
  "Passwords do not match.": "auth.reset_mismatch",
};

export function authMessageKey(message: string | undefined): string | null {
  if (!message) return null;
  return KEY_BY_MESSAGE[message] ?? null;
}

export function translateAuthMessage(
  t: (key: string) => string,
  message: string | undefined,
  fallback = ""
): string {
  if (!message) return fallback;
  const key = authMessageKey(message);
  return key ? t(key) : message;
}

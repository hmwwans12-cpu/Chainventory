"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { fromPostgrestError } from "@/lib/api-handler";
import { getAuthLookup } from "@/lib/supabase/auth-lookup";

export type UpdateProfileState = {
  error: string | null;
  success?: boolean;
};

const NAME_MAX = 80;

/**
 * Update the current user's display name (DESIGN §30 / Settings profile).
 * User may edit their own `users.display_name`; RLS confines the write to
 * the authenticated row.
 */
export async function updateDisplayNameAction(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const raw = formData.get("displayName");
  const value = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";

  if (!value) {
    return { error: "Display name cannot be empty." };
  }
  if (value.length > NAME_MAX) {
    return { error: `Display name must be ${NAME_MAX} characters or fewer.` };
  }

  const supabase = await createClient();
  const auth = await getAuthLookup(supabase);
  if (auth.status === "unavailable") {
    return {
      error: "Your session is temporarily unavailable. Please try again.",
    };
  }
  if (auth.status === "missing") {
    return { error: "You must be signed in to update your profile." };
  }
  const user = auth.user;

  const { error } = await supabase
    .from("users")
    .update({ display_name: value })
    .eq("id", user.id);

  if (error) {
    // Pesan DB mentah (constraint/RLS) tidak pernah sampai ke client;
    // mapDbError merangkum ke pesan user-friendly dan log detail.
    const mapped = fromPostgrestError(error.message);
    const body = await mapped.json();
    return { error: body?.error?.message ?? "Could not update profile." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

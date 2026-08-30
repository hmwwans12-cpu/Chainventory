"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update your profile." };
  }

  const { error } = await supabase
    .from("users")
    .update({ display_name: value })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

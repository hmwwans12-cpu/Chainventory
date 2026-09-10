"use client";

import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { ErrorState } from "@/components/shared/error-state";

/**
 * ErrorState untuk Server Component (FE-15): server tidak bisa mengoper
 * callback retry melewati batas RSC — wrapper client ini memberi tombol
 * "Try again" via router.refresh(). Pakai di semua halaman server yang
 * sebelumnya menampilkan ErrorState tanpa retry.
 */
export function RetryErrorState({
  title,
  description,
  icon,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
}) {
  const router = useRouter();
  return (
    <ErrorState
      title={title}
      description={description}
      icon={icon}
      onRetry={() => router.refresh()}
    />
  );
}

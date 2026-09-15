"use client";

import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/shared/error-state";
import { RSC_ICONS, type RscIconName } from "@/components/shared/rsc-icons";

/**
 * ErrorState untuk Server Component (FE-15): server tidak bisa mengoper
 * callback retry melewati batas RSC — wrapper client ini memberi tombol
 * "Try again" via router.refresh(). Pakai di semua halaman server yang
 * sebelumnya menampilkan ErrorState tanpa retry.
 *
 * `icon` berupa NAMA (rsc-icons.ts), bukan komponen Lucide — definisi
 * komponen tidak serializable melewati batas RSC (lihat modul tersebut).
 */
export function RetryErrorState({
  title,
  description,
  icon,
}: {
  title?: string;
  description?: string;
  icon?: RscIconName;
}) {
  const router = useRouter();
  return (
    <ErrorState
      title={title}
      description={description}
      icon={icon ? RSC_ICONS[icon] : undefined}
      onRetry={() => router.refresh()}
    />
  );
}

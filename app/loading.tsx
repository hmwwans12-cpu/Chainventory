import { Skeleton } from "@/components/ui/skeleton";

/**
 * Global loading fallback (P2 audit A2) — skeleton netral tanpa teks,
 * jadi tidak ada masalah locale. Segmen dengan loading.tsx sendiri
 * (console/blockchain) memakai versi mereka yang lebih kaya.
 */
export default function GlobalLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-8">
      <Skeleton className="h-9 w-56 rounded-lg" />
      <Skeleton className="h-4 w-80 rounded" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="min-h-[180px] rounded-xl" />
        <Skeleton className="min-h-[180px] rounded-xl" />
      </div>
    </main>
  );
}

/**
 * Global loading fallback (DESIGN §45 — skeleton states).
 */
export default function Loading() {
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="border-border border-t-primary size-8 animate-spin rounded-full border-2" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    </div>
  );
}

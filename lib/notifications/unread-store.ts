/**
 * Shared unread-count store (audit 0.1.5 P2-06).
 *
 * Sebelumnya Sidebar (polling) dan NotificationBell (realtime) masing-masing
 * memegang salinan sendiri — badge bisa drift dari panel. Kini keduanya
 * membaca/menulis SATU nilai melalui store modular ini; transport masing-
 * masing dipertahankan (polling sidebar murah; realtime tetap milik bell
 * demi lifecycle channel yang sehat).
 */
type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

export const unreadStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): number {
    return count;
  },
  set(next: number): void {
    const clamped = Math.max(0, next);
    if (clamped === count) return;
    count = clamped;
    for (const listener of listeners) listener();
  },
  /** Optimistic adjust (mis. mark-one-read di bell): -1 / +n. */
  adjust(delta: number): void {
    unreadStore.set(count + delta);
  },
};

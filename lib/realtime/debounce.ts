/**
 * Trailing debounce util (audit 0.1.5 P2-05).
 *
 * Realtime event beruntun (movement→proof→movement…) tidak boleh memicu N
 * full fetch / router.refresh(); invalidasi cukup satu kali setelah hening.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return wrapped;
}

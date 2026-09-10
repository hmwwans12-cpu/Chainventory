import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Buka channel Realtime yang SELALU baru (runtime crash fix).
 *
 * `supabase.channel(topic)` mengembalikan instance LAMA bila topik sama
 * masih terdaftar — dan `removeChannel()` TIDAK menghapusnya dari daftar
 * (hanya unsubscribe async). Akibatnya `.on()` setelah `.subscribe()`
 * melempar "cannot add callbacks after subscribe()" pada:
 *   - StrictMode double-mount (dev),
 *   - retry reconnect yang overlap dengan start(),
 *   - cleanup → remount dalam tick yang sama.
 *
 * Topik unik per attempt (`base#seq`) menghindari tabrakan seluruhnya;
 * channel lama tetap di-remove seperti biasa (leave diproses server).
 * Filter postgres_changes tidak terpengaruh nama topik.
 */
let channelSeq = 0;

export function openChannel(supabase: SupabaseClient, base: string) {
  channelSeq += 1;
  return supabase.channel(`${base}#${channelSeq}`);
}

import pkg from "../package.json";

/**
 * Single source of truth versi aplikasi (audit 0.1.5 P2-06).
 * Diimpor dari package.json — health endpoint dan tooling lain membaca
 * dari sini agar tidak ada drift antar tempat.
 */
export const APP_VERSION = pkg.version;

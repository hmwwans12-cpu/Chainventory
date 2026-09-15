import {
  ArrowDownToLine,
  ArrowLeftRight,
  Layers,
  Link2,
  Package,
  PackageMinus,
  PackagePlus,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Ikon serializable untuk batas React Server Component.
 *
 * Aturan RSC: Server Component TIDAK boleh mengoper definisi komponen
 * (objek berisi `render: function...`, mis. ikon Lucide) sebagai prop ke
 * Client Component — runtime melempar "Only plain objects can be passed...".
 * tsc/eslint/next build TIDAK menangkap ini (halaman force-dynamic tidak
 * dieksekusi saat build), dan E2E lama lolos karena user baru tanpa warehouse
 * tidak pernah me-render cabang yang mengandung ikon.
 *
 * Pola: server mengoper NAMA string (serializable), Client Component
 * me-resolve ke komponen Lucide di sini. Tambahkan entri bila halaman server
 * butuh ikon baru di Client Component — JANGAN oper komponen langsung.
 */
export const RSC_ICONS = {
  package: Package,
  layers: Layers,
  "package-plus": PackagePlus,
  "package-minus": PackageMinus,
  "arrow-left-right": ArrowLeftRight,
  "link-2": Link2,
  users: Users,
  "arrow-down-to-line": ArrowDownToLine,
} as const satisfies Record<string, LucideIcon>;

export type RscIconName = keyof typeof RSC_ICONS;

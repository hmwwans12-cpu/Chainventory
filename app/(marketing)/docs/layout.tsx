import { source } from "@/lib/source";
import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

const docsOptions: DocsLayoutProps = {
  tree: source.getPageTree(),
  nav: {
    title: "Chainventory",
  },
  links: [
    {
      text: "Dashboard",
      url: "/dashboard",
    },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    // Brand terkunci light-only (DESIGN §4). Tanpa ini, next-themes bawaan
    // fumadocs menyetel class .dark di <html> saat masuk /docs dan class itu
    // tersangkut saat kembali ke landing -> bug warna.
    <RootProvider
      // Nonaktifkan theme provider bawaan fumadocs (next-themes) — provider
      // itu menyuntik <script> yang ditolak React 19/Next 16 (console error).
      // Docs tetap light-only sesuai DESIGN §4. Global dark mode (toggle kita)
      // tidak memengaruhi docs.
      theme={{ enabled: false }}
    >
      <DocsLayout {...docsOptions}>{children}</DocsLayout>
    </RootProvider>
  );
}

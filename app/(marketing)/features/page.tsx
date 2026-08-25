import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Real-time inventory, role-based access control, bulk import, verifiable blockchain proof, and more — for modern warehouse teams.",
  alternates: { canonical: "/features" },
};

const FEATURE_GROUPS = [
  {
    title: "Inventory",
    description:
      "Products, stock levels, and units managed in one place — with SKU-level uniqueness and atomic updates.",
    items: [
      "Add, edit, archive, and bulk-import products",
      "Stock in / stock out with no negative balances",
      "Atomic updates under concurrent team edits",
      "Unit stays immutable once stock movement exists",
    ],
  },
  {
    title: "Team & access",
    description:
      "Five roles — Owner, Manager, Staff, Auditor, Viewer — enforced server-side, not just in the UI.",
    items: [
      "Join a warehouse by code or invite link",
      "Managers approve staff, auditors, and viewers",
      "Audit trail of every role and membership change",
      "Owners can suspend or transfer ownership",
    ],
  },
  {
    title: "Real-time & verification",
    description:
      "Live updates for connected users, plus a verifiable proof record for every stock movement.",
    items: [
      "Instant sync across desktop, tablet, and mobile",
      "Live / reconnecting / outdated status indicators",
      "Blockchain proof on Base Sepolia for movements",
      "View proof on BaseScan with a single click",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
      <PageHeader
        title="Features"
        description="Everything you need to keep inventory accurate and accountable."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {FEATURE_GROUPS.map((group) => (
          <section
            key={group.title}
            className="ring-foreground/10 bg-card flex flex-col gap-3 rounded-xl p-6 ring-1 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="font-display text-foreground text-lg font-semibold">
              {group.title}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {group.description}
            </p>
            <ul className="text-foreground mt-2 flex flex-col gap-2 text-sm">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="bg-primary mt-2 size-1.5 shrink-0 rounded-full"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

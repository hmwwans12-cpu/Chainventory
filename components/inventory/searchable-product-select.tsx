"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Searchable product picker (DESIGN §37 form).
 * List produk yang bisa panjang → input + dropdown filter, bukan native select.
 */

export function SearchableProductSelect({
  products,
  value,
  onChange,
  placeholder = "Search product…",
}: {
  products: { id: string; name: string; sku: string; unit: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value);

  const filtered = query.trim()
    ? products.filter((p) =>
        `${p.name} ${p.sku}`.toLowerCase().includes(query.trim().toLowerCase())
      )
    : products;

  React.useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          value={
            open
              ? query
              : selected
                ? `${selected.name} (${selected.sku})`
                : query
          }
          onChange={(e) => {
            setQuery(e.target.value);
            if (
              selected &&
              e.target.value !== `${selected.name} (${selected.sku})`
            ) {
              onChange("");
            }
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Select product"
          aria-expanded={open}
        />
      </div>
      {open ? (
        <ul
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg p-1 shadow-md ring-1"
        >
          {filtered.length === 0 ? (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">
              No products found.
            </li>
          ) : (
            filtered.map((p) => {
              const active = p.id === value;
              return (
                <li key={p.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={cn(
                      "hover:bg-muted flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none select-none",
                      active ? "bg-muted" : ""
                    )}
                    onClick={() => {
                      onChange(p.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {p.sku}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

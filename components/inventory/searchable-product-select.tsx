"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Searchable product picker (DESIGN §37 form).
 *
 * Audit M-04: kini mengikuti pola ARIA combobox —
 *   - input: role=combobox, aria-expanded/controls/activedescendant
 *   - listbox: role=listbox + option aria-selected
 *   - keyboard: ArrowUp/Down, Home, End, Enter (pilih), Escape (tutup)
 *   - klik/hover menyelaraskan active index agar mouse & keyboard setara.
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
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const uid = React.useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (index: number) => `${uid}-opt-${index}`;

  const selected = products.find((p) => p.id === value);

  const filtered = query.trim()
    ? products.filter((p) =>
        `${p.name} ${p.sku}`.toLowerCase().includes(query.trim().toLowerCase())
      )
    : products;

  // Jaga opsi aktif tetap terlihat (keyboard navigation).
  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView?.({
      block: "nearest",
    });
  }, [activeIndex, open]);

  React.useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function select(product: (typeof products)[number]) {
    onChange(product.id);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function commitActive() {
    const product = filtered[activeIndex];
    if (product) select(product);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === "Enter" && open && activeIndex >= 0) {
      e.preventDefault(); // cegah submit form induk saat memilih
      commitActive();
      return;
    }
    const last = filtered.length - 1;
    const move = (next: number) => {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, Math.min(next, last)));
    };
    switch (e.key) {
      case "ArrowDown":
        if (!open) {
          setOpen(true);
          setActiveIndex(filtered.length ? 0 : -1);
        } else if (filtered.length) {
          move(activeIndex + 1 > last ? 0 : activeIndex + 1);
        }
        break;
      case "ArrowUp":
        if (open && filtered.length) {
          move(activeIndex <= 0 ? last : activeIndex - 1);
        }
        break;
      case "Home":
        if (open && filtered.length) move(0);
        break;
      case "End":
        if (open && filtered.length) move(last);
        break;
    }
  }

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
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Select product"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          aria-autocomplete="list"
        />
      </div>
      {open ? (
        filtered.length === 0 ? (
          <div
            role="status"
            className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1 w-full rounded-lg p-2 text-sm shadow-md ring-1"
          >
            No products found.
          </div>
        ) : (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg p-1 shadow-md ring-1"
          >
            {filtered.map((p, index) => {
              const isSelected = p.id === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={p.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "bg-muted",
                    !isActive && isSelected && "bg-muted/60",
                    !isActive && !isSelected && "hover:bg-muted"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(p)}
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {p.sku}
                  </span>
                  {isSelected ? (
                    <Check
                      aria-hidden="true"
                      className="text-primary size-4 shrink-0"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

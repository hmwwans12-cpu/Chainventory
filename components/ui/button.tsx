import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
        "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/15 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 before:hidden hover:underline",
      },
      size: {
        default:
          "h-11 gap-1.5 px-2.5 min-w-11 before:absolute before:content-[''] before:-inset-[7px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        input:
          "h-11 gap-1.5 px-2.5 min-w-11 before:absolute before:content-[''] before:-inset-[7px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-8 min-w-11 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs before:absolute before:content-[''] before:-inset-[11px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 min-w-11 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-sm before:absolute before:content-[''] before:-inset-[9px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 min-w-11 gap-1.5 px-2.5 before:absolute before:content-[''] before:-inset-[5px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8 before:absolute before:content-[''] before:-inset-[7px]",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] before:absolute before:content-[''] before:-inset-[11px] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg before:absolute before:content-[''] before:-inset-[9px]",
        "icon-lg":
          "size-9 before:absolute before:content-[''] before:-inset-[5px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/**
 * Button component wrapping Base UI's ButtonPrimitive.
 *
 * Base UI TIDAK auto-detect (diverifikasi di @base-ui/react@1.7.0
 * button/Button.mjs: `nativeButton = true` hardcoded sebagai default),
 * dan dev-check-nya dua arah (internals/use-button/useButton.mjs:33-52):
 *   - nativeButton=true + elemen bukan <button>  → error
 *   - nativeButton=false + elemen <button> asli  → error
 * Jadi nativeButton HARUS match elemen yang benar-benar dirender:
 *   - tanpa `render` prop → Base UI merender <button> native → true
 *   - dengan `render` (<Link>/<a>) → bukan <button> → false
 *
 * Caller tetap bisa override eksplisit, mis. untuk render={<button/>}:
 * `<Button render={<button type="submit" />} nativeButton>`.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      nativeButton={nativeButton ?? props.render === undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

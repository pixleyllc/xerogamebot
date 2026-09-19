import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn.ts";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-out,cubic-bezier(0.22,1,0.36,1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:opacity-90",
        secondary:
          "bg-bg-subtle text-fg border border-border hover:border-border-strong",
        ghost: "text-fg-muted hover:text-fg hover:bg-bg-subtle",
        danger: "bg-danger text-danger-fg hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-[var(--radius-sm)]",
        md: "h-11 px-4 text-sm rounded-[var(--radius-md)]",
        lg: "h-12 px-5 text-base rounded-[var(--radius-md)]",
        icon: "size-11 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

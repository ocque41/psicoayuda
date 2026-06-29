import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-[22px] py-3 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)] focus-visible:outline-[var(--accent)]",
        secondary:
          "border-[var(--accent)] bg-transparent text-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline-[var(--accent)]",
        human:
          "border-[var(--human)] bg-[var(--human)] text-white hover:bg-[var(--human-strong)] hover:border-[var(--human-strong)] focus-visible:outline-[var(--human)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, className }))}
      data-slot="button"
      {...props}
    />
  );
}

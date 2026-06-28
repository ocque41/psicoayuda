import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 font-bold text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "border-[#1f6f64] bg-[#1f6f64] text-white hover:bg-[#15524a] focus-visible:outline-[#1f6f64]",
        secondary:
          "border-[#1f6f64] bg-transparent text-[#1f6f64] hover:bg-[#eef8f5] focus-visible:outline-[#1f6f64]",
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

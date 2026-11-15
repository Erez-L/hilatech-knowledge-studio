import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold",
    "rounded-control border border-transparent select-none",
    "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-[1.125em] [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        accent: "bg-accent text-on-accent hover:bg-accent-hover",
        outline:
          "border-border-strong bg-transparent text-foreground hover:bg-hover hover:border-foreground/40",
        ghost: "bg-transparent text-secondary hover:bg-hover hover:text-foreground",
        onStage:
          "border-stage-border bg-transparent text-on-stage hover:bg-stage-raised hover:border-on-stage-muted",
      },
      size: {
        sm: "h-9 px-3 text-small",
        md: "h-11 px-4 text-[0.9375rem]",
        lg: "h-13 px-6 text-body",
        icon: "size-11",
        iconSm: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

export { buttonVariants };

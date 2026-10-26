import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import { cva, type VariantProps } from "class-variance-authority";

const inputVariants = cva(
  "h-9 w-full min-w-0 px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        search:
          "rounded-none border-x-0 border-y border-border bg-transparent! text-base shadow-none outline-none transition-none focus-visible:border-border focus-visible:ring-0 md:text-base",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>;

const Input = ({ className, type, variant, ...props }: InputProps) => (
  <InputPrimitive
    type={type}
    data-slot="input"
    data-variant={variant ?? "default"}
    className={cn(inputVariants({ variant }), className)}
    {...props}
  />
);

export { Input, inputVariants };

import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "accent" | "destructive" | "outline";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

export type { BadgeProps };

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border-transparent bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]",
  accent: "border-transparent bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)]",
  destructive:
    "border-transparent bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)]",
  outline: "border border-[color:var(--color-border)] bg-transparent text-[color:var(--color-foreground)]",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-full)] border px-[10px] py-[2px] text-[0.72rem] font-[850] tracking-wide uppercase",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

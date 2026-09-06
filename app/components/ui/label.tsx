import type { LabelHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

export function Label({ className, children, ...props }: LabelProps): React.JSX.Element {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-[8px] text-[0.86rem] font-[800] leading-none text-[color:var(--color-foreground)] peer-disabled:cursor-not-allowed peer-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

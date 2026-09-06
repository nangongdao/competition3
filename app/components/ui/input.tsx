import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = "text", ...props }: InputProps): React.JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        "flex h-[38px] w-full rounded-[var(--radius-md)] border border-[color:var(--color-input)] bg-[color:var(--color-secondary)] px-[12px] text-[0.9rem] font-[800] text-[color:var(--color-foreground)] transition-colors placeholder:text-[color:var(--color-muted-foreground)] focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-1 focus-visible:outline-dashed disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

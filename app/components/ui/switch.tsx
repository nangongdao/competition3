import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type SwitchProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Switch — 语义化的布尔开关。
 * 基于原生 checkbox 实现，视觉呈现为可滑动开关，
 * 无额外依赖，兼容键盘与无障碍树。
 */
export function Switch({ className, checked, onChange, ...props }: SwitchProps): React.JSX.Element {
  return (
    <label
      className={cn(
        "relative inline-flex h-[22px] w-[40px] cursor-pointer items-center rounded-[var(--radius-full)]",
        "border border-[color:var(--color-border)] transition-colors",
        checked
          ? "bg-[color:var(--color-primary)]"
          : "bg-[color:var(--color-secondary)]",
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
        {...props}
      />
      <span
        className={cn(
          "pointer-events-none absolute left-[3px] inline-block h-[16px] w-[16px] rounded-[var(--radius-full)] bg-[color:var(--color-foreground)] shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0",
        )}
      />
    </label>
  );
}

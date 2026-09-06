import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
};

export type { SeparatorProps };

/**
 * Separator — 语义化分割线。
 */
export function Separator({
  orientation = "horizontal",
  className,
  ...props
}: SeparatorProps): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-[color:var(--color-border)]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

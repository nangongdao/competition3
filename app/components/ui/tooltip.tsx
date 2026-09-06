import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

type TooltipSide = "top" | "right" | "bottom" | "left";

type TooltipProps = {
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  className?: string;
};

export type { TooltipProps, TooltipSide };

const sidePosition: Record<TooltipSide, CSSProperties> = {
  top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
};

/**
 * Tooltip — 纯 CSS 实现的提示浮层（hover/focus 触发）。
 * 容器必须 relative；浮层带 backdrop 模糊与品牌风格阴影。
 */
export function Tooltip({
  content,
  side = "top",
  children,
  className,
}: TooltipProps): React.JSX.Element {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute z-[50] whitespace-nowrap rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-popover)] px-[10px] py-[5px] text-[0.76rem] font-[800] text-[color:var(--color-popover-foreground)] opacity-0 shadow-[var(--shadow-soft)] backdrop-blur-[8px] transition-opacity duration-[140ms] group-hover:opacity-100 group-focus-within:opacity-100"
        style={sidePosition[side]}
      >
        {content}
      </span>
    </span>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "primary" | "destructive" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border border-white/10 bg-white/[0.05] text-[color:var(--color-foreground)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-white/[0.08]",
  primary:
    "border-0 bg-[color:var(--color-primary)] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] hover:bg-[#6872d9] hover:shadow-[0_0_0_1px_rgba(94,106,210,0.6),0_6px_16px_rgba(94,106,210,0.35),inset_0_1px_0_0_rgba(255,255,255,0.25)]",
  destructive:
    "border-0 bg-[color:var(--color-destructive)] text-white shadow-[0_4px_12px_rgba(239,109,109,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] hover:bg-[#d9534f]",
  outline:
    "border border-white/10 bg-transparent text-[color:var(--color-foreground)] hover:border-white/20 hover:bg-white/[0.05]",
  ghost:
    "border-0 bg-transparent text-[color:var(--color-foreground)] hover:bg-white/[0.05]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[30px] px-[9px] text-[0.76rem]",
  md: "min-h-[38px] px-[12px] text-[0.86rem]",
  lg: "min-h-[48px] px-[14px] text-[0.95rem]",
  icon: "min-h-[36px] min-w-[36px] p-0",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  type = "button",
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-[6px] rounded-[var(--radius-md)] font-[600] transition-[background,box-shadow,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

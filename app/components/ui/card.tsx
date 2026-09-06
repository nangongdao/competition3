import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export type { CardProps };

export function Card({ className, children, ...props }: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-card)] text-[color:var(--color-card-foreground)] shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function CardHeader({ className, children, ...props }: CardHeaderProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-[4px] p-[18px] pb-0", className)} {...props}>
      {children}
    </div>
  );
}

type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  children: ReactNode;
};

export function CardTitle({ className, children, ...props }: CardTitleProps): React.JSX.Element {
  return (
    <h3 className={cn("m-0 text-[1.05rem] font-[850] tracking-tight", className)} {...props}>
      {children}
    </h3>
  );
}

type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
};

export function CardDescription({
  className,
  children,
  ...props
}: CardDescriptionProps): React.JSX.Element {
  return (
    <p className={cn("m-0 text-[0.82rem] leading-[1.5] text-[color:var(--color-muted-foreground)]", className)} {...props}>
      {children}
    </p>
  );
}

type CardContentProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function CardContent({ className, children, ...props }: CardContentProps): React.JSX.Element {
  return (
    <div className={cn("p-[18px] pt-[12px]", className)} {...props}>
      {children}
    </div>
  );
}

type CardFooterProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function CardFooter({ className, children, ...props }: CardFooterProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center gap-[8px] p-[18px] pt-0", className)} {...props}>
      {children}
    </div>
  );
}

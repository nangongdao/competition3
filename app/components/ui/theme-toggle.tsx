import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ThemePreference } from "@/modules/assistant/lib/theme";

type ThemeToggleProps = {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
};

export function ThemeToggle({ preference, onChange }: ThemeToggleProps): React.JSX.Element {
  const { t } = useTranslation();

  const themeOptions: readonly {
    value: ThemePreference;
    label: string;
    icon: React.JSX.Element;
  }[] = [
    { value: "system", label: t("theme.system"), icon: <Monitor size={16} aria-hidden="true" /> },
    { value: "light", label: t("theme.light"), icon: <Sun size={16} aria-hidden="true" /> },
    { value: "dark", label: t("theme.dark"), icon: <Moon size={16} aria-hidden="true" /> },
  ];

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-toolbar-border bg-soft-bg p-[3px]"
      role="group"
      aria-label={t("toolbar.themeMode")}
      aria-live="polite"
    >
      {themeOptions.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            data-active={active}
            aria-pressed={active}
            title={option.label}
            onClick={() => onChange(option.value)}
            className="inline-flex min-h-[30px] items-center justify-center gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[0.76rem] font-[600] text-toolbar-muted transition-[color,background] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-soft-bg-strong hover:text-toolbar-fg data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

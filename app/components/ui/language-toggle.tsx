import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AppLanguage } from "@/i18n";
import { persistLanguage, SUPPORTED_LANGUAGES } from "@/i18n";

const languageLabels: Readonly<Record<AppLanguage, string>> = {
  zh: "中文",
  en: "EN",
};

type LanguageToggleProps = {
  onChange?: (language: AppLanguage) => void;
};

/**
 * M3.4 语言切换：中 / 英 双语即时切换。
 * 纯展示组件，语言偏好由 i18next 管理并持久化到 localStorage。
 */
export function LanguageToggle({ onChange }: LanguageToggleProps): React.JSX.Element {
  const { t, i18n } = useTranslation();

  function handleSelect(language: AppLanguage): void {
    persistLanguage(language);
    void i18n.changeLanguage(language);
    onChange?.(language);
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-toolbar-border bg-soft-bg p-[3px]"
      role="group"
      aria-label={t("language.switch")}
      aria-live="polite"
    >
      <Languages size={14} aria-hidden="true" className="ml-1.5 text-toolbar-muted" />
      {SUPPORTED_LANGUAGES.map((language) => {
        const active = i18n.resolvedLanguage?.startsWith(language) ?? language === "zh";
        return (
          <button
            key={language}
            type="button"
            data-active={active}
            aria-pressed={active}
            title={language === "zh" ? "中文" : "English"}
            onClick={() => handleSelect(language)}
            className="inline-flex min-h-[30px] items-center justify-center rounded-full border-0 bg-transparent px-2.5 text-[0.76rem] font-[600] text-toolbar-muted transition-[color,background] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-soft-bg-strong hover:text-toolbar-fg data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
          >
            <span>{languageLabels[language]}</span>
          </button>
        );
      })}
    </div>
  );
}

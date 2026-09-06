import { memo } from "react";
import { Bell, Check, Scale, TrendingUp, ShieldAlert, History, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  CostAlertNotification,
} from "@/modules/assistant/hooks/use-cost-alert-notifications";
import type { CostAlertSource } from "@/modules/assistant/lib/cost-alert-notification";

type CostAlertCenterProps = {
  /** 全部通知项（含已忽略）。 */
  notifications: readonly CostAlertNotification[];
  /** 活跃（未忽略）通知数。 */
  activeCount: number;
  /** 是否展示一次性横幅（新告警首次触发）。 */
  showBanner: boolean;
  /** 忽略一条通知。 */
  onDismiss: (key: string) => void;
  /** 一键忽略全部。 */
  onDismissAll: () => void;
};

const sourceIcon: Record<CostAlertSource, typeof Bell> = {
  budget: ShieldAlert,
  forecast: TrendingUp,
  history: History,
  cockpit: Bell,
  calibration: Scale,
};

const severityClasses: Record<
  CostAlertNotification["severity"],
  { border: string; badge: string; dot: string }
> = {
  critical: {
    border: "border-red-500/40",
    badge: "bg-red-500/15 text-red-400",
    dot: "bg-red-400",
  },
  warning: {
    border: "border-amber-400/40",
    badge: "bg-amber-400/15 text-amber-300",
    dot: "bg-amber-300",
  },
  info: {
    border: "border-sky-400/30",
    badge: "bg-sky-400/10 text-sky-300",
    dot: "bg-sky-300",
  },
};

function severityLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  severity: CostAlertNotification["severity"],
): string {
  switch (severity) {
    case "critical":
      return t("usage.costAlert.severityCritical");
    case "warning":
      return t("usage.costAlert.severityWarning");
    default:
      return t("usage.costAlert.severityInfo");
  }
}

/**
 * 成本告警通知中心（Linear/Modern 深空环境光风格）。
 *
 * 把预算护栏 / 全局月度外推 / 预算历史审计的告警折叠为：
 *   - 右上角铃铛 + 活跃角标（activeCount）；
 *   - 一次性横幅（新告警首次触发时展示，可忽略）；
 *   - 通知列表面板（全部活跃通知，逐条可忽略 / 一键全部忽略）。
 *
 * 纯展示组件：状态与动作（onDismiss / onDismissAll / showBanner）由上层 hook 注入。
 */
export const CostAlertCenter = memo(function CostAlertCenter({
  notifications,
  activeCount,
  showBanner,
  onDismiss,
  onDismissAll,
}: CostAlertCenterProps): React.JSX.Element {
  const { t } = useTranslation();
  const active = notifications.filter((n) => !n.dismissed);

  // 一次性横幅：仅当存在未忽略且未展示过的通知时出现。
  const banner = showBanner ? active[0] : undefined;

  return (
    <>
      {/* 一次性横幅（新告警首次触发）。 */}
      {banner !== undefined ? (
        <div
          role="alert"
          data-cost-alert-banner
          className={`pointer-events-auto fixed right-4 top-4 z-[60] flex w-[clamp(280px,32vw,360px)] items-start gap-2.5 rounded-xl border bg-[color:var(--color-float-bg)]/90 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.45),0_0_40px_rgba(94,106,210,0.08)] backdrop-blur-xl ${severityClasses[banner.severity].border}`}
        >
          <span
            className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg ${severityClasses[banner.severity].badge}`}
          >
            {(() => {
              const Icon = sourceIcon[banner.source];
              return <Icon size={14} aria-hidden="true" />;
            })()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${severityClasses[banner.severity].dot}`}
                aria-hidden="true"
              />
              <span className="text-[0.72rem] font-[850] tracking-[0.08em] uppercase text-[color:var(--color-toolbar-muted)]">
                {severityLabel(t, banner.severity)}
              </span>
            </div>
            <p className="mt-1 text-[0.86rem] font-[650] leading-snug text-[color:var(--color-foreground)]">
              {t(banner.titleKey)}
            </p>
            <p className="mt-0.5 text-[0.74rem] leading-[1.5] text-[color:var(--color-toolbar-muted)]">
              {t(banner.descriptionKey, {
                pct: banner.metricPct ?? 0,
                usd: banner.metricUsd ?? 0,
              })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("usage.costAlert.dismiss")}
            onClick={() => onDismiss(banner.key)}
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[color:var(--color-toolbar-muted)] transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.06] hover:text-[color:var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-1"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* 铃铛 + 角标（始终可见，提供主动查看/清理入口）。 */}
      <div
        data-cost-alert-center
        className="pointer-events-auto fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
      >
        {active.length > 0 ? (
          <div
            data-cost-alert-list
            className="mb-1 w-[clamp(260px,28vw,320px)] rounded-xl border border-white/[0.07] bg-[color:var(--color-float-bg)]/90 p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between px-1 pb-1.5 pt-0.5">
              <span className="text-[0.7rem] font-[800] tracking-[0.08em] uppercase text-[color:var(--color-toolbar-muted)]">
                {t("usage.costAlert.centerTitle")}
              </span>
              <button
                type="button"
                aria-label={t("usage.costAlert.dismissAll")}
                onClick={onDismissAll}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-[650] text-[color:var(--color-toolbar-muted)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-[color:var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-1"
              >
                <Check size={12} aria-hidden="true" />
                {t("usage.costAlert.dismissAll")}
              </button>
            </div>
            <ul className="grid gap-1.5">
              {active.map((n) => (
                <li
                  key={n.key}
                  className={`flex items-start gap-2 rounded-lg border p-2 ${severityClasses[n.severity].border}`}
                >
                  <span
                    className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md ${severityClasses[n.severity].badge}`}
                  >
                    {(() => {
                      const Icon = sourceIcon[n.source];
                      return <Icon size={12} aria-hidden="true" />;
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.78rem] font-[650] leading-snug text-[color:var(--color-foreground)]">
                      {t(n.titleKey)}
                    </p>
                    <p className="mt-0.5 text-[0.68rem] leading-[1.45] text-[color:var(--color-toolbar-muted)]">
                      {t(n.descriptionKey, {
                        pct: n.metricPct ?? 0,
                        usd: n.metricUsd ?? 0,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("usage.costAlert.dismiss")}
                    onClick={() => onDismiss(n.key)}
                    className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-[color:var(--color-toolbar-muted)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-[color:var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-1"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          aria-label={t("usage.costAlert.bellLabel", { count: activeCount })}
          title={t("usage.costAlert.bellTitle")}
          className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-white/[0.08] bg-[color:var(--color-float-bg)]/85 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_4px_16px_rgba(0,0,0,0.4),0_0_24px_rgba(94,106,210,0.06),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/[0.14] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_6px_20px_rgba(0,0,0,0.5),0_0_32px_rgba(94,106,210,0.12)] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2"
        >
          <Bell size={19} aria-hidden="true" strokeWidth={1.5} className="text-[color:var(--color-foreground)]" />
          {activeCount > 0 ? (
            <span
              data-cost-alert-badge
              className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--color-destructive)] px-1 text-[0.66rem] font-[850] text-[color:var(--color-destructive-foreground)] shadow-[0_2px_8px_rgba(239,109,109,0.4)]"
            >
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>
    </>
  );
});

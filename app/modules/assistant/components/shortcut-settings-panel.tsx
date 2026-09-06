import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  findShortcutConflicts,
  parseShortcut,
  shortcutToEditable,
  type Shortcut,
  type ShortcutId,
} from "@/modules/assistant/lib/shortcuts";
import { SHORTCUT_IDS } from "@/modules/assistant/lib/shortcuts";
import type { UseGlobalShortcutsResult } from "@/modules/assistant/hooks/use-global-shortcuts";

type ShortcutSettingsPanelProps = {
  /** 关闭面板。 */
  onClose: () => void;
  /** 由父级（GlobalShortcutHost）注入的快捷键控制器，保证单实例同步。 */
  shortcuts: UseGlobalShortcutsResult;
};

const SHORTCUT_LABEL_KEYS: Record<ShortcutId, string> = {
  "palette.open": "shortcuts.paletteOpen",
  newSession: "shortcuts.newSession",
  openSessions: "shortcuts.openSessions",
  toggleTerminal: "shortcuts.toggleTerminal",
  toggleTheme: "shortcuts.toggleTheme",
  goCosts: "shortcuts.goCosts",
  goHome: "shortcuts.goHome",
  toggleConsole: "shortcuts.toggleConsole",
};

/**
 * 全局快捷键配置面板。
 *
 * 列出所有可绑定快捷键，支持点击某一项后按下新键组合完成重绑定；
 * 提供恢复默认。通过 `useGlobalShortcuts` 读写并持久化用户覆盖。
 */
export const ShortcutSettingsPanel = memo(function ShortcutSettingsPanel({
  onClose,
  shortcuts: shortcutsController,
}: ShortcutSettingsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const { shortcuts, setOverride, resetAll, format, isMac } = shortcutsController;
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState<Shortcut | null>(null);
  const recorderRef = useRef<HTMLButtonElement | null>(null);

  // 重绑冲突检测：拟绑定键位若与其它生效键位相同，则不能静默覆盖，需提示。
  const conflicts = useMemo(
    () =>
      recording !== null && pendingShortcut !== null
        ? findShortcutConflicts(shortcuts, recording, pendingShortcut)
        : [],
    [recording, pendingShortcut, shortcuts],
  );

  // 记录键位时监听键盘输入，捕获新组合。
  useEffect(() => {
    if (recording === null) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const captured = parseShortcut(
        shortcutToEditable({
          modifiers: [
            ...(event.metaKey ? (["meta"] as const) : []),
            ...(event.ctrlKey ? (["ctrl"] as const) : []),
            ...(event.altKey ? (["alt"] as const) : []),
            ...(event.shiftKey ? (["shift"] as const) : []),
          ],
          key: event.key === " " ? "space" : event.key.toLowerCase(),
        }),
      );
      if (captured !== null && captured.key !== "escape") {
        setPendingShortcut(captured);
      } else {
        setRecording(null);
        setPendingShortcut(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording]);

  const handleRowClick = useCallback((id: ShortcutId) => {
    setRecording(id);
    setPendingShortcut(null);
  }, []);

  const confirmRebind = useCallback(() => {
    if (recording === null || pendingShortcut === null) return;
    setOverride(recording, pendingShortcut);
    setRecording(null);
    setPendingShortcut(null);
  }, [recording, pendingShortcut, setOverride]);

  // 确认键位时，将发生覆盖的其它组合渲染为可读列表。
  const conflictDescription = useMemo(() => {
    if (conflicts.length === 0) return null;
    return conflicts.map((id) => format(id)).join("、");
  }, [conflicts, format]);

  const cancelRecording = useCallback(() => {
    setRecording(null);
    setPendingShortcut(null);
  }, []);

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation">
      <Card
        role="dialog"
        aria-modal="true"
        aria-label={t("shortcuts.panelTitle")}
        className="w-full max-w-[520px]"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{t("shortcuts.panelTitle")}</CardTitle>
            <CardDescription>{t("shortcuts.panelDescription")}</CardDescription>
          </div>
          <button
            type="button"
            aria-label={t("shortcuts.close")}
            onClick={onClose}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-[color:var(--color-muted-foreground)] transition-colors hover:bg-white/[0.06] hover:text-[color:var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1.5">
            {SHORTCUT_IDS.map((id) => {
              const isRecording = recording === id;
              return (
                <li key={id}>
                  <button
                    ref={recording === id ? recorderRef : undefined}
                    type="button"
                    onClick={() => (isRecording ? cancelRecording() : handleRowClick(id))}
                    data-recording={isRecording || undefined}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isRecording
                        ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10"
                        : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-[0.87rem] font-[600] text-[color:var(--color-foreground)]">
                      {t(SHORTCUT_LABEL_KEYS[id])}
                    </span>
                    <span className="flex items-center gap-2">
                      {isRecording ? (
                        <span className="text-[0.72rem] font-[650] text-[color:var(--color-primary)]">
                          {pendingShortcut !== null
                            ? `${shortcutToEditable(pendingShortcut)} — ${t("shortcuts.confirm")}`
                            : t("shortcuts.pressKeys")}
                        </span>
                      ) : (
                        <kbd
                          data-shortcut-id={id}
                          className="rounded-md border border-white/[0.1] bg-white/[0.05] px-2 py-0.5 text-[0.74rem] font-[700] text-[color:var(--color-muted-foreground)]"
                        >
                          {format(id)}
                        </kbd>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {conflicts.length > 0 && conflictDescription !== null ? (
            <div
              role="alert"
              data-shortcut-conflict="true"
              className="mt-3 flex items-start gap-2 rounded-lg border border-[color:var(--color-destructive)]/40 bg-[color:var(--color-destructive)]/10 px-3 py-2.5"
            >
              <span className="text-[0.85rem] leading-relaxed text-[color:var(--color-destructive)]">
                {t("shortcuts.conflict", {
                  shortcut: shortcutToEditable(pendingShortcut ?? ({ modifiers: [], key: "" } as Shortcut)),
                  targets: conflictDescription,
                })}
              </span>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-[0.7rem] text-[color:var(--color-muted-foreground)]">
              {isMac
                ? t("shortcuts.platformMac")
                : t("shortcuts.platformOther")}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  cancelRecording();
                  resetAll();
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t("shortcuts.resetAll")}
              </Button>
              {recording !== null && pendingShortcut !== null ? (
                <Button
                  variant={conflicts.length > 0 ? "destructive" : "primary"}
                  size="sm"
                  onClick={confirmRebind}
                  data-shortcut-conflict-confirm={conflicts.length > 0 || undefined}
                >
                  {t("shortcuts.confirm")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

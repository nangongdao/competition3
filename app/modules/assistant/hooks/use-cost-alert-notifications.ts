import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deriveCostAlerts,
  type CostAlertInput,
  type CostAlertItem,
} from "@/modules/assistant/lib/cost-alert-notification";

/** localStorage 中记录已归档（已忽略/已读）通知键。 */
const DISMISSED_KEY = "assistant.cost-alert-dismissed";
/** 每次会话最多对同一告警提示一次：记录已在本会话提示过的键。 */
const SESSION_SHOWN_KEY = "assistant.cost-alert-session-shown";

function readStringSet(key: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw.length === 0) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeStringSet(key: string, values: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // 可选的去重状态；隐私模式 / 配额异常不应阻断会话。
  }
}

export type UseCostAlertNotificationsOptions = {
  /** 是否已加载成本数据（未加载时不派发通知，避免初始闪烁）。 */
  isLoaded: boolean;
  /** 成本告警输入。 */
  input: CostAlertInput;
};

export type CostAlertNotification = CostAlertItem & {
  /** 是否已被用户忽略（持久化）。 */
  dismissed: boolean;
};

export type UseCostAlertNotificationsResult = {
  /** 派生出的全部通知项（含已忽略，供 UI 决定是否展示）。 */
  notifications: readonly CostAlertNotification[];
  /** 活跃（未忽略）通知数，用于铃铛角标。 */
  activeCount: number;
  /** 是否存在新的（本会话未提示过）活跃通知，用于触发一次性横幅。 */
  hasFreshAlert: boolean;
  /** 忽略一条通知（写入持久化去重集）。 */
  dismiss: (key: string) => void;
  /** 一键忽略全部活跃通知。 */
  dismissAll: () => void;
  /** 清空全部已忽略记录（通常仅用于测试/重置）。 */
  reset: () => void;
};

/**
 * 成本告警通知状态 hook。
 *
 * 收敛「成本治理信号 → 可去重 / 可忽略 / 可一次性提示」的通知状态：
 *   - 用纯函数 `deriveCostAlerts` 折叠活跃告警；
 *   - 已忽略的通知键持久化到 localStorage（跨会话保持）；
 *   - 本会话首次出现的活跃通知会置 `hasFreshAlert`，供顶部横幅一次性展示，
 *     展示后写入 session 去重集，避免每次渲染都弹横幅。
 */
export function useCostAlertNotifications({
  isLoaded,
  input,
}: UseCostAlertNotificationsOptions): UseCostAlertNotificationsResult {
  const [dismissed, setDismissed] = useState<Set<string>>(
    () => readStringSet(DISMISSED_KEY),
  );
  const [sessionShown, setSessionShown] = useState<Set<string>>(
    () => readStringSet(SESSION_SHOWN_KEY),
  );

  // 持久化已忽略集合。
  useEffect(() => {
    writeStringSet(DISMISSED_KEY, dismissed);
  }, [dismissed]);

  // 持久化本会话已提示集合。
  useEffect(() => {
    writeStringSet(SESSION_SHOWN_KEY, sessionShown);
  }, [sessionShown]);

  const activeItems = useMemo<CostAlertItem[]>(() => {
    if (!isLoaded) {
      return [];
    }
    return deriveCostAlerts(input);
  }, [isLoaded, input]);

  const notifications = useMemo<CostAlertNotification[]>(
    () =>
      activeItems.map((item) => ({
        ...item,
        dismissed: dismissed.has(item.key),
      })),
    [activeItems, dismissed],
  );

  const activeCount = notifications.filter((n) => !n.dismissed).length;

  // 首次出现的新活跃通知 → 触发一次性横幅。
  const hasFreshAlert = notifications.some(
    (n) => !n.dismissed && !sessionShown.has(n.key),
  );

  // 一旦触发横幅（有新活跃通知），把这些键写入 session 已提示集。
  useEffect(() => {
    if (!hasFreshAlert) {
      return;
    }
    setSessionShown((prev) => {
      const next = new Set(prev);
      for (const n of notifications) {
        if (!n.dismissed) {
          next.add(n.key);
        }
      }
      return next;
    });
    // 依赖 hasFreshAlert 与 notifications；在已触发后 hasFreshAlert 会因
    // sessionShown 更新而回落到 false，避免重复写入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFreshAlert]);

  const dismiss = useCallback((key: string): void => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const dismissAll = useCallback((): void => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const n of activeItems) {
        next.add(n.key);
      }
      return next;
    });
  }, [activeItems]);

  const reset = useCallback((): void => {
    setDismissed(new Set());
    setSessionShown(new Set());
  }, []);

  return {
    notifications,
    activeCount,
    hasFreshAlert,
    dismiss,
    dismissAll,
    reset,
  };
}

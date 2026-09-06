import type { CostControlSetting } from "@/modules/assistant/types";
import {
  renderLocalizedText,
  type CostControlItem,
  type LocalizedText,
  type WorkspaceStatusLabels,
} from "@/modules/assistant/lib/workspace-status-labels";

/**
 * 工作台展示标签的渲染收敛（纯函数）。
 *
 * `assistant-workspace.tsx` 中有 9 处重复的 `renderLocalizedText(t, ...)` 调用：
 * 6 个状态标签（麦克风、语音输入、供应商详情、启动按钮、PTT 文案/提示）与
 * 成本面板每条目的 label/value/detail 映射，全部内联在组件里，不可单测。
 * 本模块把这些「已解析的 `LocalizedText` → 最终展示字符串」的组合逻辑收敛为
 * 单个可单测纯函数：组件仅传入 i18n 渲染器 `t`、`resolveWorkspaceStatusLabels`
 * 的输出与 `resolveCostControlItems` 的输出，一次取回全部展示标签。
 */

/** 工作台展示标签的渲染结果（全部为已渲染字符串）。 */
export type WorkspaceDisplayLabels = {
  microphoneStatusLabel: string;
  chatSpeechStatusLabel: string;
  providerDetail: string;
  startSessionLabel: string;
  pushToTalkLabel: string;
  pushToTalkTitle: string;
  /** 成本面板条目：label/value/detail 已渲染为字符串。 */
  costControls: readonly CostControlSetting[];
};

/**
 * i18n 渲染器签名（与 `react-i18next` 的 `t` 兼容的子集）。
 */
export type I18nRender = (
  key: string,
  options?: Record<string, string | number>,
) => string;

/**
 * 一次性渲染全部工作台展示标签。
 *
 * @param t i18n 渲染器。
 * @param statusLabels `resolveWorkspaceStatusLabels` 的输出（含 6 个状态标签）。
 * @param costControlItems `resolveCostControlItems` 的输出（渲染前条目）。
 * @returns 已渲染的展示标签与成本面板条目。
 */
export function renderWorkspaceDisplayLabels(
  t: I18nRender,
  statusLabels: WorkspaceStatusLabels,
  costControlItems: readonly CostControlItem[],
): WorkspaceDisplayLabels {
  const renderItem = (item: CostControlItem): CostControlSetting => ({
    label: renderLocalizedText(t, item.label),
    value: renderLocalizedText(t, item.value),
    detail: renderLocalizedText(t, item.detail),
  });

  return {
    microphoneStatusLabel: renderLocalizedText(t, statusLabels.microphoneStatus),
    chatSpeechStatusLabel: renderLocalizedText(t, statusLabels.chatSpeechStatus),
    providerDetail: renderLocalizedText(t, statusLabels.providerDetail),
    startSessionLabel: renderLocalizedText(t, statusLabels.startSessionLabel),
    pushToTalkLabel: renderLocalizedText(t, statusLabels.pushToTalkLabel),
    pushToTalkTitle: renderLocalizedText(t, statusLabels.pushToTalkTitle),
    costControls: costControlItems.map(renderItem),
  };
}

/** 便捷导出：供需要单独渲染单个标签（如复用片段）时使用。 */
export { renderLocalizedText, type LocalizedText };

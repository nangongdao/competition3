import { describe, expect, it } from "vitest";

import {
  renderWorkspaceDisplayLabels,
  type I18nRender,
} from "@/modules/assistant/lib/workspace-labels-render";
import type { WorkspaceStatusLabels } from "@/modules/assistant/lib/workspace-status-labels";
import type { CostControlItem } from "@/modules/assistant/lib/workspace-status-labels";

/** 模拟 i18n 渲染器：把 key + 插值参数拼成字符串。 */
function makeT(): I18nRender {
  return (key, options) => {
    if (!options) return `[${key}]`;
    return `[${key}]${JSON.stringify(options)}`;
  };
}

function makeStatusLabels(
  overrides: Partial<WorkspaceStatusLabels> = {},
): WorkspaceStatusLabels {
  return {
    microphoneStatus: { key: "status.micOn" },
    chatSpeechStatus: { key: "status.canVoiceAsk" },
    providerDetail: { key: "status.providerChat" },
    startSessionLabel: { key: "status.startSession" },
    pushToTalkLabel: { key: "status.pushToTalk" },
    pushToTalkTitle: { key: "status.pushToTalkTitle" },
    ...overrides,
  };
}

function makeCostItem(
  overrides: Partial<CostControlItem> = {},
): CostControlItem {
  return {
    label: { key: "status.costProviderLabel" },
    value: { key: "provider.chat" },
    detail: { key: "status.costProviderChatDetail" },
    ...overrides,
  };
}

describe("renderWorkspaceDisplayLabels", () => {
  it("渲染全部 6 个状态标签为字符串", () => {
    const t = makeT();
    const result = renderWorkspaceDisplayLabels(t, makeStatusLabels(), []);
    expect(result.microphoneStatusLabel).toBe("[status.micOn]");
    expect(result.chatSpeechStatusLabel).toBe("[status.canVoiceAsk]");
    expect(result.providerDetail).toBe("[status.providerChat]");
    expect(result.startSessionLabel).toBe("[status.startSession]");
    expect(result.pushToTalkLabel).toBe("[status.pushToTalk]");
    expect(result.pushToTalkTitle).toBe("[status.pushToTalkTitle]");
  });

  it("渲染动态文本标签（text 分支直接返回原文）", () => {
    const t = makeT();
    const result = renderWorkspaceDisplayLabels(
      t,
      makeStatusLabels({
        providerDetail: { text: "上游连接失败" },
        pushToTalkTitle: { text: "按住说话" },
      }),
      [],
    );
    expect(result.providerDetail).toBe("上游连接失败");
    expect(result.pushToTalkTitle).toBe("按住说话");
  });

  it("渲染带插值参数的标签", () => {
    const t = makeT();
    const result = renderWorkspaceDisplayLabels(
      t,
      makeStatusLabels({
        microphoneStatus: { key: "status.micMutedWith", options: { count: 2 } },
      }),
      [],
    );
    expect(result.microphoneStatusLabel).toBe(
      '[status.micMutedWith]{"count":2}',
    );
  });

  it("渲染 segments 片段拼接标签", () => {
    const t = makeT();
    const result = renderWorkspaceDisplayLabels(
      t,
      makeStatusLabels({
        startSessionLabel: {
          segments: [
            { key: "status.budgetPrefix" },
            { key: "status.budgetTokens", options: { count: 100 } },
          ],
        },
      }),
      [],
    );
    expect(result.startSessionLabel).toBe(
      '[status.budgetPrefix][status.budgetTokens]{"count":100}',
    );
  });

  it("渲染成本面板条目：label/value/detail 均翻译", () => {
    const t = makeT();
    const result = renderWorkspaceDisplayLabels(t, makeStatusLabels(), [
      makeCostItem(),
      makeCostItem({ label: { key: "status.costVisionLabel" } }),
    ]);
    expect(result.costControls).toHaveLength(2);
    expect(result.costControls[0]).toEqual({
      label: "[status.costProviderLabel]",
      value: "[provider.chat]",
      detail: "[status.costProviderChatDetail]",
    });
    expect(result.costControls[1].label).toBe("[status.costVisionLabel]");
  });

  it("空成本面板条目时返回空数组", () => {
    const t = makeT();
    const result = renderWorkspaceDisplayLabels(t, makeStatusLabels(), []);
    expect(result.costControls).toEqual([]);
  });

  it("不修改输入的条目（纯函数）", () => {
    const t = makeT();
    const items = [makeCostItem()];
    const itemsBefore = JSON.stringify(items);
    renderWorkspaceDisplayLabels(t, makeStatusLabels(), items);
    expect(JSON.stringify(items)).toBe(itemsBefore);
  });
});

import { describe, expect, it } from "vitest";

import {
  addSceneSummary,
  buildSceneSummary,
  clearSceneMemory,
  createInitialSceneMemoryState,
  estimateSceneMemorySavings,
  removeSceneSummary,
  serializeSceneMemoryContext,
  truncateSceneSummary,
  type SceneMemoryConfig,
  type SceneMemoryState,
} from "@/modules/assistant/lib/scene-memory";

const CONFIG: SceneMemoryConfig = {
  maxSummaries: 4,
  maxSummaryLength: 200,
};

describe("scene-memory", () => {
  describe("createInitialSceneMemoryState / clearSceneMemory", () => {
    it("初始为空", () => {
      expect(createInitialSceneMemoryState()).toEqual({ summaries: [] });
    });

    it("清空后恢复为空", () => {
      expect(clearSceneMemory()).toEqual({ summaries: [] });
    });
  });

  describe("truncateSceneSummary", () => {
    it("短文本原样返回并去首尾空白", () => {
      expect(truncateSceneSummary("  hello  ", 200)).toBe("hello");
    });

    it("超长文本截断并追加省略号", () => {
      expect(truncateSceneSummary("a".repeat(50), 10)).toBe("aaaaaaaaaa…");
    });

    it("空文本返回空串", () => {
      expect(truncateSceneSummary("   ", 10)).toBe("");
    });
  });

  describe("addSceneSummary", () => {
    it("追加新摘要", () => {
      const initial = createInitialSceneMemoryState();
      const next = addSceneSummary(
        initial,
        { id: "f1", text: "画面中是橘猫", recordedAt: 10, frameTokens: 425 },
        CONFIG,
      );

      expect(next.summaries).toHaveLength(1);
      expect(next.summaries[0]).toMatchObject({
        id: "f1",
        text: "画面中是橘猫",
      });
      // 原快照不可变
      expect(initial.summaries).toHaveLength(0);
    });

    it("同名 id 原地更新（最新帧刷新）而不新增", () => {
      const initial = createInitialSceneMemoryState();
      const first = addSceneSummary(
        initial,
        { id: "f1", text: "橘猫", recordedAt: 10, frameTokens: 425 },
        CONFIG,
      );
      const updated = addSceneSummary(
        first,
        { id: "f1", text: "橘猫在睡觉", recordedAt: 20, frameTokens: 425 },
        CONFIG,
      );

      expect(updated.summaries).toHaveLength(1);
      expect(updated.summaries[0].text).toBe("橘猫在睡觉");
      expect(updated.summaries[0].recordedAt).toBe(20);
    });

    it("超出 maxSummaries 时丢弃最旧", () => {
      const smallConfig: SceneMemoryConfig = {
        maxSummaries: 2,
        maxSummaryLength: 200,
      };
      let state = createInitialSceneMemoryState();

      for (let i = 1; i <= 4; i += 1) {
        state = addSceneSummary(
          state,
          { id: `f${i}`, text: `摘要${i}`, recordedAt: i, frameTokens: 10 },
          smallConfig,
        );
      }

      expect(state.summaries.map((entry) => entry.id)).toEqual(["f3", "f4"]);
    });

    it("空文本摘要被忽略", () => {
      const next = addSceneSummary(
        createInitialSceneMemoryState(),
        { id: "f1", text: "   ", recordedAt: 1, frameTokens: 425 },
        CONFIG,
      );

      expect(next.summaries).toHaveLength(0);
    });
  });

  describe("removeSceneSummary", () => {
    it("移除指定 id，其余保留", () => {
      const state: SceneMemoryState = {
        summaries: [
          { id: "a", text: "A", recordedAt: 1, frameTokens: 10 },
          { id: "b", text: "B", recordedAt: 2, frameTokens: 10 },
        ],
      };

      const next = removeSceneSummary(state, "a");

      expect(next.summaries.map((entry) => entry.id)).toEqual(["b"]);
    });
  });

  describe("serializeSceneMemoryContext", () => {
    it("空记忆返回空串", () => {
      expect(serializeSceneMemoryContext(createInitialSceneMemoryState())).toBe(
        "",
      );
    });

    it("多条摘要序列化为项目符号列表", () => {
      const state: SceneMemoryState = {
        summaries: [
          { id: "a", text: "桌面咖啡", recordedAt: 1, frameTokens: 10 },
          { id: "b", text: "画面中心橘猫", recordedAt: 2, frameTokens: 10 },
        ],
      };

      expect(serializeSceneMemoryContext(state)).toBe(
        "此前画面（文字摘要）：\n- 桌面咖啡\n- 画面中心橘猫",
      );
    });
  });

  describe("estimateSceneMemorySavings", () => {
    it("历史帧以文本替代图片的 token 节省", () => {
      // 历史 2 帧各 425 token；最新帧本次仍以图片发送（400 token）
      const state: SceneMemoryState = {
        summaries: [
          { id: "f1", text: "A", recordedAt: 1, frameTokens: 425 },
          { id: "f2", text: "B", recordedAt: 2, frameTokens: 425 },
        ],
      };

      expect(estimateSceneMemorySavings(state, 400)).toBe(450);
    });

    it("历史摘要恰好含最新帧 id 时不计入该帧节省", () => {
      const state: SceneMemoryState = {
        summaries: [
          { id: "f1", text: "最新帧", recordedAt: 3, frameTokens: 425 },
        ],
      };

      // 425 - 425 = 0
      expect(estimateSceneMemorySavings(state, 425)).toBe(0);
    });

    it("空历史返回 0", () => {
      expect(
        estimateSceneMemorySavings(createInitialSceneMemoryState(), 425),
      ).toBe(0);
    });

    it("节省不为负数", () => {
      const state: SceneMemoryState = {
        summaries: [{ id: "a", text: "A", recordedAt: 1, frameTokens: 10 }],
      };

      expect(estimateSceneMemorySavings(state, 500)).toBe(0);
    });
  });

  describe("buildSceneSummary", () => {
    it("按帧尺寸换算 token 组装摘要", () => {
      const summary = buildSceneSummary("f1", "橘猫", 100, 640, 360);

      expect(summary).toMatchObject({
        id: "f1",
        text: "橘猫",
        recordedAt: 100,
      });
      // 640×360 → 425（与 cost-model 一致）
      expect(summary.frameTokens).toBe(425);
    });
  });
});

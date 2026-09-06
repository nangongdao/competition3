import { z } from "zod";

export const WORKSPACE_LAYOUT_STORAGE_KEY = "assistant-workspace-layout-v1";

export const workspaceFocusModeSchema = z.enum([
  "balanced",
  "camera-first",
  "conversation-first",
]);

export const workspacePanelIdSchema = z.enum(["session", "vision"]);

const workspaceLayoutSchema = z.object({
  version: z.literal(1),
  focusMode: workspaceFocusModeSchema,
  panelOrder: z.tuple([workspacePanelIdSchema, workspacePanelIdSchema]),
  sessionWidthPercent: z.number().min(28).max(55),
  panelVisibility: z.object({
    cost: z.boolean(),
    usage: z.boolean(),
    visualContext: z.boolean(),
  }),
});

export type WorkspaceFocusMode = z.infer<typeof workspaceFocusModeSchema>;
export type WorkspacePanelId = z.infer<typeof workspacePanelIdSchema>;
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;

export const defaultWorkspaceLayout: WorkspaceLayout = {
  version: 1,
  focusMode: "balanced",
  panelOrder: ["session", "vision"],
  sessionWidthPercent: 34,
  panelVisibility: {
    cost: true,
    usage: true,
    visualContext: true,
  },
};

function hasUniquePanelOrder(
  panelOrder: readonly WorkspacePanelId[],
): panelOrder is readonly [WorkspacePanelId, WorkspacePanelId] {
  return new Set(panelOrder).size === 2;
}

export function parseWorkspaceLayout(value: unknown): WorkspaceLayout {
  const result = workspaceLayoutSchema.safeParse(value);

  if (result.success !== true || !hasUniquePanelOrder(result.data.panelOrder)) {
    return defaultWorkspaceLayout;
  }

  return result.data;
}

export function parseStoredWorkspaceLayout(value: string | null): WorkspaceLayout {
  if (value === null) {
    return defaultWorkspaceLayout;
  }

  try {
    return parseWorkspaceLayout(JSON.parse(value));
  } catch {
    return defaultWorkspaceLayout;
  }
}

export function clampSessionWidthPercent(value: number): number {
  return Math.min(55, Math.max(28, Math.round(value)));
}

export function swapWorkspacePanels(
  panelOrder: WorkspaceLayout["panelOrder"],
): WorkspaceLayout["panelOrder"] {
  return [panelOrder[1], panelOrder[0]];
}

/**
 * 把拖拽指针位置换算为会话面板宽度百分比。
 *
 * `panelOrder[0]` 决定会话面板位于左侧还是右侧：
 * - 会话面板在左侧时，宽度即指针相对容器左边缘的百分比；
 * - 会话面板在右侧时，宽度为右侧到指针的百分比。
 */
export function resolveSessionWidthFromPointer(
  pointerClientX: number,
  bounds: Pick<DOMRect, "left" | "width">,
  panelOrder: readonly WorkspacePanelId[],
): number {
  const pointerPercent = ((pointerClientX - bounds.left) / bounds.width) * 100;
  return panelOrder[0] === "session" ? pointerPercent : 100 - pointerPercent;
}

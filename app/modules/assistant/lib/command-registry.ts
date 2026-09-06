/**
 * M10.8 全局命令面板 —— 纯命令模型与过滤/导航纯函数。
 *
 * 把「命令的注册、过滤、索引推进」抽为可测纯函数；命令面板 UI 与
 * 键盘编排层只负责把命令与组件回调接线，核心逻辑均由本模块的单测覆盖。
 */

/** 命令分组（用于面板内分区展示）。 */
export type CommandGroup =
  | "navigation"
  | "panels"
  | "preferences";

/**
 * 一条可执行命令。
 * `labelKey` / `hintKey` 为 i18n key，UI 层用 useTranslation 解析。
 * `action` 为面板执行时的副作用回调（路由跳转 / 面板开关等）。
 */
export type CommandAction = {
  /** 稳定唯一 id（供 React key 与测试定位）。 */
  id: string;
  /** 命令所属分组。 */
  group: CommandGroup;
  /** 主标题 i18n key。 */
  labelKey: string;
  /** 副标题/说明 i18n key（可为空串）。 */
  hintKey?: string;
  /** 检索关键词（小写，包含主标题/拼音化关键词），用于模糊过滤。 */
  keywords: readonly string[];
  /** 无参数执行回调。 */
  action: () => void;
};

/** 用于测试/类型安全的命令描述（不含 action 的纯数据形态）。 */
export type CommandDescriptor = Omit<CommandAction, "action">;

/** 过滤后的可展示命令条目。 */
export type FilteredCommand = {
  command: CommandAction;
  /** 该命令是否命中当前查询（决定高亮）。 */
  matched: boolean;
};

/**
 * 按查询串过滤命令。
 *
 * 查询为空时返回全部命令（面板打开时展示所有可操作项）。
 * 匹配规则：对查询按空白切词，每个词都需命中 主标题/分组/关键词 之一；
 * 全部命中才保留。匹配忽略大小写。
 */
export function filterCommands(
  commands: readonly CommandAction[],
  query: string,
): CommandAction[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return [...commands];
  }
  const terms = trimmed.split(/\s+/).filter((t) => t.length > 0);
  return commands.filter((command) => {
    const haystack = [
      command.labelKey,
      command.group,
      command.hintKey ?? "",
      ...command.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * 推进当前选中索引（支持环绕）。
 *
 * `delta = 1` 下移、`delta = -1` 上移；列表为空时返回 -1。
 * 选中索引越界时环绕到另一端，模拟键盘上下键的循环行为。
 */
export function moveSelection(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) {
    return -1;
  }
  if (current < 0 || current >= length) {
    // 越界时按方向落到列表首/尾。
    return delta >= 0 ? 0 : length - 1;
  }
  const next = current + delta;
  if (next < 0) {
    return length - 1;
  }
  if (next >= length) {
    return 0;
  }
  return next;
}

/** 命令是否命中某查询（用于测试/打标）。 */
export function commandMatchesQuery(
  command: Pick<CommandAction, "labelKey" | "group" | "hintKey" | "keywords">,
  query: string,
): boolean {
  return filterCommands(
    [{ ...command, id: "__probe__", action: () => undefined }],
    query,
  ).length === 1;
}

/** 返回每个命令的过滤结果（含 matched 标记），供 UI 高亮。 */
export function toFilteredCommands(
  commands: readonly CommandAction[],
  query: string,
): FilteredCommand[] {
  const matched = filterCommands(commands, query);
  const matchedIds = new Set(matched.map((c) => c.id));
  return commands.map((command) => ({
    command,
    matched: matchedIds.has(command.id),
  }));
}

/** 一段文本，标记其是否命中查询（用于匹配高亮）。 */
export type HighlightSegment = {
  text: string;
  matched: boolean;
};

/**
 * 把文本按查询命中拆分为高亮片段。
 *
 * 查询为空时返回整段（无命中）；否则在文本中按大小写不敏感方式
 * 查找查询串（含前后空白）并标记命中片段，供 UI 用 <mark> 高亮。
 * 用于命令面板的「分组高亮增强」——用户输入时，命中的命令标题
 * 中与查询重合的子串被高亮，提升定位速度。
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [{ text, matched: false }];
  }
  const segments: HighlightSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  let cursor = 0;
  let index = lowerText.indexOf(lowerQuery, cursor);
  while (index !== -1) {
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), matched: false });
    }
    segments.push({ text: text.slice(index, index + trimmed.length), matched: true });
    cursor = index + trimmed.length;
    index = lowerText.indexOf(lowerQuery, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matched: false });
  }
  return segments.length > 0 ? segments : [{ text, matched: false }];
}

/**
 * M1.24 可重试转写条目 id 派生收敛为纯函数
 *
 * `assistant-workspace.tsx` 中 `retryableEntryIds` 的 `useMemo` 把「重试中 turn 表 →
 * 可重试转写条目 id 集合」的派生逻辑内联在组件里,不可单测。本模块将其抽为纯函数,
 * 组件仅保留 `useMemo(() => buildRetryableEntryIds(turns), [turns])` 的薄接线。
 */

/**
 * 从「重试中 turn 表」派生出需要标记为"可重试"的转写条目 id 集合。
 *
 * @param retryableChatTurns key 为转写条目 id、值为重试载荷的映射表;可含 undefined
 *   以便调用方直接传组件 state(空对象 → 空集合)。
 * @returns 可重试转写条目 id 的 Set(与入参无共享引用,调用方可安全消费)。
 */
export function buildRetryableEntryIds(
  retryableChatTurns:
    | Readonly<Record<string, unknown>>
    | undefined,
): ReadonlySet<string> {
  if (!retryableChatTurns) return new Set<string>();
  return new Set(Object.keys(retryableChatTurns));
}

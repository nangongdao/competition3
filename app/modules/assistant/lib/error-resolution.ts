/**
 * 可见错误优先级派生（纯函数）。
 *
 * `assistant-workspace.tsx` 中可见错误此前是内联的 `??` 短路链，按固定优先级
 * 从多个数据源（媒体授权 → 供应商配置 → Realtime 会话 → 语音转写 → Chat 会话）
 * 取第一个非空错误文案。该决策不依赖 React 生命周期，因此沉淀为可单测的纯函数：
 * 每次渲染由组件按相同顺序收集各错误源（`string | undefined`），交给
 * `resolveVisibleError` 一次算出最终展示的错误文案。
 */

/**
 * 按优先级取第一个非空错误文案。
 *
 * - 任一源传入非空字符串即命中，返回该字符串；
 * - 空字符串按「无错误」处理，跳过；
 * - 全部为空 / undefined 返回 `undefined`（无可见错误）。
 */
export function resolveVisibleError(
  ...sources: readonly (string | undefined)[]
): string | undefined {
  for (const source of sources) {
    if (source !== undefined && source.length > 0) {
      return source;
    }
  }
  return undefined;
}

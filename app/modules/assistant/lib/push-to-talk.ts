/**
 * Push-to-Talk（按住说话）事件守卫的纯函数库。
 *
 * 将 PTT 的键位判定（空格 / 回车）从事件 handler 中抽为可单测纯函数，
 * 便于对"按住说话"的交互边界做独立验证。
 */

/** PTT 允许作为"激活"的按键。 */
const PTT_ACTIVATION_KEYS = new Set([" ", "Enter"]);

/**
 * 判定一个键盘事件是否应激活 PTT。
 *
 * 仅当按键为空格或回车、未处于 auto-repeat（长按触发重复事件）、
 * 且当前允许 PTT 时才返回 true。
 */
export function isPushToTalkActivationKey(
  key: string,
  canPushToTalk: boolean,
  isRepeat: boolean,
): boolean {
  if (isRepeat || !canPushToTalk) {
    return false;
  }

  return PTT_ACTIVATION_KEYS.has(key);
}

/**
 * 判定一个键盘事件是否应释放 PTT。
 *
 * 仅当按键为空格或回车时释放（不检查 canPushToTalk，
 * 因为释放不应被禁用态阻塞）。
 */
export function isPushToTalkReleaseKey(key: string): boolean {
  return PTT_ACTIVATION_KEYS.has(key);
}

/**
 * cn — 轻量 className 合并工具（无第三方依赖）
 *
 * 支持 string / number / undefined / null / false 以及嵌套数组。
 * 与 shadcn/ui 的 `cn` 语义兼容，但仅合并字符串 token，
 * 不做 Tailwind 冲突去重（本项目 token 均为语义化命名，冲突极少）。
 */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const flattened: ClassValue[] = [];
  const stack: ClassValue[] = [...inputs];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
    } else if (value) {
      flattened.push(value);
    }
  }
  return flattened.reverse().join(" ");
}

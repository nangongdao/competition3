import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * UI 对比度专项（2026-08-24）— WCAG AA 守卫。
 *
 * 视觉体系重构为 Linear/Modern 深空环境光后，评审关注 UI 对比度。
 * 本测试锁定设计 token 的关键「文字/图标 vs 背景」组合，断言其对比度
 * 满足 WCAG 2.1 AA 阈值（正常文字 ≥4.5:1，可放大文字/图形 ≥3:1）。
 *
 * 覆盖两类已知缺陷的回归：
 *   1) 深色主题 accent 作为文字/图标强调色在近黑基底上曾仅 4.33:1
 *      （<4.5）→ 提亮为 #7581e2（≈5.8:1）。
 *   2) 浅色主题 soft-fg / soft-fg-muted 曾 2.68–4.65:1 不达 AA
 *      → 提亮到 ≥4.65:1（≈5.7:1 及 4.65:1）。
 *
 * 同时断言 primary（实心按钮底色）保持不变，确保白字按钮对比度不因
 * accent 提亮而退化（white on #5e6ad2 ≈ 4.7:1）。
 */

const tokensPath = resolve(__dirname, "tokens.css");
const tokensCss = readFileSync(tokensPath, "utf8");

type Rgb = {
  r: number;
  g: number;
  b: number;
};

/** 解析 #rgb / #rrggbb / rgba() 十六进制色。rgba 需带完整背景做混合。 */
function parseHex(hex: string): Rgb {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = [Math.max(l1, l2), Math.min(l1, l2)];
  return (hi + 0.05) / (lo + 0.05);
}

/** 把 rgba(255,255,255,a) 之类半透明前景按 alpha 混合到不透明背景上。 */
function blendRgbaOver(
  rgba: string,
  bg: string,
): Rgb {
  const match = rgba.match(/[\d.]+/g);
  if (!match) throw new Error(`无法解析 rgba：${rgba}`);
  const m = match.map(Number);
  const [r, g, b, a] = m;
  const { r: br, g: bg_, b: bb } = parseHex(bg);
  return {
    r: (r / 255) * a + br * (1 - a),
    g: (g / 255) * a + bg_ * (1 - a),
    b: (b / 255) * a + bb * (1 - a),
  };
}

/** 从 CSS 文本中提取指定 token 在当前（首个匹配）主题中的取值。 */
function tokenValue(name: string, scope: "dark" | "light"): string {
  if (scope === "dark") {
    const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`未找到 token：${name}`);
    return match[1].trim();
  }
  const block = tokensCss.split('[data-theme="light"]')[1];
  if (!block) throw new Error(`缺少浅色主题块：${name}`);
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`未找到浅色 token：${name}`);
  return match[1].trim();
}

function toRgb(value: string, over: string): Rgb {
  if (value.startsWith("rgba")) return blendRgbaOver(value, over);
  return parseHex(value);
}

describe("UI 对比度（WCAG AA 守卫）", () => {
  const DARK_BG = "#050506";
  const DARK_PANEL = "#0a0a0c";
  const LIGHT_BG = "#fafafa";
  const LIGHT_CARD = "#ffffff";

  it("深色主题主要文字对比度 ≥4.5:1（AA 正常文字）", () => {
    const cases: [string, string][] = [
      [tokenValue("color-foreground", "dark"), DARK_BG],
      [tokenValue("color-muted", "dark"), DARK_BG],
      [tokenValue("color-accent", "dark"), DARK_BG],
      [tokenValue("color-soft-fg-bright", "dark"), DARK_PANEL],
      [tokenValue("color-soft-fg", "dark"), DARK_PANEL],
      [tokenValue("color-soft-fg-muted", "dark"), DARK_PANEL],
    ];
    for (const [fg, bg] of cases) {
      const ratio = contrastRatio(toRgb(fg, bg), toRgb(bg, bg));
      expect(
        ratio,
        `深色 ${fg} on ${bg} 应为 ≥4.5:1，实际 ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("深色主题 accent 图标/图形 ≥3:1（AA 图形），且不再退回旧值", () => {
    // accent 文字必须达 AA；图标要求更宽松（≥3:1）但需守住不回退旧 #5e6ad2
    expect(tokenValue("color-accent", "dark")).not.toBe("#5e6ad2");
    const ratio = contrastRatio(
      toRgb(tokenValue("color-accent", "dark"), DARK_BG),
      toRgb(DARK_BG, DARK_BG),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("primary 保持 #5e6ad2，保证白字实心按钮对比度 ≥4.5:1", () => {
    expect(tokenValue("color-primary", "dark")).toBe("#5e6ad2");
    const ratio = contrastRatio(
      parseHex("#ffffff"),
      parseHex("#5e6ad2"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("浅色主题小字号说明/占位符对比度 ≥4.5:1（AA 正常文字）", () => {
    const cases: [string, string][] = [
      [tokenValue("color-foreground", "light"), LIGHT_BG],
      [tokenValue("color-muted", "light"), LIGHT_BG],
      [tokenValue("color-soft-fg-bright", "light"), LIGHT_CARD],
      [tokenValue("color-soft-fg", "light"), LIGHT_CARD],
      [tokenValue("color-soft-fg-muted", "light"), LIGHT_CARD],
      [tokenValue("color-warn-fg", "light"), LIGHT_CARD],
      [tokenValue("color-info-fg", "light"), LIGHT_CARD],
      [tokenValue("color-success-fg", "light"), LIGHT_CARD],
      [tokenValue("color-danger-text", "light"), LIGHT_CARD],
    ];
    for (const [fg, bg] of cases) {
      const ratio = contrastRatio(toRgb(fg, bg), toRgb(bg, bg));
      expect(
        ratio,
        `浅色 ${fg} on ${bg} 应为 ≥4.5:1，实际 ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("浅色主题 accent 对比度 ≥4.5:1", () => {
    const ratio = contrastRatio(
      toRgb(tokenValue("color-accent", "light"), LIGHT_CARD),
      toRgb(LIGHT_CARD, LIGHT_CARD),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const tokensPath = resolve(__dirname, "tokens.css");
const tokensCss = readFileSync(tokensPath, "utf8");

describe("design tokens (M2.1)", () => {
  it("defines the primitive palette", () => {
    expect(tokensCss).toMatch(/--color-ink:/);
    expect(tokensCss).toMatch(/--color-panel:/);
    expect(tokensCss).toMatch(/--color-lime:/);
    expect(tokensCss).toMatch(/--color-cyan:/);
    expect(tokensCss).toMatch(/--color-coral:/);
    expect(tokensCss).toMatch(/--color-violet:/);
  });

  it("defines semantic background/foreground tokens", () => {
    expect(tokensCss).toMatch(/--color-background:/);
    expect(tokensCss).toMatch(/--color-foreground:/);
    expect(tokensCss).toMatch(/--color-primary:/);
    expect(tokensCss).toMatch(/--color-primary-foreground:/);
    expect(tokensCss).toMatch(/--color-border:/);
    expect(tokensCss).toMatch(/--color-muted:/);
  });

  it("defines component-level tokens", () => {
    expect(tokensCss).toMatch(/--color-toolbar-bg:/);
    expect(tokensCss).toMatch(/--color-toolbar-fg:/);
    expect(tokensCss).toMatch(/--color-btn-primary-bg:/);
    expect(tokensCss).toMatch(/--color-panel-bg:/);
  });

  it("defines spacing, radius and shadow primitives", () => {
    expect(tokensCss).toMatch(/--spacing-1:/);
    expect(tokensCss).toMatch(/--radius-sm:/);
    expect(tokensCss).toMatch(/--radius-md:/);
    expect(tokensCss).toMatch(/--shadow-soft:/);
  });

  it("is registered via Tailwind v4 @theme", () => {
    expect(tokensCss).toMatch(/@theme/);
  });

  it("defines light theme semantic overrides for M2.2", () => {
    expect(tokensCss).toMatch(/\[data-theme="light"\]/);
    expect(tokensCss).toMatch(/--color-background: #fafafa;/);
    expect(tokensCss).toMatch(/--color-foreground: #17181a;/);
  });

  it("defines soft-surface tokens for dark adaptation", () => {
    expect(tokensCss).toMatch(/--color-soft-bg:/);
    expect(tokensCss).toMatch(/--color-soft-fg:/);
    expect(tokensCss).toMatch(/--color-float-bg:/);
    expect(tokensCss).toMatch(/--color-danger-text:/);
  });

  it("overrides soft-surface tokens in light theme", () => {
    expect(tokensCss).toMatch(/\[data-theme="light"\][\s\S]*--color-soft-bg: rgba\(23, 24, 26/);
  });
});

# 性能基线（Lighthouse 报告产出）

> M5.4 性能基线与回归深化的落地产物。本文档固化**首个 Lighthouse 基线报告**的量化结果、
> 复现方式与预算口径，使后续每次 `pnpm perf:audit` 都能对照基线判断是否回归。

## 1. 审计口径

- **工具**：Lighthouse via `@lhci/cli`（`npx -y @lhci/cli autorun`）
- **配置**：`lighthouserc.cjs`
  - 桌面预设（1440×900，deviceScaleFactor 1）
  - 本地审计不模拟慢网络（`rttMs 40` / `throughputKbps 10MB` / `cpuSlowdownMultiplier 1`），
    避免供应商网络波动污染结果
  - `chromeFlags: "--no-sandbox --disable-setuid-sandbox"`（CI/容器常以 root 运行 Chrome）
- **目标**：构建产物 `dist/` 通过 `vite preview` 服务，审计 `http://127.0.0.1:4173/`
- **产物**：`.lighthouseci/lighthouse-report-*.html` / `.json`

## 2. 基线结果（2026-08-20）

| 指标 | 预算 | 基线实测 | 达标 |
|---|---|---|---|
| Performance 综合分 | ≥ 0.9 | **0.99** | ✅ |
| LCP（最大内容绘制） | < 2.5s | **0.6s** | ✅ |
| FCP（首次内容绘制） | < 1.8s | **0.5s** | ✅ |
| CLS（累计布局偏移） | < 0.1 | **0.067** | ✅ |
| TBT（总阻塞时间） | < 200ms | **~0ms** | ✅ |
| 总传输体积 | — | **200KiB** | ✅（gzip 主包 < 300KB 预算） |

> **注**：`interaction-to-next-paint`（INP）是**真实交互**采样指标，加载-only 的实验室审计
> 不产生该值，故不设硬断言；交互响应性已由 `e2e/perf-transcript.spec.ts` 的滚动帧率基线
> （≥ 55 FPS）与 `e2e/cost-panel-interaction.spec.ts` 等交互路径兜底。

## 3. 复现方式

```bash
pnpm build          # 依赖 dist/
CHROME_PATH=<你的Chrome二进制> pnpm perf:audit
```

- `CHROME_PATH` 可选；未设置时 LHCI 自动探测系统 Chrome。
- 成功后 `.lighthouseci/` 下产出 `lighthouse-report-*.html`（可交互报告）+ `.json`（机器可读）。
- 预算断言见 `lighthouserc.cjs` `assert.assertions`（均为 `warn` 级，不阻塞 CI 主流水线；
  打包体积预算仍由 `pnpm check:bundle-size` 强制把关）。

## 4. 常见问题

- **Chrome 无法启动（root without --no-sandbox）**：容器/CI 以 root 运行时需
  `chromeFlags: "--no-sandbox --disable-setuid-sandbox"`（已内置在 `lighthouserc.cjs`）。
- **INP 断言误报**：不要用 `metrics:interaction-to-next-paint` 前缀断言（指标不可用时会
  回退匹配 `metrics` 聚合审计并误报整体数值）；直接用审计 ID（如 `largest-contentful-paint`）。

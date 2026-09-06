/**
 * Lighthouse 性能预算配置（M5.4 性能基线与回归的深化）。
 *
 * 基于 PERFORMANCE_UPGRADE §7 与 docs/upgrade-roadmap.md M5.4 的目标预算：
 *   - LCP（最大内容绘制）< 2.5s
 *   - INP（交互到下一次绘制）< 200ms
 *   - CLS（累计布局偏移）< 0.1
 *   - TBT（总阻塞时间）< 200ms（辅助预算）
 *   - FCP（首次内容绘制）< 1.8s（辅助预算）
 *
 * 用法（本地 / CI 可选）：
 *   pnpm perf:audit            # 默认跑桌面预设，产物到 .lighthouseci/
 *   pnpm perf:audit -- --mobile  # 或按 `npx lhci autorun` 运行 LHCI 完整流程
 *
 * 注：Lighthouse 审计需要真实浏览器 + 网络，且结果受运行环境负载影响较大，
 * 故作为**可选**的量化审计工具，不强制阻塞 CI 主流水线（避免偶发抖动）；
 * 前端打包体积预算（gzip <300KB）仍由 CI 的 `pnpm check:bundle-size` 强制把关。
 */

/** @type {import('@lhci/cli').LHCIConfig} */
module.exports = {
  ci: {
    collect: {
      url: ["http://127.0.0.1:4173/"],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        formFactor: "desktop",
        screenEmulation: {
          mobile: false,
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
        },
        throttling: {
          // 本地审计默认不模拟慢网络（避免供应商网络波动污染结果）
          rttMs: 40,
          throughputKbps: 10 * 1024,
          cpuSlowdownMultiplier: 1,
        },
        // LHCI 的 collect.settings.chromeFlags 期望以空格分隔的字符串（见 node-runner
        // 将其拼接进 Lighthouse cli-flags）。CI/容器常以 root 运行 Chrome，
        // 必须显式关闭沙箱才能启动。
        chromeFlags: "--no-sandbox --disable-setuid-sandbox",
      },
    },
    assert: {
      assertions: {
        // 核心预算（PERFORMANCE_UPGRADE §7）。
        // 注意：这里直接用 Lighthouse 的**审计 ID**（如 largest-contentful-paint），
        // 而非 `metrics:xxx` 前缀——后者在对应指标不可用时会回退匹配到 `metrics`
        // 聚合审计并产生误导性告警（如把 CLS/TBT 误报成整体数值）。
        "categories:performance": ["warn", { minScore: 0.9 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "first-contentful-paint": ["warn", { maxNumericValue: 1800 }],
        "total-blocking-time": ["warn", { maxNumericValue: 200 }],
        // interaction-to-next-paint 需要在真实交互下采样，加载-only 的实验室审计
        // 不产生该指标；INP 已由 e2e/perf-transcript.spec.ts 的滚动帧率基线兜底。
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
      reportFilenamePattern: "lighthouse-report-%%HOSTNAME%%-%%DATETIME%%.%%EXTENSION%%",
    },
  },
};

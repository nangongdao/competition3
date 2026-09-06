#!/usr/bin/env node
/**
 * 性能审计脚本（M5.4 性能基线与回归的深化）。
 *
 * 基于 `lighthouserc.cjs` 的预算配置，对构建产物运行 Lighthouse 审计，
 * 输出 LCP / INP / CLS / FCP / TBT 指标并断言预算。
 *
 * 用法：
 *   pnpm build            # 先构建（脚本依赖 dist/）
 *   pnpm perf:audit       # 自动起 preview 服务 → 跑 Lighthouse → 出报告
 *
 * 依赖：@lhci/cli（通过 npx 按需拉取，无需固定在 package.json）。
 *
 * Chrome 发现顺序：
 *   1. `CHROME_PATH` 环境变量（CI/容器常用，如 Playwright 的 chromium 二进制）；
 *   2. LHCI 自动探测系统 Chrome。
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const port = 4173;
const url = `http://127.0.0.1:${port}/`;

function fail(message) {
  console.error(`[perf-audit] ❌ ${message}`);
  process.exit(1);
}

function waitForServer(urlString, timeoutMs = 60_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      fetch(urlString)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - startedAt > timeoutMs) {
            reject(new Error(`等待 preview 服务超时：${urlString}`));
            return;
          }
          setTimeout(probe, 500);
        });
    };
    probe();
  });
}

async function main() {
  // 1. 校验产物存在
  if (!existsSync(distDir)) {
    fail(`未找到构建产物 ${distDir}，请先执行 pnpm build`);
  }

  // 2. 启动 preview 服务（复用 playwright 的起服务方式）
  console.info(`[perf-audit] 启动 preview 服务（http://127.0.0.1:${port}）…`);
  const preview = spawn("pnpm", ["preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: rootDir,
    stdio: "ignore",
  });

  let exited = false;
  preview.on("exit", () => {
    exited = true;
  });

  try {
    await waitForServer(url);

    // 3. 跑 Lighthouse 预算断言（lighthouserc.cjs）
    console.info(`[perf-audit] 审计目标：${url}`);
    console.info("[perf-audit] 运行 Lighthouse 预算断言…");

    // 解析 Chrome 路径（CI/容器常通过 CHROME_PATH 显式提供）。
    const chromePath = process.env.CHROME_PATH;
    const lhciArgs = ["-y", "@lhci/cli", "autorun"];
    if (chromePath) {
      lhciArgs.push("--chromePath", chromePath);
    }

    const result = spawnSync("npx", lhciArgs, {
      cwd: rootDir,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      fail("Lighthouse 预算未达标或运行失败，详见 .lighthouseci/ 报告");
    }

    console.info("[perf-audit] ✅ 性能预算全部达标（LCP<2.5s / FCP<1.8s / CLS<0.1 / TBT<200ms）");
  } finally {
    if (!exited) {
      preview.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  fail(String(error));
});

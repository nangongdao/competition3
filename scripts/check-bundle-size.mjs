/**
 * 前端打包体积预算检查（M5.4 性能基线与回归）。
 *
 * 读取 `dist/` 构建产物，校验 gzip 压缩后总大小不超过预算。
 * 超预算时以非零退出码失败，防止性能回归合并到 main。
 *
 * 预算见 `.github/workflows/ci.yml` 与本文底部常量（保持同步）。
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 前端产物目录。 */
const DIST_DIR = join(__dirname, "..", "dist");

/** gzip 总预算（字节）：roadmap M5.4 要求 gzip <300KB。 */
const GZIP_TOTAL_BUDGET_BYTES = 300 * 1024;

/** 单个 JS chunk 的 gzip 预算（防止单个大 chunk 拖垮首屏）。 */
const SINGLE_JS_GZIP_BUDGET_BYTES = 220 * 1024;

function collectAssets(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectAssets(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function gzipSizeBytes(buffer) {
  return gzipSync(buffer).length;
}

/**
 * 按需加载（deferred / on-demand）的 vendor chunk 标记。
 *
 * 这些 chunk 由动态 import 触发、仅在对应功能被使用时才加载
 * （如内置终端 xterm、Tauri 桌面桥接），不属于首屏关键路径。
 * 因此它们**不计入总 gzip 预算**（首屏成本），但各自仍受单 chunk
 * 预算约束，防止任一 on-demand chunk 体积失控。
 */
const DEFERRED_CHUNK_MARKERS = ["vendor-xterm", "vendor-tauri"];

function isDeferred(file) {
  return DEFERRED_CHUNK_MARKERS.some((marker) => file.includes(marker));
}

const assets = collectAssets(DIST_DIR);
const jsAssets = assets.filter((f) => f.endsWith(".js"));
const cssAssets = assets.filter((f) => f.endsWith(".css"));

let totalGzip = 0;
const failures = [];

for (const file of jsAssets) {
  const size = gzipSizeBytes(readFileSync(file));
  if (!isDeferred(file)) {
    totalGzip += size;
  }
  console.log(`  ${file} gzip: ${(size / 1024).toFixed(1)} KB${isDeferred(file) ? " (deferred)" : ""}`);
  if (size > SINGLE_JS_GZIP_BUDGET_BYTES) {
    failures.push(
      `${file} gzip ${(size / 1024).toFixed(1)} KB 超过单 chunk 预算 ${(SINGLE_JS_GZIP_BUDGET_BYTES / 1024).toFixed(0)} KB`,
    );
  }
}

for (const file of cssAssets) {
  const size = gzipSizeBytes(readFileSync(file));
  if (!isDeferred(file)) {
    totalGzip += size;
  }
  console.log(`  ${file} gzip: ${(size / 1024).toFixed(1)} KB${isDeferred(file) ? " (deferred)" : ""}`);
}

console.log(`\n合计 gzip: ${(totalGzip / 1024).toFixed(1)} KB`);
console.log(`预算: ${(GZIP_TOTAL_BUDGET_BYTES / 1024).toFixed(0)} KB`);

if (totalGzip > GZIP_TOTAL_BUDGET_BYTES) {
  failures.push(
    `总 gzip ${(totalGzip / 1024).toFixed(1)} KB 超过预算 ${(GZIP_TOTAL_BUDGET_BYTES / 1024).toFixed(0)} KB`,
  );
}

if (failures.length > 0) {
  console.error("\n❌ 打包体积预算超限：");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("✅ 打包体积预算通过");

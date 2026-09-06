import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 把体积较大的第三方库拆分为独立、可长缓存（内容哈希）的 vendor chunk。
 *
 * 背景（M5.4 性能基线）：构建产物主 chunk 曾达 ~610KB（未压缩），超过 Vite 500KB
 * 单 chunk 告警阈值，也意味着任何依赖升级都会让浏览器重新下载整包。
 * 拆分后：
 *   1. 消除 500KB 单 chunk 告警；
 *   2. 各 vendor chunk 内容哈希独立，未变更的库可被浏览器长期缓存命中；
 *   3. 首屏只需并行下载少量固定 vendor 块，缓存命中后仅拉取应用代码增量。
 *
 * 函数按模块 id 归属分组；未匹配到任何分组的模块回落到默认 main chunk。
 */
function vendorChunk(id: string): string | undefined {
  // 仅处理 node_modules 内的第三方库，应用代码交给默认 chunk 策略。
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (id.includes("@tanstack/react-virtual")) {
    return "vendor-virtual";
  }
  // xterm.js 终端渲染器体积较大且仅桌面终端面板使用，独立成块以便懒加载/缓存。
  if (id.includes("xterm")) {
    return "vendor-xterm";
  }
  if (id.includes("@tauri-apps")) {
    return "vendor-tauri";
  }
  if (id.includes("react-router")) {
    return "vendor-router";
  }
  if (id.includes("i18next") || id.includes("react-i18next")) {
    return "vendor-i18n";
  }
  if (id.includes("zod")) {
    return "vendor-zod";
  }
  if (
    id.includes("/react/") ||
    id.includes("/react-dom/") ||
    id.includes("/react-router/") ||
    id.includes("/scheduler/") ||
    id.includes("/react-is/") ||
    id.includes("/react-refresh/") ||
    id.includes("/react-jsx/") ||
    id.includes("react/jsx-runtime") ||
    id.includes("react/jsx-dev-runtime")
  ) {
    return "vendor-react";
  }
  return undefined;
}

export default defineConfig({
  // Tauri 期望固定端口；clearScreen 避免 Tauri 控制台被 Vite 刷屏覆盖。
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/app",
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Tauri 源码变更由 Tauri 自身的 watch 处理，避免 Vite 重复扫描 src-tauri。
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
});

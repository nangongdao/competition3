# Tauri 桌面化：原生应用 + 内置终端 + UI 重构

> 把项目从纯浏览器应用升级为真正的原生桌面应用（Tauri），摆脱对浏览器
> 的依赖，并内置一个 xterm.js 驱动的交互式终端，同时优化前端渲染性能。

## 目标

1. **原生桌面**：用 Tauri 2 将 React 前端打包为原生桌面应用，可独立于浏览器运行。
2. **内置终端**：在应用内提供可交互的 shell 终端（xterm.js 渲染 + Rust 后端 PTY 交互）。
3. **UI / 交互重构**：桌面窗口控制栏、终端开关入口、状态可视化。
4. **性能优化**：xterm 懒加载、输出节流、vendor 拆分、组件 memo。

## 架构

### 1. Rust 后端（`src-tauri/src/lib.rs`）

| 命令 | 说明 |
| --- | --- |
| `get_host_platform` | 返回宿主 OS（`macos`/`linux`/`windows`） |
| `run_terminal_command` | 一次性执行 shell 命令并返回输出（原有能力） |
| `spawn_terminal` | 启动交互式 shell（sh/cmd），stdout/stderr 通过 `terminal-output` / `terminal-error-output` 事件推送前端 |
| `write_terminal` | 向交互式 shell 的 stdin 写入一行输入 |
| `terminate_terminal` | 终止当前交互式 shell |
| `is_terminal_running` | 查询 shell 是否运行中 |
| `minimize_window` / `maximize_window` / `close_window` / `toggle_fullscreen` / `is_window_maximized` | 桌面窗口控制 |
| `get_system_info` | 返回平台 / 架构 / CPU 核数 / 内存 |
| `reveal_in_file_manager` | 在文件管理器中定位路径 |

**交互式终端实现要点**：
- 用 `std::process::Command` 启动 `sh`（非 Windows）或 `cmd /Q`（Windows），
  stdin/stdout/stderr 全部 pipe。
- 两个后台线程分别读取 stdout/stderr，逐行通过 Tauri 事件 `emit` 到前端。
- 子进程句柄用 `Arc<Mutex<Option<Child>>>` 在 state 与退出监控线程间共享，
  避免 move 冲突。
- 退出监控线程每 80ms 轮询 `try_wait`，进程退出时 `emit("terminal-exit")`。
- 同一时刻仅支持一个交互式会话（幂等启动：已在运行则返回 `already-running`）。

### 2. 前端（React + xterm.js）

- **`use-tauri.ts`**：扩展 hook，暴露窗口控制、系统信息、文件管理定位等能力。
- **`use-desktop-terminal.ts`**：交互式终端 hook。
  - 动态 `import("xterm")` + `import("xterm/css/xterm.css")`，只在「面板可见 +
    桌面环境」时加载，浏览器/Node 测试环境不触发 xterm 模块副作用（xterm 访问
    `self`，静态导入会在 Node 崩溃）。
  - 通过 `@tauri-apps/api/event.listen` 监听 `terminal-output` /
    `terminal-error-output` / `terminal-exit`。
  - 输出微节流：同一时间窗口（24ms）内的多条输出合并为一次 `Terminal.write`，
    减少 DOM 抖动。
  - 提供 `start` / `stop` / `clear` / `isRunning` / `cwdLabel`。
  - 浏览器环境下 `unavailable = true`，所有操作安全 no-op。
- **`terminal-panel.tsx`**：终端面板 UI。折叠态为右下角浮动按钮，展开态为
  面板（标题栏 + 终端渲染区 + 状态条），支持启动/停止/清屏/最大化/收起。
- **`desktop-window-controls.tsx`**：桌面窗口控制栏（最小化/最大化/关闭），
  仅 Tauri 环境显示，`-webkit-app-region: drag` 支持原生拖拽。

## 性能优化

| 优化项 | 做法 | 收益 |
| --- | --- | --- |
| xterm 懒加载 | 动态 `import("xterm")` + CSS，独立 vendor chunk | 浏览器/首屏不加载 xterm（71KB gzip JS + 1.6KB CSS），仅在打开终端时按需拉取 |
| vendor 拆分 | `vite.config.ts` 为 xterm 增加独立 `manualChunks` | xterm 长期缓存命中，不污染主 bundle |
| 终端输出节流 | 24ms 窗口合并写入 | 避免高频输出导致布局抖动 |
| 组件 memo | 终端面板、窗口控制栏均为 `memo` | 减少父组件重渲染时的子组件重渲染 |
| 终端实例按需创建 | 仅 `visible && isTauri` 时创建 | 避免首屏不必要的终端初始化 |

## 交互重构

- **桌面窗口控制栏**：顶部原生 titlebar 替代（最小化/最大化/关闭 + 平台标识）。
- **终端开关入口**：工具栏新增「终端」按钮（仅桌面显示），一键打开/收起终端。
- **终端面板**：折叠为右下角浮动按钮，展开为可最大化面板，带启动/停止/清屏状态。

## 验证

```bash
# 前端质量门禁
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm test:worker
corepack pnpm build

# Tauri 桌面构建（需本机 Rust 工具链）
pnpm tauri build
```

验证点：
- 浏览器环境：终端入口隐藏，工作台正常渲染，xterm 不加载。
- Tauri 环境：窗口控制栏可用，终端可启动/交互/停止，输出流式渲染。
- 构建产物：主入口不含 xterm，vendor-xterm 独立且按需加载。

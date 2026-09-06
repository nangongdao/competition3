import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 桌面端交互式终端 hook。
 *
 * 在 Tauri 原生桌面环境中，通过 Rust 后端启动一个长驻 shell（sh / cmd），
 * 并把其 stdout / stderr 以 `terminal-output` / `terminal-error-output` 事件
 * 推送到前端；前端用 xterm.js 渲染输出，并把用户输入转发给进程 stdin。
 *
 * 浏览器环境中优雅降级：不创建 Terminal 实例，返回 `not-available` 状态。
 *
 * 性能说明：
 *  - xterm.js 通过动态 `import()` 懒加载：浏览器 / 测试环境不会触发 xterm
 *    模块加载（xterm 会访问 `self`，在 Node 中会抛错，必须避免静态导入）；
 *  - 前端对高频输出做微节流：合并同一帧内的多次 `terminal-output` 事件，
 *    一次性写入 Terminal，减少布局抖动；
 *  - 终端实例仅在「面板可见 + 桌面环境」时才创建，避免拖慢首屏。
 */

export type TerminalStatus =
  | "idle"           // 未启动 / 已退出
  | "starting"       // 正在启动 shell
  | "running"        // shell 运行中
  | "error"          // 启动或运行出错
  | "not-available"; // 浏览器环境（无 Tauri）

export type UseDesktopTerminalOptions = {
  /** 是否可见（仅可见时才创建/挂载 Terminal 实例，优化首屏）。 */
  visible: boolean;
  /** 是否启用输出节流（默认 true）。 */
  throttleOutput?: boolean;
};

export type UseDesktopTerminalResult = {
  status: TerminalStatus;
  /** 当前工作目录标签（启动 shell 时由后端返回）。 */
  cwdLabel: string;
  /** 把 Terminal 实例挂载到指定 DOM 节点（ref 回调）。 */
  setTerminalElement: (el: HTMLDivElement | null) => void;
  /** 启动交互式终端（幂等：已运行则忽略）。 */
  start: () => Promise<void>;
  /** 终止当前终端进程。 */
  stop: () => Promise<void>;
  /** 清空终端屏幕（仅清除显示，不影响进程）。 */
  clear: () => void;
  /** 是否正在运行。 */
  isRunning: boolean;
  /** 是否需要显示“浏览器不可用”提示。 */
  unavailable: boolean;
};

const THROTTLE_MS = 24;

/** 轻量类型占位：避免静态导入 xterm 类型触发模块加载。 */
type AnyTerminal = {
  open: (el: HTMLElement) => void;
  write: (data: string) => void;
  writeln: (data: string) => void;
  onData: (cb: (data: string) => void) => { dispose: () => void };
  dispose: () => void;
  loadAddon: (addon: unknown) => void;
};

export function useDesktopTerminal({
  visible,
  throttleOutput = true,
}: UseDesktopTerminalOptions): UseDesktopTerminalResult {
  const terminalRef = useRef<AnyTerminal | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const eventUnlistenRef = useRef<(() => void)[]>([]);
  const outputBufferRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [cwdLabel, setCwdLabel] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const unavailable = !isTauriAvailable();

  // —— 输出节流：把同一时间窗口内的多条输出合并为一次 Terminal.write ——
  const flushOutput = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const buffer = outputBufferRef.current;
    outputBufferRef.current = [];
    if (buffer.length === 0) return;
    const joined = buffer.join("\r\n");
    terminalRef.current?.write(joined + "\r\n");
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!throttleOutput) {
      flushOutput();
      return;
    }
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(flushOutput, THROTTLE_MS);
  }, [flushOutput, throttleOutput]);

  // —— 写输入到后端 stdin ——
  const writeToShell = useCallback(
    async (data: string) => {
      if (unavailable) return;
      const { invoke } = await import("@tauri-apps/api/core");
      try {
        await invoke("write_terminal", { input: data });
      } catch {
        // 进程可能已退出；由 terminal-exit 事件更新状态
      }
    },
    [unavailable],
  );

  // —— 初始化 Terminal 实例（仅桌面 + 可见时动态创建一次） ——
  useEffect(() => {
    if (unavailable || !visible) return;

    let cancelled = false;
    let disposeTerminal: (() => void) | null = null;

    void (async () => {
      // 动态加载 xterm（JS + CSS），避免在浏览器 / Node 测试环境中触发模块
      // 副作用，也让终端体积只在首次打开时随按需 chunk 一起加载（懒加载）。
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("@xterm/addon-fit"),
        import("xterm/css/xterm.css"),
      ]);
      if (cancelled) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        lineHeight: 1.35,
        convertEol: true,
        scrollback: 4000,
        theme: {
          background: "#0b0c10",
          foreground: "#e2e6ef",
          cursor: "#5e6ad2",
          cursorAccent: "#0b0c10",
          selectionBackground: "rgba(94,106,210,0.35)",
          black: "#0b0c10",
          red: "#ef6d6d",
          green: "#63d17b",
          yellow: "#e6c14f",
          blue: "#5e6ad2",
          magenta: "#b48bd0",
          cyan: "#4fc3d0",
          white: "#e2e6ef",
          brightBlack: "#5b6472",
          brightRed: "#ff8f8f",
          brightGreen: "#8be39b",
          brightYellow: "#f0d675",
          brightBlue: "#8a93e8",
          brightMagenta: "#cfa6e4",
          brightCyan: "#7fdbe6",
          brightWhite: "#ffffff",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);

      terminalRef.current = term as unknown as AnyTerminal;
      fitRef.current = fit;

      if (containerRef.current) {
        term.open(containerRef.current);
        fit.fit();
      }

      const unData = term.onData((data: string) => {
        void writeToShell(data);
      });
      const cleanup: (() => void)[] = [];

      const onResize = () => {
        try {
          fit.fit();
        } catch {
          // 容器尚未就绪
        }
      };
      window.addEventListener("resize", onResize);
      cleanup.push(() => window.removeEventListener("resize", onResize));
      cleanup.push(() => unData.dispose());

      disposeTerminal = () => {
        for (const c of cleanup) c();
        for (const un of eventUnlistenRef.current) un();
        eventUnlistenRef.current = [];
        try {
          term.dispose();
        } catch {
          // ignore
        }
        terminalRef.current = null;
        fitRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(flushTimerRef.current ?? undefined);
      flushTimerRef.current = null;
      disposeTerminal?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable, visible]);

  // —— 挂载 Terminal 到 DOM 节点 ——
  const setTerminalElement = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (el && terminalRef.current) {
      try {
        terminalRef.current.open(el);
        fitRef.current?.fit();
      } catch {
        // container 可能还没布局完成，由下一次 resize 触发
      }
    }
  }, []);

  // —— 事件监听（terminal-output / terminal-error-output / terminal-exit） ——
  useEffect(() => {
    if (unavailable) return;
    let cancelled = false;

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unOut = await listen<string>("terminal-output", (event) => {
        if (cancelled) return;
        outputBufferRef.current.push(event.payload);
        scheduleFlush();
      });
      const unErr = await listen<string>("terminal-error-output", (event) => {
        if (cancelled) return;
        outputBufferRef.current.push(event.payload);
        scheduleFlush();
      });
      const unExit = await listen<number>("terminal-exit", () => {
        if (cancelled) return;
        setStatus("idle");
        setIsRunning(false);
        startedRef.current = false;
        flushOutput();
      });
      if (cancelled) {
        unOut();
        unErr();
        unExit();
        return;
      }
      eventUnlistenRef.current.push(unOut, unErr, unExit);
    })();

    return () => {
      cancelled = true;
    };
  }, [unavailable, scheduleFlush, flushOutput]);

  const start = useCallback(async (): Promise<void> => {
    if (unavailable) return;
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus("starting");
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const cwd = await invoke<string>("spawn_terminal");
      setCwdLabel(cwd);
      setStatus("running");
      setIsRunning(true);
    } catch (err) {
      startedRef.current = false;
      setStatus("error");
      setIsRunning(false);
      const message = err instanceof Error ? err.message : String(err);
      terminalRef.current?.writeln(`\r\n\x1b[31m[terminal] 启动失败：${message}\x1b[0m\r\n`);
    }
  }, [unavailable]);

  const stop = useCallback(async (): Promise<void> => {
    if (unavailable) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("terminate_terminal");
    } finally {
      startedRef.current = false;
      setStatus("idle");
      setIsRunning(false);
      terminalRef.current?.writeln("\r\n[terminal] session ended.\r\n");
    }
  }, [unavailable]);

  const clear = useCallback((): void => {
    // xterm 支持 \x1b[2J 清屏 + \x1b[H 光标归位；若实例尚未就绪则忽略。
    terminalRef.current?.write("\x1b[2J\x1b[H");
  }, []);

  return {
    status,
    cwdLabel,
    setTerminalElement,
    start,
    stop,
    clear,
    isRunning,
    unavailable,
  };
}

function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

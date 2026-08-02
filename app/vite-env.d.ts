/// <reference types="vite/client" />

/*
 * 此处必须使用 interface 而非 type：Vite 通过 `interface ImportMetaEnv`
 * 声明合并来扩展环境变量类型，改用 `type` 会与 vite/client 自带类型冲突。
 * 详见 eslint 规则 @typescript-eslint/consistent-type-definitions。
 */
/* eslint-disable @typescript-eslint/consistent-type-definitions */

interface ImportMetaEnv {
  /**
   * 调用 Worker AI 端点所需的客户端令牌。
   *
   * 部署时应与 `npx wrangler secret put CLIENT_ACCESS_TOKEN` 设置的值一致。
   * 留空则 Worker 侧不启用令牌校验（仅限本地开发）。
   */
  readonly VITE_CLIENT_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

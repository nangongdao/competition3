import { CostDashboard } from "@/modules/assistant/components/usage/cost-dashboard";

/**
 * 成本驾驶舱页面路由（/costs）。
 *
 * 独立全屏视图，集中呈现整套成本治理能力。主体逻辑在 `CostDashboard`，
 * 便于组件测试；本文件仅为路由薄包装。
 */
export function CostsPage(): React.JSX.Element {
  return <CostDashboard />;
}

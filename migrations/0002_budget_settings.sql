-- M? 全局预算护栏：跨会话成本护栏的单行配置表。
-- 只允许一行（id = 'global'），PUT 以覆盖方式写入。
-- 幂等：表/索引均带 IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS budget_settings (
  id                    TEXT PRIMARY KEY,
  monthly_budget_usd    REAL NOT NULL DEFAULT 0,
  alert_threshold_pct   REAL NOT NULL DEFAULT 80,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_settings_id ON budget_settings(id);

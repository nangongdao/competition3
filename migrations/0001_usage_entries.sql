-- M? 会话级用量持久化：把 Chat / Realtime 每轮 token 用量写入 D1，跨会话累计。
-- 幂等：所有表/索引均带 IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS usage_entries (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  mode                 TEXT NOT NULL DEFAULT 'chat',
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  input_text_tokens    INTEGER NOT NULL DEFAULT 0,
  input_audio_tokens   INTEGER NOT NULL DEFAULT 0,
  input_image_tokens   INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens  INTEGER NOT NULL DEFAULT 0,
  cached_text_tokens   INTEGER NOT NULL DEFAULT 0,
  cached_audio_tokens  INTEGER NOT NULL DEFAULT 0,
  cached_image_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  output_text_tokens   INTEGER NOT NULL DEFAULT 0,
  output_audio_tokens  INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd   REAL NOT NULL DEFAULT 0,
  recorded_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_entries_session ON usage_entries(session_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_usage_entries_recorded ON usage_entries(recorded_at);

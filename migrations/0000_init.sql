-- M3.2 会话持久化初始 schema。
-- 幂等：所有表/索引均带 IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '新会话',
  provider_mode TEXT NOT NULL DEFAULT 'chat',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  modality   TEXT NOT NULL DEFAULT 'text',
  tokens     INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS frames (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES messages(id) ON DELETE CASCADE,
  data_url_ref TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_frames_session ON frames(session_id);

-- M4.1 场景记忆：跨会话保存关键帧文字摘要。
CREATE TABLE IF NOT EXISTS scene_memory (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entry_id   TEXT NOT NULL,
  summary    TEXT NOT NULL,
  frame_tokens INTEGER,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_memory_session ON scene_memory(session_id, recorded_at);

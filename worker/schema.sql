-- npx wrangler d1 execute hymn-sched --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS marks (
  k  TEXT PRIMARY KEY,   -- 抖音号|日期
  by TEXT,               -- store / hq
  at INTEGER             -- 标记时间（毫秒）
);

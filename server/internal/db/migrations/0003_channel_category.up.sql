ALTER TABLE channel ADD COLUMN category_id INTEGER REFERENCES category(id) ON DELETE SET NULL;
ALTER TABLE channel ADD COLUMN last_seen_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE channel ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_channel_category ON channel(category_id);

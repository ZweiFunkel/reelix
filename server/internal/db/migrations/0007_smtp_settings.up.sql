CREATE TABLE smtp_settings (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    host         TEXT NOT NULL DEFAULT '',
    port         INTEGER NOT NULL DEFAULT 587,
    username     TEXT NOT NULL DEFAULT '',
    password     TEXT NOT NULL DEFAULT '',
    from_address TEXT NOT NULL DEFAULT ''
);

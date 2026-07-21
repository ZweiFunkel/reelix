CREATE TABLE library (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    root_path       TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('FOLDER', 'PHOTO', 'M3U')),
    scan_settings   TEXT NOT NULL DEFAULT '{}',
    scan_generation INTEGER NOT NULL DEFAULT 0,
    last_scanned_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE category (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id          INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    parent_category_id  INTEGER REFERENCES category(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    path                TEXT NOT NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    last_seen_generation INTEGER NOT NULL DEFAULT 0,
    UNIQUE (library_id, path)
);

CREATE INDEX idx_category_library_parent ON category(library_id, parent_category_id);

CREATE TABLE media_item (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id            INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    category_id           INTEGER REFERENCES category(id) ON DELETE SET NULL,
    file_path             TEXT NOT NULL,
    file_size             INTEGER NOT NULL,
    file_mtime            TEXT NOT NULL,
    media_type            TEXT NOT NULL DEFAULT 'unknown',
    duration_seconds      REAL,
    codec_info            TEXT,
    metadata              TEXT NOT NULL DEFAULT '{}',
    last_seen_generation  INTEGER NOT NULL DEFAULT 0,
    deleted_at            TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (library_id, file_path)
);

CREATE INDEX idx_media_item_category ON media_item(category_id);
CREATE INDEX idx_media_item_library_deleted ON media_item(library_id, deleted_at);

CREATE TABLE channel (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id   INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    group_title  TEXT,
    stream_url   TEXT NOT NULL,
    tvg_id       TEXT,
    tvg_logo     TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (library_id, stream_url)
);

CREATE INDEX idx_channel_library_group ON channel(library_id, group_title);

CREATE TABLE user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profile (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar       TEXT,
    is_kid       INTEGER NOT NULL DEFAULT 0,
    pin_hash     TEXT
);

CREATE TABLE watch_state (
    profile_id        INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
    playable_item_id  INTEGER NOT NULL,
    playable_item_type TEXT NOT NULL CHECK (playable_item_type IN ('media_item', 'channel')),
    position_seconds  REAL NOT NULL DEFAULT 0,
    duration_seconds  REAL,
    watched           INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (profile_id, playable_item_id, playable_item_type)
);

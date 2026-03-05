-- Migration number: 0022_org_boards.sql

CREATE TABLE IF NOT EXISTS org_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    board_type TEXT DEFAULT 'normal', -- 'normal', 'notice', 'gallery'
    read_level TEXT DEFAULT 'member', -- 'public', 'member', 'admin'
    write_level TEXT DEFAULT 'member', -- 'member', 'admin'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES org_boards(id) ON DELETE CASCADE,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id), -- 작성자 (adminUser.id)
    author_name TEXT, -- 작성자 이름 표시용
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER REFERENCES org_posts(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id),
    author_name TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_boards_org ON org_boards(org_id);
CREATE INDEX IF NOT EXISTS idx_posts_board ON org_posts(board_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON org_comments(post_id);

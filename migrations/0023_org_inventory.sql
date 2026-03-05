-- Migration number: 0023_org_inventory.sql

CREATE TABLE IF NOT EXISTS org_inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 물품명 (셔틀콕, 유니폼 상의 L, 등급콕 등)
    category TEXT NOT NULL, -- 'shuttlecock', 'uniform', 'equipment', 'other'
    current_quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT '개', -- 개, 박스, 타 등
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES org_inventory_items(id) ON DELETE CASCADE,
    log_type TEXT NOT NULL, -- 'in' (입고), 'out' (출고), 'adjust' (조정)
    quantity_change INTEGER NOT NULL, -- 변동 수량 (+/-)
    balance_after INTEGER NOT NULL, -- 변경 후 잔여 수량
    log_date DATETIME NOT NULL,
    memo TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_org ON org_inventory_items(org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_item ON org_inventory_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_org_date ON org_inventory_logs(org_id, log_date);

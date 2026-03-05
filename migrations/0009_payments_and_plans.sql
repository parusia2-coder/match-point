-- 참가자의 참가비 결제 상태 추적용 필드 추가
ALTER TABLE participants ADD COLUMN payment_status TEXT DEFAULT 'none'; -- none, pending, paid, failed, refunded
ALTER TABLE participants ADD COLUMN payment_id TEXT; -- 결제 고유 식별자 (토스페이먼츠 결제키 등)
ALTER TABLE participants ADD COLUMN amount INTEGER DEFAULT 0; -- 결제 금액

-- 대회 설정에 참가비(기본값) 및 결제 사용 여부 추가
ALTER TABLE tournaments ADD COLUMN use_payment BOOLEAN DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN participation_fee INTEGER DEFAULT 0;

-- 결제 이력(영수증) 테이블 (옵션: 나중에 관리자 수익/정산 시 필요)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    participant_id INTEGER,
    admin_id INTEGER, -- 관리자가 PRO 구독 결제 시
    amount INTEGER NOT NULL,
    payment_key TEXT NOT NULL, -- Toss명: paymentKey
    order_id TEXT NOT NULL,
    status TEXT NOT NULL, -- DONE, CANCELED 등
    method TEXT, -- CARD, TRANSFER 등
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

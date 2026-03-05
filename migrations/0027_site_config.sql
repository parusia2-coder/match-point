-- 사이트 커스터마이징 설정 (JSON) 컬럼 추가
ALTER TABLE organizations ADD COLUMN site_config TEXT DEFAULT '{}';

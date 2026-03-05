-- Migration: 0026_org_hierarchy.sql
-- 계층형 조직 구조: 클럽 → 시협회 → 도협회 → 체육회

-- 상위 단체 연결
ALTER TABLE organizations ADD COLUMN parent_org_id INTEGER REFERENCES organizations(id);

-- 조직 레벨 (club, city_assoc, province_assoc, national)
ALTER TABLE organizations ADD COLUMN org_level TEXT DEFAULT 'club';

-- 지역 정보
ALTER TABLE organizations ADD COLUMN region TEXT;

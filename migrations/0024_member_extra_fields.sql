-- Migration number: 0024_member_extra_fields.sql
-- 회원 관리 추가 필드: 직위, 옷사이즈

-- org_members 테이블에 직위 / 옷사이즈 필드 추가
ALTER TABLE org_members ADD COLUMN position TEXT; -- 직위 (회장, 부회장, 총무, 감사, 이사, 일반 등)
ALTER TABLE org_members ADD COLUMN clothing_size TEXT; -- 옷사이즈 (XS, S, M, L, XL, 2XL, 3XL)

-- members 테이블에 생년월일(날짜형) 추가 (기존 birth_year와 병행)
ALTER TABLE members ADD COLUMN birth_date TEXT; -- YYYY-MM-DD 형식 생년월일

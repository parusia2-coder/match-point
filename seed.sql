-- Seed Data

-- 1. Create a tournament
INSERT INTO tournaments (name, description, status, format, games_per_player, courts, merge_threshold, admin_password)
VALUES ('2026 안양시배드민턴협회 장년부 자체대회', '제1회 안양시 장년부 배드민턴 대회', 'open', 'kdk', 4, 6, 4, 'admin123');

-- 2. Insert sample participants (Total ~20 for testing)
INSERT INTO participants (tournament_id, name, phone, gender, birth_year, level, paid, checked_in, club, wants_mixed) VALUES
(1, '김철수', '010-1111-2222', 'm', 1970, 'a', 1, 0, '안양클럽', 1),
(1, '이영희', '010-3333-4444', 'f', 1975, 'b', 1, 0, '동안클럽', 1),
(1, '박민수', '010-5555-6666', 'm', 1968, 's', 1, 0, '만안클럽', 0),
(1, '최지우', '010-7777-8888', 'f', 1980, 'c', 1, 0, '평촌클럽', 1),
(1, '정우성', '010-9999-0000', 'm', 1972, 'a', 1, 0, '안양클럽', 1),
(1, '한가인', '010-1234-5678', 'f', 1985, 'd', 0, 0, '호계클럽', 0),
(1, '강호동', '010-1111-1111', 'm', 1965, 'b', 1, 0, '비산클럽', 0),
(1, '유재석', '010-2222-2222', 'm', 1972, 'c', 1, 0, '관양클럽', 1),
(1, '이효리', '010-3333-3333', 'f', 1979, 'a', 1, 0, '부림클럽', 1),
(1, '송혜교', '010-4444-4444', 'f', 1982, 'b', 1, 0, '달안클럽', 0),
(1, '현빈',   '010-5555-5555', 'm', 1982, 's', 1, 0, '부흥클럽', 1),
(1, '손예진', '010-6666-6666', 'f', 1982, 'a', 1, 0, '부흥클럽', 1),
(1, '차은우', '010-7777-7777', 'm', 1997, 'a', 1, 0, '동안클럽', 0),
(1, '장원영', '010-8888-8888', 'f', 2004, 'c', 1, 0, '평촌클럽', 0),
(1, '마동석', '010-9999-9999', 'm', 1971, 'd', 1, 0, '만안클럽', 1),
(1, '김혜수', '010-0000-0000', 'f', 1970, 's', 1, 0, '안양클럽', 1),
(1, '황정민', '010-1212-3434', 'm', 1970, 'b', 1, 0, '호계클럽', 0),
(1, '전지현', '010-5656-7878', 'f', 1981, 'b', 1, 0, '비산클럽', 1),
(1, '이정재', '010-4321-8765', 'm', 1972, 'a', 1, 0, '관양클럽', 1),
(1, '김태희', '010-9876-5432', 'f', 1980, 'c', 1, 0, '달안클럽', 0);

-- 3. Create Sample Events
-- Men's Doubles 50s A
INSERT INTO events (tournament_id, category, age_group, level_group, name, status)
VALUES (1, 'md', '50대', 'a', '남자복식 50대 A급', 'pending');

-- Women's Doubles 40s B
INSERT INTO events (tournament_id, category, age_group, level_group, name, status)
VALUES (1, 'wd', '40대', 'b', '여자복식 40대 B급', 'pending');

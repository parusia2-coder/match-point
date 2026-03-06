-- Migration 0029: 최상위 관리자 크리덴셜 변경
-- username: matchpoint_admin
-- password: admin9645  (PBKDF2-SHA256, 100000 iterations)

UPDATE users 
SET username = 'matchpoint_admin', 
    password_hash = 'f5775e73bacc16b1489e81305110153104ebd1dab3ef313b786aaf687a69347f', 
    password_salt = '079ff62cb5461bd5382bf51b243f1ae9', 
    updated_at = CURRENT_TIMESTAMP 
WHERE global_role = 'super_admin';

-- 만약 super_admin 유저가 없는 경우 새로 삽입
INSERT OR IGNORE INTO users (username, password_hash, password_salt, global_role, name)
VALUES (
    'matchpoint_admin',
    'f5775e73bacc16b1489e81305110153104ebd1dab3ef313b786aaf687a69347f',
    '079ff62cb5461bd5382bf51b243f1ae9',
    'super_admin',
    '최고관리자'
);

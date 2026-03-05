import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

console.log("🚀 [배포 준비] 완전히 새로운 클라우드플레어 프로젝트와 DB를 설정합니다...");

try {
    console.log("\n[1/5] 새로운 D1 데이터베이스(minton-tennis-db) 생성 중...");
    try {
        execSync('npx wrangler d1 create minton-tennis-db', { stdio: 'ignore' });
    } catch (e) {
        // 이미 존재해서 에러가 나면 그냥 무시(계속 진행)
        console.log(" (안내: 이미 DB가 존재할 수 있습니다. 기존 DB 재사용을 시도합니다.)");
    }

    // DB 리스트를 JSON 형태로 가져와서 파싱
    console.log("\n[1.5/5] 생성된 데이터베이스 ID 찾는 중...");
    const d1ListResult = execSync('npx wrangler d1 list --json', { encoding: 'utf-8' });
    let dbId = "";
    try {
        const d1Array = JSON.parse(d1ListResult);
        const myDb = d1Array.find(db => db.name === 'minton-tennis-db');
        if (myDb && myDb.uuid) {
            dbId = myDb.uuid;
        } else {
            throw new Error("리스트에 'minton-tennis-db'가 없습니다.");
        }
    } catch (e) {
        throw new Error("데이터베이스 ID 추출 실패: " + e.message);
    }
    console.log("✅ 데이터베이스 ID 획득: " + dbId);

    // 2. wrangler.jsonc 파일 업데이트
    console.log("\n[2/5] wrangler.jsonc 설정 파일 업데이트 중 (새 프로젝트명, 새 DB 할당) ...");
    const wranglerPath = './wrangler.jsonc';
    let config = readFileSync(wranglerPath, 'utf8');

    config = config.replace(/"name":\s*"[^"]+"/, `"name": "minton-tennis"`);
    config = config.replace(/"database_name":\s*"[^"]+"/, `"database_name": "minton-tennis-db"`);
    config = config.replace(/"database_id":\s*"[^"]+"/, `"database_id": "${dbId}"`);

    writeFileSync(wranglerPath, config);
    console.log("✅ wrangler.jsonc 업데이트 완료.");

    // 3. 새 원격 DB에 테이블 속성(Migration) 적용
    console.log("\n[3/5] 새로운 DB에 테이블 구조(Migration) 적용 중...");
    // --remote로 강제 적용
    execSync('npx wrangler d1 migrations apply minton-tennis-db --remote', { stdio: 'inherit' });

    // 4. 새 원격 DB에 기본 데이터(Seed) 넣기
    console.log("\n[4/5] 새로운 DB에 기본 데이터(종목, 관리자 등) 주입 중...");
    execSync('npx wrangler d1 execute minton-tennis-db --remote --file=./seed.sql', { stdio: 'inherit' });

    // 5. 서버 빌드 및 클라우드플레어 새로운 프로젝트로 배포
    console.log("\n[5/5] 프론트엔드 빌드 및 새 프로젝트 통합 배포 진행 중...");
    execSync('npm run build', { stdio: 'inherit' });

    // 최종 배포 명령어 (프로젝트 자동 생성 포함)
    console.log("\n✅ 모든 분리 준비 완료!!! 마지막으로 클라우드플레어 전용서버에 배포합니다. (약 1분 소요)");
    execSync('npx wrangler pages deploy dist --project-name minton-tennis --branch main', { stdio: 'inherit' });

    console.log("\n🎉 성공적으로 기존 자료와 완전히 분리된 최신 버전 'Minton-Tennis' 배포가 완료되었습니다!");
    console.log("위에 출력된 🟢 초록색 주소(URL)를 통해 새 통합 시스템에 접속해보세요!");
} catch (error) {
    console.error("\n❌ 배포 중 오류가 발생했습니다:", error.message);
}

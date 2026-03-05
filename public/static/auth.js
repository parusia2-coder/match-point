// =========================================================
//  🔐 관리자 인증 UI  (auth.js)
//  JWT 기반 로그인/회원가입/내정보
// =========================================================

const AUTH_KEY = 'mp_admin_token';
const USER_KEY = 'mp_admin_user';

// ── 토큰 관리 ─────────────────────────────────────────────
function authGetToken() { return localStorage.getItem(AUTH_KEY); }
function authGetUser() { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; }
function authSave(token, user) {
  localStorage.setItem(AUTH_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function authClear() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
}
function isLoggedIn() { return !!authGetToken(); }

// ── API 헬퍼 (Authorization 헤더 자동 첨부) ───────────────
async function authApi(path, options = {}) {
  const token = authGetToken();
  const res = await fetch('/api/auth' + path, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

// ── 네비게이션 우측 버튼 업데이트 ─────────────────────────
function updateAuthNav() {
  const user = authGetUser();
  const navRight = document.querySelector('#authNavArea');
  if (!navRight) return;

  if (user) {
    // 로그인 시 네비게이션 메뉴 표시
    var navMenu = document.getElementById('navMenu');
    if (navMenu) navMenu.style.display = 'flex';

    // 권한 확인
    const isSuperAdmin = user.global_role === 'super_admin';
    const isOrgAdmin = Object.keys(user.org_roles || {}).length > 0;
    const isClubAdmin = Object.keys(user.club_roles || {}).length > 0;

    let mainRoleText = '일반 회원';
    let roleBadge = '<span style="display:inline-block;margin-top:6px;padding:3px 8px;background:rgba(148,163,184,0.1);color:#64748b;border-radius:20px;font-size:0.72rem;font-weight:700;">일반/선수</span>';

    if (isSuperAdmin) {
      mainRoleText = '시스템 관리자';
      roleBadge = '<span style="display:inline-block;margin-top:6px;padding:3px 8px;background:rgba(220,38,38,0.1);color:#dc2626;border-radius:20px;font-size:0.72rem;font-weight:700;">총괄 관리자</span>';
    } else if (isOrgAdmin) {
      mainRoleText = '협회 관리자';
      roleBadge = '<span style="display:inline-block;margin-top:6px;padding:3px 8px;background:rgba(249,115,22,0.1);color:#f97316;border-radius:20px;font-size:0.72rem;font-weight:700;">협회 관리자</span>';
    } else if (isClubAdmin) {
      mainRoleText = '클럽 관리자';
      roleBadge = '<span style="display:inline-block;margin-top:6px;padding:3px 8px;background:rgba(59,130,246,0.1);color:#3b82f6;border-radius:20px;font-size:0.72rem;font-weight:700;">클럽 총무</span>';
    }

    let roleButtons = '';
    if (isSuperAdmin) {
      roleButtons += `
          <button onclick="location.href='/';closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            📊 전체 플랫폼 대시보드
          </button>
       `;
    } else if (isOrgAdmin) {
      roleButtons += `
          <button onclick="location.href='/';closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            🏛️ 협회 관리 대시보드
          </button>
       `;
    } else if (isClubAdmin) {
      roleButtons += `
          <button onclick="location.href='/';closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            🛡️ 클럽 관리 대시보드
          </button>
       `;
    } else {
      roleButtons += `
          <button onclick="location.href='/my';closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            🏃 내 경기 일정 관리
          </button>
       `;
    }

    navRight.innerHTML = `
        <div style="text-align:right;display:none;" id="navUserInfo" class="navUserInfoEl">
          <div style="font-size:0.75rem;color:#64748b;line-height:1.2;">${mainRoleText}</div>
          <div style="font-size:0.82rem;font-weight:700;color:#0f172a;">${user.username}</div>
        </div>
        <button class="btn btn-sm" id="navUserBtn"
          style="margin:0;border-radius:50px;padding:6px 14px;font-weight:700;font-size:0.85rem;background:rgba(249,115,22,0.1);color:#f97316;border:1px solid rgba(249,115,22,0.3);"
          onclick="toggleUserMenu()">
          👤 ${user.username}
        </button>

      <!-- 드롭다운 메뉴 -->
      <div id="userDropdown" style="display:none;position:absolute;top:60px;right:16px;background:#fff;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.06);min-width:200px;z-index:200;overflow:hidden;">
        <div style="padding:16px;border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:800;color:#0f172a;">${user.username}</div>
          <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">${mainRoleText}</div>
          ${roleBadge}
        </div>
        <div style="padding:8px;">
          ${roleButtons}
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:4px 0;">
          <button onclick="showMyPage();closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            👤 내 정보
          </button>
          <button onclick="showChangePassword();closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#334155;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            🔑 비밀번호 변경
          </button>
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:4px 0;">
          <button onclick="doLogout();closeUserMenu();" style="width:100%;text-align:left;padding:10px 14px;border:none;background:none;border-radius:10px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#ef4444;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">
            🚪 로그아웃
          </button>
        </div>
      </div>
    `;

  } else {
    // 비로그인 시 네비게이션 메뉴 숨김
    var navMenu = document.getElementById('navMenu');
    if (navMenu) navMenu.style.display = 'none';
    navRight.innerHTML = `
        <button class="btn btn-sm" style="margin:0;border-radius:24px;padding:8px 16px;font-weight:700;font-size:0.85rem;background:transparent;color:#475569;border:1px solid #e2e8f0;"
          onclick="showLoginModal()">로그인</button>
        <button class="btn btn-sm" style="margin:0;border-radius:24px;padding:8px 16px;font-weight:700;font-size:0.88rem;white-space:nowrap;background:linear-gradient(135deg, #f97316, #ea580c);color:#fff;border:none;"
          onclick="showRegisterModal()">가입</button>
      `;
  }
}

// 드롭다운 토글
function toggleUserMenu() {
  const d = document.getElementById('userDropdown');
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
function closeUserMenu() {
  const d = document.getElementById('userDropdown');
  if (d) d.style.display = 'none';
}
// 외부 클릭 시 닫기
document.addEventListener('click', (e) => {
  const btn = document.getElementById('navUserBtn');
  const dd = document.getElementById('userDropdown');
  if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = 'none';
  }
});

// ── 로그아웃 ──────────────────────────────────────────────
function doLogout() {
  authClear();
  updateAuthNav();
  showToast('로그아웃되었습니다.');
  location.href = '/';
}

// ── 로그인 모달 ───────────────────────────────────────────
function showLoginModal() {
  showModal('로그인', `
        <div style="text-align:center;margin-bottom:30px;">
      <div style="font-size:3rem;margin-bottom:8px;">🔐</div>
      <p style="color:#C8FF00;font-size:0.9rem;margin:0;font-family:'Barlow Condensed',sans-serif;letter-spacing:0.1em;text-transform:uppercase;">Match Point Login</p>
    </div>
    <div class="form-group"><label>아이디</label>
      <input class="form-control" id="liUsername" placeholder="아이디 입력" autocomplete="username">
    </div>
    <div class="form-group"><label>비밀번호</label>
      <input class="form-control" id="liPassword" type="password" placeholder="비밀번호 입력" autocomplete="current-password"
        onkeydown="if(event.key==='Enter') doLogin()">
    </div>
    <button class="btn-brutal" id="modalConfirm" onclick="doLogin()">로그인 →</button>
    <p style="font-size:0.85rem;color:#888;text-align:center;margin-top:24px;font-family:'Barlow Condensed',sans-serif;">
      계정이 없으신가요?
      <a href="#" style="color:#C8FF00;font-weight:700;text-decoration:none;border-bottom:1px solid #C8FF00;padding-bottom:2px;" onclick="closeModal();setTimeout(showRegisterModal,100);">무료 가입</a>
    </p>
      `, null, { brutal: true });
  setTimeout(() => document.getElementById('liUsername')?.focus(), 100);
}

async function doLogin() {
  const btn = document.getElementById('modalConfirm');
  const username = document.getElementById('liUsername')?.value?.trim();
  const password = document.getElementById('liPassword')?.value;
  if (!username || !password) { showToast('아이디와 비밀번호를 입력하세요.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ 확인 중...'; }
  try {
    const { token, user } = await authApi('/login', { method: 'POST', body: { username, password } });
    authSave(token, user);
    closeModal();
    showToast(`환영합니다, ${user.username} 님! 👋`);
    updateAuthNav();
    // 로그인 후 강제 새로고침하여 메뉴 리로드
    location.reload();
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '로그인 →'; }
  }
}

// ── 회원가입 모달 ─────────────────────────────────────────
function showRegisterModal() {
  showModal('통합 플랫폼 회원 가입', `
        <div style="text-align:center;margin-bottom:30px;">
      <div style="font-size:3rem;margin-bottom:8px;">🚀</div>
      <p style="color:#C8FF00;font-size:0.9rem;margin:0;font-family:'Barlow Condensed',sans-serif;letter-spacing:0.1em;text-transform:uppercase;">지금 바로 시작하세요</p>
    </div>
    <div class="form-row">
      <div class="form-group"><label>아이디 *</label>
        <input class="form-control" id="rgUsername" placeholder="영문/숫자 3자 이상" autocomplete="username">
      </div>
      <div class="form-group"><label>비밀번호 *</label>
        <input class="form-control" id="rgPassword" type="password" placeholder="6자 이상" autocomplete="new-password">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>실명</label>
        <input class="form-control" id="rgName" placeholder="홍길동 (선택)">
      </div>
      <div class="form-group"><label>연락처</label>
        <input class="form-control" id="rgPhone" type="text" placeholder="010-0000-0000 (선택)">
      </div>
    </div>
    <div class="form-group"><label>이메일</label>
      <input class="form-control" id="rgEmail" type="email" placeholder="선택 사항">
    </div>
    <button class="btn-brutal" id="modalConfirm" onclick="doRegister()">무료로 시작하기</button>
    <p style="font-size:0.85rem;color:#888;text-align:center;margin-top:24px;font-family:'Barlow Condensed',sans-serif;">
      이미 계정이 있으신가요?
      <a href="#" style="color:#C8FF00;font-weight:700;text-decoration:none;border-bottom:1px solid #C8FF00;padding-bottom:2px;" onclick="closeModal();setTimeout(showLoginModal,100);">로그인</a>
    </p>
      `, null, { brutal: true });
}

async function doRegister() {
  const btn = document.getElementById('modalConfirm');
  const username = document.getElementById('rgUsername')?.value?.trim();
  const password = document.getElementById('rgPassword')?.value;
  const name = document.getElementById('rgName')?.value?.trim();
  const phone = document.getElementById('rgPhone')?.value?.trim();
  const email = document.getElementById('rgEmail')?.value?.trim();

  if (!username || !password) { showToast('아이디와 비밀번호는 필수입니다.', 'error'); return; }
  if (username.length < 3) { showToast('아이디는 3자 이상이어야 합니다.', 'error'); return; }
  if (password.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ 처리 중...'; }
  try {
    const { token, user } = await authApi('/register', {
      method: 'POST', body: { username, password, name: name || undefined, phone: phone || undefined, email: email || undefined }
    });
    authSave(token, user);
    closeModal();
    showToast(`가입 완료! 환영합니다, ${user.username} 님 🎉`);
    updateAuthNav();
    location.reload();
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '무료로 시작하기 🚀'; }
  }
}

// ── 내 정보 페이지 ────────────────────────────────────────
async function showMyPage() {
  try {
    const user = await authApi('/me');
    const planBadge = { free: '🆓 무료', club: '⭐ 클럽', premium: '💎 프리미엄' }[user.plan] || user.plan;
    showModal('내 정보', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div style="background:var(--bg);padding:12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);">아이디</div>
          <div style="font-weight:800;font-size:1.1rem;">${user.username}</div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);">플랜</div>
          <div style="font-weight:700;">${planBadge}</div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);">클럽/협회</div>
          <div style="font-weight:700;">${user.organization || '미설정'}</div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);">가입일</div>
          <div style="font-weight:700;">${(user.created_at || '').slice(0, 10)}</div>
        </div>
      </div>
        <div style="font-weight:700;margin-bottom:8px;">🏆 내 대회 (최근 5개)</div>
      ${user.tournaments?.length
        ? `<div class="table-container"><table class="data-table" style="font-size:0.85rem;">
            <thead><tr><th>대회명</th><th>상태</th><th>날짜</th></tr></thead>
            <tbody>${user.tournaments.map(t => `<tr>
              <td style="cursor:pointer;color:var(--primary);font-weight:600;" onclick="closeModal();navigateTo('?tid=${t.id}')">${t.name}</td>
              <td>${t.status}</td>
              <td style="font-size:0.75rem">${(t.date || '').slice(0, 10)}</td>
            </tr>`).join('')}</tbody>
           </table></div>`
        : '<p style="color:var(--text-muted);text-align:center;padding:20px;">아직 개설한 대회가 없습니다.</p>'
      }
      `, null, { confirmText: '닫기', hideCancel: true });
  } catch (e) { showToast(e.message, 'error'); }
}

// ── 비밀번호 변경 ─────────────────────────────────────────
function showChangePassword() {
  showModal('비밀번호 변경', `
        <div class="form-group"><label>현재 비밀번호</label>
      <input class="form-control" id="cpCurrent" type="password" placeholder="현재 비밀번호">
    </div>
    <div class="form-group"><label>새 비밀번호</label>
      <input class="form-control" id="cpNew" type="password" placeholder="새 비밀번호 (6자 이상)">
    </div>
    <div class="form-group"><label>새 비밀번호 확인</label>
      <input class="form-control" id="cpConfirm" type="password" placeholder="새 비밀번호 재입력">
    </div>
      `, async () => {
    const current = document.getElementById('cpCurrent')?.value;
    const newPw = document.getElementById('cpNew')?.value;
    const confirm = document.getElementById('cpConfirm')?.value;
    if (newPw !== confirm) { showToast('새 비밀번호가 일치하지 않습니다.', 'error'); return; }
    await authApi('/password', { method: 'PUT', body: { current_password: current, new_password: newPw } });
    showToast('비밀번호가 변경되었습니다! 🔐');
    closeModal();
  }, { confirmText: '변경하기' });
}

// ── 초기화 (홈 렌더 후 호출) ──────────────────────────────
function initAuth() {
  updateAuthNav();
}

// DOM 준비 시 자동 실행 (app.js가 아직 호출 안 했을 경우 대비)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(updateAuthNav, 200);
  });
} else {
  setTimeout(updateAuthNav, 200);
}

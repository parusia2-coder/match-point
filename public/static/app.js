// ===== 배드민턴 대회 운영 시스템 - Sport Command Center SPA =====
'use strict';

// ===== State =====
let tournaments = [];
let currentTournament = null;
let currentTab = 'overview';
let participants = [];
let events = [];
let matches = [];
let standings = [];
let venues = [];
let isAuthenticated = false;
let html5QrcodeScanner = null;
let lastScannedPid = null;

// ===== Dark Mode =====
function initDarkMode() {
  const isDark = localStorage.getItem('mp-theme') === 'dark';
  if (isDark) document.body.classList.add('dark-mode');
  updateDarkModeBtn(isDark);
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('mp-theme', isDark ? 'dark' : 'light');
  updateDarkModeBtn(isDark);
}
function updateDarkModeBtn(isDark) {
  document.querySelectorAll('#darkModeBtn').forEach(btn => {
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'var(--bg-card)';
  });
}
document.addEventListener('DOMContentLoaded', initDarkMode);

// ===== Toast =====
function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = (type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️') + ' ' + msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ===== 공용 API Fetch (모든 하위 모듈이 이 함수를 공유) =====
// basePrefix: '/api/tournaments' | '/api/members' | '/api/rankings' 등
async function apiFetch(basePrefix, path = '', options = {}) {
  const token = typeof authGetToken === 'function' ? authGetToken() : null;
  const res = await fetch(basePrefix + path, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// 기존 api() 유지 (하위 호환)
async function api(path, options = {}) {
  try {
    return await apiFetch('/api/tournaments', path, options);
  } catch (e) {
    if (options.muteError) throw e; // 에러 토스트 생략
    // 오프라인 응답인 경우 특별 처리
    if (e.message.includes('503') || e.message.includes('offline')) {
      showToast('📡 오프라인 상태 — 캐시된 데이터를 표시합니다', 'warning');
    } else {
      showToast(e.message, 'error');
    }
    throw e;
  }
}

// ===== 오프라인 상태 배너 =====
window.addEventListener('online', () => showToast('🌐 네트워크 연결됨'));
window.addEventListener('offline', () => showToast('📡 오프라인 상태 — 캐시된 데이터로 동작합니다', 'warning'));

// ===== 드롭다운 네비게이션 유틸 =====
let _ndJustToggled = false;  // 이벤트 버블링 방지 플래그

function ndToggle(id) {
  const nd = document.getElementById(id);
  const btn = nd?.querySelector('.nd-trigger');
  const menu = nd?.querySelector('.nd-menu');
  const isOpen = menu?.classList.contains('nd-open');
  ndClose(); // 다른 드롭다운 먼저 닫기
  if (!isOpen) {
    menu?.classList.add('nd-open');
    btn?.classList.add('nd-open');
  }
  _ndJustToggled = true;  // document.click에서 무시하도록
  setTimeout(() => { _ndJustToggled = false; }, 0);
}

function ndClose() {
  document.querySelectorAll('.nd-menu.nd-open').forEach(m => m.classList.remove('nd-open'));
  document.querySelectorAll('.nd-trigger.nd-open').forEach(b => b.classList.remove('nd-open'));
}

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', (e) => {
  if (_ndJustToggled) return;  // ndToggle에서 방금 열었으면 무시
  if (!e.target.closest('.nd')) ndClose();
});

function navActivate(el) {
  document.querySelectorAll('.nd-trigger').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}


// ===== Landing Page (비로그인 홈) =====
function renderHome(container) {
  container.innerHTML = `
    <style>
      /* ── Landing Page Styles ── */
      .lp-root {
        background: #0A0A0A;
        color: #fff;
        min-height: 100vh;
        font-family: 'Space Grotesk', 'Barlow Condensed', sans-serif;
        overflow-x: hidden;
      }

      /* NAV */
      .lp-nav {
        position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
        display: flex; justify-content: space-between; align-items: center;
        padding: 0 clamp(20px, 5vw, 60px); height: 68px;
        background: rgba(10,10,10,0.85);
        backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        transition: all 0.3s ease;
      }
      .lp-logo { display: flex; align-items: center; gap: 10px; cursor: pointer; text-decoration: none; }
      .lp-logo-block {
        width: 34px; height: 34px; background: #C8FF00;
        display: flex; align-items: center; justify-content: center;
        clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
      }
      .lp-logo-block span { font-family: 'Bebas Neue', sans-serif; color: #0A0A0A; font-size: 1rem; font-weight: bold; }
      .lp-logo-text { font-family: 'Bebas Neue', sans-serif; font-size: 1.55rem; color: #fff; letter-spacing: 0.15em; }
      .lp-nav-actions { display: flex; gap: 10px; align-items: center; }
      .lp-btn-ghost {
        padding: 8px 20px; border-radius: 50px; font-size: 0.88rem; font-weight: 700;
        background: transparent; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15);
        cursor: pointer; transition: all 0.2s ease; letter-spacing: 0.03em;
      }
      .lp-btn-ghost:hover { background: rgba(255,255,255,0.07); color: #fff; border-color: rgba(255,255,255,0.3); }
      .lp-btn-cta {
        padding: 9px 22px; border-radius: 50px; font-size: 0.9rem; font-weight: 800;
        background: #C8FF00; color: #0A0A0A; border: none;
        cursor: pointer; transition: all 0.2s ease; letter-spacing: 0.04em;
      }
      .lp-btn-cta:hover { background: #d8ff33; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(200,255,0,0.3); }

      /* HERO */
      .lp-hero {
        min-height: 100vh;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 100px clamp(20px, 6vw, 80px) 80px;
        position: relative; overflow: hidden;
        text-align: center;
      }
      .lp-hero-bg {
        position: absolute; inset: 0; pointer-events: none;
        background:
          radial-gradient(ellipse 60% 50% at 30% 30%, rgba(200,255,0,0.08) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 75% 70%, rgba(139,92,246,0.1) 0%, transparent 55%),
          radial-gradient(ellipse 40% 60% at 85% 15%, rgba(249,115,22,0.07) 0%, transparent 50%);
      }
      .lp-hero-grid {
        position: absolute; inset: 0; pointer-events: none;
        background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
        background-size: 60px 60px;
        mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000 0%, transparent 100%);
      }
      .lp-hero-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 18px; border-radius: 50px;
        background: rgba(200,255,0,0.08); border: 1px solid rgba(200,255,0,0.25);
        color: #C8FF00; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.08em;
        margin-bottom: 28px; text-transform: uppercase;
        animation: fadeInDown 0.6s ease both;
      }
      .lp-hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #C8FF00; animation: pulse-dot 2s infinite; }
      @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
      .lp-hero-title {
        font-family: 'Bebas Neue', sans-serif;
        font-size: clamp(3.5rem, 10vw, 8rem);
        line-height: 0.95; letter-spacing: 0.04em;
        color: #fff; margin-bottom: 12px;
        animation: fadeInDown 0.7s ease 0.1s both;
      }
      .lp-hero-title .accent { color: #C8FF00; }
      .lp-hero-sub {
        font-family: 'Barlow Condensed', sans-serif;
        font-size: clamp(1.1rem, 2.5vw, 1.5rem);
        color: rgba(200,200,220,0.7); font-weight: 400; letter-spacing: 0.08em;
        margin-bottom: 10px; text-transform: uppercase;
        animation: fadeInDown 0.7s ease 0.15s both;
      }
      .lp-hero-desc {
        font-size: clamp(0.95rem, 1.8vw, 1.15rem); color: #64748b;
        max-width: 600px; margin: 16px auto 40px; line-height: 1.7;
        animation: fadeInDown 0.7s ease 0.2s both;
      }
      .lp-hero-ctas {
        display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;
        animation: fadeInDown 0.7s ease 0.25s both;
        margin-bottom: 60px;
      }
      .lp-btn-primary {
        padding: 16px 36px; border-radius: 50px; font-size: 1rem; font-weight: 800;
        background: #C8FF00; color: #0A0A0A; border: none;
        cursor: pointer; transition: all 0.25s ease; letter-spacing: 0.04em;
        position: relative; overflow: hidden;
      }
      .lp-btn-primary:hover { background: #d8ff33; transform: translateY(-2px); box-shadow: 0 16px 40px rgba(200,255,0,0.35); }
      .lp-btn-outline {
        padding: 15px 34px; border-radius: 50px; font-size: 1rem; font-weight: 700;
        background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,0.2);
        cursor: pointer; transition: all 0.25s ease; letter-spacing: 0.03em;
      }
      .lp-btn-outline:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); transform: translateY(-2px); }

      /* Stats Bar */
      .lp-stats {
        display: flex; gap: clamp(24px, 5vw, 60px); flex-wrap: wrap; justify-content: center;
        padding: 28px 40px; border-radius: 20px;
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        animation: fadeInDown 0.7s ease 0.3s both;
      }
      .lp-stat-item { text-align: center; }
      .lp-stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 2.4rem; color: #C8FF00; line-height: 1; }
      .lp-stat-label { font-size: 0.78rem; color: #64748b; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }

      /* FEATURES */
      .lp-section { padding: clamp(60px, 8vw, 120px) clamp(20px, 6vw, 80px); position: relative; }
      .lp-section-label {
        font-family: 'Barlow Condensed', sans-serif; font-size: 0.85rem;
        color: #C8FF00; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
        margin-bottom: 16px; display: block;
      }
      .lp-section-title {
        font-family: 'Bebas Neue', sans-serif;
        font-size: clamp(2.2rem, 5vw, 4rem);
        color: #fff; line-height: 1; letter-spacing: 0.04em;
        margin-bottom: 16px;
      }
      .lp-section-desc { font-size: 1.05rem; color: #64748b; max-width: 540px; line-height: 1.7; margin-bottom: 50px; }

      .lp-features {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px; max-width: 1200px; margin: 0 auto;
      }
      .lp-feature-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 20px; padding: 32px;
        transition: all 0.3s ease; cursor: default;
        position: relative; overflow: hidden;
      }
      .lp-feature-card::before {
        content: ''; position: absolute; inset: 0; border-radius: 20px;
        background: linear-gradient(135deg, rgba(200,255,0,0.06), transparent);
        opacity: 0; transition: opacity 0.3s ease;
      }
      .lp-feature-card:hover { border-color: rgba(200,255,0,0.2); transform: translateY(-4px); box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
      .lp-feature-card:hover::before { opacity: 1; }
      .lp-feature-icon {
        width: 52px; height: 52px; border-radius: 14px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.6rem; margin-bottom: 20px;
        background: rgba(200,255,0,0.08); border: 1px solid rgba(200,255,0,0.15);
      }
      .lp-feature-title { font-weight: 800; font-size: 1.1rem; color: #f8fafc; margin-bottom: 10px; }
      .lp-feature-desc { font-size: 0.92rem; color: #64748b; line-height: 1.65; }

      /* SPORT TAGS */
      .lp-sports { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 60px; }
      .lp-sport-tag {
        display: flex; align-items: center; gap: 8px;
        padding: 12px 24px; border-radius: 50px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
        font-size: 1rem; font-weight: 700; color: #e2e8f0;
        transition: all 0.2s ease;
      }
      .lp-sport-tag:hover { background: rgba(200,255,0,0.08); border-color: rgba(200,255,0,0.3); color: #C8FF00; }

      /* CTA Block */
      .lp-cta-block {
        background: linear-gradient(135deg, #111 0%, #1a1a1a 100%);
        border: 1px solid rgba(200,255,0,0.1);
        border-radius: 28px; padding: clamp(40px, 6vw, 80px);
        text-align: center; max-width: 800px; margin: 0 auto;
        position: relative; overflow: hidden;
      }
      .lp-cta-block::after {
        content: '';
        position: absolute; bottom: -40px; right: -40px;
        width: 250px; height: 250px; border-radius: 50%;
        background: radial-gradient(circle, rgba(200,255,0,0.08), transparent 70%);
        pointer-events: none;
      }
      .lp-cta-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2rem, 5vw, 3.5rem); color: #fff; letter-spacing: 0.05em; margin-bottom: 16px; }
      .lp-cta-desc { font-size: 1.05rem; color: #64748b; line-height: 1.7; margin-bottom: 32px; }

      /* FOOTER */
      .lp-footer {
        border-top: 1px solid rgba(255,255,255,0.06);
        padding: 40px clamp(20px, 6vw, 80px);
        display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;
        color: #334155; font-size: 0.85rem;
      }
      .lp-footer a { color: #475569; text-decoration: none; transition: color 0.2s; }
      .lp-footer a:hover { color: #C8FF00; }

      @keyframes fadeInDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
      @keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }

      /* Scroll observer animations */
      .lp-reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease, transform 0.6s ease; }
      .lp-reveal.visible { opacity: 1; transform: translateY(0); }
    </style>

    <div class="lp-root" id="lpRoot">

      <!-- ────── NAV ────── -->
      <nav class="lp-nav">
        <a class="lp-logo" href="/">
          <div class="lp-logo-block"><span>M</span></div>
          <span class="lp-logo-text">MATCH POINT</span>
        </a>
        <div class="lp-nav-actions">
          <button class="lp-btn-ghost" onclick="location.href='/sitemap'">대회 목록</button>
          <button class="lp-btn-ghost" id="lpLoginBtn" onclick="if(typeof showLoginModal==='function') showLoginModal()">로그인</button>
          <button class="lp-btn-cta" id="lpSignupBtn" onclick="if(typeof showRegisterModal==='function') showRegisterModal()">무료 시작</button>
        </div>
      </nav>

      <!-- ────── HERO ────── -->
      <section class="lp-hero">
        <div class="lp-hero-bg"></div>
        <div class="lp-hero-grid"></div>

        <div class="lp-hero-badge">
          <div class="lp-hero-badge-dot"></div>
          배드민턴 · 테니스 통합 운영 플랫폼
        </div>

        <h1 class="lp-hero-title">
          SPORT<br>
          <span class="accent">COMMAND</span><br>
          CENTER
        </h1>
        <div class="lp-hero-sub">Match Point — Tournament Management</div>
        <p class="lp-hero-desc">
          대회 개설부터 실시간 점수판, 대진표 자동 생성, 갤럭시 워치 연동까지.<br>
          스포츠 대회 운영의 모든 것을 하나의 플랫폼에서 관리하세요.
        </p>

        <div class="lp-hero-ctas">
          <button class="lp-btn-primary" onclick="if(typeof showRegisterModal==='function') showRegisterModal()">
            🚀 무료로 시작하기
          </button>
          <button class="lp-btn-outline" onclick="location.href='/sitemap'">
            📋 대회 목록 보기
          </button>
        </div>

        <div class="lp-stats" id="lpStats">
          <div class="lp-stat-item">
            <div class="lp-stat-num" id="lpTotalTournaments">—</div>
            <div class="lp-stat-label">개설된 대회</div>
          </div>
          <div class="lp-stat-item">
            <div class="lp-stat-num">2</div>
            <div class="lp-stat-label">지원 종목</div>
          </div>
          <div class="lp-stat-item">
            <div class="lp-stat-num">100%</div>
            <div class="lp-stat-label">무료 플랜</div>
          </div>
          <div class="lp-stat-item">
            <div class="lp-stat-num">∞</div>
            <div class="lp-stat-label">확장 가능</div>
          </div>
        </div>
      </section>

      <!-- ────── SPORTS ────── -->
      <section class="lp-section" style="padding-top:40px;padding-bottom:80px;text-align:center;">
        <div class="lp-sports lp-reveal">
          <div class="lp-sport-tag">🏸 배드민턴 토너먼트</div>
          <div class="lp-sport-tag">🎾 테니스 토너먼트</div>
          <div class="lp-sport-tag">🏆 KDK 리그 방식</div>
          <div class="lp-sport-tag">📊 실시간 점수판</div>
          <div class="lp-sport-tag">⌚ 갤럭시 워치 연동</div>
          <div class="lp-sport-tag">📱 PWA 앱 설치</div>
        </div>
      </section>

      <!-- ────── FEATURES ────── -->
      <section class="lp-section" style="background:rgba(255,255,255,0.01);">
        <div style="max-width:1200px;margin:0 auto;">
          <div class="lp-reveal">
            <span class="lp-section-label">핵심 기능</span>
            <h2 class="lp-section-title">대회 운영에<br>필요한 모든 것</h2>
            <p class="lp-section-desc">복잡한 토너먼트 운영을 직관적인 인터페이스로 처리하세요. 처음 사용자도 10분 안에 대회를 개설할 수 있습니다.</p>
          </div>
          <div class="lp-features">
            <div class="lp-feature-card lp-reveal" style="transition-delay:0.05s">
              <div class="lp-feature-icon">⚡</div>
              <div class="lp-feature-title">실시간 점수 관리</div>
              <div class="lp-feature-desc">코트별 점수를 실시간으로 입력하고 전광판, QR코드로 관중과 공유하세요. 배드민턴/테니스 규칙 자동 적용.</div>
            </div>
            <div class="lp-feature-card lp-reveal" style="transition-delay:0.1s">
              <div class="lp-feature-icon">🤖</div>
              <div class="lp-feature-title">자동 대진표 생성</div>
              <div class="lp-feature-desc">참가자를 등록하면 KDK, 리그전, 토너먼트 방식의 대진표를 클릭 한 번으로 자동 생성합니다.</div>
            </div>
            <div class="lp-feature-card lp-reveal" style="transition-delay:0.15s">
              <div class="lp-feature-icon" style="background:rgba(139,92,246,0.1);border-color:rgba(139,92,246,0.2);">🏛️</div>
              <div class="lp-feature-title">협회 / 조직 관리</div>
              <div class="lp-feature-desc">협회, 클럽, 동호회를 위한 전용 미니사이트를 개설하고, 회원 관리 및 회비 결제를 통합 운영하세요.</div>
            </div>
            <div class="lp-feature-card lp-reveal" style="transition-delay:0.2s">
              <div class="lp-feature-icon" style="background:rgba(249,115,22,0.1);border-color:rgba(249,115,22,0.2);">👥</div>
              <div class="lp-feature-title">통합 회원 DB</div>
              <div class="lp-feature-desc">대회별 참가 이력, 전적, 급수 등을 통합 관리. 회원별 경기 기록을 한눈에 확인하세요.</div>
            </div>
            <div class="lp-feature-card lp-reveal" style="transition-delay:0.25s">
              <div class="lp-feature-icon" style="background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.2);">💳</div>
              <div class="lp-feature-title">온라인 결제 연동</div>
              <div class="lp-feature-desc">토스페이먼츠 연동으로 참가비 온라인 결제를 지원합니다. 카드, 간편결제 모두 가능.</div>
            </div>
            <div class="lp-feature-card lp-reveal" style="transition-delay:0.3s">
              <div class="lp-feature-icon" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.2);">⌚</div>
              <div class="lp-feature-title">스마트워치 연동</div>
              <div class="lp-feature-desc">갤럭시 워치 앱과 연동하여 손목에서 코트 점수를 실시간으로 확인하고 입력할 수 있습니다.</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ────── HOW TO USE ────── -->
      <section class="lp-section" style="text-align:center;">
        <div class="lp-reveal" style="max-width:700px;margin:0 auto;">
          <span class="lp-section-label">3단계로 시작</span>
          <h2 class="lp-section-title">10분 안에 대회 개설</h2>
          <p class="lp-section-desc" style="margin:0 auto 50px;">계정 없이도 바로 대진표를 구경할 수 있고, 가입 후 바로 대회를 개설할 수 있습니다.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;max-width:900px;margin:0 auto;" class="lp-reveal">
          <div style="padding:32px;background:rgba(200,255,0,0.04);border:1px solid rgba(200,255,0,0.12);border-radius:20px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:3.5rem;color:rgba(200,255,0,0.3);line-height:1;margin-bottom:16px;">01</div>
            <div style="font-weight:800;font-size:1.1rem;color:#f8fafc;margin-bottom:8px;">회원 가입</div>
            <div style="font-size:0.9rem;color:#64748b;line-height:1.6;">30초 만에 계정을 만들고 무료 플랜으로 바로 시작하세요.</div>
          </div>
          <div style="padding:32px;background:rgba(139,92,246,0.04);border:1px solid rgba(139,92,246,0.12);border-radius:20px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:3.5rem;color:rgba(139,92,246,0.3);line-height:1;margin-bottom:16px;">02</div>
            <div style="font-weight:800;font-size:1.1rem;color:#f8fafc;margin-bottom:8px;">대회 개설</div>
            <div style="font-size:0.9rem;color:#64748b;line-height:1.6;">대회명, 종목, 코트 수를 입력하면 자동으로 대회가 만들어집니다.</div>
          </div>
          <div style="padding:32px;background:rgba(249,115,22,0.04);border:1px solid rgba(249,115,22,0.12);border-radius:20px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:3.5rem;color:rgba(249,115,22,0.3);line-height:1;margin-bottom:16px;">03</div>
            <div style="font-weight:800;font-size:1.1rem;color:#f8fafc;margin-bottom:8px;">대진표 운영</div>
            <div style="font-size:0.9rem;color:#64748b;line-height:1.6;">참가자를 등록하고 대진표를 생성하면, 실시간 운영이 시작됩니다.</div>
          </div>
        </div>
      </section>

      <!-- ────── CTA ────── -->
      <section class="lp-section">
        <div class="lp-cta-block lp-reveal">
          <div style="font-size:3rem;margin-bottom:16px;">🏆</div>
          <h2 class="lp-cta-title">지금 바로 시작하세요</h2>
          <p class="lp-cta-desc">무료 가입 후 즉시 대회 개설이 가능합니다.<br>신용카드 없이, 설치 없이, 바로 시작하세요.</p>
          <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;">
            <button class="lp-btn-primary" style="font-size:1.05rem;padding:18px 44px;" onclick="if(typeof showRegisterModal==='function') showRegisterModal()">
              무료로 가입하기 →
            </button>
            <button class="lp-btn-outline" onclick="if(typeof showLoginModal==='function') showLoginModal()">
              이미 계정이 있으신가요?
            </button>
          </div>
        </div>
      </section>

      <!-- ────── FOOTER ────── -->
      <footer class="lp-footer">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div class="lp-logo-block" style="width:22px;height:22px;"><span style="font-size:0.7rem;">M</span></div>
            <span style="font-family:'Bebas Neue',sans-serif;font-size:1rem;color:#475569;letter-spacing:0.1em;">MATCH POINT</span>
          </div>
          <div style="font-size:0.8rem;color:#1e293b;">스포츠 대회 운영 통합 플랫폼</div>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <a href="/sitemap">대회 목록</a>
          <a href="#" onclick="if(typeof showLoginModal==='function') showLoginModal()">관리자 로그인</a>
        </div>
        <div style="font-size:0.8rem;color:#1e293b;">© 2026 Match Point. All rights reserved.</div>
      </footer>

    </div>

    <script>
      // 스탯 카운터: 총 대회 수 실시간 로드
      (async function loadStats() {
        try {
          const res = await fetch('/api/tournaments');
          const data = await res.json();
          const total = (data.my || data || []).length;
          const el = document.getElementById('lpTotalTournaments');
          if (el && total >= 0) {
            let count = 0;
            const target = total;
            const timer = setInterval(() => {
              count = Math.min(count + Math.max(1, Math.ceil(target / 20)), target);
              el.textContent = count;
              if (count >= target) clearInterval(timer);
            }, 40);
          }
        } catch(e) {}
      })();

      // Intersection Observer for scroll animations
      const lpObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll('.lp-reveal').forEach(el => lpObserver.observe(el));
    </script>
  `;
}

// ===== Router =====

function renderApp() {
  const app = document.getElementById('app');
  if (!currentTournament) {
    // 만약 로그인된 유저라면 롤 기반 대시보드 표시
    const user = typeof authGetUser === 'function' ? authGetUser() : null;
    if (user) {
      renderRoleDashboard(app, user);
    } else {
      renderHome(app);
    }
  } else {
    // 특정 대회 진입 시
    renderTournamentDetail(app);
  }
  // auth.js 로드 완료 후 nav 업데이트 (DOM 렌더 후)
  setTimeout(function () {
    if (typeof initAuth === 'function') initAuth();
  }, 100);
}

// ===== Role-based Dashboard =====
async function renderRoleDashboard(container, user) {
  // 권한별 분기
  const isSuperAdmin = user.global_role === 'super_admin';
  const isOrgAdmin = Object.keys(user.org_roles || {}).length > 0;
  const isClubAdmin = Object.keys(user.club_roles || {}).length > 0;

  // 네비게이션 먼저 빈 상태로 혹은 기본 UI로 그림
  container.innerHTML = `
    <nav style="position:fixed; top:0; left:0; right:0; z-index:10000; display:flex; justify-content:space-between; align-items:center; padding:0 clamp(16px,4vw,32px); height:64px; background:#0A0A0A; border-bottom:1px solid rgba(255,255,255,0.05); transition:all 0.3s ease; box-sizing:border-box;">
      <div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="location.href='/'">
        <div style="width:32px;height:32px;background:#C8FF00;display:flex;align-items:center;justify-content:center;clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));position:relative;">
          <span style="font-family:'Bebas Neue',sans-serif;color:#0A0A0A;font-size:0.9rem;font-weight:bold;line-height:1;">M</span>
        </div>
        <span style="font-family:'Bebas Neue',sans-serif; font-size:1.5rem; color:#fff; letter-spacing:0.15em;">MATCH POINT</span>
      </div>
      <div style="display:flex; align-items:center; gap:12px;" id="authNavArea"></div>
    </nav>
    <div id="dashboardContent" style="padding-top:80px; max-width:1200px; margin:0 auto; padding-left:20px; padding-right:20px; padding-bottom:100px;">
       <div style="padding:40px; text-align:center; color:#94a3b8;">데이터를 불러오는 중입니다...⏳</div>
    </div>
  `;
  setTimeout(() => { if (typeof updateAuthNav === 'function') updateAuthNav() }, 50);

  const content = document.getElementById('dashboardContent');

  try {
    // Fetch user dashboard data including stats
    let fetchUrl = '/api/tournaments';
    if (window.currentTenantSlug) fetchUrl += '?slug=' + window.currentTenantSlug;

    const tournamentsRes = await apiFetch(fetchUrl);
    const tournaments = tournamentsRes.my || tournamentsRes || [];

    // 단체(Orgs) 데이터 가져오기 (관리자 뷰 추가용)
    let myOrgs = [];
    try { myOrgs = await apiFetch('/api/orgs', '/my'); } catch (e) { }

    // 클럽(Clubs) 데이터 가져오기 (클럽 관리자 뷰 추가용)
    let myClubs = [];
    if (isClubAdmin || isSuperAdmin) {
      try { myClubs = await apiFetch('/api/clubs', '/my'); } catch (e) { }
    }

    const renderOrgCardHtml = o => `
      <div class="mp-tournament-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:24px; position:relative; overflow:hidden; cursor:pointer; transition:all 0.3s ease;" onclick="window.open('/org/${o.slug}', '_blank')" onmouseover="this.style.borderColor='rgba(200,255,0,0.2)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';this.style.transform=''">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${o.theme_color || '#C8FF00'},transparent);"></div>
        <h3 style="display:flex; align-items:center; gap:10px; color:#f0f0f5; font-size:1.1rem; margin-bottom:12px;">🏛️ ${o.name} <span style="font-size:0.65rem; padding:3px 10px; border-radius:100px; background:rgba(200,255,0,0.1); color:#C8FF00; border:1px solid rgba(200,255,0,0.2); font-weight:600;">공식 단체</span></h3>
        <div style="margin-bottom:16px; font-size:0.85rem; color:#808090; line-height:1.6;">
          🔗 사이트: minton-tennis.pages.dev/org/<b style="color:#C8FF00">${o.slug}</b><br>
          🏁 종목: ${o.sport_type === 'tennis' ? '🎾 테니스' : '🏸 배드민턴'}
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:16px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
          <button style="background:rgba(255,255,255,0.04); color:#C8FF00; border:1px solid rgba(255,255,255,0.08); padding:9px 8px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); manageOrg('${o.id}')" onmouseover="this.style.background='rgba(200,255,0,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">⚙️ 설정</button>
          <button style="background:rgba(255,255,255,0.04); color:#a78bfa; border:1px solid rgba(255,255,255,0.08); padding:9px 8px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); manageOrgMembers('${o.id}')" onmouseover="this.style.background='rgba(167,139,250,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">👥 회원</button>
          <button style="background:rgba(255,255,255,0.04); color:#34d399; border:1px solid rgba(255,255,255,0.08); padding:9px 8px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); manageOrgDues('${o.id}')" onmouseover="this.style.background='rgba(52,211,153,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">💳 회비결제</button>
          <button style="background:rgba(255,255,255,0.04); color:#fbbf24; border:1px solid rgba(255,255,255,0.08); padding:9px 8px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); manageOrgSchedules('${o.id}')" onmouseover="this.style.background='rgba(251,191,36,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">📅 일정관리</button>
          <button style="background:rgba(255,255,255,0.04); color:#38bdf8; border:1px solid rgba(255,255,255,0.08); padding:9px 8px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); manageOrgBoards('${o.id}')" onmouseover="this.style.background='rgba(56,189,248,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">📋 게시판</button>
          <button style="background:rgba(255,255,255,0.04); color:#f472b6; border:1px solid rgba(255,255,255,0.08); padding:9px 8px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); manageOrgInventory('${o.id}')" onmouseover="this.style.background='rgba(244,114,182,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">📦 재고관리</button>
        </div>
        <button style="width:100%; margin-top:10px; background:linear-gradient(135deg,#C8FF00,#a0e000); color:#0A0A0A; border:none; padding:10px; border-radius:8px; font-family:'Inter',sans-serif; font-weight:800; font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onclick="event.stopPropagation(); window.open('/org/${o.slug}', '_blank')" onmouseover="this.style.boxShadow='0 4px 20px rgba(200,255,0,0.25)';this.style.transform='translateY(-1px)'" onmouseout="this.style.boxShadow='';this.style.transform=''">👉 전용 홈 보기</button>
      </div>`;

    const myOrgsHtml = (myOrgs && myOrgs.length > 0) ? `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:20px;">
        <div>
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary); margin:0;">🏛️ 내 단체 (협회/리그)</h2>
          <p style="color:var(--text-muted);font-size:0.9rem;margin:4px 0 0 0;">운영 중인 전용 홈페이지 마스터 공간</p>
        </div>
        <button class="btn btn-primary" onclick="showCreateOrg()" style="padding:8px 16px; background:#8b5cf6; border-color:#8b5cf6; color:#fff; font-weight:700;">+ 새 단체 개설</button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; margin-bottom:40px;">
        ${myOrgs.map(renderOrgCardHtml).join('')}
      </div>
    ` : `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:20px;">
        <div>
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary); margin:0;">🏛️ 내 단체 (협회/리그)</h2>
          <p style="color:var(--text-muted);font-size:0.9rem;margin:4px 0 0 0;">운영 중인 단체가 없습니다.</p>
        </div>
         <button class="btn btn-primary" onclick="showCreateOrg()" style="padding:8px 16px; background:#8b5cf6; border-color:#8b5cf6; color:#fff; font-weight:700;">+ 새 단체 개설</button>
      </div><div style="margin-bottom:40px;"></div>
    `;

    const renderClubCardHtml = c => `
      <div class="mp-tournament-card" style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:20px;">
        <h3 style="display:flex; align-items:center; gap:8px; color:var(--text-primary);">🏸 ${c.name} <span class="mp-badge mp-badge-open" style="font-size:0.65rem;">소속 클럽</span></h3>
        <div style="margin-top:16px; border-top: 1px solid var(--border); padding-top:16px; display:flex; flex-wrap:wrap; gap:8px;">
          <button style="flex:1; min-width:100%; background:rgba(139,92,246,0.08); color:#8b5cf6; border:1px solid rgba(139,92,246,0.2); padding:8px; font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:0.05em; font-size:0.8rem; cursor:pointer;" onclick="event.stopPropagation(); manageOrgMembers('${c.org_id}')">👥 우리 클럽 회원 관리</button>
        </div>
      </div>`;

    const myClubsHtml = (myClubs && myClubs.length > 0) ? `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:20px;">
        <div>
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary); margin:0;">🏸 관리 중인 클럽</h2>
          <p style="color:var(--text-muted);font-size:0.9rem;margin:4px 0 0 0;">클럽 운영 및 회원 관리 공간</p>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; margin-bottom:40px;">
        ${myClubs.map(renderClubCardHtml).join('')}
      </div>
    ` : '';

    let html = `
      <div style="margin-bottom:30px;">
        <h1 style="font-size:2rem; font-weight:800; color:var(--text-primary); margin-bottom:8px;">환영합니다, ${user.username}님 👋</h1>
        <p style="color:var(--text-muted); font-size:1.05rem;">
          ${isSuperAdmin ? '시스템 통합 관리 대시보드' : isOrgAdmin ? '협회 통합 관리 대시보드' : isClubAdmin ? '클럽/동호회 관리 대시보드' : '내 경기 일정 모아보기'}
        </p>
      </div>
    `;

    const statsStyle = "background:var(--bg-card); backdrop-filter:blur(16px); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-card); transition:all 0.2s;";

    // 1. Super Admin View
    if (isSuperAdmin) {
      html += `
        <!-- Stats Row -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:40px;">
          <div style="${statsStyle}">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px; letter-spacing:0.05em;">총 개설 대회</div>
             <div style="font-size:2rem; font-weight:900; color:var(--brand); font-family:'Outfit',sans-serif; letter-spacing:0.02em;">${tournaments.length}</div>
          </div>
          <div style="${statsStyle}">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px; letter-spacing:0.05em;">가입된 회원(추정)</div>
             <div style="font-size:2rem; font-weight:900; color:var(--accent-emerald); font-family:'Outfit',sans-serif; letter-spacing:0.02em;">0</div>
          </div>
          <div style="${statsStyle}">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px; letter-spacing:0.05em;">협회/조직 수</div>
             <div style="font-size:2rem; font-weight:900; color:var(--accent-purple); font-family:'Outfit',sans-serif; letter-spacing:0.02em;">${myOrgs.length}</div>
          </div>
        </div>

        ${myOrgsHtml}
        ${myClubsHtml}

        <!-- Section: 협회 생성 / 대회 관리 -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:20px;">
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary); margin:0;">관리 중인 전체 대회</h2>
          <button class="btn btn-primary" onclick="showCreateTournament()" style="padding:8px 16px; font-weight:700;">+ 새 대회 만들기</button>
        </div>
      `;
      html += renderTournamentCards(tournaments, true);

    }
    // 2. Org Admin View
    else if (isOrgAdmin) {
      html += myOrgsHtml;

      html += `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:30px;">
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px;">산하 클럽 수</div>
             <div style="font-size:2rem; font-weight:900; color:var(--accent-cyan);">0</div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px;">개최 대회 수</div>
             <div style="font-size:2rem; font-weight:900; color:var(--text-primary);">${tournaments.length}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:20px;">
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary);">협회 소속 대회</h2>
          <button onclick="showCreateTournament()" style="padding:8px 16px; background:#f97316; color:#fff; border:none; border-radius:10px; font-weight:700; cursor:pointer;">+ 협회 대회 개설</button>
        </div>
      `;
      html += renderTournamentCards(tournaments);
    }
    // 3. Club Admin View
    else if (isClubAdmin) {
      html += `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:30px;">
           <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-card);">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px;">클럽 회원수</div>
             <div style="font-size:2rem; font-weight:900; color:var(--accent-emerald);">0명</div>
           </div>
           <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-card);">
             <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px;">참가 예정 대회</div>
             <div style="font-size:2rem; font-weight:900; color:var(--text-primary);">${tournaments.length > 0 ? 1 : 0}건</div>
           </div>
        </div>

        ${myClubsHtml}

        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #f1f5f9; padding-bottom:12px; margin-bottom:20px;">
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary);">참여/관리 중인 대회</h2>
        </div>
      `;
      html += renderTournamentCards(tournaments);
    }
    // 4. User View
    else {
      html += `
        <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:24px; box-shadow:var(--shadow-card); margin-bottom:30px;">
           <div style="font-size:0.85rem; color:var(--text-muted); font-weight:700; margin-bottom:8px;">내 통산 전적</div>
           <div style="font-size:1.6rem; font-weight:900; color:var(--text-primary);">0승 0패 <span style="font-size:1rem; color:var(--text-muted); font-weight:600;">(승률 0%)</span></div>
        </div>

        <div style="border-bottom:2px solid #f1f5f9; padding-bottom:12px; margin-bottom:20px;">
          <h2 style="font-size:1.3rem; font-weight:800; color:var(--text-primary);">다가오는 / 진행중인 대회</h2>
        </div>
      `;
      html += renderTournamentCards(tournaments);
      html += `
        <div style="text-align:center; margin-top:20px;">
          <button onclick="location.href='/my'" style="padding:12px 24px; background:rgba(15,23,42,0.04); color:#0f172a; border:1px solid #e2e8f0; border-radius:12px; font-weight:700; cursor:pointer;">상세 경기 일정 보기 →</button>
        </div>
      `;
    }

    content.innerHTML = html;

  } catch (e) {
    content.innerHTML = `<div style="color:red; padding:20px; text-align:center; background:#fee2e2; border-radius:12px;">데이터를 불러오지 못했습니다. ${e}</div>`;
  }
}

function renderTournamentCards(tournaments, isAdmin) {
  if (!tournaments || tournaments.length === 0) {
    return '<div style="padding:50px; text-align:center; background:rgba(255,255,255,0.02); border:1px dashed rgba(200,255,0,0.15); border-radius:16px; color:#606070; font-weight:600;">관련된 대회가 없습니다.</div>';
  }
  var rows = [];
  for (var i = 0; i < tournaments.length; i++) {
    var t = tournaments[i];
    var isTennis = t.sport_type === 'tennis';
    var statusLabel = t.status === 'in_progress' ? '진행중' : t.status === 'completed' ? '종료' : '접수/준비중';
    var statusColor = t.status === 'in_progress' ? '#C8FF00' : t.status === 'completed' ? '#606070' : '#f97316';
    var sportIcon = isTennis ? '🎾' : '🏸';
    var dateStr = t.date ? t.date.slice(0, 10) : '날짜 미정';

    var btnHtml;
    if (isAdmin) {
      btnHtml = '<button onclick="event.stopPropagation(); enterTournamentAsAdmin(' + t.id + ')" style="flex:1; padding:11px 0; background:linear-gradient(135deg,#C8FF00,#a0e000); border:none; border-radius:8px; color:#0A0A0A; font-family:Inter,sans-serif; font-weight:800; font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(200,255,0,0.25)\'" onmouseout="this.style.boxShadow=\'\'">⚙️ 대회 관리</button>';
    } else {
      btnHtml = '<button onclick="event.stopPropagation(); navigateTo(\'?tid=' + t.id + '\')" style="flex:1; padding:11px 0; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#c0c0cc; font-family:Inter,sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor=\'rgba(200,255,0,0.3)\';this.style.color=\'#C8FF00\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.1)\';this.style.color=\'#c0c0cc\'">👁 보기</button>';
    }

    var card = '<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:16px; padding:22px; transition:all 0.3s ease; display:flex; flex-direction:column; gap:12px; cursor:pointer; position:relative; overflow:hidden;" onclick="' + (isAdmin ? 'enterTournamentAsAdmin(' + t.id + ')' : 'navigateTo(\'?tid=' + t.id + '\')') + '" onmouseover="this.style.borderColor=\'rgba(200,255,0,0.15)\';this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 12px 40px rgba(0,0,0,0.25)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.06)\';this.style.transform=\'\';this.style.boxShadow=\'\'">'
      + '<div style="position:absolute;top:0;left:0;width:3px;height:100%;background:' + statusColor + ';border-radius:0 4px 4px 0;"></div>'
      + '<div style="display:flex; justify-content:space-between; align-items:flex-start;">'
      + '<span style="font-size:1.8rem;">' + sportIcon + '</span>'
      + '<span style="background:' + statusColor + '18; color:' + statusColor + '; padding:4px 12px; border-radius:100px; font-size:0.72rem; font-weight:700; border:1px solid ' + statusColor + '30;">' + statusLabel + '</span>'
      + '</div>'
      + '<div style="font-weight:800; font-size:1.05rem; color:#f0f0f5; line-height:1.3;">' + t.name + '</div>'
      + '<div style="font-size:0.82rem; color:#606070;">📅 ' + dateStr + ' &nbsp;|&nbsp; 코트 ' + (t.courts || '-') + '개</div>'
      + '<div style="display:flex; gap:8px; margin-top:4px;">' + btnHtml + '</div>'
      + '</div>';
    rows.push(card);
  }
  return '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">' + rows.join('') + '</div>';
}

// 관리자 모드로 대회 직접 입장 (비밀번호 자동 인증)
async function enterTournamentAsAdmin(tid, adminPassword) {
  navigateTo('?tid=' + tid);

  // 비밀번호가 전달되지 않은 경우 대회 데이터에서 가져오기
  if (!adminPassword && currentTournament && currentTournament.admin_password) {
    adminPassword = currentTournament.admin_password;
  }
  if (!adminPassword) {
    try {
      var tData = await api('/' + tid, { muteError: true });
      if (tData && tData.admin_password) adminPassword = tData.admin_password;
    } catch (e) { }
  }

  let attempts = 0;
  const tryAuth = async function () {
    attempts++;
    if (attempts > 25) return;
    if (window.isAuthenticated) return;
    try {
      const res = await api('/' + tid + '/auth', { method: 'POST', body: { password: adminPassword || '' } });
      if (res && res.authenticated) {
        window.isAuthenticated = true;
        if (typeof renderApp === 'function') renderApp();
        if (typeof showToast === 'function') showToast('관리자 인증 완료 ✅');
        return;
      }
    } catch (e) { }
    setTimeout(tryAuth, 200);
  };
  setTimeout(tryAuth, 400);
}

function getStatusLabel(s) {
  return { draft: '준비중', open: '모집중', in_progress: '진행중', completed: '완료', cancelled: '취소' }[s] || s;
}

async function openTournament(id) {
  // 비로그인 사용자는 공개 포털로 이동
  if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
    location.href = '/t?tid=' + id;
    return;
  }

  const url = new URL(location);
  url.searchParams.set('tid', id);
  history.pushState({ tid: id }, '', url);
  currentTournament = await api('/' + id);

  // 글로벌 로그인(JWT)이 되어있다면 추가 대회 비밀번호 확인 없이 인증됨으로 처리
  isAuthenticated = true;

  // Load venues globally
  try {
    venues = await api('/' + id + '/venues');
  } catch (e) { console.error('Failed to load venues', e); }

  if (currentTournament.theme_color) {
    document.documentElement.style.setProperty('--primary', currentTournament.theme_color);
  } else {
    document.documentElement.style.removeProperty('--primary');
  }
  renderApp();
}

// ===== Create Tournament Modal =====
function showCreateTournament() {
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    showToast('대회 개설을 위해 가입 및 로그인이 필요합니다.', 'warning');
    if (typeof showLoginModal === 'function') showLoginModal();
    return;
  }

  showModal('새 대회 만들기', `
    <div class="form-group"><label>🏅 종목 분류</label><select class="form-control" id="ctSport" onchange="updateScoreRules()"><option value="badminton">배드민턴 🏸</option><option value="tennis">테니스 🎾</option></select></div>
    <div class="form-group"><label>대회명</label><input class="form-control" id="ctName" placeholder="202X 통합 스포츠 토너먼트" value=""></div>
    <div class="form-group"><label>설명</label><input class="form-control" id="ctDesc" placeholder="대회 설명 (선택사항)" value=""></div>
    <div class="form-row">
      <div class="form-group"><label>형식</label><select class="form-control" id="ctFormat"><option value="kdk">KDK</option><option value="league">리그</option><option value="tournament">토너먼트</option></select></div>
      <div class="form-group"><label>관리자 비밀번호</label><input class="form-control" id="ctPwd" type="password" placeholder="admin123" value=""></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>코트 수</label><input class="form-control" id="ctCourts" type="number" value="6" min="1" max="20"></div>
      <div class="form-group"><label>팀당 경기수</label><input class="form-control" id="ctGames" type="number" value="4" min="1" max="10"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>테마 컬러</label><input class="form-control" id="ctTheme" type="color" value="#C8FF00" style="height:40px;padding:2px;"></div>
      <div class="form-group"><label>합병 기준 (팀수)</label><input class="form-control" id="ctMerge" type="number" value="4" min="2" max="20"></div>
    </div>
    <div id="scoreRulesSection" style="margin-top:10px; padding-top:16px; border-top:1px solid #333;"></div>
    <div style="margin-top:10px; padding-top:16px; border-top:1px solid #333;">
      <h4 style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:0.04em;color:#C8FF00;margin-bottom:12px;">💳 결제 설정</h4>
      <div class="form-row">
        <div class="form-group">
          <label>온라인 결제 지원</label>
          <select class="form-control" id="ctUsePayment">
            <option value="0">사용 안함 (현장 현금결제 등)</option>
            <option value="1">사용 (신용카드/간편결제)</option>
          </select>
        </div>
        <div class="form-group">
          <label>인당 참가비 (원)</label>
          <input class="form-control" id="ctFee" type="number" value="0" min="0" step="1000">
        </div>
      </div>
    </div>
    <button class="btn-brutal" id="modalConfirm">대회 개설하기</button>
  `, async () => {
    await api('', {
      method: 'POST', body: {
        name: document.getElementById('ctName').value,
        description: document.getElementById('ctDesc').value,
        format: document.getElementById('ctFormat').value,
        admin_password: document.getElementById('ctPwd').value,
        courts: parseInt(document.getElementById('ctCourts').value),
        games_per_player: parseInt(document.getElementById('ctGames').value),
        sport_type: document.getElementById('ctSport').value,
        theme_color: document.getElementById('ctTheme').value,
        merge_threshold: parseInt(document.getElementById('ctMerge').value),
        use_payment: document.getElementById('ctUsePayment').value === '1',
        participation_fee: parseInt(document.getElementById('ctFee').value) || 0,
        score_rule_prelim: parseInt((document.getElementById('ctScorePrelim') || {}).value) || (document.getElementById('ctSport').value === 'tennis' ? 4 : 25),
        score_rule_final: parseInt((document.getElementById('ctScoreFinal') || {}).value) || (document.getElementById('ctSport').value === 'tennis' ? 6 : 21),
        max_sets: parseInt((document.getElementById('ctMaxSets') || {}).value) || 1,
        org_slug: window.currentTenantSlug || null
      }
    });
    showToast('대회가 생성되었습니다');
    closeModal();
    if (window.currentTenantSlug) {
      renderOrgApp(window.currentTenantSlug);
    } else {
      renderApp();
    }
  }, { brutal: true, wide: false });
  setTimeout(updateScoreRules, 50);
}

function updateScoreRules() {
  var sec = document.getElementById('scoreRulesSection');
  if (!sec) return;
  var sport = (document.getElementById('ctSport') || {}).value || 'badminton';

  if (sport === 'tennis') {
    sec.innerHTML = '<h4 style="font-family:\'Bebas Neue\',sans-serif;font-size:1.3rem;letter-spacing:0.04em;color:#C8FF00;margin-bottom:12px;">🎾 테니스 점수 규정</h4>' +
      '<div style="background:rgba(200,255,0,0.1); padding:12px 16px; border:1px solid rgba(200,255,0,0.2); margin-bottom:14px; font-family:\'Barlow Condensed\',sans-serif; font-size:0.9rem; color:#ccc;">' +
      '💡 노애드(No-Ad) 디사이딩 포인트 방식으로 진행되며, 6:6 시 타이브레이크가 적용됩니다.' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label>세트 수</label>' +
      '<select class="form-control" id="ctMaxSets"><option value="1" selected>1세트 (단세트)</option><option value="3">3세트</option></select></div>' +
      '<div class="form-group"><label>게임 형식</label>' +
      '<select class="form-control" id="ctScorePrelim"><option value="4" selected>노애드 (디사이딩 포인트)</option><option value="5">어드밴티지</option></select></div>' +
      '<div class="form-group"><label>타이브레이크 (6:6)</label>' +
      '<select class="form-control" id="ctScoreFinal"><option value="6" selected>7점 타이브레이크</option><option value="10">10점 타이브레이크</option></select></div>' +
      '</div>';
  } else {
    sec.innerHTML = '<h4 style="font-family:\'Bebas Neue\',sans-serif;font-size:1.3rem;letter-spacing:0.04em;color:#C8FF00;margin-bottom:12px;">🏸 배드민턴 점수 규정</h4>' +
      '<div style="background:rgba(200,255,0,0.1); padding:12px 16px; border:1px solid rgba(200,255,0,0.2); margin-bottom:14px; font-family:\'Barlow Condensed\',sans-serif; font-size:0.9rem; color:#ccc;">' +
      '💡 랠리 포인트(Rally Point) 시스템. 듀스 진행 후 30점 캡 적용. 코트체인지는 목표점수의 절반.' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label>예선 목표점수</label><input class="form-control" id="ctScorePrelim" type="number" value="25" min="1"></div>' +
      '<div class="form-group"><label>본선 목표점수</label><input class="form-control" id="ctScoreFinal" type="number" value="21" min="1"></div>' +
      '<div class="form-group"><label>최대 세트수</label><input class="form-control" id="ctMaxSets" type="number" value="1" min="1" max="3"></div>' +
      '</div>';
  }
}
// ===== Create Organization Modal =====
function showCreateOrg() {
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    showToast('새 단체를 개설하려면 로그인이 필요합니다.', 'warning');
    if (typeof showLoginModal === 'function') showLoginModal();
    return;
  }

  showModal('✨ 프리미엄 단체 개설 마법사', `
    <div id="orgWizardStep1">
      <div style="margin-bottom:20px; text-align:center;">
        <div style="font-size:1.5rem; color:var(--primary); font-weight:800; font-family:'Bebas Neue',sans-serif;">STEP 1 / 3</div>
        <div style="font-size:1.1rem; color:var(--text-primary); font-weight:700;">기본 웹사이트 정보</div>
      </div>
      <div class="form-group"><label>🏅 단체 종목</label><select class="form-control" id="coSport"><option value="badminton">배드민턴 🏸</option><option value="tennis">테니스 🎾</option></select></div>
      <div class="form-group">
        <label>단체 공식 명칭 <span style="color:#ef4444">*</span></label>
        <input class="form-control" id="coName" placeholder="예: 대한배드민턴협회">
      </div>
      <div class="form-group">
        <label>전용 영문 주소 (Slug) <span style="color:#ef4444">*</span></label>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:var(--text-muted);">minton-tennis.pages.dev/org/</span>
          <input class="form-control" id="coSlug" placeholder="seoulamateur" style="flex:1;">
        </div>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">영문 소문자, 숫자만 가능합니다. (예: seoulamateur)</p>
      </div>
      <button class="btn btn-primary" style="width:100%; margin-top:10px; font-weight:800;" onclick="nextOrgWizard(2)">다음 단계로 👉</button>
    </div>

    <div id="orgWizardStep2" style="display:none;">
      <div style="margin-bottom:20px; text-align:center;">
        <div style="font-size:1.5rem; color:var(--primary); font-weight:800; font-family:'Bebas Neue',sans-serif;">STEP 2 / 3</div>
        <div style="font-size:1.1rem; color:var(--text-primary); font-weight:700;">브랜딩 및 홈페이지 테마</div>
      </div>
      <div class="form-group">
        <label>브랜드 대표 컬러</label>
        <div style="display:flex; gap:10px; align-items:center;">
          <input class="form-control" id="coTheme" type="color" value="#8b5cf6" style="height:50px; flex:1; padding:2px; cursor:pointer;">
          <div style="flex:3; font-size:0.9rem; color:var(--text-muted);">이 색상이 단체의 대표 색상으로 모든 버튼과 배경 하이라이트에 자동 적용됩니다.</div>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button class="btn" style="flex:1; background:var(--bg-card); color:var(--text-primary); border-color:var(--border);" onclick="nextOrgWizard(1)">👈 이전</button>
        <button class="btn btn-primary" style="flex:2; font-weight:800;" onclick="nextOrgWizard(3)">다음 단계로 👉</button>
      </div>
    </div>

    <div id="orgWizardStep3" style="display:none;">
      <div style="margin-bottom:20px; text-align:center;">
        <div style="font-size:1.5rem; color:var(--primary); font-weight:800; font-family:'Bebas Neue',sans-serif;">STEP 3 / 3</div>
        <div style="font-size:1.1rem; color:var(--text-primary); font-weight:700;">요금제 및 기능 선택</div>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
        <label style="display:flex; align-items:flex-start; gap:12px; background:var(--bg-card); padding:16px; border:1px solid rgba(16,185,129,0.5); border-radius:12px; cursor:pointer;" onclick="selectOrgPlan('standard')">
          <input type="radio" name="coPlan" value="standard" style="margin-top:4px;" checked>
          <div>
            <div style="font-weight:800; color:var(--text-primary); font-size:1.1rem;">🟢 Free 플랜 <span style="font-size:0.8rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; margin-left:8px;">무료</span></div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">최대 50명 한정. 사이트 발급, 대회 개설 및 선수 관리 등 기본 기능 포함.</div>
          </div>
        </label>

        <label style="display:flex; align-items:flex-start; gap:12px; background:var(--bg-card); padding:16px; border:1px solid rgba(59,130,246,0.5); border-radius:12px; cursor:pointer;" onclick="selectOrgPlan('pro')">
          <input type="radio" name="coPlan" value="pro" style="margin-top:4px;">
          <div>
            <div style="font-weight:800; color:#3b82f6; font-size:1.1rem;">🔵 Pro 플랜</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">회원수 무제한. 📅일정 관리 모듈 등 고급 협회 공지/행정 기능 활성화.</div>
          </div>
        </label>

        <label style="display:flex; align-items:flex-start; gap:12px; background:var(--bg-card); padding:16px; border:1px solid rgba(139,92,246,0.5); border-radius:12px; cursor:pointer;" onclick="selectOrgPlan('premium')">
          <input type="radio" name="coPlan" value="premium" style="margin-top:4px;">
          <div>
            <div style="font-weight:800; color:#8b5cf6; font-size:1.1rem;">🟣 Premium 플랜</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">모든 기능 활성화. 💳회비/납부 빌링 자동화 모듈 등 최상위 기능.</div>
          </div>
        </label>
      </div>

      <div style="display:flex; gap:10px;">
        <button class="btn" style="flex:1; background:var(--bg-card); color:var(--text-primary); border-color:var(--border);" onclick="nextOrgWizard(2)">👈 이전</button>
        <button class="btn btn-primary" style="flex:2; font-weight:800;" onclick="submitCreateOrg()">🚀 미니 사이트 런칭하기</button>
      </div>
    </div>
  `, null);

  const confirmBtn = document.getElementById('modalConfirm');
  if (confirmBtn) confirmBtn.style.display = 'none';
}

window.nextOrgWizard = function (step) {
  document.getElementById('orgWizardStep1').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('orgWizardStep2').style.display = step === 2 ? 'block' : 'none';
  document.getElementById('orgWizardStep3').style.display = step === 3 ? 'block' : 'none';
};

window.selectOrgPlan = function (plan) {
  document.querySelector('input[name="coPlan"][value="' + plan + '"]').checked = true;
};

window.submitCreateOrg = async function () {
  const name = document.getElementById('coName').value.trim();
  const slug = document.getElementById('coSlug').value.trim().toLowerCase();
  const sport = document.getElementById('coSport').value;
  const theme = document.getElementById('coTheme').value;
  const plan = document.querySelector('input[name="coPlan"]:checked').value;

  if (!name || !slug) { showToast('단체명과 영문 주소를 입력해주세요.', 'error'); return; }

  try {
    const rawBtn = document.querySelector('#orgWizardStep3 .btn-primary');
    const oldText = rawBtn.innerText;
    rawBtn.innerText = '사이트 구축 중...⏳';
    rawBtn.disabled = true;

    const res = await apiFetch('/api/orgs', '', {
      method: 'POST', body: { name: name, slug: slug, sport_type: sport, theme_color: theme, plan_tier: plan }
    });
    closeModal(); // Create org modal close
    renderApp();

    if (res.adminSetup) {
      setTimeout(() => {
        showModal('🎉 단체 개설 및 전용 관리자 계정 발급 완료', `
          <div style="text-align:center;">
            <h3 style="color:#C8FF00; margin-bottom:10px;">홈페이지가 개설되었습니다!</h3>
            <p style="color:var(--text-muted); margin-bottom:20px;">이 단체만을 전담으로 관리하실 수 있는 <strong style="color:var(--text-primary);">전용 관리용 로그인 계정</strong>이 임시로 발급되었습니다.</p>
            <div style="background:linear-gradient(135deg,#161616,#111); border:1px solid #2A2A2A; border-radius:12px; padding:20px; font-size:1.1rem;">
              <div style="margin-bottom:12px;">👤 임시 아이디: <b style="color:#8b5cf6;">${res.adminSetup.username}</b></div>
              <div>🔑 임시 비밀번호: <b style="color:#10b981; font-family:monospace;">${res.adminSetup.password}</b></div>
            </div>
            <p style="color:#64748b; font-size:0.9rem; margin-top:16px;">💡 임시 발급된 비밀번호이므로 기억하기 쉽습니다.<br>나중에 단체 관리자 본인이 언제든 로그인하여 수정할 수 있습니다.</p>
            <button class="btn btn-primary" style="margin-top:20px; width:100%;" onclick="closeModal()">확인 완료. 닫기</button>
          </div>
        `, null, { hideConfirm: true });
      }, 300);
    } else {
      showToast('성공적으로 단체 미니 사이트가 개설되었습니다!', 'success');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
};

async function manageOrg(id) {
  try {
    const orgs = await apiFetch('/api/orgs', '/my');
    const org = orgs.find(o => String(o.id) === String(id));
    if (!org) { showToast('단체를 찾을 수 없습니다.', 'error'); return; }

    let layout = {};
    if (org.site_layout) {
      if (typeof org.site_layout === 'string') {
        try { layout = JSON.parse(org.site_layout); } catch (e) { }
      } else {
        layout = org.site_layout;
      }
    }

    const heroTitle = layout.hero?.title || `${org.name} 공식 홈페이지`;
    const heroSubtitle = layout.hero?.subtitle || '환영합니다.';

    showModal(`⚙ ${org.name} 설정`, `
      <div style="max-height:60vh; overflow-y:auto; padding-right:8px;">
        <div class="form-group">
          <label>단체 공식 명칭</label>
          <input class="form-control" id="moName" value="${org.name}">
        </div>
        <div class="form-group">
          <label>테마 컬러</label>
          <input class="form-control" id="moTheme" type="color" value="${org.theme_color || '#8b5cf6'}" style="height:40px;padding:2px;">
        </div>
        <div class="form-group">
          <label>홈페이지 템플릿 (Pro 이상)</label>
          <select class="form-control" id="moTemplate" ${org.plan_tier === 'standard' ? 'disabled' : ''}>
            <option value="modern" ${(!layout.template || layout.template === 'modern') ? 'selected' : ''}>[무료] 모던 기본형</option>
            <option value="brutalism" ${layout.template === 'brutalism' ? 'selected' : ''}>[Pro] 브루탈리즘</option>
            <option value="cards" ${layout.template === 'cards' ? 'selected' : ''}>[Pro] 다이나믹 카드형</option>
          </select>
          ${org.plan_tier === 'standard' ? '<small style="color:#ef4444; font-size:0.8rem; display:block; margin-top:4px;">* Pro 플랜 이상에서만 템플릿을 변경할 수 있습니다.</small>' : ''}
        </div>
        
        <h4 style="margin-top:20px; margin-bottom:12px; font-size:1rem; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">홈페이지 문구 설정</h4>
        <div class="form-group">
          <label>메인 타이틀 (환영 인사)</label>
          <input class="form-control" id="moHeroTitle" value="${heroTitle}">
        </div>
        <div class="form-group">
          <label>서브 타이틀</label>
          <input class="form-control" id="moHeroSubtitle" value="${heroSubtitle}">
        </div>

        <h4 style="margin-top:20px; margin-bottom:12px; font-size:1rem; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">연락처 및 회비 계좌</h4>
        <div class="form-group">
          <label>대표 이메일</label>
          <input class="form-control" id="moEmail" value="${org.contact_email || ''}">
        </div>
        <div class="form-group">
          <label>대표 연락처</label>
          <input class="form-control" id="moPhone" value="${org.contact_phone || ''}">
        </div>
        <div class="form-group">
          <label>단체 계좌번호</label>
          <input class="form-control" id="moBank" placeholder="예: 국민 1234-56-7890" value="${org.bank_account || ''}">
        </div>
        <div style="margin-top:40px; border-top:1px solid #e2e8f0; padding-top:20px;" id="orgAdminCredsSection">
          <h4 style="font-size:1rem; margin-bottom:8px;">🔐 단체 전용 로그인 계정 관리</h4>
          <p style="color:#64748b; font-size:0.85rem; margin-bottom:12px;">최고관리자 권한으로 단체 로그인 계정 정보를 확인하고 초기화할 수 있습니다.</p>
          <div id="orgCredsContainer">
            <button class="btn btn-sm" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;" onclick="fetchOrgCreds('${org.id}')">👀 관리자 계정 정보 보기</button>
          </div>
        </div>
        
        <div style="margin-top:40px; border-top:1px solid #fee2e2; padding-top:20px;">
          <h4 style="color:#ef4444; font-size:1rem; margin-bottom:8px;">⚠️ 위험 구역 (Danger Zone)</h4>
          <p style="color:#7f1d1d; font-size:0.85rem; margin-bottom:12px;">단체를 삭제하면 소속된 회원 데이터가 접근 불가능해집니다. 이 작업은 되돌릴 수 없습니다.</p>
          <button class="btn" style="background:#fee2e2; color:#ef4444; border:1px solid #f87171; width:100%; font-weight:bold;" onclick="deleteOrg('${org.id}', '${org.name}')">🗑️ 이 단체 완전히 삭제하기</button>
        </div>
      </div>
    `, async () => {
      const nameElem = document.getElementById('moName');
      if (!nameElem) return;

      const name = nameElem.value.trim();
      if (!name) { showToast('단체명은 필수입니다.', 'error'); return; }

      try {
        await apiFetch('/api/orgs', '/' + id, {
          method: 'PUT',
          body: {
            name,
            theme_color: document.getElementById('moTheme').value,
            site_layout: {
              template: document.getElementById('moTemplate') ? document.getElementById('moTemplate').value : 'modern',
              hero: {
                title: document.getElementById('moHeroTitle').value,
                subtitle: document.getElementById('moHeroSubtitle').value
              },
              sections: layout.sections || ['tournaments']
            },
            contact_email: document.getElementById('moEmail').value,
            contact_phone: document.getElementById('moPhone').value,
            bank_account: document.getElementById('moBank').value
          }
        });
        showToast('설정이 성공적으로 저장되었습니다.', 'success');
        closeModal();
        renderApp();
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  } catch (e) {
    showToast('설정 정보를 불러오지 못했습니다.', 'error');
  }
}

window.fetchOrgCreds = async function (orgId) {
  const container = document.getElementById('orgCredsContainer');
  try {
    container.innerHTML = '<span style="color:#64748b; font-size:0.85rem;">조회 중...</span>';
    const creds = await apiFetch('/api/orgs', '/' + orgId + '/credentials');

    container.innerHTML = `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:10px;">
        <div style="font-size:0.85rem; color:#475569; margin-bottom:4px;">👤 아이디</div>
        <div style="font-weight:700; color:#0f172a; margin-bottom:12px; font-size:1.05rem;">${creds.username}</div>
        
        <div style="font-size:0.85rem; color:#475569; margin-bottom:4px;">🔑 현재 비밀번호</div>
        <div style="font-family:monospace; font-weight:700; color:#10b981; font-size:1.1rem;">${creds.current_password}</div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="resetOrgPassword('${orgId}')">비밀번호 무작위 재발급 (초기화)</button>
    `;
  } catch (e) {
    if (e.message.includes('최고 관리자')) {
      container.innerHTML = '<span style="color:#ef4444; font-size:0.85rem;">최고 관리자 권한(Super Admin)이 필요합니다.</span>';
    } else {
      container.innerHTML = '<span style="color:#ef4444; font-size:0.85rem;">발급된 계정 정보가 없거나 오류가 발생했습니다.</span>';
    }
  }
};

window.resetOrgPassword = async function (orgId) {
  if (!confirm('정말 이 단체 관리자 계정의 비밀번호를 무작위로 새로 발급하시겠습니까?\n기존 비밀번호로는 더 이상 접속할 수 없게 됩니다.')) return;

  try {
    const btn = event.target;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '초기화 중...';
    btn.disabled = true;

    const res = await apiFetch('/api/orgs', '/' + orgId + '/reset-password', { method: 'POST' });
    showToast('비밀번호가 성공적으로 초기화되었습니다.', 'success');

    // UI 업데이트
    document.getElementById('orgCredsContainer').innerHTML = `
      <div style="background:#f1f8e9; border:1px solid #c5e1a5; border-radius:8px; padding:12px; margin-bottom:10px;">
        <div style="font-size:0.85rem; color:#558b2f; margin-bottom:4px;">👤 아이디</div>
        <div style="font-weight:700; color:#33691e; margin-bottom:12px; font-size:1.05rem;">${res.username}</div>
        
        <div style="font-size:0.85rem; color:#558b2f; margin-bottom:4px;">🔑 새 비밀번호</div>
        <div style="font-family:monospace; font-weight:700; color:#ef6c00; font-size:1.2rem;">${res.password}</div>
      </div>
    `;
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.deleteOrg = async function (id, name) {
  showModal('⚠️ 단체 삭제 확인', `
    <div style="text-align:center;">
      <h3 style="color:#ef4444; margin-bottom:16px;">정말 삭제하시겠습니까?</h3>
      <p style="margin-bottom:8px;">[ ${name} ] 단체를 삭제합니다.</p>
      <p style="color:#64748b; font-size:0.9rem; margin-bottom:24px;">삭제 후에는 복구가 불가능하며 접근할 수 없게 됩니다.</p>
    </div>
  `, async () => {
    try {
      await apiFetch('/api/orgs', '/' + id, { method: 'DELETE' });
      showToast('단체가 성공적으로 삭제되었습니다.', 'success');
      closeModal();

      // 만약 단체 전용 홈페이지에서 삭제한 것이라면 메인으로 튕겨냄
      if (window.currentTenantSlug) {
        location.href = '/';
      } else {
        renderApp();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
};

// ===== Organization Members Management =====
async function manageOrgMembers(id) {
  try {
    const orgs = await apiFetch('/api/orgs', '/my');
    const org = orgs.find(o => String(o.id) === String(id));
    if (!org) { showToast('단체를 찾을 수 없습니다.', 'error'); return; }

    const members = await apiFetch('/api/orgs', '/' + id + '/members');
    window.currentOrgMembers = members;
    window.currentOrgId = id;

    showModal(`👥 ${org.name} 소속 회원 통합 관리`, `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #f1f5f9; padding-bottom:12px; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <h2 style="font-size:1.1rem; font-weight:800; color:var(--text-primary); margin:0;">
          등록된 회원 명단 (<span id="orgMemberCount">${members.length}</span>명)
        </h2>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm" style="border:1px solid #10b981; color:#10b981; background:rgba(16,185,129,0.05);" onclick="downloadOrgMemberTemplate()">📝 양식(CSV) 다운로드</button>
          <button class="btn btn-sm btn-primary" onclick="showOrgMemberBulkUpload()">⬆️ 회원 일괄 등록</button>
          <button class="btn btn-sm" style="border:1px solid #3b82f6; color:#3b82f6; background:rgba(59,130,246,0.05);" onclick="exportOrgMembers()">💾 엑셀로 명부 저장</button>
          <button class="btn btn-sm" style="border:1px solid #8b5cf6; color:#8b5cf6; background:rgba(139,92,246,0.05);" onclick="showSendOrgSms()">💬 알림톡/문자 발송</button>
          <button class="btn btn-sm" style="border:1px solid #ef4444; color:#ef4444; background:rgba(239,68,68,0.05);" onclick="deleteAllOrgMembers()">🗑️ 전체 삭제</button>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:12px;">
        <input type="text" id="orgMemberSearch" class="form-control" placeholder="🔍 목록 내 이름, 클럽 검색..." onkeyup="filterOrgMembers()" style="flex:1;">
      </div>

      <div style="max-height: 400px; overflow-y:auto; margin-bottom:20px;">
        <table class="table" style="width:100%; border-collapse:collapse;" id="orgMembersTable">
          <thead style="background:var(--bg-card); position:sticky; top:0; box-shadow:0 1px 0 var(--border); z-index:1;">
            <tr>
              <th style="padding:10px; text-align:center; width:40px;"><input type="checkbox" id="selectAllOrgMembers" onclick="toggleAllOrgMembers(this)"></th>
              <th style="padding:10px; text-align:left;">이름</th>
              <th style="padding:10px; text-align:left;">역할</th>
              <th style="padding:10px; text-align:left;">공인급수</th>
              <th style="padding:10px; text-align:left;">세부소속클럽</th>
              <th style="padding:10px; text-align:left;">상태</th>
              <th style="padding:10px; text-align:center;">관리</th>
            </tr>
          </thead>
          <tbody id="orgMembersTbody">
            <!-- 렌더링 영역 -->
          </tbody>
        </table>
      </div>

      <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9); border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
        <h4 style="margin:0 0 12px 0; font-size:1rem; color:#0f172a;">👤 개별 회원 빠른 추가 (이름으로 중앙DB 검색)</h4>
        <div style="display:flex; gap:8px;">
          <input type="text" id="addMemberQuery" class="form-control" placeholder="추가할 회원의 이름 검색..." style="flex:1;" onkeydown="if(event.key==='Enter') searchAndAddOrgMember(${org.id})">
          <button class="btn" style="background:var(--bg-card); border-color:var(--border);" onclick="searchAndAddOrgMember(${org.id})">🔍 검색</button>
          <button class="btn btn-primary" onclick="showCreateOrgMember(${org.id})">➕ 신규 회원 직접 등록</button>
        </div>
        <div id="addMemberResult" style="margin-top:12px;"></div>
      </div>
    `, null, { hideConfirm: true, wide: true });

    renderOrgMembersTable();

    window.renderOrgMembersTable = function () {
      const tbody = document.getElementById('orgMembersTbody');
      if (!tbody || !window.currentOrgMembers) return;
      const q = (document.getElementById('orgMemberSearch')?.value || '').toLowerCase();

      const filtered = window.currentOrgMembers.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.affiliated_club && m.affiliated_club.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
      );

      document.getElementById('orgMemberCount').textContent = filtered.length;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">등록된/검색된 회원이 없습니다.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(m => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:10px; text-align:center;"><input type="checkbox" class="org-member-checkbox" value="${m.id}" data-phone="${m.phone || ''}"></td>
      <td style="padding:10px;">
        <div style="font-weight:bold; color:var(--text-primary);">${m.name}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${m.phone || '번호없음'} | ${m.birth_year ? m.birth_year.toString().slice(-2) : '??'}${m.gender === 'm' ? '남' : '여'}</div>
      </td>
      <td style="padding:10px;">${m.role === 'admin' ? '<span style="color:#C8FF00;font-weight:700;background:#1e293b;padding:2px 6px;border-radius:4px;">👑 운영진</span>' : '일반'}</td>
      <td style="padding:10px; font-weight:700;">${m.official_level || '-'}</td>
      <td style="padding:10px; color:#475569;">${m.affiliated_club || '-'}</td>
      <td style="padding:10px;">
        <span class="mp-badge ${m.status === 'active' ? 'mp-badge-open' : 'mp-badge-done'}">${m.status}</span>
      </td>
      <td style="padding:10px; text-align:center;">
        <button class="btn btn-sm" style="background:rgba(139,92,246,0.1); color:#8b5cf6;" onclick="editOrgMember(${window.currentOrgId}, ${m.id}, '${m.name}', '${m.role}', '${m.official_level || ''}', '${m.affiliated_club || ''}', '${m.status}')">수정</button>
        <button class="btn btn-sm" style="background:rgba(239,68,68,0.1); color:#ef4444;" onclick="removeOrgMember(${window.currentOrgId}, ${m.id})">추방</button>
      </td>
    </tr>
  `).join('');

      // Update toggle-all checkbox logic
      const selectAllCb = document.getElementById('selectAllOrgMembers');
      if (selectAllCb) selectAllCb.checked = false;
    };

    window.toggleAllOrgMembers = function (source) {
      document.querySelectorAll('.org-member-checkbox').forEach(cb => {
        cb.checked = source.checked;
      });
    };

    window.showSendOrgSms = function () {
      const selectedIds = Array.from(document.querySelectorAll('.org-member-checkbox:checked')).map(cb => parseInt(cb.value));
      const validSelectedCount = Array.from(document.querySelectorAll('.org-member-checkbox:checked')).filter(cb => cb.dataset.phone).length;

      if (selectedIds.length === 0) {
        // No one selected directly, let's select ALL currently visible rows that have phones
        const allVisibleIds = Array.from(document.querySelectorAll('.org-member-checkbox')).filter(cb => cb.dataset.phone).map(cb => parseInt(cb.value));
        if (allVisibleIds.length === 0) return showToast('발송 가능한 회원이 목록에 없습니다.', 'error');

        if (confirm(`선택한 회원이 없습니다.\n현재 검색/표시된 모든 회원 중 번호가 명확한 ${allVisibleIds.length}명에게 전체 문자를 발송하시겠습니까?`)) {
          openSmsModal(allVisibleIds);
        }
      } else {
        if (validSelectedCount < selectedIds.length) {
          if (!confirm(`선택한 ${selectedIds.length}명 중 ${selectedIds.length - validSelectedCount}명은 휴대폰 번호가 없습니다.\n나머지 ${validSelectedCount}명에게만 발송하시겠습니까?`)) return;
        }
        if (validSelectedCount > 0) {
          openSmsModal(selectedIds);
        } else {
          showToast('선택한 회원들 모두 번호가 등록되지 않았습니다.', 'error');
        }
      }
    };

    function openSmsModal(targetIds) {
      showModal('💬 단체 문자 / 알림톡 발송', `
          <div style="margin-bottom:16px;">
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:8px;">
              선택/표시된 <strong>${targetIds.length}</strong>명에게 문자를 발송합니다.<br>
              <small>(메시지 앞에 단체 이름이 자동 포함될 수 있습니다)</small>
            </p>
            <textarea id="orgSmsContent" class="form-control" style="height:120px; resize:vertical;" placeholder="발송할 메시지 내용을 입력하세요..."></textarea>
          </div>
        `, async () => {
        const message = document.getElementById('orgSmsContent').value.trim();
        if (message.length < 2) return showToast('메시지를 2자 이상 입력해주세요.', 'warning');

        document.getElementById('modalConfirm').disabled = true;
        document.getElementById('modalConfirm').textContent = '발송 중...';

        try {
          const res = await apiFetch('/api/orgs', '/' + window.currentOrgId + '/members/sms', {
            method: 'POST', body: { member_ids: targetIds, message }
          });
          showToast(res.message || '발송되었습니다.', 'success');
          closeModal();
        } catch (e) {
          showToast(e.message, 'error');
          document.getElementById('modalConfirm').disabled = false;
          document.getElementById('modalConfirm').textContent = '✅ 저장';
        }
      });

      setTimeout(() => {
        const btn = document.getElementById('modalConfirm');
        if (btn) {
          btn.textContent = '🚀 문자 전송';
          btn.style.background = '#8b5cf6';
        }
      }, 50);
    }

    window.filterOrgMembers = function () {
      renderOrgMembersTable();
    };

    window.downloadOrgMemberTemplate = function () {
      const tsv = "이름\t전화번호\t성별(m/f)\t출생년도(4자리)\t중앙급수\t세부소속클럽\t공인급수\n홍길동\t010-1234-5678\tm\t1980\tD\t강남클럽\tC\n김연아\t010-9876-5432\tf\t1990\tS\t송파클럽\tS";
      const blob = new Blob([tsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "단체회원_일괄등록양식.csv";
      a.click();
      URL.revokeObjectURL(url);
    };

    window.exportOrgMembers = function () {
      if (!window.currentOrgMembers || window.currentOrgMembers.length === 0) {
        return showToast('저장할 회원이 없습니다.', 'error');
      }
      let csv = "이름,전화번호,성별,생년,역할,공인급수,세부소속클럽,상태,가입일\n";
      window.currentOrgMembers.forEach(m => {
        csv += `"${m.name}","${m.phone || ''}","${m.gender}","${m.birth_year || ''}","${m.role}","${m.official_level || ''}","${m.affiliated_club || ''}","${m.status}","${m.joined_at || ''}"\n`;
      });
      // Prefix BOM for excel
      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `회원명부_${new Date().toLocaleDateString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    window.deleteAllOrgMembers = async function () {
      if (!confirm('경고: 이 단체의 모든 회원 목록을 초기화(전체 삭제)합니다.\n정말 삭제하시겠습니까? (중앙 서버의 회원 데이터는 삭제되지 않습니다)')) return;
      try {
        await apiFetch('/api/orgs', '/' + window.currentOrgId + '/members', { method: 'DELETE' });
        showToast('전체 삭제되었습니다.', 'success');
        manageOrgMembers(window.currentOrgId);
      } catch (e) {
        showToast(e.message, 'error');
      }
    };

    window.showOrgMemberBulkUpload = function () {
      const tpl = `
    <div style="font-size:0.9rem; margin-bottom:12px; color:var(--text-muted);">
      엑셀이나 CSV 양식에 맞춰 작성된 명단을 아래에 <strong>복사하여 붙여넣기(Ctrl+V)</strong> 해주세요.<br>
      이름, 전화번호를 기준으로 매칭하여 새로운 회원이면 개별등록까지 일괄 처리됩니다.<br>
      <small style="color:#ef4444">* 양식: 이름(필수), 전화번호, 성별(m/f), 출생년도, 급수, 세부소속, 공인급수 순</small>
    </div>
    <textarea id="orgBulkMemberData" class="form-control" style="height:200px; font-family:monospace; white-space:pre-wrap; background:#f8fafc;" placeholder="홍길동	010-1234-5678	m	1980	c	강남클럽	c
김영희	010-1111-2222	f	1990	e	잠실클럽	e"></textarea>
    <div style="margin-top:12px; text-align:right;">
      <button class="btn btn-primary" onclick="submitOrgBulkMembers()">일괄 전송 및 등록</button>
    </div>
  `;
      const div = document.createElement('div');
      div.id = 'orgBulkUploadContainer';
      div.style.marginTop = '20px';
      div.style.paddingTop = '20px';
      div.style.borderTop = '1px solid #e2e8f0';
      div.innerHTML = tpl;

      const searchSection = document.getElementById('addMemberResult').parentNode;
      searchSection.parentNode.insertBefore(div, searchSection);
      document.getElementById('orgBulkMemberData').focus();
    };

    window.submitOrgBulkMembers = async function () {
      const data = document.getElementById('orgBulkMemberData').value.trim();
      if (!data) return showToast('데이터를 입력해주세요.', 'error');

      const lines = data.split('\n');
      const members = [];
      lines.forEach(line => {
        const cols = line.split(/[	,]+/).map(c => c.trim()); // tab or comma
        if (cols.length >= 1 && cols[0]) {
          members.push({
            name: cols[0],
            phone: cols[1] || null,
            gender: (cols[2] || '').toLowerCase() === 'f' || cols[2] === '여' ? 'f' : 'm',
            birth_year: parseInt(cols[3]) || null,
            global_level: cols[4] || 'E',
            affiliated_club: cols[5] || null,
            official_level: cols[6] || null
          });
        }
      });

      if (members.length === 0) return showToast('분석 가능한 데이터가 없습니다.', 'error');

      try {
        const res = await apiFetch('/api/orgs', '/' + window.currentOrgId + '/members/bulk', {
          method: 'POST',
          body: { members }
        });
        showToast(res.message || '등록되었습니다.', 'success');
        manageOrgMembers(window.currentOrgId);
      } catch (e) {
        showToast(e.message, 'error');
      }
    };

  } catch (e) {
    showToast('회원 정보를 불러오지 못했습니다.', 'error');
  }
}

async function searchAndAddOrgMember(orgId) {
  const q = document.getElementById('addMemberQuery').value.trim();
  if (!q) return;

  const resDiv = document.getElementById('addMemberResult');
  resDiv.innerHTML = '<div style="color:var(--text-muted);">검색 중...</div>';

  try {
    const res = await apiFetch('/api/members?q=' + encodeURIComponent(q));
    if (!res.members || res.members.length === 0) {
      resDiv.innerHTML = `
        <div style="color:#ef4444; font-weight:bold; margin-bottom:8px;">중앙 DB에서 검색 결과가 없습니다.</div>
        <div style="color:var(--text-muted); font-size:0.9rem;">신규 회원일 경우 '신규 회원 직접 등록'을 이용해주세요.</div>
      `;
      return;
    }

    resDiv.innerHTML = `
      <table class="table" style="width:100%; border-collapse:collapse; background:#fff;">
        ${res.members.map(m => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:10px;">
              <b>${m.name}</b> <span style="font-size:0.8rem; color:var(--text-muted);">
              (${m.birth_year ? m.birth_year.toString().slice(-2) : ''}${m.gender === 'm' ? '남' : '여'}) ${m.phone || ''}
              </span>
            </td>
            <td style="padding:10px; color:#475569;">${m.club || '-'} / ${m.level || '-'}</td>
            <td style="padding:10px; text-align:right;">
              <button class="btn btn-sm" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700;" onclick="addOrgMemberAction(${orgId}, ${m.id})">단체에 추가</button>
            </td>
          </tr>
        `).join('')}
      </table>
    `;
  } catch (e) {
    resDiv.innerHTML = '<div style="color:red;">검색 오류: ' + e.message + '</div>';
  }
}

async function addOrgMemberAction(orgId, memberId) {
  try {
    await apiFetch('/api/orgs', '/' + orgId + '/members', {
      method: 'POST',
      body: { member_id: memberId }
    });
    showToast('회원이 단체에 성공적으로 추가되었습니다!', 'success');
    manageOrgMembers(orgId); // refresh
  } catch (e) {
    showToast(e.message, 'error');
  }
}

window.showCreateOrgMember = function (orgId) {
  showModal('➕ 신규 회원 직접 등록 (단체 및 중앙DB 동시추가)', `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <p style="font-size:0.9rem; color:var(--text-muted);">이름, 전화번호는 정확히 입력해주세요. (향후 로그인 연동 및 중복방지 기준이 됩니다)</p>
      <div class="form-group">
        <label>이름 (필수)</label>
        <input type="text" id="newOmName" class="form-control" placeholder="홍길동">
      </div>
      <div class="form-group">
        <label>연락처</label>
        <input type="text" id="newOmPhone" class="form-control" placeholder="010-1234-5678">
      </div>
      <div style="display:flex; gap:10px;">
        <div class="form-group" style="flex:1;">
          <label>성별</label>
          <select id="newOmGender" class="form-control">
            <option value="m">남</option>
            <option value="f">여</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;">
          <label>출생년도(4자리)</label>
          <input type="number" id="newOmBirthYear" class="form-control" placeholder="1990">
        </div>
      </div>
      <div style="display:flex; gap:10px;">
        <div class="form-group" style="flex:1;">
          <label>세부 소속클럽</label>
          <input type="text" id="newOmClub" class="form-control" placeholder="상록클럽">
        </div>
        <div class="form-group" style="flex:1;">
          <label>공인 급수</label>
          <input type="text" id="newOmOfficialLevel" class="form-control" placeholder="A조, S조 등">
        </div>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('newOmName').value.trim();
    const phone = document.getElementById('newOmPhone').value.trim();
    if (!name) return showToast('이름은 필수입니다.', 'error');

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;"></div> 등록 중...';

    try {
      // 1. 단일 데이터 배열로 만들어서 bulk api 호출해버리면 동일 로직을 수행함
      // /api/orgs/:id/members/bulk 는 전화번호 중복체크 후 맵핑까지 다해줌
      // 그래서 별도로 /api/members 에 쏠 필요가 없음
      const membersToCreate = [{
        name,
        phone,
        gender: document.getElementById('newOmGender').value,
        birth_year: parseInt(document.getElementById('newOmBirthYear').value) || null,
        global_level: 'E',
        affiliated_club: document.getElementById('newOmClub').value.trim(),
        official_level: document.getElementById('newOmOfficialLevel').value.trim()
      }];

      const res = await apiFetch('/api/orgs', '/' + orgId + '/members/bulk', {
        method: 'POST',
        body: { members: membersToCreate }
      });
      showToast(res.message || '등록되었습니다.', 'success');
      closeModal();
      manageOrgMembers(orgId); // refresh
    } catch (e) {
      showToast(e.message, 'error');
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '확인';
    }
  });
};

function editOrgMember(orgId, omId, name, role, level, club, status) {
  showModal(`👤 ${name} 정보 수정`, `
    <div class="form-group">
      <label>역할</label>
      <select class="form-control" id="emRole">
        <option value="member" ${role === 'member' ? 'selected' : ''}>일반 회원</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>운영진 (Admin)</option>
      </select>
    </div>
    <div class="form-group">
      <label>협회 발급 급수</label>
      <input class="form-control" id="emLevel" value="${level}">
    </div>
    <div class="form-group">
      <label>소속 클럽</label>
      <input class="form-control" id="emClub" value="${club}">
    </div>
    <div class="form-group">
      <label>승인 상태</label>
      <select class="form-control" id="emStatus">
        <option value="active" ${status === 'active' ? 'selected' : ''}>활동중 (Active)</option>
        <option value="pending" ${status === 'pending' ? 'selected' : ''}>승인대기 (Pending)</option>
        <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>정지 (Suspended)</option>
      </select>
    </div>
  `, async () => {
    try {
      await apiFetch('/api/orgs', '/' + orgId + '/members/' + omId, {
        method: 'PUT',
        body: {
          role: document.getElementById('emRole').value,
          official_level: document.getElementById('emLevel').value,
          affiliated_club: document.getElementById('emClub').value,
          status: document.getElementById('emStatus').value
        }
      });
      showToast('정보가 수정되었습니다.', 'success');
      closeModal();
      manageOrgMembers(orgId); // refresh
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function removeOrgMember(orgId, omId) {
  if (!confirm('정말 이 회원을 단체에서 추방하시겠습니까?')) return;
  try {
    await apiFetch('/api/orgs', '/' + orgId + '/members/' + omId, { method: 'DELETE' });
    showToast('추방되었습니다.', 'success');
    manageOrgMembers(orgId); // refresh
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ===== Organization Finances Management =====
async function manageOrgDues(id) {
  manageOrgFinances(id); // Alias for backward compatibility
}

async function manageOrgFinances(id) {
  try {
    const orgs = await apiFetch('/api/orgs', '/my');
    const org = orgs.find(o => String(o.id) === String(id));
    if (!org) { showToast('단체를 찾을 수 없습니다.', 'error'); return; }

    if (org.plan_tier !== 'premium') {
      showModal('💳 재무관리 기능 설정', `
        <div style="text-align:center; padding:20px 0;">
          <div style="font-size:3rem; margin-bottom:10px;">🔒</div>
          <h3 style="font-size:1.3rem; margin-bottom:10px; color:var(--text-primary);">Premium 플랜 업그레이드 필요</h3>
          <p style="color:var(--text-muted); line-height:1.6;">💰 수입/지출 관리, N빵 정산, 통계 모듈은<br>최상위 Premium 플랜 전용 B2B 기능입니다.</p>
          <button class="btn btn-primary" style="margin-top:20px; font-weight:800; background:#8b5cf6; border-color:#8b5cf6;" onclick="closeModal()">플랜 업그레이드 문의</button>
        </div>
      `, null);
      document.getElementById('modalConfirm').style.display = 'none';
      return;
    }

    const dues = await apiFetch('/api/orgs', '/' + id + '/dues');
    const expenses = await apiFetch('/api/orgs', '/' + id + '/expenses');
    const stats = await apiFetch('/api/orgs', '/' + id + '/finance-stats');
    const members = await apiFetch('/api/orgs', '/' + id + '/members');

    showModal(`💰 ${org.name} 종합 재무 관리 센터`, `
      <div style="display:flex; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:20px; gap:8px; overflow-x:auto;">
        <button class="btn btn-sm btn-primary fin-tab" onclick="switchFinTab(this, 'fin-income')" style="white-space:nowrap;">💰 수입 (회비)</button>
        <button class="btn btn-sm fin-tab" onclick="switchFinTab(this, 'fin-expense')" style="white-space:nowrap;">📤 지출 관리</button>
        <button class="btn btn-sm fin-tab" onclick="switchFinTab(this, 'fin-settle')" style="white-space:nowrap;">⚖️ 1/N 정산</button>
        <button class="btn btn-sm fin-tab" onclick="switchFinTab(this, 'fin-stats')" style="white-space:nowrap;">📊 재무 통계</button>
      </div>

      <!-- 1. 수입 관리 -->
      <div id="fin-income" class="fin-panel" style="display:block;">
        <div style="max-height: 250px; overflow-y:auto; margin-bottom:20px;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead style="background:var(--bg-card); position:sticky; top:0; box-shadow:0 1px 0 var(--border);">
              <tr>
                <th style="padding:10px; text-align:left;">일시</th>
                <th style="padding:10px; text-align:left;">납부/청구 대상자</th>
                <th style="padding:10px; text-align:left;">구분</th>
                <th style="padding:10px; text-align:right;">금액</th>
                <th style="padding:10px; text-align:center;">상태</th>
              </tr>
            </thead>
            <tbody>
              ${dues.map(d => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px; font-size:0.85rem; color:var(--text-muted);">${new Date(d.created_at).toLocaleString()}</td>
                  <td style="padding:10px;"><b>${d.member_name || '알수없음'}</b></td>
                  <td style="padding:10px;">${d.payment_type === 'annual_fee' ? `${d.target_year}년 연회비` : d.payment_type === 'monthly_dues' ? `${d.target_month}월 월회비` : d.payment_type === 'participation_fee' ? '참가비' : '특별회비/기타'} <div style="font-size:0.7rem; color:var(--text-muted)">${d.memo || ''}</div></td>
                  <td style="padding:10px; text-align:right; font-weight:bold; color:#10b981;">₩${d.amount.toLocaleString()}</td>
                  <td style="padding:10px; text-align:center;"><span class="mp-badge ${d.payment_status === 'completed' ? 'mp-badge-open' : 'mp-badge-done'}" ${d.payment_status === 'pending' ? 'style="background:rgba(239,68,68,0.1);color:#ef4444;"' : ''}>${d.payment_status === 'pending' ? '미납' : '완납'}</span></td>
                </tr>
              `).join('')}
              ${dues.length === 0 ? `<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">수입(청구) 내역이 없습니다.</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div style="background:linear-gradient(135deg,#161616,#111); border:1px solid #2A2A2A; border-radius:12px; padding:16px;">
          <h4 style="margin:0 0 12px 0; font-size:1rem; color:#fff;">새 수입/청구 수동 등록</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group" style="margin:0;">
              <select id="adMember" class="form-control">
                <option value="">-- 납부자 선택 --</option>
                ${members.map(m => `<option value="${m.member_id}">${m.name} (${m.affiliated_club || '무소속'})</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <input type="number" id="adAmount" class="form-control" placeholder="금액 (원)">
            </div>
            <div class="form-group" style="margin:0;">
              <select id="adType" class="form-control">
                <option value="annual_fee">연회비</option>
                <option value="monthly_dues">월회비</option>
                <option value="join_fee">가입비</option>
                <option value="participation_fee">회차별 참가비</option>
                <option value="special_fee">특별회비/기타</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <select id="adStatus" class="form-control">
                <option value="completed">완납처리 (입금완료)</option>
                <option value="pending">미납처리 (단순청구)</option>
              </select>
            </div>
            <div class="form-group" style="margin:0; grid-column:1/-1;">
              <input type="text" id="adMemo" class="form-control" placeholder="메모 (예: 2026년 가입비)">
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px; width:100%; border:none; background:linear-gradient(135deg,#10b981,#047857); color:#fff;" onclick="addOrgDuesAction(${org.id})">등록 처리</button>
        </div>
      </div>

      <!-- 2. 지출 관리 -->
      <div id="fin-expense" class="fin-panel" style="display:none;">
        <div style="max-height: 250px; overflow-y:auto; margin-bottom:20px;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead style="background:var(--bg-card); position:sticky; top:0; box-shadow:0 1px 0 var(--border);">
              <tr>
                <th style="padding:10px; text-align:left;">지출 일자</th>
                <th style="padding:10px; text-align:left;">분류</th>
                <th style="padding:10px; text-align:left;">상세 내용</th>
                <th style="padding:10px; text-align:right;">금액</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map(e => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px; font-size:0.85rem; color:var(--text-muted);">${new Date(e.expense_date).toLocaleDateString()}</td>
                  <td style="padding:10px;"><span class="mp-badge">${e.category}</span></td>
                  <td style="padding:10px;">${e.description || '-'}</td>
                  <td style="padding:10px; text-align:right; font-weight:bold; color:#ef4444;">-₩${e.amount.toLocaleString()}</td>
                </tr>
              `).join('')}
              ${expenses.length === 0 ? `<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--text-muted);">지출 내역이 없습니다.</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div style="background:linear-gradient(135deg,#161616,#111); border:1px solid #2A2A2A; border-radius:12px; padding:16px;">
          <h4 style="margin:0 0 12px 0; font-size:1rem; color:#fff;">새 지출 내역 등록</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group" style="margin:0;">
              <select id="exCategory" class="form-control">
                <option value="코트/구장 임대료">코트/구장 임대료</option>
                <option value="용품비 (셔틀콕 등)">용품비 (셔틀콕 등)</option>
                <option value="유니폼/장비">유니폼/장비</option>
                <option value="식대/뒤풀이">식대/뒤풀이</option>
                <option value="대회 참가비">대회 참가비</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <input type="number" id="exAmount" class="form-control" placeholder="지출 금액 (원)">
            </div>
            <div class="form-group" style="margin:0;">
              <input type="date" id="exDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group" style="margin:0;">
              <input type="text" id="exDesc" class="form-control" placeholder="상세 내용">
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px; width:100%; border:none; background:linear-gradient(135deg,#ef4444,#b91c1c); color:#fff;" onclick="addOrgExpenseAction(${org.id})">지출 등록</button>
        </div>
      </div>

      <!-- 3. N빵 정산 -->
      <div id="fin-settle" class="fin-panel" style="display:none;">
        <div style="background:var(--bg-card); padding:16px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;">
          <h3 style="margin:0 0 10px 0; font-size:1.1rem; color:var(--text-primary);">⚖️ 참석자 공동 부담금 1/N 청구</h3>
          <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">코트비, 식비 등 총액을 입력하고 참석자를 선택하면, 자동으로 1/N 금액이 <b>미납(청구)</b> 상태로 추가됩니다.</p>
          
          <div style="display:grid; grid-template-columns:1fr; gap:12px; margin-bottom:16px;">
            <div class="form-group" style="margin:0;">
              <label>정산 총액 (원)</label>
              <input type="number" id="stTotal" class="form-control" placeholder="예: 150000" oninput="previewSettlement()">
            </div>
            <div class="form-group" style="margin:0;">
              <label>청구 명목 (메모에 저장됨)</label>
              <input type="text" id="stMemo" class="form-control" placeholder="예: 3월 정기모임 회식비 정산">
            </div>
          </div>

          <label style="display:block; margin-bottom:8px; font-weight:bold;">정산 대상자 (체크)</label>
          <div style="max-height:180px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; background:#000; padding:10px; margin-bottom:10px;">
            ${members.map(m => `
              <label style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #222; cursor:pointer;">
                <input type="checkbox" class="st-chk" value="${m.member_id}" onchange="previewSettlement()" checked>
                <span><b>${m.name}</b> <span style="font-size:0.8rem; color:#888;">(${m.affiliated_club || '무소속'})</span></span>
              </label>
            `).join('')}
          </div>
          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <button class="btn btn-sm" onclick="document.querySelectorAll('.st-chk').forEach(c => c.checked = true); previewSettlement();">전체 선택</button>
            <button class="btn btn-sm" onclick="document.querySelectorAll('.st-chk').forEach(c => c.checked = false); previewSettlement();">전체 해제</button>
          </div>

          <div style="background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.9rem; color:var(--text-muted);">예상 1인당 청구액 (10원 미만 올림)</div>
              <div style="font-size:1.5rem; font-weight:800; color:#c084fc;" id="stPreview">₩0</div>
            </div>
            <button class="btn btn-primary" style="background:#8b5cf6; border:none;" onclick="addOrgSettlementAction(${org.id})">1/N 청구서 발행</button>
          </div>
        </div>
      </div>

      <!-- 4. 통계 -->
      <div id="fin-stats" class="fin-panel" style="display:none;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
          <div style="background:var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border); text-align:center;">
            <div style="font-size:0.9rem; color:var(--text-muted); margin-bottom:8px;">현재 잔액 (수입 - 지출)</div>
            <div style="font-size:2rem; font-weight:900; color:${stats.balance >= 0 ? '#10b981' : '#ef4444'};">₩${stats.balance.toLocaleString()}</div>
          </div>
          <div style="background:var(--bg-card); padding:20px; border-radius:12px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="font-size:0.9rem; color:var(--text-muted);">총 수입</span>
              <span style="font-weight:bold; color:#10b981;">₩${stats.income_total.toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="font-size:0.9rem; color:var(--text-muted);">총 지출</span>
              <span style="font-weight:bold; color:#ef4444;">₩${stats.expense_total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div style="background:var(--bg-card); padding:16px; border-radius:12px; border:1px solid var(--border);">
          <h3 style="margin:0 0 12px 0; font-size:1rem;">지출 통계 (카테고리별 누적)</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${stats.expense_by_category.map(c => `
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #222; padding-bottom:4px;">
                <span>${c.category}</span>
                <span class="mp-badge mp-badge-done" style="background:rgba(239,68,68,0.1); color:#ef4444;">₩${c.total.toLocaleString()}</span>
              </div>
            `).join('')}
            ${stats.expense_by_category.length === 0 ? '<div style="color:#666;">지출 데이터가 없습니다.</div>' : ''}
          </div>
        </div>
      </div>
    `, null, { hideConfirm: true, wide: true });
  } catch (e) {
    showToast('재무 정보를 불러오지 못했습니다.', 'error');
  }
}

function switchFinTab(btnElem, targetId) {
  document.querySelectorAll('.fin-tab').forEach(b => { b.classList.remove('btn-primary'); });
  btnElem.classList.add('btn-primary');
  document.querySelectorAll('.fin-panel').forEach(p => p.style.display = 'none');
  document.getElementById(targetId).style.display = 'block';
}

function previewSettlement() {
  const total = parseInt(document.getElementById('stTotal').value) || 0;
  let cnt = 0;
  document.querySelectorAll('.st-chk').forEach(c => { if (c.checked) cnt++; });
  if (cnt === 0) {
    document.getElementById('stPreview').innerText = '₩0';
    return;
  }
  const perPerson = Math.ceil(total / cnt);
  document.getElementById('stPreview').innerText = '₩' + perPerson.toLocaleString() + ' (총 ' + cnt + '명)';
}

async function addOrgDuesAction(orgId) {
  const mId = document.getElementById('adMember').value;
  const amount = document.getElementById('adAmount').value;
  const type = document.getElementById('adType').value;
  const status = document.getElementById('adStatus').value;
  const memo = document.getElementById('adMemo').value;

  if (!mId || !amount) {
    showToast('납부자와 금액을 필수 입력하세요.', 'error'); return;
  }

  let body = {
    member_id: parseInt(mId),
    amount: parseInt(amount),
    payment_type: type,
    payment_status: status,
    memo: memo
  };

  try {
    await apiFetch('/api/orgs', '/' + orgId + '/dues', {
      method: 'POST',
      body
    });
    showToast('회비/청구가 등록되었습니다!', 'success');
    manageOrgFinances(orgId); // refresh
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function addOrgExpenseAction(orgId) {
  const category = document.getElementById('exCategory').value;
  const amount = document.getElementById('exAmount').value;
  const dateStr = document.getElementById('exDate').value;
  const desc = document.getElementById('exDesc').value;

  if (!amount || !dateStr) {
    showToast('금액과 일자를 입력하세요.', 'error'); return;
  }

  let body = {
    category,
    amount: parseInt(amount),
    expense_date: new Date(dateStr).toISOString(),
    description: desc
  };

  try {
    await apiFetch('/api/orgs', '/' + orgId + '/expenses', {
      method: 'POST', body
    });
    showToast('지출이 등록되었습니다!', 'success');
    manageOrgFinances(orgId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function addOrgSettlementAction(orgId) {
  const total = parseInt(document.getElementById('stTotal').value);
  const memo = document.getElementById('stMemo').value.trim();

  if (!total || total <= 0) {
    showToast('정산 총액을 입력하세요.', 'error'); return;
  }

  const mids = [];
  document.querySelectorAll('.st-chk').forEach(c => {
    if (c.checked) mids.push(parseInt(c.value));
  });

  if (mids.length === 0) {
    showToast('대상을 선택하세요.', 'error'); return;
  }

  if (!confirm(`총 ${mids.length}명에게 1/N 정산서를 발행하시겠습니까?`)) return;

  try {
    const res = await apiFetch('/api/orgs', '/' + orgId + '/finances/settlement', {
      method: 'POST',
      body: { total_amount: total, member_ids: mids, memo }
    });
    showToast(res.message, 'success');
    manageOrgFinances(orgId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ===== Organization Schedules Management =====
async function manageOrgSchedules(id) {
  try {
    const orgs = await apiFetch('/api/orgs', '/my');
    const org = orgs.find(o => String(o.id) === String(id));
    if (!org) { showToast('단체를 찾을 수 없습니다.', 'error'); return; }

    const schedules = await apiFetch('/api/orgs', '/' + id + '/schedules');

    // 지난 일정 / 예정 일정 분리
    const now = new Date();
    const upcoming = schedules.filter(s => new Date(s.start_time) >= now);
    const past = schedules.filter(s => new Date(s.start_time) < now);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const typeLabels = { meeting: '회의/모임', training: '훈련/연습', regular: '정기모임', tournament_prep: '대회준비', etc: '기타' };

    const renderRow = (s) => {
      const d = new Date(s.start_time);
      const dayName = dayNames[d.getDay()];
      const endStr = s.end_time ? ' ~ ' + new Date(s.end_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
      const isPast = d < now;
      return `
        <tr style="border-bottom:1px solid var(--border); ${isPast ? 'opacity:0.5;' : ''}">
          <td style="padding:10px; font-size:0.85rem; color:var(--text-muted); white-space:nowrap;">
            ${d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} (${dayName})<br>
            <span style="font-size:0.8rem;">${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}${endStr}</span>
          </td>
          <td style="padding:10px;"><b>${s.title}</b><br><span style="font-size:0.75rem;color:var(--text-muted)">${typeLabels[s.event_type] || s.event_type}${s.description ? ' · ' + s.description : ''}</span></td>
          <td style="padding:10px;">${s.location || '-'}</td>
          <td style="padding:10px; text-align:center; white-space:nowrap;">
            <button class="btn btn-sm btn-primary" style="margin:2px;" onclick="manageOrgScheduleAttendance(${org.id}, ${s.id}, '${s.title.replace(/'/g, "\\'")}')">✅ 출석</button>
            <button class="btn btn-sm" style="margin:2px; background:rgba(139,92,246,0.1); color:#8b5cf6;" onclick="editOrgSchedule(${org.id}, ${s.id}, '${s.title.replace(/'/g, "\\'")}', '${s.start_time}', '${s.location || ''}', '${s.end_time || ''}', '${(s.description || '').replace(/'/g, "\\'")}', '${s.event_type || 'meeting'}')">✏️</button>
            <button class="btn btn-sm" style="margin:2px; background:rgba(239,68,68,0.1); color:#ef4444;" onclick="removeOrgSchedule(${org.id}, ${s.id})">🗑</button>
          </td>
        </tr>`;
    };

    // 올해/내년 기본값
    const todayStr = new Date().toISOString().substring(0, 10);
    const yearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().substring(0, 10);

    showModal(`📅 ${org.name} 일정 통합 관리`, `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--border); padding-bottom:12px; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
        <h2 style="font-size:1.1rem; font-weight:800; color:var(--text-primary); margin:0;">전체 일정 (${schedules.length}건 | 예정 ${upcoming.length} · 지난 ${past.length})</h2>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm" style="border:1px solid #10b981; color:#10b981; background:rgba(16,185,129,0.05);" onclick="showOrgAttendanceStats(${org.id})">📊 출석통계</button>
          <button class="btn btn-sm" style="border:1px solid #ef4444; color:#ef4444; background:rgba(239,68,68,0.05);" onclick="resetOrgSchedules(${org.id})">🗑 전체 초기화</button>
        </div>
      </div>

      <!-- 일정 목록 -->
      <div style="max-height:280px; overflow-y:auto; margin-bottom:20px;">
        <table class="table" style="width:100%; border-collapse:collapse;">
          <thead style="background:var(--bg-card); position:sticky; top:0; box-shadow:0 1px 0 var(--border);">
            <tr>
              <th style="padding:10px; text-align:left;">일시</th>
              <th style="padding:10px; text-align:left;">행사명</th>
              <th style="padding:10px; text-align:left;">장소</th>
              <th style="padding:10px; text-align:center;">관리</th>
            </tr>
          </thead>
          <tbody>
            ${upcoming.map(renderRow).join('')}
            ${past.length > 0 ? `<tr><td colspan="4" style="padding:8px; text-align:center; font-size:0.8rem; color:var(--text-muted); background:rgba(255,255,255,0.02);">── 지난 일정 (${past.length}건) ──</td></tr>` : ''}
            ${past.map(renderRow).join('')}
            ${schedules.length === 0 ? '<tr><td colspan="4" style="padding:30px; text-align:center; color:var(--text-muted);">예정된 일정이 없습니다. 아래에서 일정을 등록해 보세요!</td></tr>' : ''}
          </tbody>
        </table>
      </div>

      <!-- 탭: 개별등록 / 일괄등록 -->
      <div style="background:linear-gradient(135deg,#161616,#111); border:1px solid #2A2A2A; border-radius:12px; overflow:hidden;">
        <div style="display:flex; border-bottom:1px solid #2A2A2A;">
          <button id="schedTabSingle" class="btn" style="flex:1; border:none; border-radius:0; background:#222; color:#fff; font-weight:700; padding:12px;" onclick="switchScheduleTab('single')">📌 개별 등록</button>
          <button id="schedTabBulk" class="btn" style="flex:1; border:none; border-radius:0; background:transparent; color:var(--text-muted); font-weight:700; padding:12px;" onclick="switchScheduleTab('bulk')">📋 일괄 등록 (요일 반복)</button>
        </div>

        <!-- 개별 등록 -->
        <div id="schedPanelSingle" style="padding:16px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group" style="margin:0; grid-column:1/-1;">
              <label>행사명 *</label>
              <input type="text" id="asTitle" class="form-control" placeholder="예: 3월 정기모임">
            </div>
            <div class="form-group" style="margin:0;">
              <label>시작 일시 *</label>
              <input type="datetime-local" id="asStart" class="form-control">
            </div>
            <div class="form-group" style="margin:0;">
              <label>종료 일시</label>
              <input type="datetime-local" id="asEnd" class="form-control">
            </div>
            <div class="form-group" style="margin:0;">
              <label>장소</label>
              <input type="text" id="asLocation" class="form-control" placeholder="체육관/코트명">
            </div>
            <div class="form-group" style="margin:0;">
              <label>유형</label>
              <select id="asType" class="form-control">
                <option value="regular">정기모임</option>
                <option value="meeting">회의/모임</option>
                <option value="training">훈련/연습</option>
                <option value="tournament_prep">대회준비</option>
                <option value="etc">기타</option>
              </select>
            </div>
            <div class="form-group" style="margin:0; grid-column:1/-1;">
              <label>설명/메모</label>
              <input type="text" id="asDesc" class="form-control" placeholder="예: 코트 4면 예약 완료">
            </div>
            <div class="form-group" style="margin:0;">
              <label>반복 생성</label>
              <select id="asRepeat" class="form-control">
                <option value="0">반복 없음 (1회)</option>
                <option value="2">매월 3개월간</option>
                <option value="5">매월 6개월간</option>
                <option value="11">매월 12개월간 (1년)</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px; width:100%; background:linear-gradient(135deg,#f97316,#ea580c); border:none; font-weight:800;" onclick="addOrgScheduleAction(${org.id})">📌 일정 추가하기</button>
        </div>

        <!-- 일괄 등록 -->
        <div id="schedPanelBulk" style="padding:16px; display:none;">
          <div style="background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.3); border-radius:8px; padding:10px; margin-bottom:14px; font-size:0.85rem; color:#fbbf24;">
            💡 <b>매주 반복되는 정기 일정</b>을 1년치 한꺼번에 생성합니다.<br>
            예: "매주 토요일 09:00~12:00 정기모임" → 52건 자동 생성
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group" style="margin:0; grid-column:1/-1;">
              <label>행사명 *</label>
              <input type="text" id="bsTitle" class="form-control" placeholder="예: 토요 정기모임">
            </div>
            <div class="form-group" style="margin:0;">
              <label>요일 *</label>
              <select id="bsDayOfWeek" class="form-control">
                <option value="1">월요일</option>
                <option value="2">화요일</option>
                <option value="3">수요일</option>
                <option value="4">목요일</option>
                <option value="5">금요일</option>
                <option value="6" selected>토요일</option>
                <option value="0">일요일</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <label>반복 주기</label>
              <select id="bsInterval" class="form-control">
                <option value="1">매주</option>
                <option value="2">격주</option>
                <option value="4">매월 (4주마다)</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <label>시작 시간 *</label>
              <input type="time" id="bsStartTime" class="form-control" value="09:00">
            </div>
            <div class="form-group" style="margin:0;">
              <label>종료 시간</label>
              <input type="time" id="bsEndTime" class="form-control" value="12:00">
            </div>
            <div class="form-group" style="margin:0;">
              <label>기간 시작일 *</label>
              <input type="date" id="bsStartDate" class="form-control" value="${todayStr}">
            </div>
            <div class="form-group" style="margin:0;">
              <label>기간 종료일 *</label>
              <input type="date" id="bsEndDate" class="form-control" value="${yearLater}">
            </div>
            <div class="form-group" style="margin:0;">
              <label>장소</label>
              <input type="text" id="bsLocation" class="form-control" placeholder="체육관/코트명">
            </div>
            <div class="form-group" style="margin:0;">
              <label>유형</label>
              <select id="bsType" class="form-control">
                <option value="regular">정기모임</option>
                <option value="training">훈련/연습</option>
                <option value="meeting">회의/모임</option>
                <option value="etc">기타</option>
              </select>
            </div>
            <div class="form-group" style="margin:0; grid-column:1/-1;">
              <label>설명/메모</label>
              <input type="text" id="bsDesc" class="form-control" placeholder="예: 안양 시민체육관 코트 3~4면">
            </div>
          </div>
          <div id="bulkPreview" style="margin-top:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:0.85rem; color:var(--text-muted);"></div>
          <button class="btn btn-primary" style="margin-top:12px; width:100%; background:linear-gradient(135deg,#8b5cf6,#6366f1); border:none; font-weight:800;" onclick="addBulkWeeklySchedule(${org.id})">📋 일괄 생성하기</button>
        </div>
      </div>
    `, null, { hideConfirm: true, wide: true });

    // 일괄생성 미리보기 업데이트
    const updateBulkPreview = () => {
      const dow = parseInt(document.getElementById('bsDayOfWeek')?.value || '6');
      const interval = parseInt(document.getElementById('bsInterval')?.value || '1');
      const sd = document.getElementById('bsStartDate')?.value;
      const ed = document.getElementById('bsEndDate')?.value;
      if (!sd || !ed) return;
      const dayName = dayNames[dow];
      const sDate = new Date(sd + 'T00:00:00');
      const eDate = new Date(ed + 'T23:59:59');
      let cursor = new Date(sDate);
      while (cursor.getDay() !== dow) cursor.setDate(cursor.getDate() + 1);
      let count = 0;
      while (cursor <= eDate) { count++; cursor.setDate(cursor.getDate() + 7 * interval); }
      const prefix = interval === 1 ? '매주' : interval === 2 ? '격주' : '4주마다';
      const previewEl = document.getElementById('bulkPreview');
      if (previewEl) previewEl.innerHTML = `📊 <b>${prefix} ${dayName}요일</b> · ${sd} ~ ${ed} → 총 <b style="color:#f97316;">${count}건</b> 생성 예정`;
    };
    setTimeout(() => {
      ['bsDayOfWeek', 'bsInterval', 'bsStartDate', 'bsEndDate'].forEach(elId => {
        const el = document.getElementById(elId);
        if (el) el.addEventListener('change', updateBulkPreview);
      });
      updateBulkPreview();
    }, 100);

  } catch (e) {
    showToast('일정 정보를 불러오지 못했습니다.', 'error');
  }
}

window.switchScheduleTab = function (tab) {
  const singleTab = document.getElementById('schedTabSingle');
  const bulkTab = document.getElementById('schedTabBulk');
  const singlePanel = document.getElementById('schedPanelSingle');
  const bulkPanel = document.getElementById('schedPanelBulk');
  if (tab === 'single') {
    singleTab.style.background = '#222'; singleTab.style.color = '#fff';
    bulkTab.style.background = 'transparent'; bulkTab.style.color = 'var(--text-muted)';
    singlePanel.style.display = 'block'; bulkPanel.style.display = 'none';
  } else {
    bulkTab.style.background = '#222'; bulkTab.style.color = '#fff';
    singleTab.style.background = 'transparent'; singleTab.style.color = 'var(--text-muted)';
    bulkPanel.style.display = 'block'; singlePanel.style.display = 'none';
  }
};

async function addOrgScheduleAction(orgId) {
  const title = document.getElementById('asTitle').value.trim();
  const rawStart = document.getElementById('asStart').value;
  const rawEnd = document.getElementById('asEnd')?.value || '';
  const location = document.getElementById('asLocation').value.trim();
  const event_type = document.getElementById('asType').value;
  const description = document.getElementById('asDesc')?.value?.trim() || '';
  const repeat_months = parseInt(document.getElementById('asRepeat').value) || 0;

  if (!title || !rawStart) {
    showToast('행사명과 시작 일시를 입력하세요.', 'error'); return;
  }

  const start_time = new Date(rawStart).toISOString();
  const end_time = rawEnd ? new Date(rawEnd).toISOString() : null;

  try {
    const res = await apiFetch('/api/orgs', '/' + orgId + '/schedules', {
      method: 'POST',
      body: { title, start_time, end_time, location, event_type, description, repeat_months }
    });
    showToast(res.message + (res.inserted > 1 ? ` (${res.inserted}건 생성)` : ''), 'success');
    manageOrgSchedules(orgId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function addBulkWeeklySchedule(orgId) {
  const title = document.getElementById('bsTitle').value.trim();
  const day_of_week = document.getElementById('bsDayOfWeek').value;
  const interval_weeks = document.getElementById('bsInterval').value;
  const startTime = document.getElementById('bsStartTime').value;
  const endTime = document.getElementById('bsEndTime').value;
  const start_date = document.getElementById('bsStartDate').value;
  const end_date = document.getElementById('bsEndDate').value;
  const location = document.getElementById('bsLocation').value.trim();
  const event_type = document.getElementById('bsType').value;
  const description = document.getElementById('bsDesc')?.value?.trim() || '';

  if (!title || !startTime || !start_date || !end_date) {
    showToast('행사명, 시작시간, 기간을 입력해주세요.', 'error'); return;
  }

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime ? endTime.split(':').map(Number) : [null, null];

  try {
    const res = await apiFetch('/api/orgs', '/' + orgId + '/schedules/bulk-weekly', {
      method: 'POST',
      body: {
        title, day_of_week, interval_weeks,
        start_hour: sh, start_minute: sm,
        end_hour: eh, end_minute: em,
        start_date, end_date,
        location, event_type, description
      }
    });
    showToast(res.message, 'success');
    manageOrgSchedules(orgId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function resetOrgSchedules(orgId) {
  if (!confirm('⚠️ 모든 일정과 출석 데이터가 삭제됩니다.\n정말 초기화하시겠습니까?')) return;
  if (!confirm('❗ 한번 더 확인합니다. 되돌릴 수 없습니다. 계속하시겠습니까?')) return;
  try {
    const res = await apiFetch('/api/orgs', '/' + orgId + '/schedules', { method: 'DELETE' });
    showToast(res.message, 'success');
    manageOrgSchedules(orgId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function editOrgSchedule(orgId, sId, currentTitle, currentStart, currentLocation, currentEnd, currentDesc, currentType) {
  // Convert UTC ISO to local datetime-local format
  const startLocal = new Date(currentStart);
  const tzOffset = startLocal.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(startLocal.getTime() - tzOffset)).toISOString().slice(0, 16);
  let localEndTime = '';
  if (currentEnd) {
    const endLocal = new Date(currentEnd);
    localEndTime = (new Date(endLocal.getTime() - tzOffset)).toISOString().slice(0, 16);
  }

  showModal(`✏️ 일정 수정`, `
    <div class="form-group">
      <label>행사명</label>
      <input type="text" id="esTitle" class="form-control" value="${currentTitle}">
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="form-group">
        <label>시작 일시</label>
        <input type="datetime-local" id="esStart" class="form-control" value="${localISOTime}">
      </div>
      <div class="form-group">
        <label>종료 일시</label>
        <input type="datetime-local" id="esEnd" class="form-control" value="${localEndTime}">
      </div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="form-group">
        <label>장소</label>
        <input type="text" id="esLocation" class="form-control" value="${currentLocation}">
      </div>
      <div class="form-group">
        <label>유형</label>
        <select id="esType" class="form-control">
          <option value="regular" ${currentType === 'regular' ? 'selected' : ''}>정기모임</option>
          <option value="meeting" ${currentType === 'meeting' ? 'selected' : ''}>회의/모임</option>
          <option value="training" ${currentType === 'training' ? 'selected' : ''}>훈련/연습</option>
          <option value="tournament_prep" ${currentType === 'tournament_prep' ? 'selected' : ''}>대회준비</option>
          <option value="etc" ${currentType === 'etc' ? 'selected' : ''}>기타</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>설명/메모</label>
      <input type="text" id="esDesc" class="form-control" value="${currentDesc || ''}">
    </div>
  `, async () => {
    try {
      const rawEnd = document.getElementById('esEnd').value;
      await apiFetch('/api/orgs', '/' + orgId + '/schedules/' + sId, {
        method: 'PUT',
        body: {
          title: document.getElementById('esTitle').value.trim(),
          start_time: new Date(document.getElementById('esStart').value).toISOString(),
          end_time: rawEnd ? new Date(rawEnd).toISOString() : null,
          location: document.getElementById('esLocation').value.trim(),
          event_type: document.getElementById('esType').value,
          description: document.getElementById('esDesc').value.trim()
        }
      });
      showToast('일정이 수정되었습니다.', 'success');
      closeModal();
      manageOrgSchedules(orgId);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function removeOrgSchedule(orgId, sId) {
  if (!confirm('해당 일정을 취소/삭제하시겠습니까? 관련 출석 데이터도 모두 삭제됩니다.')) return;
  try {
    await apiFetch('/api/orgs', '/' + orgId + '/schedules/' + sId, { method: 'DELETE' });
    showToast('삭제되었습니다.', 'success');
    manageOrgSchedules(orgId); // refresh
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function manageOrgScheduleAttendance(orgId, scheduleId, title) {
  try {
    // 1. Get current attendances for this schedule
    const attendances = await apiFetch('/api/orgs', '/' + orgId + '/schedules/' + scheduleId + '/attendance');
    const attMap = {}; // member_id -> status
    attendances.forEach(a => { attMap[a.member_id] = a.status; });

    // 2. Get all org members
    const members = await apiFetch('/api/orgs', '/' + orgId + '/members');

    showModal(`✅ [${title}] 출석 체크`, `
      <div style="font-size:0.9rem; color:var(--text-muted); margin-bottom:12px;">체크를 해제하면 '결석' 처리됩니다. (현재 편의상 출석/결석만 지원)</div>
      <div style="max-height: 400px; overflow-y:auto; margin-bottom:20px;">
        <table class="table" style="width:100%; border-collapse:collapse;">
          <thead style="background:var(--bg-card); position:sticky; top:0; box-shadow:0 1px 0 var(--border);">
            <tr>
              <th style="padding:10px; width:50px;">출석</th>
              <th style="padding:10px; text-align:left;">이름</th>
              <th style="padding:10px; text-align:left;">클럽</th>
            </tr>
          </thead>
          <tbody id="attTbody">
            ${members.map(m => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px; text-align:center;">
                  <input type="checkbox" class="att-chk" data-mid="${m.id}" ${attMap[m.id] === 'present' ? 'checked' : ''} style="width:18px;height:18px;">
                </td>
                <td style="padding:10px;"><b>${m.name}</b> <span style="font-size:0.8rem;color:var(--text-muted)">(${m.phone || '번호없음'})</span></td>
                <td style="padding:10px; color:var(--text-muted);">${m.affiliated_club || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div>
        <button class="btn btn-sm" onclick="document.querySelectorAll('.att-chk').forEach(c => c.checked = true)">전체 선택</button>
        <button class="btn btn-sm" onclick="document.querySelectorAll('.att-chk').forEach(c => c.checked = false)">전체 해제</button>
      </div>
    `, async () => {
      // Save attendances
      const payload = [];
      document.querySelectorAll('.att-chk').forEach(c => {
        payload.push({ member_id: parseInt(c.dataset.mid), status: c.checked ? 'present' : 'absent' });
      });

      try {
        await apiFetch('/api/orgs', '/' + orgId + '/schedules/' + scheduleId + '/attendance', {
          method: 'POST',
          body: { attendances: payload }
        });
        showToast('출석부가 저장되었습니다.', 'success');
        closeModal();
        manageOrgSchedules(orgId); // return to schedule list
      } catch (e) {
        showToast(e.message, 'error');
      }
    }, { wide: true });
  } catch (e) {
    showToast('데이터를 불러오지 못했습니다.', 'error');
  }
}

async function showOrgAttendanceStats(orgId) {
  try {
    const monthly = await apiFetch('/api/orgs', '/' + orgId + '/attendance-stats?type=monthly');
    const ranking = await apiFetch('/api/orgs', '/' + orgId + '/attendance-stats?type=ranking');

    showModal(`📊 출석 통계 (랭킹 및 추이)`, `
      <div style="display:flex; gap:20px; flex-wrap:wrap;">
        <div style="flex:1; min-width:300px; background:var(--bg-card); padding:16px; border-radius:12px; border:1px solid var(--border);">
          <h3 style="margin:0 0 12px 0; font-size:1.1rem;">🏆 개인별 출석 랭킹 (Top 50)</h3>
          <table class="table" style="width:100%;">
            <thead><tr><th style="padding:8px;">순위</th><th style="padding:8px;">이름</th><th style="padding:8px;">소속</th><th style="padding:8px;">출석횟수</th></tr></thead>
            <tbody>
              ${ranking.map((r, i) => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:8px; text-align:center;">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)}</td>
                  <td style="padding:8px;"><b>${r.name}</b></td>
                  <td style="padding:8px; font-size:0.85rem; color:var(--text-muted);">${r.affiliated_club || '-'}</td>
                  <td style="padding:8px; text-align:center; font-weight:bold; color:#f97316;">${r.attend_count}회</td>
                </tr>
              `).join('')}
              ${ranking.length === 0 ? '<tr><td colspan="4" style="padding:20px;text-align:center;">데이터가 없습니다.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <div style="flex:1; min-width:300px; background:var(--bg-card); padding:16px; border-radius:12px; border:1px solid var(--border);">
          <h3 style="margin:0 0 12px 0; font-size:1.1rem;">📈 월별 행사 참석 연인원</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${monthly.map(m => `
              <div style="display:flex; align-items:center;">
                <div style="width:70px; font-weight:bold; font-size:0.9rem;">${m.month}</div>
                <div style="flex:1; background:rgba(249,115,22,0.1); height:16px; border-radius:8px; overflow:hidden;">
                  <div style="background:#f97316; height:100%; width:${Math.min(100, (m.attend_count / 50) * 100)}%;"></div>
                </div>
                <div style="width:40px; text-align:right; font-size:0.85rem; font-weight:bold;">${m.attend_count}명</div>
              </div>
            `).join('')}
            ${monthly.length === 0 ? '<div style="color:var(--text-muted);">통계 데이터가 없습니다.</div>' : ''}
          </div>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:20px;">* 막대그래프는 편의상 50명을 100%로 잡은 예시 비율입니다.</p>
        </div>
      </div>
    `, () => {
      // Return to schedule management
      manageOrgSchedules(orgId);
    }, { wide: true });
  } catch (e) {
    showToast('통계 데이터를 불러오지 못했습니다.', 'error');
  }
}


// ===== Organization Bulletin Boards (게시판) =====
async function manageOrgBoards(id) {
  try {
    const orgs = await apiFetch('/api/orgs', '/my');
    const org = orgs.find(o => String(o.id) === String(id));
    if (!org) { showToast('단체를 찾을 수 없습니다.', 'error'); return; }

    const boards = await apiFetch('/api/orgs', '/' + id + '/boards');

    showModal(`📋 ${org.name} 게시판 관리`, `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:16px;">
        <h2 style="font-size:1.1rem; font-weight:800; color:var(--text-primary); margin:0;">등록된 게시판 (${boards.length}개)</h2>
        <button class="btn btn-sm btn-primary" onclick="showCreateOrgBoard(${org.id})">+ 새 게시판 만들기</button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; margin-bottom:20px;" id="orgBoardsList">
        ${boards.map(b => `
          <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:16px; cursor:pointer; transition:all 0.2s;" hover="box-shadow:0 4px 12px rgba(0,0,0,0.2)" onclick="manageOrgPosts(${org.id}, ${b.id}, '${b.name}')">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.5rem;">${b.board_type === 'notice' ? '📢' : b.board_type === 'gallery' ? '🖼️' : '💬'}</span>
              <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${b.name}</h3>
            </div>
            <p style="margin:8px 0 0 0; font-size:0.85rem; color:var(--text-muted); height:2.5em; overflow:hidden; text-overflow:ellipsis;">${b.description || '운영 목적에 맞는 소식을 나누는 공간입니다.'}</p>
            <div style="margin-top:12px; padding-top:12px; border-top:1px dashed #333; text-align:right;">
              <span class="mp-badge mp-badge-open" style="font-size:0.7rem;">자세히 보기 👉</span>
            </div>
          </div>
        `).join('')}
        ${boards.length === 0 ? '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">등록된 게시판이 없습니다.<br>새 게시판을 만들어 소통을 시작해 보세요.</div>' : ''}
      </div>
    `, null, { hideConfirm: true, wide: true });
  } catch (e) {
    showToast('게시판 정보를 불러오지 못했습니다.', 'error');
  }
}

function showCreateOrgBoard(orgId) {
  showModal('✨ 새 게시판 만들기', `
    <div class="form-group">
      <label>게시판 이름 (필수)</label>
      <input type="text" id="obName" class="form-control" placeholder="예: 공지사항, 자유게시판">
    </div>
    <div class="form-group">
      <label>게시판 종류</label>
      <select id="obType" class="form-control">
        <option value="normal">일반 게시판 (텍스트 위주)</option>
        <option value="notice">공지사항 (알림 위주)</option>
        <option value="gallery">사진방/갤러리 (이미지 위주)</option>
      </select>
    </div>
    <div class="form-group">
      <label>게시판 설명 (선택)</label>
      <input type="text" id="obDesc" class="form-control" placeholder="목적이나 규칙을 간략하게 작성하세요">
    </div>
  `, async () => {
    const name = document.getElementById('obName').value.trim();
    if (!name) { showToast('이름을 입력해주세요.', 'error'); return; }

    try {
      await apiFetch('/api/orgs', '/' + orgId + '/boards', {
        method: 'POST',
        body: {
          name: name,
          board_type: document.getElementById('obType').value,
          description: document.getElementById('obDesc').value
        }
      });
      showToast('게시판이 생성되었습니다!', 'success');
      manageOrgBoards(orgId); // refresh
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function manageOrgPosts(orgId, boardId, boardName) {
  try {
    const posts = await apiFetch('/api/orgs', '/' + orgId + '/boards/' + boardId + '/posts');

    showModal(`📑 [${boardName}] 게시글 목록`, `
      <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
        <button class="btn btn-sm" onclick="manageOrgBoards(${orgId})">👈 게시판 목록으로</button>
        <button class="btn btn-sm btn-primary" onclick="showCreateOrgPost(${orgId}, ${boardId}, '${boardName}')">✏️ 새 글 쓰기</button>
      </div>

      <table class="table" style="width:100%; font-size:0.9rem;">
        <thead style="background:var(--bg-card);">
          <tr>
            <th style="padding:10px 8px; width:60px; text-align:center;">번호</th>
            <th style="padding:10px 8px; text-align:left;">제목</th>
            <th style="padding:10px 8px; text-align:center;">작성자</th>
            <th style="padding:10px 8px; text-align:center;">조회</th>
            <th style="padding:10px 8px; text-align:center;">작성일</th>
          </tr>
        </thead>
        <tbody>
          ${posts.map((p, i) => `
            <tr style="border-bottom:1px solid var(--border); cursor:pointer;" onclick="manageOrgPostDetail(${orgId}, ${boardId}, ${p.id})">
              <td style="padding:10px 8px; text-align:center; color:var(--text-muted);">${posts.length - i}</td>
              <td style="padding:10px 8px;">
                <b style="color:var(--text-primary);">${p.title}</b>
                ${p.comment_count > 0 ? `<span style="font-size:0.75rem; color:#ef4444; margin-left:4px; font-weight:bold;">[${p.comment_count}]</span>` : ''}
              </td>
              <td style="padding:10px 8px; text-align:center;">${p.author_name}</td>
              <td style="padding:10px 8px; text-align:center; color:var(--text-muted);">${p.views}</td>
              <td style="padding:10px 8px; text-align:center; color:var(--text-muted); font-size:0.8rem;">${new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          `).join('')}
          ${posts.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">등록된 글이 아직 없습니다.</td></tr>' : ''}
        </tbody>
      </table>
    `, null, { hideConfirm: true, wide: true });
  } catch (e) {
    showToast('게시글 목록을 불러오지 못했습니다.', 'error');
  }
}

function showCreateOrgPost(orgId, boardId, boardName) {
  showModal(`📝 [${boardName}] 새 글 쓰기`, `
    <div class="form-group">
      <label>제목</label>
      <input type="text" id="opTitle" class="form-control" placeholder="게시글 제목을 입력하세요">
    </div>
    <div class="form-group" style="flex:1; display:flex; flex-direction:column;">
      <label>내용</label>
      <textarea id="opContent" class="form-control" style="flex:1; min-height:200px; resize:vertical;" placeholder="글 내용을 자세히 작성해 주세요..."></textarea>
    </div>
  `, async () => {
    const title = document.getElementById('opTitle').value.trim();
    const content = document.getElementById('opContent').value.trim();
    if (!title || !content) { showToast('제목과 내용을 모두 입력해 주세요.', 'error'); return; }

    try {
      await apiFetch('/api/orgs', '/' + orgId + '/boards/' + boardId + '/posts', {
        method: 'POST', body: { title, content }
      });
      showToast('게시글이 성공적으로 등록되었습니다!', 'success');
      manageOrgPosts(orgId, boardId, boardName); // refresh list
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, { wide: true });
}

async function manageOrgPostDetail(orgId, boardId, postId) {
  try {
    const data = await apiFetch('/api/orgs', '/' + orgId + '/boards/' + boardId + '/posts/' + postId);
    const post = data.post;
    const comments = data.comments;

    showModal(`📖 게시글 상세보기`, `
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:20px;">
        <h2 style="margin:0 0 12px 0; font-size:1.3rem; color:var(--text-primary); border-bottom:1px solid #333; padding-bottom:12px;">${post.title}</h2>
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted); margin-bottom:20px;">
          <span>작성자: <b>${post.author_name}</b> &nbsp;|&nbsp; 조회수: ${post.views}</span>
          <span>${new Date(post.created_at).toLocaleString()}</span>
        </div>
        <div style="min-height:100px; line-height:1.6; white-space:pre-wrap;">${post.content}</div>
        
        <div style="text-align:right; margin-top:20px; border-top:1px solid #333; padding-top:12px;">
          <button class="btn btn-sm" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);" onclick="deleteOrgPost(${orgId}, ${boardId}, ${postId})">🗑️ 이 글 삭제</button>
        </div>
      </div>

      <div style="background:linear-gradient(135deg,#161616,#111); border:1px solid #2A2A2A; border-radius:12px; padding:16px;">
        <h3 style="margin:0 0 12px 0; font-size:1rem;">💬 댓글 달기</h3>
        <div style="display:flex; gap:8px;">
          <textarea id="ocContent" class="form-control" style="flex:1; height:45px; min-height:45px; resize:none;" placeholder="따뜻한 댓글을 남겨보세요!"></textarea>
          <button class="btn btn-primary" onclick="addOrgComment(${orgId}, ${boardId}, ${postId})" style="white-space:nowrap; padding:0 20px;">등록</button>
        </div>

        <div style="margin-top:20px; border-top:1px solid #333; padding-top:16px;">
          ${comments.map(c => `
            <div style="margin-bottom:12px; border-bottom:1px dashed #333; padding-bottom:12px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.85rem;">
                <b>${c.author_name}</b>
                <div style="display:flex; gap:8px; align-items:center;">
                  <span style="color:var(--text-muted); font-size:0.75rem;">${new Date(c.created_at).toLocaleString()}</span>
                  <button style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.75rem;" onclick="deleteOrgComment(${orgId}, ${boardId}, ${postId}, ${c.id})">삭제</button>
                </div>
              </div>
              <div style="white-space:pre-wrap; font-size:0.95rem;">${c.content}</div>
            </div>
          `).join('')}
          ${comments.length === 0 ? '<div style="color:var(--text-muted); text-align:center; font-size:0.85rem; padding:10px;">첫 댓글을 남겨주세요! 😊</div>' : ''}
        </div>
      </div>
    `, null, { hideConfirm: true, wide: true });
  } catch (e) {
    showToast('게시글을 불러오지 못했습니다.', 'error');
  }
}

async function addOrgComment(orgId, boardId, postId) {
  const content = document.getElementById('ocContent').value.trim();
  if (!content) { showToast('댓글 내용을 작성해주세요.', 'error'); return; }

  try {
    await apiFetch('/api/orgs', '/' + orgId + '/boards/' + boardId + '/posts/' + postId + '/comments', {
      method: 'POST', body: { content }
    });
    showToast('댓글 등록 완료!', 'success');
    manageOrgPostDetail(orgId, boardId, postId); // refresh
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteOrgPost(orgId, boardId, postId) {
  if (!confirm('정말 이 게시글을 삭제하시겠습니까? (관련 댓글도 모두 삭제됩니다)')) return;
  try {
    await apiFetch('/api/orgs', '/' + orgId + '/boards/' + boardId + '/posts/' + postId, { method: 'DELETE' });
    showToast('게시글이 삭제되었습니다.', 'success');
    manageOrgPosts(orgId, boardId, '게시판'); // return to list
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteOrgComment(orgId, boardId, postId, commentId) {
  if (!confirm('이 댓글을 삭제할까요?')) return;
  try {
    await apiFetch('/api/orgs', '/' + orgId + '/boards/' + boardId + '/posts/' + postId + '/comments/' + commentId, { method: 'DELETE' });
    manageOrgPostDetail(orgId, boardId, postId); // refresh post view
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ===== Organization Inventory Management (재고 관리) =====
async function manageOrgInventory(id) {
  try {
    const orgs = await apiFetch('/api/orgs', '/my');
    const org = orgs.find(o => String(o.id) === String(id));
    if (!org) { showToast('단체를 찾을 수 없습니다.', 'error'); return; }

    const items = await apiFetch('/api/orgs', '/' + id + '/inventory');

    showModal(`📦 ${org.name} 물품 재고 관리`, `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:16px;">
        <h2 style="font-size:1.1rem; font-weight:800; color:var(--text-primary); margin:0;">등록된 관리 품목 (${items.length}개)</h2>
        <div style="display:flex; gap:8px;">
           <button class="btn btn-sm btn-outline" style="border-color:#3b82f6; color:#3b82f6;" onclick="showOrgInventoryLogs(${org.id})">🔍 전체 입출고 내역</button>
           <button class="btn btn-sm" style="background:#ec4899; color:#fff; border-color:#ec4899;" onclick="showCreateOrgInventoryItem(${org.id})">+ 새 품목 등록</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; margin-bottom:20px;">
        ${items.map(i => `
          <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:16px; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <span style="font-size:0.75rem; background:rgba(236,72,153,0.1); color:#ec4899; padding:2px 6px; border-radius:4px;">${i.category === 'shuttlecock' ? '셔틀콕' : i.category === 'uniform' ? '유니폼/장비' : i.category === 'equipment' ? '소모품/비품' : '기타'
      }</span>
                <h3 style="margin:8px 0 0 0; font-size:1.1rem; color:var(--text-primary);">${i.name}</h3>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.8rem; color:var(--text-muted);">현재 잔여</div>
                <div style="font-size:1.4rem; font-weight:900; color:${i.current_quantity > 0 ? '#10b981' : '#ef4444'};">${i.current_quantity}<span style="font-size:0.9rem; font-weight:normal; color:var(--text-muted); margin-left:4px;">${i.unit}</span></div>
              </div>
            </div>
            
            <div style="margin-top:16px; display:flex; gap:8px; border-top:1px dashed #333; padding-top:12px;">
              <button class="btn btn-sm" style="flex:1; background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.3);" onclick="showOrgInventoryAdjust(${org.id}, ${i.id}, '${i.name}', 'in')">➕ 입고</button>
              <button class="btn btn-sm" style="flex:1; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);" onclick="showOrgInventoryAdjust(${org.id}, ${i.id}, '${i.name}', 'out')">➖ 사용/출고</button>
            </div>
            <button style="position:absolute; top:16px; right:16px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.8rem;" class="btn btn-sm" onclick="showOrgInventoryLogs(${org.id}, ${i.id})">📋 내역</button>
          </div>
        `).join('')}
        ${items.length === 0 ? '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">등록된 관리 품목이 없습니다.</div>' : ''}
      </div>
    `, null, { hideConfirm: true, wide: true });
  } catch (e) {
    showToast('재고 정보를 불러오지 못했습니다.', 'error');
  }
}

function showCreateOrgInventoryItem(orgId) {
  showModal('✨ 새 품목 등록', `
    <div class="form-group">
      <label>품목 분류</label>
      <select id="oiCategory" class="form-control">
        <option value="shuttlecock">셔틀콕 (타/통)</option>
        <option value="uniform">유니폼/장비</option>
        <option value="equipment">소모품/기타 비품</option>
        <option value="other">기타</option>
      </select>
    </div>
    <div class="form-group">
      <label>품목명 (예: KBB 79 셔틀콕, 2024 단체 유니폼 하의)</label>
      <input type="text" id="oiName" class="form-control">
    </div>
    <div style="display:flex; gap:12px;">
      <div class="form-group" style="flex:2;">
        <label>초기 재고 수량</label>
        <input type="number" id="oiQty" class="form-control" value="0">
      </div>
      <div class="form-group" style="flex:1;">
        <label>단위 (예: 개, 타, 벌)</label>
        <input type="text" id="oiUnit" class="form-control" value="개">
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('oiName').value.trim();
    if (!name) { showToast('품목명을 입력해주세요.', 'error'); return; }

    try {
      await apiFetch('/api/orgs', '/' + orgId + '/inventory', {
        method: 'POST',
        body: {
          name: name,
          category: document.getElementById('oiCategory').value,
          initial_quantity: document.getElementById('oiQty').value || 0,
          unit: document.getElementById('oiUnit').value || '개'
        }
      });
      showToast('새 품목이 등록되었습니다.', 'success');
      manageOrgInventory(orgId); // refresh
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function showOrgInventoryAdjust(orgId, itemId, itemName, logType) {
  const typeText = logType === 'in' ? '입고 (추가)' : '출고 (사용/감소)';
  const typeColor = logType === 'in' ? '#10b981' : '#ef4444';

  showModal(`⚖️ [${itemName}] 수량 ${typeText}`, `
    <div class="form-group">
      <label style="color:${typeColor}; font-weight:bold;">${typeText} 수량</label>
      <input type="number" id="oiaQty" class="form-control" placeholder="변동할 수량을 입력하세요 (양수)">
    </div>
    <div class="form-group">
      <label>변동 일자</label>
      <input type="date" id="oiaDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="form-group">
      <label>메모/사유 (선택)</label>
      <input type="text" id="oiaMemo" class="form-control" placeholder="예: 3월 정기 모임 사용, 추가 구매 등">
    </div>
  `, async () => {
    let qty = parseInt(document.getElementById('oiaQty').value, 10);
    if (!qty || qty <= 0 || isNaN(qty)) { showToast('유효한 수량을 입력해주세요.', 'error'); return; }

    try {
      await apiFetch('/api/orgs', '/' + orgId + '/inventory/' + itemId + '/logs', {
        method: 'POST',
        body: {
          log_type: logType,
          quantity_change: qty,
          log_date: document.getElementById('oiaDate').value,
          memo: document.getElementById('oiaMemo').value
        }
      });
      showToast('재고 변동 내역이 저장되었습니다.', 'success');
      manageOrgInventory(orgId); // refresh
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function showOrgInventoryLogs(orgId, itemId = null) {
  try {
    const urlSuffix = itemId ? `/inventory/logs?item_id=${itemId}` : '/inventory/logs';
    const logs = await apiFetch('/api/orgs', '/' + orgId + urlSuffix);

    showModal(`📑 물품 입출고 내역 ${itemId ? '(선택 품목)' : '(전체)'}`, `
      <div style="margin-bottom:12px; text-align:right;">
        <button class="btn btn-sm" onclick="manageOrgInventory(${orgId})">👈 재고 홈으로</button>
      </div>
      <div style="max-height:60vh; overflow-y:auto;">
        <table class="table" style="width:100%; font-size:0.85rem;">
          <thead style="background:var(--bg-card); position:sticky; top:0;">
            <tr>
              <th style="padding:10px 8px;">일자</th>
              <th style="padding:10px 8px;">품목명</th>
              <th style="padding:10px 8px; text-align:center;">구분</th>
              <th style="padding:10px 8px; text-align:right;">변동량</th>
              <th style="padding:10px 8px; text-align:right;">잔여</th>
              <th style="padding:10px 8px;">사유/메모</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px 8px; color:var(--text-muted);">${new Date(l.log_date).toLocaleDateString()}</td>
                <td style="padding:10px 8px; font-weight:bold;">${l.item_name}</td>
                <td style="padding:10px 8px; text-align:center;">
                  ${l.log_type === 'in' ? '<span style="color:#10b981;">입고</span>' :
        l.log_type === 'out' ? '<span style="color:#ef4444;">출고</span>' :
          '<span style="color:#f97316;">조정</span>'}
                </td>
                <td style="padding:10px 8px; text-align:right; font-weight:bold; color:${l.log_type === 'in' ? '#10b981' : '#ef4444'};">
                  ${l.log_type === 'in' ? '+' : '-'}${l.quantity_change}
                </td>
                <td style="padding:10px 8px; text-align:right;">${l.balance_after}${l.unit}</td>
                <td style="padding:10px 8px; color:var(--text-muted);">${l.memo || '-'}</td>
              </tr>
            `).join('')}
            ${logs.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">조건에 맞는 거래 내역이 없습니다.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `, null, { hideConfirm: true, wide: true });
  } catch (e) {
    showToast('입출고 내역을 불러오지 못했습니다.', 'error');
  }
}

// ===== Tournament Detail =====
function renderTournamentDetail(container) {
  const t = currentTournament;
  container.innerHTML = `
          <div class="header" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:nowrap; gap:12px; padding:10px 16px;">
      <!--좌: 대회명-->
      <div class="header-title" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
        <span class="logo" style="cursor:pointer; flex-shrink:0;" onclick="goHome()">🏸</span>
        <h1 style="font-size:clamp(0.95rem, 3vw, 1.3rem); word-break:keep-all; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0;">${t.name}</h1>
        <span class="badge ${t.status === 'open' ? 'badge-success' : t.status === 'in_progress' ? 'badge-warning' : 'badge-muted'}" style="flex-shrink:0;">${getStatusLabel(t.status)}</span>
      </div>
      <!--우: 버튼 그룹-->
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <button onclick="toggleDarkMode()" id="darkModeBtn" style="background:var(--bg-card); border:1px solid var(--border); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:1.1rem; transition:var(--transition); box-shadow:var(--shadow-sm);">${document.body.classList.contains('dark-mode') ? '☀️' : '🌙'}</button>
          ${!isAuthenticated
      ? '<button class="btn btn-warning" style="font-size:0.82rem; padding:6px 14px; white-space:nowrap;" onclick="showAuthModal()">🔐 관리자 인증</button>'
      : `${venues.length > 0 ? `<select id="venueFilter" onchange="if(window.broadcastEnabled && window.pollMatchesForBroadcast) window.pollMatchesForBroadcast(${t.id})" style="font-size:0.82rem; padding:6px 14px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; color:var(--text-primary);"><option value="">모든 경기장(통합방송)</option>${venues.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}</select>` : ''}
          <span class="badge badge-success" style="white-space:nowrap; padding:6px 12px;">🔓 인증됨</span>
          <button class="btn ` + (window.broadcastEnabled ? 'pulse-border' : '') + `" style="font-size:0.82rem; padding:6px 14px; white-space:nowrap;` + (window.broadcastEnabled ? 'background:rgba(239, 68, 68, 0.1);color:#ef4444;border-color:rgba(239, 68, 68, 0.3)' : '') + `" onclick="if(window.toggleVoiceBroadcast) window.toggleVoiceBroadcast(` + t.id + `, this)">` + (window.broadcastEnabled ? '🔴 방송 중 (ON)' : '🎙️ 방송 켜기 (OFF)') + `</button>`
    }
          <button class="btn" style="font-size:0.82rem; padding:6px 14px; white-space:nowrap;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);"
            onclick="copyJoinLink(${t.id})">📋 참가 링크</button>
          <button class="btn" style="font-size:0.82rem; padding:6px 14px; white-space:nowrap;background:rgba(139,92,246,0.1);color:#8b5cf6;border:1px solid rgba(139,92,246,0.3);"
            onclick="shareResults(${t.id})">📤 결과 공유</button>
          <button class="btn" style="font-size:0.82rem; padding:6px 14px; white-space:nowrap;" onclick="goHome()">← 목록</button>
        </div>

    </div>
          <div class="container">
            <!-- 운영 위자드 (스텝 프로그레스) -->
            <div id="wizardBar" style="display:none; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:16px 20px; margin-bottom:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">📌 대회 운영 가이드</span>
                <button onclick="hideWizard()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.75rem;">숨기기 ✕</button>
              </div>
              <div id="wizardSteps" style="display:flex; gap:4px; flex-wrap:wrap;"></div>
              <div id="wizardHint" style="margin-top:10px; font-size:0.82rem; color:var(--text-muted);"></div>
            </div>
            <div class="tabs" id="mainTabs">
              <button class="tab ${currentTab === 'overview' ? 'active' : ''}" onclick="switchTab('overview')">📊 개요</button>
              <button class="tab ${currentTab === 'participants' ? 'active' : ''}" onclick="switchTab('participants')">👥 참가자</button>
              <button class="tab ${currentTab === 'events' ? 'active' : ''}" onclick="switchTab('events')">🏆 종목/팀</button>
              <button class="tab ${currentTab === 'matches' ? 'active' : ''}" onclick="switchTab('matches')">⚔️ 경기</button>
              <button class="tab ${currentTab === 'schedule' ? 'active' : ''}" onclick="switchTab('schedule')">🕐 시간표</button>
              <button class="tab ${currentTab === 'standings' ? 'active' : ''}" onclick="switchTab('standings')">📈 순위</button>
              <button class="tab ${currentTab === 'members' ? 'active' : ''}" onclick="switchTab('members')">👤 회원DB</button>
              <button class="tab ${currentTab === 'qrscanner' ? 'active' : ''}" onclick="switchTab('qrscanner')">📷 QR 스캐너</button>
              <button class="tab ${currentTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings')">⚙️ 설정</button>
            </div>
            <div id="tabContent"></div>
          </div>
  `;
  renderTabContent();
  updateWizard();
}

function switchTab(tab) {
  if (currentTab === 'qrscanner' && tab !== 'qrscanner') {
    if (html5QrcodeScanner) {
      try { html5QrcodeScanner.clear(); } catch (e) { }
    }
  }
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => { if (t.textContent.includes(getTabIcon(tab))) t.classList.add('active'); });
  renderTabContent();
}

function getTabIcon(tab) {
  return { overview: '📊', participants: '👥', events: '🏆', matches: '⚔️', schedule: '🕐', standings: '📈', members: '👤', qrscanner: '📷', settings: '⚙️' }[tab] || '';
}

async function renderTabContent() {
  const c = document.getElementById('tabContent');
  if (!c) return;
  switch (currentTab) {
    case 'overview': await renderOverview(c); break;
    case 'participants': await renderParticipants(c); break;
    case 'events': await renderEvents(c); break;
    case 'matches': await renderMatches(c); break;
    case 'schedule': await renderScheduleTab(c); break;
    case 'standings': await renderStandings(c); break;
    case 'members': await renderMembersTab(c); break;
    case 'qrscanner': renderQrScanner(c); break;
    case 'settings': await renderSettings(c); break;
  }
}

// ===== 대회 운영 위자드 =====
function updateWizard() {
  const bar = document.getElementById('wizardBar');
  const stepsEl = document.getElementById('wizardSteps');
  const hintEl = document.getElementById('wizardHint');
  if (!bar || !currentTournament) return;

  // 숨기기 설정 확인
  if (localStorage.getItem('mp-wizard-hide-' + currentTournament.id)) { bar.style.display = 'none'; return; }

  const t = currentTournament;
  const hasP = participants.length > 0;
  const hasE = events.length > 0;
  const hasTeams = events.some(e => e.team_count > 0);
  const hasM = matches.length > 0;
  const allDone = hasM && matches.every(m => m.status === 'completed');

  // 대회 완료 시 위자드 자동 숨김
  if (t.status === 'completed' || allDone) { bar.style.display = 'none'; return; }

  const steps = [
    { label: '1. 참가자 등록', done: hasP, tab: 'participants', hint: '👥 참가자 탭에서 선수를 등록하세요. 엑셀 업로드 또는 참가 링크 공유도 가능합니다.' },
    { label: '2. 종목 설정', done: hasE, tab: 'events', hint: '🏆 종목/팀 탭에서 종목을 만드세요. "일괄 생성"으로 자동 매칭도 가능합니다.' },
    { label: '3. 팀 편성', done: hasTeams, tab: 'events', hint: '🏆 종목/팀 탭에서 "자동 배정"을 클릭하면 레벨 밸런싱으로 팀이 편성됩니다.' },
    { label: '4. 대진 생성', done: hasM, tab: 'matches', hint: '⚔️ 경기 탭에서 "대진표 생성"을 클릭하세요.' },
    { label: '5. 경기 진행!', done: allDone, tab: 'matches', hint: '⚔️ 경기 카드에서 점수를 입력하세요. 순위가 자동 계산됩니다.' },
  ];

  // 현재 단계 파악
  let currentStep = steps.findIndex(s => !s.done);
  if (currentStep === -1) currentStep = steps.length;

  stepsEl.innerHTML = steps.map((s, i) => {
    const isDone = s.done;
    const isCurrent = i === currentStep;
    const bg = isDone ? 'rgba(16,185,129,0.15)' : isCurrent ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.05)';
    const color = isDone ? '#10b981' : isCurrent ? '#fb923c' : '#475569';
    const icon = isDone ? '✅' : isCurrent ? '🔵' : '⬜';
    return `<button onclick="switchTab('${s.tab}')" style="flex:1;min-width:100px;padding:8px 10px;border:1px solid ${color}33;border-radius:10px;background:${bg};color:${color};font-size:0.75rem;font-weight:600;cursor:pointer;font-family:inherit;border:none;">
        ${icon} ${s.label}
    </button>`;
  }).join('');

  if (currentStep < steps.length) {
    hintEl.innerHTML = `💡 <strong>다음 단계:</strong> ${steps[currentStep].hint} <button onclick="switchTab('${steps[currentStep].tab}')" style="background:linear-gradient(135deg,#f97316,#8b5cf6);color:#fff;border:none;padding:4px 12px;border-radius:8px;font-size:0.75rem;font-weight:600;cursor:pointer;margin-left:8px;font-family:inherit;">이동 →</button>`;
  } else {
    hintEl.innerHTML = '🎉 모든 준비가 완료되었습니다!';
  }

  bar.style.display = 'block';
}

function hideWizard() {
  if (currentTournament) localStorage.setItem('mp-wizard-hide-' + currentTournament.id, '1');
  const bar = document.getElementById('wizardBar');
  if (bar) bar.style.display = 'none';
}

// ===== 🕐 Schedule Tab (대회 시간표 / 스케줄링) =====
let _scheduleResult = null;

async function renderScheduleTab(container) {
  const t = currentTournament;
  if (!t) return;

  // 기존 설정 불러오기 (종목별 기본값: 배드민턴 15분, 테니스 25분)
  const defaultDuration = (t.sport_type === 'tennis') ? 30 : 15;
  let cfg = { start_time: '09:00', end_time: '18:00', match_duration: defaultDuration, changeover_time: 5, break_start: '12:00', break_end: '13:00', rest_between: 10 };
  try {
    const saved = await api('/' + t.id + '/schedule/settings');
    if (saved && saved.start_time) cfg = saved;
  } catch (e) { }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <!-- 헤더 -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="margin:0; font-size:1.4rem; font-weight:800; color:var(--text-primary);">🕐 대회 시간표 & 스케줄링</h2>
          <p style="margin:4px 0 0; font-size:0.9rem; color:var(--text-muted);">대회 시작·종료 시간을 설정하면 각 경기에 자동으로 시간이 배정됩니다.</p>
        </div>
      </div>

      <!-- 설정 패널 -->
      <div style="background:var(--bg-card); border-radius:16px; padding:24px; border:1px solid var(--border); box-shadow:var(--shadow-sm);">
        <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 16px; display:flex; align-items:center; gap:8px;">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff; font-size:0.9rem;">⚙️</span>
          스케줄 설정
        </h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:16px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🏁 대회 시작 시간</label>
            <input type="time" class="form-control" id="schStart" value="${cfg.start_time}" style="font-size:1rem; font-weight:700; text-align:center;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🏳️ 대회 마감 (희망)</label>
            <input type="time" class="form-control" id="schEnd" value="${cfg.end_time}" style="font-size:1rem; font-weight:700; text-align:center;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">⏱️ 경기당 소요 (분)</label>
            <input type="number" class="form-control" id="schDuration" value="${cfg.match_duration}" min="10" max="60" style="text-align:center; font-weight:700;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🔄 코트 전환 (분)</label>
            <input type="number" class="form-control" id="schChangeover" value="${cfg.changeover_time}" min="0" max="15" style="text-align:center; font-weight:700;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🍽️ 점심 시작</label>
            <div style="display:flex; gap:4px; align-items:center;">
              <input type="time" class="form-control" id="schBreakStart" value="${cfg.break_start}" style="text-align:center; font-weight:700; flex:1;">
              <button type="button" onclick="document.getElementById('schBreakStart').value=''" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:0.8rem; flex-shrink:0;" title="초기화">✕</button>
            </div>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🍽️ 점심 종료</label>
            <div style="display:flex; gap:4px; align-items:center;">
              <input type="time" class="form-control" id="schBreakEnd" value="${cfg.break_end}" style="text-align:center; font-weight:700; flex:1;">
              <button type="button" onclick="document.getElementById('schBreakEnd').value=''" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:0.8rem; flex-shrink:0;" title="초기화">✕</button>
            </div>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">😤 선수 최소 휴식 (분)</label>
            <input type="number" class="form-control" id="schRest" value="${cfg.rest_between}" min="0" max="30" style="text-align:center; font-weight:700;">
          </div>
          <div style="display:flex; align-items:flex-end;">
            <button class="btn btn-primary" onclick="runScheduleSimulation()" style="width:100%; padding:10px; font-weight:800; font-size:0.95rem; border-radius:12px; background:linear-gradient(135deg,#8b5cf6,#6366f1);">
              🧮 시뮬레이션 실행
            </button>
          </div>
        </div>
      </div>

      <!-- 시뮬레이션 결과 영역 -->
      <div id="scheduleResultArea"></div>
    </div>
  `;

  // 이전 결과가 있으면 다시 표시
  if (_scheduleResult) {
    renderScheduleResult(_scheduleResult);
  }
}

async function runScheduleSimulation() {
  const t = currentTournament;
  if (!t) return;

  const params = {
    start_time: document.getElementById('schStart').value,
    end_time: document.getElementById('schEnd').value,
    match_duration: parseInt(document.getElementById('schDuration').value) || 25,
    changeover_time: parseInt(document.getElementById('schChangeover').value) || 5,
    break_start: document.getElementById('schBreakStart').value,
    break_end: document.getElementById('schBreakEnd').value,
    rest_between: parseInt(document.getElementById('schRest').value) || 10
  };

  const area = document.getElementById('scheduleResultArea');
  if (!area) return;
  area.innerHTML = '<div class="loading"><div class="spinner"></div>스케줄을 계산 중입니다...</div>';

  try {
    // 설정 저장
    await api('/' + t.id + '/schedule/settings', { method: 'PUT', body: params });
    // 시뮬레이션 실행
    const result = await api('/' + t.id + '/schedule/simulate', { method: 'POST', body: params });
    _scheduleResult = result;
    renderScheduleResult(result);
  } catch (e) {
    area.innerHTML = `<div style="padding:24px; text-align:center; background:rgba(239,68,68,0.1); border-radius:16px; border:1px solid rgba(239,68,68,0.2);">
      <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
      <div style="font-weight:700; color:#ef4444;">${e.message || '스케줄 계산 중 오류가 발생했습니다.'}</div>
      <p style="color:var(--text-muted); font-size:0.9rem; margin-top:8px;">대진표를 먼저 생성해주세요 (경기 탭 → 대진표 생성)</p>
    </div>`;
  }
}

function renderScheduleResult(result) {
  const area = document.getElementById('scheduleResultArea');
  if (!area || !result) return;

  const { schedule, summary, suggestions } = result;
  if (!schedule || schedule.length === 0) {
    area.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">생성된 스케줄이 없습니다.</div>';
    return;
  }

  const s = summary;

  // 요약 카드
  let html = `
    <!-- 요약 통계 카드 -->
    ${s.ai_optimized ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;"><span style="background:linear-gradient(135deg,#C8FF00,#a0e000);color:#0A0A0A;padding:4px 12px;border-radius:8px;font-size:0.75rem;font-weight:800;">🧠 AI 최적화</span><span style="font-size:0.82rem;color:var(--text-muted);">다중 제약조건 점수 기반 스케줄링 · 경기시간 AI 예측 적용</span></div>' : ''}
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:12px; margin-bottom:24px;">
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#8b5cf6;">${s.total_matches}</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">총 경기</div>
      </div>
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#10b981;">${s.courts}면</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">사용 코트</div>
      </div>
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#f97316;">${s.start}</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">시작</div>
      </div>
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:${s.over_time_matches > 0 ? '#ef4444' : '#10b981'};">${s.estimated_end}</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">예상 종료</div>
      </div>
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#3b82f6;">${s.total_hours}h</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">소요 시간</div>
      </div>
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#6366f1;">${s.utilization_pct}%</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">코트 활용률</div>
      </div>
      ${s.court_balance_pct !== undefined ? `
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:${s.court_balance_pct >= 80 ? '#10b981' : '#f59e0b'};">${s.court_balance_pct}%</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">코트 균형</div>
      </div>` : ''}
      ${s.dual_players > 0 ? `
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#ec4899;">${s.dual_players}명</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">듀얼 출전</div>
      </div>` : ''}
      ${s.finals_in_golden !== undefined ? `
      <div style="background:var(--bg-card); border-radius:14px; padding:16px 12px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:1.8rem; font-weight:900; color:#C8FF00;">🏆 ${s.finals_in_golden}</div>
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">골든타임 결승</div>
      </div>` : ''}
    </div>
  `;

  // AI 분석 & 제안
  if (suggestions && suggestions.length > 0) {
    html += `
      <div style="background:linear-gradient(135deg, rgba(200,255,0,0.06), rgba(200,255,0,0.02)); border-radius:14px; padding:16px 20px; border:1px solid rgba(200,255,0,0.15); margin-bottom:24px;">
        <div style="font-weight:800; font-size:0.95rem; margin-bottom:8px; color:#C8FF00;">🧠 AI 분석 & 제안</div>
        ${suggestions.map(s => `<div style="padding:5px 0; font-size:0.85rem; color:var(--text-secondary);">${s}</div>`).join('')}
      </div>
    `;
  }

  // 액션 버튼
  html += `
    <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="applySchedule()" style="padding:10px 24px; font-weight:800; border-radius:12px; background:linear-gradient(135deg,#10b981,#059669);">
        ✅ 이 스케줄 적용하기
      </button>
      <button class="btn" onclick="toggleScheduleView()" style="padding:10px 24px; font-weight:700; border-radius:12px;">
        🔄 뷰 전환 (코트별/시간순)
      </button>
    </div>
  `;

  // 코트별 간트 차트 뷰
  html += renderScheduleGantt(schedule, summary);

  // 시간순 테이블 뷰
  html += renderScheduleTable(schedule);

  area.innerHTML = html;
}

function renderScheduleGantt(schedule, summary) {
  const courts = summary.courts;
  // 코트별 그룹핑
  const courtMatches = {};
  for (let i = 1; i <= courts; i++) courtMatches[i] = [];
  for (const m of schedule) {
    if (!courtMatches[m.court]) courtMatches[m.court] = [];
    courtMatches[m.court].push(m);
  }

  let html = `<div id="scheduleGanttView" style="background:var(--bg-card); border-radius:16px; padding:20px; border:1px solid var(--border); margin-bottom:24px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h3 style="font-size:1.05rem; font-weight:800; margin:0; color:var(--text-primary);">🏟️ 코트별 타임라인</h3>
      <span style="font-size:0.72rem; color:#C8FF00; background:rgba(200,255,0,0.1); padding:4px 12px; border-radius:8px; font-weight:700; border:1px solid rgba(200,255,0,0.2);">✋ 경기를 드래그해서 코트/순서 변경</span>
    </div>
    <div style="overflow-x:auto;">
  `;

  for (let c = 1; c <= courts; c++) {
    const mList = courtMatches[c] || [];
    html += `
      <div style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:rgba(200,255,0,0.15); color:#C8FF00; font-size:0.75rem; font-weight:800; border:1px solid rgba(200,255,0,0.25);">${c}</span>
          <span style="font-size:0.82rem; font-weight:700; color:var(--text-muted);">${c}코트 (${mList.length}경기)</span>
        </div>
        <div class="gantt-court-lane" data-court="${c}" style="display:flex; gap:4px; overflow-x:auto; padding:6px 4px; min-height:92px; border-radius:10px; border:2px dashed transparent; transition:border-color 0.2s, background 0.2s;">
    `;

    for (const m of mList) {
      const statusColor = m.status === 'completed' ? '#34d399' : m.status === 'playing' ? '#C8FF00' : '#808090';
      const overStyle = m.over_time ? 'border:2px solid #ef4444;' : '';
      const isDraggable = m.status !== 'completed' && m.status !== 'playing';
      const dragAttr = isDraggable ? `draggable="true" ondragstart="onMatchDragStart(event, ${JSON.stringify(m.match_id)}, ${m.court})"` : '';
      const dragCursor = isDraggable ? 'cursor:grab;' : 'cursor:not-allowed; opacity:0.7;';
      html += `
        <div class="gantt-match-card" data-match-id="${m.match_id}" data-court="${m.court}" data-time="${m.scheduled_time}" ${dragAttr}
             style="min-width:120px; max-width:160px; background:${statusColor}12; border-radius:10px; padding:8px 10px; border:1px solid ${statusColor}33; ${overStyle} flex-shrink:0; ${dragCursor} transition:transform 0.15s, box-shadow 0.15s;"
             title="${m.event_name || ''} R${m.round}${isDraggable ? ' — 드래그해서 이동' : ' — 이동 불가'}">
          <div style="font-size:0.72rem; font-weight:800; color:${statusColor}; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
            <span>${m.scheduled_time}</span>
            ${isDraggable ? '<span style="font-size:0.6rem; opacity:0.6;">⠿</span>' : ''}
          </div>
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.team1_name}</div>
          <div style="font-size:0.65rem; color:var(--text-muted); text-align:center; margin:2px 0;">vs</div>
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.team2_name}</div>
          <div style="font-size:0.65rem; color:${statusColor}; margin-top:4px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.event_name || ''}</div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  html += '</div></div>';
  return html;
}

// ── 드래그앤드롭 핸들러 ──────────────────────────────────────
let _dragMatchId = null;
let _dragFromCourt = null;

function onMatchDragStart(e, matchId, fromCourt) {
  _dragMatchId = matchId;
  _dragFromCourt = fromCourt;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', matchId);
  e.target.style.opacity = '0.4';
  e.target.style.transform = 'scale(0.95)';

  // 모든 레인에 드롭 가능 표시
  setTimeout(() => {
    document.querySelectorAll('.gantt-court-lane').forEach(lane => {
      const lc = parseInt(lane.dataset.court);
      if (lc !== fromCourt) {
        lane.style.borderColor = 'rgba(200,255,0,0.4)';
        lane.style.background = 'rgba(200,255,0,0.03)';
      }
    });
  }, 0);
}

// 전역 드래그 이벤트
document.addEventListener('dragover', function (e) {
  const lane = e.target.closest('.gantt-court-lane');
  if (lane) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lane.style.borderColor = '#C8FF00';
    lane.style.background = 'rgba(200,255,0,0.08)';
  }
});

document.addEventListener('dragleave', function (e) {
  const lane = e.target.closest('.gantt-court-lane');
  if (lane) {
    const toCourt = parseInt(lane.dataset.court);
    if (toCourt !== _dragFromCourt) {
      lane.style.borderColor = 'rgba(200,255,0,0.4)';
      lane.style.background = 'rgba(200,255,0,0.03)';
    } else {
      lane.style.borderColor = 'transparent';
      lane.style.background = 'transparent';
    }
  }
});

document.addEventListener('drop', function (e) {
  e.preventDefault();
  const lane = e.target.closest('.gantt-court-lane');
  if (!lane || !_dragMatchId) return;

  const toCourt = parseInt(lane.dataset.court);
  handleMatchDrop(_dragMatchId, _dragFromCourt, toCourt);

  // 스타일 리셋
  resetDragStyles();
});

document.addEventListener('dragend', function (e) {
  resetDragStyles();
  if (e.target.classList && e.target.classList.contains('gantt-match-card')) {
    e.target.style.opacity = '1';
    e.target.style.transform = 'scale(1)';
  }
});

function resetDragStyles() {
  document.querySelectorAll('.gantt-court-lane').forEach(lane => {
    lane.style.borderColor = 'transparent';
    lane.style.background = 'transparent';
  });
  _dragMatchId = null;
  _dragFromCourt = null;
}

async function handleMatchDrop(matchId, fromCourt, toCourt) {
  if (fromCourt === toCourt) return;

  // _scheduleResult가 있으면 (시뮬레이션 미적용 상태) 로컬에서 변경
  if (_scheduleResult && _scheduleResult.schedule) {
    const match = _scheduleResult.schedule.find(m => m.match_id === matchId);
    if (match) {
      const oldCourt = match.court;
      match.court = toCourt;

      // 시간 재조정: 대상 코트의 마지막 경기 이후로
      const targetCourtMatches = _scheduleResult.schedule
        .filter(m => m.court === toCourt && m.match_id !== matchId)
        .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

      if (targetCourtMatches.length > 0) {
        const lastMatch = targetCourtMatches[targetCourtMatches.length - 1];
        const slotMin = _scheduleResult.summary.slot_minutes || 20;
        const [hh, mm] = lastMatch.scheduled_time.split(':').map(Number);
        const newMinutes = hh * 60 + mm + slotMin;
        const nh = Math.floor(newMinutes / 60);
        const nm = newMinutes % 60;
        match.scheduled_time = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      }

      showToast(`경기를 ${oldCourt}코트 → ${toCourt}코트로 이동했습니다. (${match.scheduled_time})`, 'success');
      renderScheduleResult(_scheduleResult);
      return;
    }
  }

  // DB에 이미 적용된 경기인 경우 API 호출
  try {
    const res = await api('/' + currentTournament.id + '/schedule/match/' + matchId, {
      method: 'PATCH',
      body: { court_number: toCourt }
    });
    if (res.success) {
      showToast(`경기를 ${fromCourt}코트 → ${toCourt}코트로 이동했습니다.`, 'success');
      // 탭 새로고침
      if (typeof loadScheduleTab === 'function') loadScheduleTab();
    }
  } catch (err) {
    showToast('경기 이동 실패: ' + (err.message || err), 'error');
  }
}

function renderScheduleTable(schedule) {
  let html = `<div id="scheduleTableView" style="background:var(--bg-card); border-radius:16px; padding:20px; border:1px solid var(--border); display:none;">
    <h3 style="font-size:1.05rem; font-weight:800; margin:0 0 16px; color:var(--text-primary);">📋 시간순 전체 경기 목록</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
        <thead>
          <tr style="background:var(--bg-main);">
            <th style="padding:10px 12px; text-align:left; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);">시간</th>
            <th style="padding:10px 12px; text-align:center; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);">코트</th>
            <th style="padding:10px 12px; text-align:left; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);">종목</th>
            <th style="padding:10px 12px; text-align:left; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);">팀1</th>
            <th style="padding:10px 12px; text-align:center; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);"></th>
            <th style="padding:10px 12px; text-align:left; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);">팀2</th>
            <th style="padding:10px 12px; text-align:center; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border);">상태</th>
          </tr>
        </thead>
        <tbody>
  `;

  let lastTime = '';
  for (const m of schedule) {
    const isNewTime = m.scheduled_time !== lastTime;
    lastTime = m.scheduled_time;
    const statusBadge = m.status === 'completed' ? '<span class="badge badge-success">완료</span>' :
      m.status === 'playing' ? '<span class="badge badge-warning">진행</span>' :
        '<span class="badge badge-muted">예정</span>';
    const rowBg = m.over_time ? 'background:rgba(239,68,68,0.06);' : (isNewTime ? 'border-top:2px solid var(--border);' : '');

    html += `
      <tr style="${rowBg}">
        <td style="padding:8px 12px; font-weight:${isNewTime ? '800' : '500'}; color:${isNewTime ? 'var(--text-primary)' : 'var(--text-muted)'}; border-bottom:1px solid var(--border); white-space:nowrap;">
          ${isNewTime ? '🕐 ' + m.scheduled_time : ''}
          ${m.over_time ? '<span style="color:#ef4444; font-size:0.72rem; font-weight:800;"> ⚠️초과</span>' : ''}
        </td>
        <td style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--border);">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; border-radius:6px; background:rgba(200,255,0,0.15); color:#C8FF00; font-size:0.72rem; font-weight:800; text-align:center; border:1px solid rgba(200,255,0,0.25);">${m.court}</span>
        </td>
        <td style="padding:8px 12px; font-size:0.78rem; color:var(--text-muted); font-weight:600; border-bottom:1px solid var(--border); max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.event_name || ''}</td>
        <td style="padding:8px 12px; font-weight:700; color:var(--text-primary); border-bottom:1px solid var(--border); white-space:nowrap;">${m.team1_name}</td>
        <td style="padding:8px 12px; text-align:center; color:var(--text-muted); font-size:0.78rem; border-bottom:1px solid var(--border);">vs</td>
        <td style="padding:8px 12px; font-weight:700; color:var(--text-primary); border-bottom:1px solid var(--border); white-space:nowrap;">${m.team2_name}</td>
        <td style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--border);">${statusBadge}</td>
      </tr>
    `;
  }

  html += '</tbody></table></div></div>';
  return html;
}

function toggleScheduleView() {
  const gantt = document.getElementById('scheduleGanttView');
  const table = document.getElementById('scheduleTableView');
  if (!gantt || !table) return;
  if (gantt.style.display === 'none') {
    gantt.style.display = 'block';
    table.style.display = 'none';
  } else {
    gantt.style.display = 'none';
    table.style.display = 'block';
  }
}

async function applySchedule() {
  if (!_scheduleResult || !_scheduleResult.schedule) {
    showToast('먼저 시뮬레이션을 실행해주세요.', 'error');
    return;
  }

  if (!confirm(`총 ${_scheduleResult.schedule.length}경기에 시간을 배정합니다.\n기존 코트 배정도 변경됩니다.\n\n적용하시겠습니까?`)) return;

  try {
    await api('/' + currentTournament.id + '/schedule/apply', {
      method: 'POST',
      body: { schedule: _scheduleResult.schedule }
    });
    showToast(`✅ ${_scheduleResult.schedule.length}경기에 시간표가 적용되었습니다!`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function goHome() {
  currentTournament = null;
  currentTab = 'overview';
  if (html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
  document.documentElement.style.removeProperty('--primary');

  if (window.currentTenantSlug) {
    location.href = '/org/' + window.currentTenantSlug;
    return;
  }

  const url = new URL(location);
  url.searchParams.delete('tid');
  history.pushState(null, '', url);
  renderApp();
}

// ===== Auth Modal =====
function showAuthModal() {
  showModal('관리자 인증', `
        <div class="form-group"><label>비밀번호</label><input class="form-control" id="authPwd" type="password" placeholder="관리자 비밀번호"></div>
  `, async () => {
    const pwd = document.getElementById('authPwd').value;
    const res = await api('/' + currentTournament.id + '/auth', { method: 'POST', body: { password: pwd } });
    if (res.authenticated) {
      isAuthenticated = true;
      showToast('인증 성공');
      closeModal();
      renderApp();
    }
  });

  setTimeout(() => {
    const pwdInput = document.getElementById('authPwd');
    if (pwdInput) {
      pwdInput.focus();
      pwdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('modalConfirm')?.click();
        }
      });
    }
  }, 100);
}

// ===== Overview Tab =====
async function renderOverview(c) {
  c.innerHTML = '<div class="loading"><div class="spinner"></div>통계 로딩중...</div>';
  try {
    const stats = await api('/' + currentTournament.id + '/stats');
    const p = stats.participants || {};
    c.innerHTML = `
          <div class="grid-4 overview-grid" style = "margin-bottom:20px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
        <div class="stat-card" style="padding:16px 12px;"><div class="stat-value emerald" style="font-size:1.8rem;">${p.total || 0}</div><div class="stat-label">참가자</div></div>
        <div class="stat-card" style="padding:16px 12px;"><div class="stat-value cyan" style="font-size:1.8rem;">${p.male || 0} / ${p.female || 0}</div><div class="stat-label">남 / 여</div></div>
        <div class="stat-card" style="padding:16px 12px;"><div class="stat-value amber" style="font-size:1.8rem;">${stats.events || 0}</div><div class="stat-label">종목</div></div>
        <div class="stat-card" style="padding:16px 12px;"><div class="stat-value red" style="font-size:1.8rem;">${stats.matches?.total || 0}</div><div class="stat-label">경기</div></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">경기 현황</div>
          <div style="margin-top:12px; display:flex; align-items:center; gap:20px;">
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:0.9rem">
                <span>진행중: <strong style="color:#3b82f6">${stats.matches?.playing || 0}</strong></span>
                <span>완료: <strong style="color:#10b981">${stats.matches?.completed || 0}</strong> / ${stats.matches?.total || 0}</span>
              </div>
              <div style="width:100%;height:10px;background:rgba(255,255,255,0.1);border-radius:5px;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,0.5);">
                <div style="width:${stats.matches?.total ? Math.round(stats.matches.completed / stats.matches.total * 100) : 0}%;height:100%;background:linear-gradient(90deg,#10b981,#06b6d4);border-radius:5px"></div>
              </div>
            </div>
            <div style="width:100px;height:100px;flex-shrink:0;">
              <canvas id="overviewChart"></canvas>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
             <span>수납 현황 및 체크인</span>
             ${currentTournament.use_payment
        ? '<span style="font-size:0.8rem; background:rgba(139,92,246,0.2); color:#c4b5fd; padding:3px 8px; border-radius:12px;">온라인 결제(Toss) 🟢</span>'
        : '<span style="font-size:0.8rem; background:rgba(255,255,255,0.1); color:#94a3b8; padding:3px 8px; border-radius:12px;">오프라인 결제 ⚪</span>'
      }
          </div>
          <div style="margin-top:16px;">
            ${currentTournament.use_payment ? `
              <div style="font-size:1.8rem; font-weight:800; color:#10b981; margin-bottom:8px;">₩ ${(p.total_revenue || 0).toLocaleString()} <span style="font-size:1rem; color:#64748b; font-weight:500;">총 수익금</span></div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.9rem; margin-bottom:12px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
                 <div>💳 온라인 결제 완료: <strong style="color:#f97316">${p.toss_paid_count || 0}명</strong></div>
                 <div>⏳ 결제 대기중: <strong style="color:#cbd5e1">${p.toss_pending_count || 0}명</strong></div>
              </div>
            ` : `
              <div style="font-size:0.95rem; margin-bottom:12px; opacity:0.8;">💰 현장 수납: <strong style="color:#f59e0b">${p.paid_count || 0}</strong> / ${p.total || 0}</div>
            `}
            <div style="font-size:0.95rem;">✅ QR 체크인 (현장 출석): <strong style="color:#0ea5e9">${p.checkedin_count || 0}</strong> / ${p.total || 0}</div>
          </div>
        </div>
      </div>
      <div class="quick-links" style="margin-top:20px">
        <a class="quick-link" href="/dashboard?tid=${currentTournament.id}"><span class="icon">📊</span>대시보드</a>
        <a class="quick-link" href="/court?tid=${currentTournament.id}"><span class="icon">🏟️</span>대형 코트 현황판</a>
        <a class="quick-link" href="/my?tid=${currentTournament.id}"><span class="icon">👤</span>내 경기</a>
        <a class="quick-link" href="/timeline?tid=${currentTournament.id}"><span class="icon">📅</span>타임라인</a>
        <a class="quick-link" href="/print?tid=${currentTournament.id}"><span class="icon">🖨️</span>인쇄 센터</a>
        <a class="quick-link" href="#" onclick="event.preventDefault();showTournamentReport(${currentTournament.id})"><span class="icon">📈</span>통계 리포트</a>
      </div>
    `;

    setTimeout(() => {
      const pending = Math.max(0, (stats.matches?.total || 0) - (stats.matches?.completed || 0) - (stats.matches?.playing || 0));
      if (window.overviewChartInstance) window.overviewChartInstance.destroy();
      const ctx = document.getElementById('overviewChart');
      if (ctx && typeof Chart !== 'undefined') {
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Pretendard', sans-serif";
        window.overviewChartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['완료', '진행중', '대기'],
            datasets: [{
              data: [stats.matches?.completed || 0, stats.matches?.playing || 0, pending],
              backgroundColor: ['#10b981', '#3b82f6', '#475569'],
              borderWidth: 0,
              cutout: '75%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
            }
          }
        });
      }
    }, 100);

  } catch (e) {
    c.innerHTML = `
          <div class="empty-state">
        <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(239,68,68,0.15)); animation:floatIcon 3s ease-in-out infinite;">⚠️</div>
        <h3 style="font-size:1.3rem; margin-bottom:12px;">통계를 불러오지 못했습니다</h3>
        <p style="font-size:1.05rem; margin-bottom:24px;">서버와의 통신이 원활하지 않거나<br>데이터가 아직 충분하지 않습니다.</p>
        <button class="btn btn-primary" onclick="switchTab('overview')">새로고침 🔄</button>
      </div> `;
  }
}

// ===== Participants Tab =====
async function renderParticipants(c) {
  c.innerHTML = '<div class="loading"><div class="spinner"></div>참가자 로딩중...</div>';
  participants = await api('/' + currentTournament.id + '/participants');

  const byClub = {};
  participants.forEach(p => {
    const club = p.club || '소속없음';
    if (!byClub[club]) byClub[club] = [];
    byClub[club].push(p);
  });

  // Age group stats
  const ageGroups = {};
  participants.forEach(p => {
    const age = getAgeGroup(p.birth_year);
    ageGroups[age] = (ageGroups[age] || 0) + 1;
  });

  if (participants.length === 0) {
    c.innerHTML = `
          <div class="card-header" style = "justify-content: flex-end;">
          <div class="btn-group">
            ${isAuthenticated ? '<button class="btn btn-primary btn-sm" onclick="showAddParticipant()">+ 개별 등록</button><button class="btn btn-sm" onclick="showBulkRegister()">📋 일괄 등록</button><button class="btn btn-sm btn-danger" style="background:#fee2e2;color:#ef4444;border-color:#fca5a5" onclick="deleteAllParticipants()">🗑️ 참가자 일괄삭제</button>' : ''}
          </div>
      </div>
          <div class="empty-state">
            <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(249,115,22,0.15)); animation:floatIcon 3s ease-in-out infinite;">👥</div>
            <h3 style="font-size:1.3rem; margin-bottom:12px;">아직 등록된 참가자가 없습니다</h3>
            <p style="font-size:1.05rem; margin-bottom:24px;">대회를 운영하려면 먼저 참가 선수를 등록해주세요.<br>엑셀을 사용해 일괄 등록하면 편리합니다.</p>
            <div style="display:flex; gap:12px; justify-content:center;">
              <button class="btn btn-primary" onclick="showAddParticipant()">+ 개별 등록</button>
              <button class="btn" style="background:#fff; border:1px solid var(--border);" onclick="showBulkRegister()">📋 엑셀 일괄 등록</button>
            </div>
          </div>
    `;
    return;
  }

  const clubs = Object.keys(byClub).sort((a, b) => byClub[b].length - byClub[a].length);

  c.innerHTML = `
          <div class="card-header" style = "flex-wrap: wrap; gap:12px;">
      <div>
        <span id="participants-count" style="font-size:0.85rem;color:var(--text-secondary); font-weight:bold;">총 ${participants.length}명 (남 ${participants.filter(p => p.gender === 'm').length} / 여 ${participants.filter(p => p.gender === 'f').length})</span>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">
          ${Object.entries(ageGroups).map(([a, n]) => a + ': ' + n + '명').join(' | ')}
        </div>
      </div>
      <div class="btn-group">
        ${isAuthenticated ? '<button class="btn btn-primary btn-sm" onclick="showAddParticipant()">+ 개별 등록</button><button class="btn btn-sm" onclick="showBulkRegister()">📋 일괄 등록</button><button class="btn btn-sm btn-danger" style="background:#fee2e2;color:#ef4444;border-color:#fca5a5" onclick="deleteAllParticipants()">🗑️ 참가자 일괄삭제</button>' : ''}
      </div>
    </div>

    <div style="background:var(--bg-card); padding:16px; border-bottom:1px solid var(--border); font-size:0.8rem;">
      <div style="font-weight:700; margin-bottom:12px; color:var(--text); font-size:0.9rem;">🏆 클럽별 참가 현황</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${clubs.map(club => `<span class="badge" style="background:rgba(59, 130, 246, 0.1); color:var(--primary); font-size:0.75rem; padding:4px 8px;">${club === '소속없음' ? '기타/소속없음' : club} <strong style="margin-left:4px; font-size:0.85rem;">${byClub[club].length}</strong></span>`).join('')}
      </div>
    </div>

    <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; gap:8px; flex-wrap:wrap; align-items:center; background:var(--bg-card);">
       <input type="text" id="searchQuery" class="form-control" style="width:140px; padding:6px 12px; font-size:0.8rem;" placeholder="이름/연락처 검색" oninput="filterParticipantsTable()">
       <select id="searchClub" class="form-control" style="width:auto; padding:6px 12px; font-size:0.8rem;" onchange="filterParticipantsTable()">
          <option value="">모든 소속</option>
          ${clubs.map(club => `<option value="${club === '소속없음' ? '' : club}">${club}</option>`).join('')}
       </select>
       <select id="searchLevel" class="form-control" style="width:auto; padding:6px 12px; font-size:0.8rem;" onchange="filterParticipantsTable()">
          <option value="">모든 출전부/급수</option>
          ${currentTournament.sport_type === 'tennis' ? `
            <option value="신인부">신인부</option>
            <option value="오픈부">오픈부</option>
            <option value="개나리부">개나리부</option>
            <option value="국화부">국화부</option>
            <option value="베테랑부">베테랑부</option>
            <option value="테린이">테린이</option>
          ` : `
            <option value="s">S급</option>
            <option value="a">A급</option>
            <option value="b">B급</option>
            <option value="c">C급</option>
            <option value="d">D급</option>
            <option value="e">E급</option>
          `}
       </select>
       <select id="searchGender" class="form-control" style="width:auto; padding:6px 12px; font-size:0.8rem;" onchange="filterParticipantsTable()">
          <option value="">모든 성별</option>
          <option value="m">👨 남</option>
          <option value="f">👩 여</option>
       </select>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead><tr><th>이름</th><th>성별</th><th>출생</th><th>연령/구력</th><th>${currentTournament.sport_type === 'tennis' ? '출전부' : '급수'}</th><th>소속</th><th>연락처</th><th>희망파트너</th><th>체크인</th>${isAuthenticated ? '<th>관리</th>' : ''}</tr></thead>
        <tbody id="participants-tbody">
        </tbody>
      </table>
    </div>
  `;

  filterParticipantsTable();
}

function filterParticipantsTable() {
  const q = (document.getElementById('searchQuery')?.value || '').toLowerCase();
  const c = document.getElementById('searchClub')?.value || '';
  const l = document.getElementById('searchLevel')?.value || '';
  const g = document.getElementById('searchGender')?.value || '';

  const tbody = document.getElementById('participants-tbody');
  if (!tbody) return;

  const filtered = participants.filter(p => {
    if (q && !p.name.toLowerCase().includes(q) && !(p.phone || '').includes(q)) return false;
    if (c && (p.club || '') !== c) return false;
    if (l && p.level !== l) return false;
    if (g && p.gender !== g) return false;
    return true;
  });

  document.getElementById('participants-count').innerText =
    `검색결과: ${filtered.length}명(남 ${filtered.filter(p => p.gender === 'm').length} / 여 ${filtered.filter(p => p.gender === 'f').length})`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--text-muted)">검색 결과가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => `<tr>
    <td><strong>${p.name}</strong></td>
    <td>${p.gender === 'm' ? '👨 남' : '👩 여'}</td>
    <td>${p.birth_year}</td>
    <td><span class="badge badge-info">${getAgeGroup(p.birth_year)}</span></td>
    <td><span class="badge badge-level-${p.level}">${p.level.toUpperCase()}</span></td>
    <td>${p.club || '-'}</td>
    <td style="font-size:0.8rem">${p.phone || '-'}</td>
    <td><span class="badge" style="background:var(--bg-card); color:var(--text); border:1px solid #e2e8f0">${p.partner || '-'}</span></td>
    <td><button class="btn btn-sm ${p.checked_in ? 'btn-primary' : ''}" onclick="toggleCheckin(${p.id})" ${!isAuthenticated ? 'disabled' : ''}>${p.checked_in ? '✅' : '☐'}</button></td>
    ${isAuthenticated ? `
      <td>
        <button class="btn btn-sm btn-primary" style="padding:4px 8px" onclick="showEditParticipant(${p.id})">수정</button>
        <button class="btn btn-sm btn-danger" style="padding:4px 8px" onclick="deleteParticipant(${p.id})">삭제</button>
      </td>
    ` : ''}
  </tr> `).join('');
}

function getAgeGroup(birthYear) {
  const age = 2026 - birthYear;
  if (age >= 60) return '60대';
  if (age >= 55) return '55대';
  if (age >= 50) return '50대';
  if (age >= 40) return '40대';
  if (age >= 30) return '30대';
  if (age >= 20) return '20대';
  return '오픈';
}

function showAddParticipant() {
  const isTennis = currentTournament && currentTournament.sport_type === 'tennis';
  const levelSelectStr = isTennis
    ? '<input class="form-control" id="pLevel" value="신인부" placeholder="오픈/신인/개나리 등">'
    : '<select class="form-control" id="pLevel"><option value="s">S</option><option value="a">A</option><option value="b" selected>B</option><option value="c">C</option><option value="d">D</option><option value="e">E</option></select>';

  showModal('참가자 등록', `
        <div class="form-row"><div class="form-group"><label>이름 *</label><input class="form-control" id="pName"></div><div class="form-group"><label>연락처</label><input class="form-control" id="pPhone"></div></div>
    <div class="form-row-3">
      <div class="form-group"><label>성별 *</label><select class="form-control" id="pGender"><option value="m">남</option><option value="f">여</option></select></div>
      <div class="form-group"><label>출생년도 *</label><input class="form-control" id="pBirth" type="number" placeholder="1970"></div>
      <div class="form-group"><label>${isTennis ? '출전부 *' : '급수 *'}</label>${levelSelectStr}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>소속 클럽</label><input class="form-control" id="pClub"></div>
      <div class="form-group"><label>혼복 참가</label><select class="form-control" id="pMixed"><option value="0">미참가</option><option value="1">참가</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>희망 파트너 (선택)</label><input class="form-control" id="pPartner" placeholder="팀 자동 배정시 우선 매칭됩니다."></div>
    </div>
      `, async () => {
    await api('/' + currentTournament.id + '/participants', {
      method: 'POST', body: {
        name: document.getElementById('pName').value,
        phone: document.getElementById('pPhone').value,
        gender: document.getElementById('pGender').value,
        birth_year: parseInt(document.getElementById('pBirth').value),
        level: document.getElementById('pLevel').value,
        club: document.getElementById('pClub').value,
        wants_mixed: parseInt(document.getElementById('pMixed').value),
        partner: document.getElementById('pPartner').value
      }
    });
    showToast('참가자가 등록되었습니다');
    closeModal();
    renderTabContent();
    renderTabContent();
  });
}

function showEditParticipant(pid) {
  const p = participants.find(x => x.id === pid);
  if (!p) return;

  const isTennis = currentTournament && currentTournament.sport_type === 'tennis';
  const levelSelectStr = isTennis
    ? '<input class="form-control" id="pLevel" value="' + (p.level || '') + '">'
    : '<select class="form-control" id="pLevel">' +
    '<option value="s" ' + (p.level === 's' ? 'selected' : '') + '>S</option>' +
    '<option value="a" ' + (p.level === 'a' ? 'selected' : '') + '>A</option>' +
    '<option value="b" ' + (p.level === 'b' ? 'selected' : '') + '>B</option>' +
    '<option value="c" ' + (p.level === 'c' ? 'selected' : '') + '>C</option>' +
    '<option value="d" ' + (p.level === 'd' ? 'selected' : '') + '>D</option>' +
    '<option value="e" ' + (p.level === 'e' ? 'selected' : '') + '>E</option>' +
    '</select>';

  showModal('참가자 수정', `
        <div class="form-row"><div class="form-group"><label>이름 *</label><input class="form-control" id="pName" value="${p.name}"></div><div class="form-group"><label>연락처</label><input class="form-control" id="pPhone" value="${p.phone || ''}"></div></div>
    <div class="form-row-3">
      <div class="form-group"><label>성별 *</label><select class="form-control" id="pGender">
        <option value="m" ${p.gender === 'm' ? 'selected' : ''}>남</option>
        <option value="f" ${p.gender === 'f' ? 'selected' : ''}>여</option>
      </select></div>
      <div class="form-group"><label>출생년도 *</label><input class="form-control" id="pBirth" type="number" value="${p.birth_year}"></div>
      <div class="form-group"><label>${isTennis ? '출전부 *' : '급수 *'}</label>${levelSelectStr}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>소속 클럽</label><input class="form-control" id="pClub" value="${p.club || ''}"></div>
      <div class="form-group"><label>혼복 참가</label><select class="form-control" id="pMixed">
        <option value="0" ${!p.wants_mixed ? 'selected' : ''}>미참가</option>
        <option value="1" ${p.wants_mixed ? 'selected' : ''}>참가</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>희망 파트너 (선택)</label><input class="form-control" id="pPartner" value="${p.partner || ''}" placeholder="우선 매칭됩니다."></div>
    </div>
      `, async () => {
    await api('/' + currentTournament.id + '/participants/' + pid, {
      method: 'PUT', body: {
        name: document.getElementById('pName').value,
        phone: document.getElementById('pPhone').value,
        gender: document.getElementById('pGender').value,
        birth_year: parseInt(document.getElementById('pBirth').value),
        level: document.getElementById('pLevel').value,
        club: document.getElementById('pClub').value,
        wants_mixed: parseInt(document.getElementById('pMixed').value),
        partner: document.getElementById('pPartner').value
      }
    });
    showToast('참가자 정보가 수정되었습니다');
    closeModal();
    renderTabContent();
  });
}

function showBulkRegister() {
  const isTennis = currentTournament && currentTournament.sport_type === 'tennis';
  showModal('일괄 등록', `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px; gap:12px;">
      <p style="font-size:0.85rem;color:var(--text-secondary);margin:0;line-height:1.4;">
        형식: 이름, 성별(m/f), 출생년도, ${isTennis ? '출전부(신인부등)' : '급수(s/a/b/c/d/e)'}, 연락처, 클럽, 혼복(0/1), 희망파트너(선명)<br>
        직접 입력(탭/쉼표 구분)하거나 <b>엑셀 파일</b>을 업로드하세요.
      </p>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-sm" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; white-space:nowrap; padding:8px 12px; font-weight:700;" onclick="downloadExcelTemplate()">📥 양식 받기</button>
        <input type="file" id="excelFile" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleExcelUpload(event)">
        <button class="btn btn-warning btn-sm" onclick="document.getElementById('excelFile').click()" style="white-space:nowrap; padding:8px 16px; font-weight:700;">엑셀 업로드 📊</button>
      </div>
    </div>
        <div class="form-group"><label>참가자 데이터</label><textarea class="form-control" id="bulkData" rows="10" placeholder="김철수,m,1970,a,010-1111-2222,안양클럽,1,이영희"></textarea></div>
      `, async () => {
    const data = document.getElementById('bulkData').value;
    const result = await api('/' + currentTournament.id + '/participants/bulk', { method: 'POST', body: { data } });
    showToast(`${result.inserted}명 등록 완료` + (result.errors?.length ? `, ${result.errors.length}건 오류` : ''));
    closeModal();
    renderTabContent();
  });
}

function downloadExcelTemplate() {
  const isTennis = currentTournament && currentTournament.sport_type === 'tennis';
  const headers = isTennis
    ? ['이름(필수)', '성별(남/여)', '출생(4자리)', '출전부(신인/오픈/개나리 등)', '연락처', '소속클럽', '비고/혼복여부(참가/미참가)', '희망파트너(선택)']
    : ['이름(필수)', '성별(남/여)', '출생년도(4자리)', '급수(S/A/B/C/D/E)', '연락처', '소속클럽', '혼복참가(참가/미참가)', '희망파트너(선택)'];

  const sampleRow1 = isTennis ? ['김테니스', '남', '1985', '신인부', '010-1234-5678', '테니스홀릭', '참가', '이서브'] : ['김철수', '남', '1980', 'C', '010-1234-5678', '안양클럽', '참가', '홍길동'];
  const sampleRow2 = isTennis ? ['박발리', '여', '1990', '개나리부', '010-9876-5432', '스매시클럽', '미참가', ''] : ['이영희', '여', '1992', 'D', '010-9876-5432', '스매시클럽', '미참가', ''];

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2]);

  // 컬럼 너비 설정
  const wscols = [
    { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
  ];
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "참가자명단_양식");

  XLSX.writeFile(wb, "대회_참가자_일괄등록_양식.xlsx");
}

function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      let workbook;

      // CSV 파일인 경우 한글 깨짐 방지 (UTF-8 시도 후 EUC-KR 폴백)
      if (file.name.toLowerCase().endsWith('.csv')) {
        let text = '';
        try {
          // strict UTF-8 디코딩 시도
          text = new TextDecoder('utf-8', { fatal: true }).decode(data);
        } catch (err) {
          // UTF-8이 아니면 EUC-KR(CP949)로 디코딩
          text = new TextDecoder('euc-kr').decode(data);
        }
        workbook = XLSX.read(text, { type: 'string' });
      } else {
        // 일반 엑셀 파일 (.xlsx, .xls)
        workbook = XLSX.read(data, { type: 'array' });
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (jsa.length < 2) {
        showToast('데이터가 부족합니다 (헤더 포함 최소 2줄 이상 필요)', 'error');
        return;
      }

      let headerRowIdx = 0;
      let headers = jsa[0].map(h => (h || '').toString().toLowerCase().replace(/\s/g, ''));

      // Try to find a header row
      for (let i = 0; i < Math.min(5, jsa.length); i++) {
        const rowStr = jsa[i].join('').toLowerCase();
        if (rowStr.includes('이름') || rowStr.includes('성명') || rowStr.includes('name')) {
          headerRowIdx = i;
          headers = jsa[i].map(h => (h || '').toString().toLowerCase().replace(/\s/g, ''));
          break;
        }
      }

      // Column mapping
      const getColIdx = (arr) => headers.findIndex(h => arr.some(keyword => h.includes(keyword)));

      const colName = getColIdx(['이름', '성명', 'name']);
      const colGender = getColIdx(['성별', '성', 'gender']);
      const colBirth = getColIdx(['출생', '생년', '년도', 'birth']);
      const colLevel = getColIdx(['급수', '등급', 'level']);
      const colPhone = getColIdx(['연락처', '전화', '번호', 'phone']);
      const colClub = getColIdx(['소속', '클럽', '팀', 'club']);
      const colMixed = getColIdx(['혼복', '혼합', 'mixed']);
      const colPartner = getColIdx(['희망', '파트너', 'partner']);

      let parsedLines = [];
      for (let i = headerRowIdx + 1; i < jsa.length; i++) {
        const row = jsa[i];
        if (!row || row.length === 0) continue;

        let name = colName >= 0 ? row[colName] : row[0];
        if (!name) continue;

        let rGender = colGender >= 0 ? row[colGender] : row[1];
        rGender = (rGender || 'm').toString().toLowerCase();
        let gender = (rGender.includes('여') || rGender === 'f' || rGender === 'female') ? 'f' : 'm';

        let rBirth = colBirth >= 0 ? row[colBirth] : row[2];
        rBirth = (rBirth || '1980').toString().replace(/[^0-9]/g, '');
        let birth = rBirth.length >= 4 ? parseInt(rBirth.substring(0, 4)) : parseInt(rBirth);
        if (isNaN(birth) || birth < 1920 || birth > 2026) birth = 1980;

        let rLevel = colLevel >= 0 ? row[colLevel] : row[3];
        rLevel = (rLevel || '').toString().trim();
        let level = rLevel;
        if (!currentTournament || currentTournament.sport_type !== 'tennis') {
          let rLevelLower = rLevel.toLowerCase();
          level = 'e';
          if (rLevelLower.includes('s')) level = 's';
          else if (rLevelLower.includes('a')) level = 'a';
          else if (rLevelLower.includes('b')) level = 'b';
          else if (rLevelLower.includes('c')) level = 'c';
          else if (rLevelLower.includes('d')) level = 'd';
        } else {
          if (!level) level = '신인부';
        }

        let phone = (colPhone >= 0 ? row[colPhone] : row[4]) || '';
        let club = (colClub >= 0 ? row[colClub] : row[5]) || '';

        let rMixed = colMixed >= 0 ? row[colMixed] : row[6];
        rMixed = (rMixed || '0').toString().toLowerCase();
        let mixed = (rMixed.includes('1') || rMixed.includes('y') || rMixed.includes('참가') || rMixed.includes('동의') || rMixed.includes('o')) ? '1' : '0';

        let partner = (colPartner >= 0 ? row[colPartner] : row[7]) || '';

        parsedLines.push([name, gender, birth, level, phone, club, mixed, partner].join('\t'));
      }

      document.getElementById('bulkData').value = parsedLines.join('\n');
      showToast('엑셀 데이터가 변환되어 자동 기입되었습니다 (' + parsedLines.length + '건)');
    } catch (e) {
      showToast('엑셀 파일을 읽는 중 오류가 발생했습니다', 'error');
    }
    // reset file input
    document.getElementById('excelFile').value = '';
  };
  reader.readAsArrayBuffer(file);
}

async function togglePaid(pid) {
  if (!isAuthenticated) return;
  await api('/' + currentTournament.id + '/participants/' + pid + '/paid', { method: 'PATCH' });
  renderTabContent();
}

async function toggleCheckin(pid) {
  if (!isAuthenticated) return;
  await api('/' + currentTournament.id + '/participants/' + pid + '/checkin', { method: 'PATCH' });
  renderTabContent();
}

async function deleteParticipant(pid) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  await api('/' + currentTournament.id + '/participants/' + pid, { method: 'DELETE' });
  showToast('삭제되었습니다');
  renderTabContent();
}

async function deleteAllParticipants() {
  if (!confirm('등록된 모든 참가자를 정말로 한 번에 삭제하시겠습니까?\\n(이 작업은 취소할 수 없습니다)')) return;
  await api('/' + currentTournament.id + '/participants', { method: 'DELETE' });
  showToast('모든 참가자 명단이 비워졌습니다.');
  renderTabContent();
}

// ===== Events Tab =====
async function renderEvents(c) {
  c.innerHTML = '<div class="loading"><div class="spinner"></div>종목 로딩중...</div>';
  events = await api('/' + currentTournament.id + '/events');

  c.innerHTML = `
        <div class="card-header">
      <span style="font-size:0.85rem;color:var(--text-secondary)">총 ${events.length}개 종목</span>
      <div class="btn-group">
        ${isAuthenticated ? `
          <button class="btn btn-primary btn-sm" onclick="showCreateEvent()">+ 종목 추가</button>
          <button class="btn btn-sm" onclick="showBulkCreateEvents()">📋 일괄 생성</button>
          <button class="btn btn-sm" onclick="autoAssignAll()">🤖 전체 팀편성</button>
          <button class="btn btn-sm" onclick="checkMerge()">🔗 자동 합병체크</button>
          <button class="btn btn-sm" onclick="showManualMerge()">🤝 수동 합병</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#ef4444;border-color:#fca5a5" onclick="deleteAllAssignments()">🗑️ 조편성 일괄삭제</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAllEvents()">🗑️ 종목 전체삭제</button>
        ` : ''}
      </div>
    </div>
        ${events.length === 0 ? `
      <div class="empty-state">
        <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(249,115,22,0.15)); animation:floatIcon 3s ease-in-out infinite;">🏆</div>
        <h3 style="font-size:1.3rem; margin-bottom:12px;">등록된 종목이 없습니다</h3>
        <p style="font-size:1.05rem; margin-bottom:24px;">'남복 20대 A조'와 같은 종목을 추가해보세요.<br>여러 종목을 엑셀로 한 번에 생성할 수도 있습니다.</p>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button class="btn btn-primary" onclick="showCreateEvent()">+ 종목 추가</button>
          <button class="btn" style="background:#fff; border:1px solid var(--border);" onclick="showBulkCreateEvents()">📋 일괄 생성</button>
        </div>
      </div>
    ` : ''
    }
    ${events.map(evt => `
      <div class="card" style="margin-bottom:12px">
        <div class="card-header">
          <div>
            <div class="card-title">${evt.name}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
              ${getCategoryLabel(evt.category)} | ${evt.age_group} | ${evt.level_group.toUpperCase()} | ${evt.team_count || 0}팀
              ${evt.merged_from ? ' <span class="badge badge-purple">합병</span>' : ''}
            </div>
          </div>
          <div class="btn-group">
            ${isAuthenticated ? `
              <button class="btn btn-sm" onclick="showTeams(${evt.id})">👥 팀 보기</button>
              <button class="btn btn-sm btn-danger" onclick="deleteEvent(${evt.id})">삭제</button>
            ` : `<button class="btn btn-sm" onclick="showTeams(${evt.id})">👥 팀 보기</button>`}
          </div>
        </div>
      </div>
    `).join('')
    }
      `;
}

function getCategoryLabel(cat) {
  return { md: '남자복식', wd: '여자복식', xd: '혼합복식', ms: '남자단식', ws: '여자단식' }[cat] || cat;
}

function showCreateEvent() {
  const venueOptions = venues.length > 0 ?
    '<option value="">기본 경기장</option>' + venues.map(v => `<option value="${v.id}">${v.name}</option> `).join('') :
    '<option value="">기본 경기장</option>';

  showModal('종목 추가', `
        <div class="form-group"><label>종류</label><select class="form-control" id="evCat"><option value="md">${currentTournament.sport_type === 'tennis' ? '남자부(남복/남단)' : '남자복식'}</option><option value="wd">${currentTournament.sport_type === 'tennis' ? '여자부(여복/여단)' : '여자복식'}</option><option value="xd">혼합복식</option>${currentTournament.sport_type !== 'tennis' ? '<option value="ms">남자단식</option><option value="ws">여자단식</option>' : ''}</select></div>
    <div class="form-group"><label>연령 / 구력</label><input class="form-control" id="evAge" placeholder="${currentTournament.sport_type === 'tennis' ? '예: 오픈, 베테랑부, 2030부, 테린이 등' : '예: 20대, 30대, 40대, 50대 등'}" value="오픈"></div>
    <div class="form-group"><label>상세 급수</label><input class="form-control" id="evLevel" placeholder="${currentTournament.sport_type === 'tennis' ? '예: 신인부, 개나리부, 오픈부 등' : '예: A, B, C, D, S 급'}" value="전체"></div>
    ${venues.length > 0 ? `<div class="form-group"><label>진행 경기장</label><select class="form-control" id="evVenue">${venueOptions}</select></div>` : ''}
      `, async () => {
    await api('/' + currentTournament.id + '/events', {
      method: 'POST', body: {
        category: document.getElementById('evCat').value,
        age_group: document.getElementById('evAge').value,
        level_group: document.getElementById('evLevel').value,
        venue_id: document.getElementById('evVenue') ? (parseInt(document.getElementById('evVenue').value) || null) : null
      }
    });
    showToast('종목이 추가되었습니다');
    closeModal();
    renderTabContent();
  });
}

function showBulkCreateEvents() {
  const venueOptions = venues.length > 0 ?
    '<option value="">기본 경기장</option>' + venues.map(v => `<option value="${v.id}">${v.name}</option> `).join('') :
    '<option value="">기본 경기장</option>';

  showModal('종목 일괄 생성', `
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px"> 종목 유형, 연령대, 급수를 선택하면 가능한 조합이 모두 생성됩니다.</p>
          ${venues.length > 0 ? `<div class="form-group"><label>진행 경기장</label><select class="form-control" id="bulkVenue">${venueOptions}</select></div>` : ''}
    <div class="form-group"><label>종목 유형 (복수 선택)</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="checkbox-label"><input type="checkbox" value="md" class="bulk-cat" checked> 남자복식</label>
        <label class="checkbox-label"><input type="checkbox" value="wd" class="bulk-cat"> 여자복식</label>
        <label class="checkbox-label"><input type="checkbox" value="xd" class="bulk-cat"> 혼합복식</label>
        <label class="checkbox-label"><input type="checkbox" value="ms" class="bulk-cat"> 남자단식</label>
        <label class="checkbox-label"><input type="checkbox" value="ws" class="bulk-cat"> 여자단식</label>
      </div>
    </div>
    <div class="form-group"><label>연령대 (복수 선택)</label>
      ${currentTournament.sport_type === 'tennis' ? `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="checkbox-label"><input type="checkbox" value="오픈" class="bulk-age"> 오픈</label>
        <label class="checkbox-label"><input type="checkbox" value="2030부" class="bulk-age" checked> 2030부</label>
        <label class="checkbox-label"><input type="checkbox" value="베테랑부" class="bulk-age" checked> 베테랑부</label>
        <label class="checkbox-label"><input type="checkbox" value="테린이부" class="bulk-age"> 테린이부</label>
      </div>
      ` : `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="checkbox-label"><input type="checkbox" value="open" class="bulk-age"> 오픈</label>
        <label class="checkbox-label"><input type="checkbox" value="20~30대" class="bulk-age"> 20~30대</label>
        <label class="checkbox-label"><input type="checkbox" value="40대" class="bulk-age"> 40대</label>
        <label class="checkbox-label"><input type="checkbox" value="50대" class="bulk-age" checked> 50대</label>
        <label class="checkbox-label"><input type="checkbox" value="55대" class="bulk-age" checked> 55대</label>
        <label class="checkbox-label"><input type="checkbox" value="60대" class="bulk-age"> 60대</label>
      </div>
      `}
    </div>
    <div class="form-group"><label>급수</label>
      ${currentTournament.sport_type === 'tennis' ? `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="checkbox-label"><input type="checkbox" value="all" class="bulk-level"> 전체</label>
        <label class="checkbox-label"><input type="checkbox" value="신인부" class="bulk-level" checked> 신인부</label>
        <label class="checkbox-label"><input type="checkbox" value="오픈부" class="bulk-level" checked> 오픈부</label>
        <label class="checkbox-label"><input type="checkbox" value="개나리부" class="bulk-level" checked> 개나리부</label>
        <label class="checkbox-label"><input type="checkbox" value="국화부" class="bulk-level"> 국화부</label>
      </div>
      ` : `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="checkbox-label"><input type="checkbox" value="all" class="bulk-level"> 전체</label>
        <label class="checkbox-label"><input type="checkbox" value="s" class="bulk-level"> S</label>
        <label class="checkbox-label"><input type="checkbox" value="a" class="bulk-level" checked> A</label>
        <label class="checkbox-label"><input type="checkbox" value="b" class="bulk-level" checked> B</label>
        <label class="checkbox-label"><input type="checkbox" value="c" class="bulk-level" checked> C</label>
        <label class="checkbox-label"><input type="checkbox" value="d" class="bulk-level"> D</label>
        <label class="checkbox-label"><input type="checkbox" value="e" class="bulk-level"> E</label>
      </div>
      `}
    </div>
    </div>

        <div style="margin-top:20px; padding:12px; background:var(--bg-card); border-radius:8px; border:1px solid var(--border)">
          <label class="checkbox-label" style="font-weight:700; margin-bottom:12px">
            <input type="checkbox" id="bulkAutoAssign" checked onchange="document.getElementById('bulkAssignOptions').style.display = this.checked ? 'block' : 'none'">
              자동 팀편성도 함께 실행 (종목 생성 후 자동으로 팀 편성)
          </label>

          <div id="bulkAssignOptions" style="padding-left:24px; border-left:2px solid var(--border); margin-bottom:12px">
            <div style="font-size:0.9rem; font-weight:600; margin-bottom:8px">편성 방식 (희망 파트너는 항상 최우선)</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:0.85rem"><input type="radio" name="bulkTeamMethod" value="club" checked> 같은 클럽 우선 편성 (기본권장)</label>
              <label style="font-size:0.85rem"><input type="radio" name="bulkTeamMethod" value="level"> 같은 급수 우선 매칭 (실력 위주)</label>
              <label style="font-size:0.85rem"><input type="radio" name="bulkTeamMethod" value="random"> 완전 랜덤 배정</label>
            </div>
          </div>
        </div>
      `, async () => {
    const cats = Array.from(document.querySelectorAll('.bulk-cat:checked')).map(c => c.value);
    const ages = Array.from(document.querySelectorAll('.bulk-age:checked')).map(c => c.value);
    const levels = Array.from(document.querySelectorAll('.bulk-level:checked')).map(c => c.value);
    const autoAssign = document.getElementById('bulkAutoAssign').checked;

    let method = 'club';
    document.querySelectorAll('input[name="bulkTeamMethod"]').forEach(n => { if (n.checked) method = n.value; });

    if (!cats.length || !ages.length || !levels.length) return showToast('모든 항목을 선택해주세요', 'warning');
    const res = await api('/' + currentTournament.id + '/events/bulk-create', {
      method: 'POST',
      body: {
        categories: cats,
        age_groups: ages,
        level_groups: levels,
        venue_id: document.getElementById('bulkVenue') ? (parseInt(document.getElementById('bulkVenue').value) || null) : null,
        auto_assign: autoAssign,
        assign_options: { method }
      }
    });
    showToast(`${res.count}개 종목 생성 완료`);
    closeModal();
    renderTabContent();
  });
}

async function showTeams(eventId) {
  const teams = await api('/' + currentTournament.id + '/events/' + eventId + '/teams');
  const evt = events.find(e => e.id === eventId);
  showModal((evt?.name || '종목') + ' — 팀 목록 (' + teams.length + '팀)', `
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>#</th><th>팀명</th><th>선수1</th><th>선수2</th><th>조</th>${isAuthenticated ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${teams.map((t, i) => `<tr>
          <td>${i + 1}</td>
          <td><strong>${t.team_name || (t.p1_name + ' · ' + t.p2_name)}</strong></td>
          <td>${t.p1_name} <span class="badge badge-level-${t.p1_level}">${t.p1_level?.toUpperCase()}</span></td>
          <td>${t.p2_name} <span class="badge badge-level-${t.p2_level}">${t.p2_level?.toUpperCase()}</span></td>
          <td>${t.group_num || '-'}</td>
          ${isAuthenticated ? `<td><button class="btn btn-sm btn-danger" onclick="deleteTeam(${eventId},${t.id})">삭제</button></td>` : ''}
        </tr>`).join('')}
            </tbody>
          </table>
    </div>
        ${teams.length === 0 ? '<div class="empty-state" style="padding:20px"><p>팀이 없습니다</p></div>' : ''}
      `);
}

function autoAssignAll() {
  showModal('종목 전체 자동 팀/조 편성 실행', `
        <div style="margin-bottom:20px;">
      <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--primary)">📋 1. 팀 편성 방식</h4>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <label class="radio-label" style="display:flex; align-items:flex-start; gap:12px; padding:16px; background:var(--bg-card); border:1px solid var(--primary); border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.02)">
          <input type="radio" name="teamMethod" value="club" checked style="margin-top:6px; transform:scale(1.2)">
          <div>
            <div style="font-weight:700; font-size:1.05rem">같은 클럽 우선 편성</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">같은 소속 클럽 멤버끼리 먼저 매칭 → 남은 인원은 급수 순 매칭</div>
          </div>
        </label>
        <label class="radio-label" style="display:flex; align-items:flex-start; gap:12px; padding:16px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; cursor:pointer;">
          <input type="radio" name="teamMethod" value="level" style="margin-top:6px; transform:scale(1.2)">
          <div>
            <div style="font-weight:700; font-size:1.05rem">같은 급수 매칭</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">클럽 무관, 같은 급수끼리 우선 매칭 (급수 밸런스 중시)</div>
          </div>
        </label>
        <label class="radio-label" style="display:flex; align-items:flex-start; gap:12px; padding:16px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; cursor:pointer;">
          <input type="radio" name="teamMethod" value="random" style="margin-top:6px; transform:scale(1.2)">
          <div>
            <div style="font-weight:700; font-size:1.05rem">완전 랜덤</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">클럽·급수 무관 랜덤 매칭</div>
          </div>
        </label>
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--primary)">📊 2. 조(그룹) 배정</h4>
      
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:16px;">
        <label style="display:flex; align-items:flex-start; gap:12px; margin-bottom:16px; cursor:pointer; font-weight:700; font-size:1.05rem;">
          <input type="checkbox" id="assignGroupsCb" checked style="margin-top:6px; transform:scale(1.2)" onchange="document.getElementById('groupOptions').style.opacity = this.checked ? '1' : '0.5'; document.getElementById('groupOptions').style.pointerEvents = this.checked ? 'auto' : 'none';">
          <div>
            조 배정 실행 (모든 규칙 일괄 적용)
            <div style="font-weight:normal; font-size:0.85rem; color:var(--text-muted); margin-top:4px;">팀 편성 후 자동으로 각 종목별 풀리그 조 배정 함께 진행</div>
          </div>
        </label>

        <div id="groupOptions" style="transition:0.2s; padding-left:32px; border-top:1px dashed var(--border); padding-top:16px;">
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
            <label style="font-size:1rem; font-weight:600;">조당 팀 수</label>
            <input class="form-control" type="number" id="tpgVal" value="5" min="2" max="10" style="width:100px; text-align:center; font-weight:bold;">
            <span style="font-size:0.85rem; color:var(--text-muted)">(4~5팀 풀리그 권장)</span>
          </div>
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
            <input type="checkbox" id="avoidClubCb" checked style="margin-top:5px; transform:scale(1.1)">
            <div>
              <div style="font-weight:700; font-size:0.95rem">같은 클럽 다른 조 배정</div>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">같은 클럽 팀끼리 다른 조에 배정 (클럽 내 대결 최소화)</div>
            </div>
          </label>
        </div>
      </div>
    </div>

    <script>
      // Make radio buttons update their parent container's border color when clicked
      document.querySelectorAll('input[name="teamMethod"]').forEach(r => {
        r.addEventListener('change', e => {
          document.querySelectorAll('input[name="teamMethod"]').forEach(el => {
            el.closest('.radio-label').style.border = '1px solid var(--border)';
            el.closest('.radio-label').style.boxShadow = 'none';
          });
          e.target.closest('.radio-label').style.border = '1px solid var(--primary)';
          e.target.closest('.radio-label').style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
        });
      });
    </script>
      `, async () => {
    let method = 'club';
    document.querySelectorAll('input[name="teamMethod"]').forEach(n => { if (n.checked) method = n.value; });
    const assignGroupsCb = document.getElementById('assignGroupsCb');
    let assignGroups = false;
    if (assignGroupsCb) assignGroups = assignGroupsCb.checked;

    let tpg = 5;
    const tpgVal = document.getElementById('tpgVal');
    if (tpgVal) tpg = parseInt(tpgVal.value) || 5;

    let avoidClub = true;
    const avoidClubCb = document.getElementById('avoidClubCb');
    if (avoidClubCb) avoidClub = avoidClubCb.checked;

    const res = await api('/' + currentTournament.id + '/events/auto-assign-all', {
      method: 'POST', body: {
        method: method,
        assign_groups: assignGroups,
        teams_per_group: tpg,
        avoid_club_in_group: avoidClub
      }
    });

    let msg = '';
    if (res.total_teams > 0) msg += `총 ${res.total_teams}개 팀 일괄 편성 완료! \n`;
    if (assignGroups) msg += `모든 종목 조 배정 완료(${tpg}팀 / 조)`;

    if (msg) showToast(msg);
    else showToast('이미 팀이 모두 편성되어 있어 추가 변경이 이뤄지지 않았습니다.');

    closeModal();
    renderTabContent();
  });

  setTimeout(() => {
    const confirmBtn = document.getElementById('modalConfirm');
    if (confirmBtn) {
      confirmBtn.innerHTML = '✨ 일괄 실행';
      confirmBtn.style.background = 'var(--primary)';
      confirmBtn.style.color = '#fff';
      confirmBtn.style.fontWeight = 'bold';
      confirmBtn.style.padding = '10px 24px';
    }
  }, 50);
}

async function deleteEvent(eid) {
  if (!confirm('이 종목과 관련 팀/경기를 모두 삭제하시겠습니까?')) return;
  await api('/' + currentTournament.id + '/events/' + eid, { method: 'DELETE' });
  showToast('종목이 삭제되었습니다');
  renderTabContent();
}

async function deleteTeam(eid, teamId) {
  if (!confirm('이 팀을 삭제하시겠습니까?')) return;
  await api('/' + currentTournament.id + '/events/' + eid + '/teams/' + teamId, { method: 'DELETE' });
  showToast('팀이 삭제되었습니다');
  closeModal();
  renderTabContent();
}

async function checkMerge() {
  const res = await api('/' + currentTournament.id + '/events/check-merge', { method: 'POST' });
  if (!res.suggestions?.length) {
    return showToast('합병이 필요한 종목이 없습니다', 'warning');
  }

  let html = `<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px"> 합병 기준: ${res.threshold}팀 미만</p> `;
  res.suggestions.forEach((s, i) => {
    html += `<div class="card" style = "margin-bottom:8px;padding:12px">
        <label class="checkbox-label"><input type="checkbox" class="merge-check" value="${i}" data-ids='${JSON.stringify(s.events.map(e => e.id))}'>
          <span><strong>${s.merged_name}</strong> (${s.total_teams}팀)<br>
            <span style="font-size:0.75rem;color:var(--text-muted)">${s.events.map(e => e.name + '(' + e.team_count + '팀)').join(' + ')}</span></span>
        </label>
    </div> `;
  });

  const titleStr = currentTournament && currentTournament.sport_type === 'tennis' ? '출전부 합병 체크' : '급수합병 체크';
  showModal(titleStr, html, async () => {
    const checked = document.querySelectorAll('.merge-check:checked');
    for (const cb of checked) {
      const ids = JSON.parse(cb.dataset.ids);
      await api('/' + currentTournament.id + '/events/execute-merge', { method: 'POST', body: { event_ids: ids } });
    }
    showToast(`${checked.length}건 합병 완료`);
    closeModal();
    renderTabContent();
  });
}

function showManualMerge() {
  let evtOptions = events.filter(e => !e.merged_from).map(e => `<option value="${e.id}">${e.name} (${e.team_count || 0}팀)</option> `).join('');
  showModal('수동 종목 합병', `
      <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px"> 합병할 대상 종목들을 여러 개 선택하세요(Ctrl / Cmd 특수키를 누르고 클릭하여 다중 선택)</p>
    <div class="form-group">
      <label>대상 종목</label>
      <select class="form-control" id="mergeEvents" multiple style="height:150px">
        ${evtOptions}
      </select>
    </div>
    <div class="form-group">
      <label>합병 후 종목명 (선택사항, 미입력시 자동생성)</label>
      <input class="form-control" id="mergeName" placeholder="예: 남자복식 통합 A+B급">
    </div>
    `, async () => {
    const selected = Array.from(document.getElementById('mergeEvents').selectedOptions).map(o => parseInt(o.value));
    if (selected.length < 2) return showToast('합병하려면 최소 2개 이상의 종목을 선택해야 합니다', 'warning');

    const customName = document.getElementById('mergeName').value;
    const res = await api('/' + currentTournament.id + '/events/execute-merge', {
      method: 'POST',
      body: { event_ids: selected, name: customName }
    });

    if (res.success) {
      showToast(`${res.name} 종목으로 수동 합병 완료 되었습니다`);
    }
    closeModal();
    renderTabContent();
  });
}

async function deleteAllAssignments() {
  if (!confirm('모든 종목의 대진표, 경기 결과 및 참가팀 기록을 완전히 삭제하시겠습니까?\n(종목 자체는 유지됩니다)')) return;
  const res = await api('/' + currentTournament.id + '/events/all/assignments', { method: 'DELETE' });
  showToast(`조편성 및 대진표 초기화 완료`);
  renderTabContent();
}

async function deleteAllEvents() {
  if (!confirm('경고: 진행 중인 경기를 포함하여 "모든 종목, 참가팀, 대진표 데이터"가 완전히 삭제됩니다!\n정말로 모든 종목을 초기화하시겠습니까?')) return;
  const res = await api('/' + currentTournament.id + '/events/all/everything', { method: 'DELETE' });
  showToast(`모든 종목이 삭제되었습니다.`);
  renderTabContent();
}

// ===== Matches Tab =====
async function renderMatches(c) {
  c.innerHTML = '<div class="loading"><div class="spinner"></div>경기 로딩중...</div>';
  matches = await api('/' + currentTournament.id + '/matches');
  if (!events.length) events = await api('/' + currentTournament.id + '/events');

  const playing = matches.filter(m => m.status === 'playing');
  const pending = matches.filter(m => m.status === 'pending');
  const completed = matches.filter(m => m.status === 'completed');

  c.innerHTML = `
      <div class="card-header">
      <div>
        <span style="font-size:0.85rem;color:var(--text-secondary)">총 ${matches.length}경기 (진행 ${playing.length} | 대기 ${pending.length} | 완료 ${completed.length})</span>
      </div>
      <div class="btn-group">
        ${isAuthenticated ? `<button class="btn btn-primary btn-sm" onclick="showGenerateBracket()">📋 대진표 생성</button>
        <button class="btn btn-sm" onclick="showGenerateFinals()">🏆 결선 생성</button>` : ''}
        ${events.length > 0 ? `<button class="btn btn-sm" style="background:rgba(139,92,246,0.1);color:#8b5cf6;border:1px solid rgba(139,92,246,0.3);" onclick="showBracketTree(${events[0].id})">🌲 대진표 보기</button>` : ''}
      </div>
    </div>

      ${playing.length > 0 ? `
      <h3 style="font-size:1rem;font-weight:700;margin:16px 0 8px;color:#10b981">🔥 진행중 (${playing.length})</h3>
      ${renderMatchCards(playing)}
    ` : ''
    }

    ${pending.length > 0 ? `
      <h3 style="font-size:1rem;font-weight:700;margin:16px 0 8px;color:#f59e0b">⏳ 대기 (${pending.length})</h3>
      ${renderPendingByCourt(pending)}
    ` : ''
    }

    ${completed.length > 0 ? `
      <h3 style="font-size:1rem;font-weight:700;margin:16px 0 8px;color:#9ca3af">✅ 완료 (${completed.length})</h3>
      ${renderMatchCards(completed.slice(0, 20))}
      ${completed.length > 20 ? '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px">... 외 ' + (completed.length - 20) + '경기</p>' : ''}
    ` : ''
    }

    ${matches.length === 0 ? `
      <div class="empty-state">
        <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(249,115,22,0.15)); animation:floatIcon 3s ease-in-out infinite;">⚔️</div>
        <h3 style="font-size:1.3rem; margin-bottom:12px;">아직 생성된 경기가 없습니다</h3>
        <p style="font-size:1.05rem; margin-bottom:24px;">종목/팀 탭에서 선수들을 팀으로 편성한 뒤<br><strong>대진표 생성</strong> 버튼을 눌러주세요.</p>
        <div style="display:flex; justify-content:center;">
          <button class="btn btn-primary" onclick="switchTab('events')">종목/팀 탭으로 이동 →</button>
        </div>
      </div>
    ` : ''
    }
    `;
}

function renderPendingByCourt(pendingList) {
  // 코트별 그룹핑
  const byCourt = {};
  for (const m of pendingList) {
    const court = m.court_number || 0;
    if (!byCourt[court]) byCourt[court] = [];
    byCourt[court].push(m);
  }

  // 코트 번호 정렬
  const courtNums = Object.keys(byCourt).map(Number).sort((a, b) => a - b);

  const courtColors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#ef4444', '#ec4899', '#14b8a6', '#3b82f6', '#a855f7'];

  return courtNums.map(court => {
    // 코트 내 경기를 시간순 정렬 (scheduled_time → round → match_order)
    const courtMatches = byCourt[court].sort((a, b) => {
      if (a.scheduled_time && b.scheduled_time) return a.scheduled_time.localeCompare(b.scheduled_time);
      if (a.scheduled_time) return -1;
      if (b.scheduled_time) return 1;
      if (a.round !== b.round) return a.round - b.round;
      return a.match_order - b.match_order;
    });
    const color = court > 0 ? courtColors[(court - 1) % courtColors.length] : '#9ca3af';
    const label = court > 0 ? court + '코트' : '미배정';
    const courtId = 'pending-court-' + court;

    return `
      <div style="margin-bottom:12px; border:1px solid ${color}22; border-radius:14px; overflow:hidden;">
        <div onclick="document.getElementById('${courtId}').style.display = document.getElementById('${courtId}').style.display === 'none' ? 'block' : 'none'"
             style="display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; background:${color}08; transition:background 0.2s;"
             onmouseover="this.style.background='${color}15'" onmouseout="this.style.background='${color}08'">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; background:linear-gradient(135deg,${color},${color}cc); color:#fff; font-size:0.8rem; font-weight:800; flex-shrink:0;">${court > 0 ? court : '?'}</span>
          <span style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${label}</span>
          <span style="font-size:0.78rem; color:${color}; font-weight:700; background:${color}15; padding:2px 8px; border-radius:6px;">${courtMatches.length}경기</span>
          ${courtMatches[0] && courtMatches[0].scheduled_time ? '<span style="font-size:0.72rem; color:#6366f1; font-weight:600;">🕐 ' + courtMatches[0].scheduled_time + '~</span>' : ''}
          <span style="margin-left:auto; color:var(--text-muted); font-size:0.75rem;">▼</span>
        </div>
        <div id="${courtId}" style="padding:0 8px 8px;">
          ${renderMatchCards(courtMatches)}
        </div>
      </div>
    `;
  }).join('');
}

function renderMatchCards(matchList) {
  return matchList.map(m => {
    const t1 = m.team1_name || (m.t1p1_name ? m.t1p1_name + ' · ' + m.t1p2_name : 'BYE');
    const t2 = m.team2_name || (m.t2p1_name ? m.t2p1_name + ' · ' + m.t2p2_name : 'BYE');
    const score = m.status !== 'pending' ? `${m.team1_set1 || 0} -${m.team1_set2 || 0} -${m.team1_set3 || 0} : ${m.team2_set1 || 0} -${m.team2_set2 || 0} -${m.team2_set3 || 0} ` : '';
    const statusClass = m.status === 'playing' ? 'badge-success' : m.status === 'pending' ? 'badge-warning' : 'badge-muted';
    return `
      <div class="card" style = "margin-bottom:8px;padding:12px;cursor:pointer" onclick = "${isAuthenticated ? `showScoreModal(${m.id})` : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span class="badge ${statusClass}" style="margin-bottom:4px">${m.status === 'playing' ? '진행중' : m.status === 'pending' ? '대기' : '완료'}</span>
            <span style="font-size:0.7rem;color:var(--text-muted);margin-left:8px">R${m.round} #${m.match_order} 코트${m.court_number || '?'}</span>
            ${m.scheduled_time ? `<span style="font-size:0.7rem;color:#6366f1;margin-left:6px;font-weight:700;">🕐${m.scheduled_time}</span>` : ''}
            ${m.event_name ? `<span style="font-size:0.7rem;color:var(--text-muted);margin-left:8px">${m.event_name}</span>` : ''}
            <div style="font-size:0.95rem;font-weight:600;margin-top:4px">${t1} <span style="color:var(--text-muted)">vs</span> ${t2}</div>
            ${score ? `<div style="color:#06b6d4;font-weight:700;font-size:0.9rem;margin-top:2px">${score}${m.winner_team ? ' 🏆 팀' + m.winner_team : ''}</div>` : ''}
          </div>
        </div>
      </div>
      `;
  }).join('');
}

function showGenerateBracket() {
  const eventsWithMatches = new Set(matches.map(m => m.event_id));
  const eligibleEvents = events.filter(e => !eventsWithMatches.has(e.id));

  let eventCheckboxes = eligibleEvents.map(e => `
      <label style = "display:flex; align-items:center; gap:8px; padding: 10px; border-bottom: 1px solid var(--border); cursor:pointer; hover:background:rgba(0,0,0,0.02)">
        <input type="checkbox" class="br-event-check" value="${e.id}" checked style="transform:scale(1.1)">
          <span><strong>${e.name}</strong> <span style="font-size:0.85rem;color:var(--text-muted)">(${e.team_count || 0}팀)</span></span>
        </label>
    `).join('');

  showModal('대진표 일괄 생성', `
      <div class="form-group">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px">
        <label style="margin:0; font-weight:700">대상 종목 (복수 선택)</label>
        <label style="font-size:0.85rem; font-weight:normal; cursor:pointer; display:flex; align-items:center; gap:4px">
          <input type="checkbox" id="brSelectAll" checked onchange="document.querySelectorAll('.br-event-check').forEach(c => c.checked = this.checked)"> 전체 선택
        </label>
      </div>
      <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card);">
        ${eventCheckboxes || '<div style="padding:15px;text-align:center;color:var(--text-muted)">생성 가능한 종목이 없습니다</div>'}
      </div>
    </div>
    
    <div class="form-group"><label style="font-weight:700">대진표 형식 (공통 적용)</label>
      <select class="form-control" id="brFormat" onchange="toggleBracketOptions(this.value)">
        <option value="league">조별 풀리그 (라운드 로빈)</option>
        <option value="tournament">싱글 엘리미네이션 (토너먼트)</option>
        <option value="double_elim">더블 엘리미네이션 (패자부활전)</option>
        <option value="kdk">KDK 방식 (정해진 게임수만큼 반복)</option>
      </select>
    </div>
    
    <div id="bracketExtraOptions" style="display:block; background:rgba(0,0,0,0.02); padding:16px; border-radius:8px; margin-bottom:15px; border:1px solid var(--border)">
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0" title="조별 리그를 진행하기 위해 미리 조 배정을 마친 그룹 갯수. 조 배정 옵션을 사용해 조를 미리 안 나누었다면 0으로 설정하면 전체 1개 리그로 반영됩니다.">
          <label>조 수 (0=자동 인지 및 전체)</label>
          <input class="form-control" id="brGroups" type="number" value="0" min="0">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>조당 팀수 (최대 게임수 제한용)</label>
          <input class="form-control" id="brTPG" type="number" value="4" min="2">
        </div>
      </div>
      <p style="font-size:0.8rem; color:var(--text-muted); margin-top:12px; line-height:1.4">
        ※ <strong>조 수 0 입력 시:</strong> 시스템이 해당 종목의 [자동 팀/조편성 실행] 때 나눈 조 배정 기록을 읽어와서 알아서 조별 매치를 분리해 생성해 줍니다! (권장 설정)<br>
        ※ <strong>테니스 경기:</strong> 자동 생성된 경기들은 기본 '1세트(6게임) 매치' 룰이 적용되며, 코트 점수판에서 타이브레이크/노애드 설정이 가능합니다.
      </p>
    </div>
    
    <script>
      function toggleBracketOptions(val) {
        document.getElementById('bracketExtraOptions').style.display = (val === 'league' || val === 'kdk') ? 'block' : 'none';
      }
      setTimeout(() => toggleBracketOptions(document.getElementById('brFormat').value), 50);
      
      // Update select all checkbox if manual click changes things
      document.querySelectorAll('.br-event-check').forEach(el => {
        el.addEventListener('change', () => {
          const allChecked = Array.from(document.querySelectorAll('.br-event-check')).every(c => c.checked);
          document.getElementById('brSelectAll').checked = allChecked;
        });
      });
    </script>
    `, async () => {
    const selectedEventIds = Array.from(document.querySelectorAll('.br-event-check:checked')).map(cb => parseInt(cb.value));

    if (selectedEventIds.length === 0) {
      return showToast('대진표를 생성할 종목을 한 개 이상 선택해주세요', 'warning');
    }

    const format = document.getElementById('brFormat').value;
    const groups = parseInt(document.getElementById('brGroups').value) || 0;
    const teamsPerGroup = parseInt(document.getElementById('brTPG').value) || 4;

    // UI Loading state
    const btn = document.getElementById('modalConfirm');
    if (btn) {
      btn.innerHTML = '⚔️ 생성 중...';
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.style.cursor = 'wait';
    }

    let totalCreated = 0;
    for (const eid of selectedEventIds) {
      try {
        const res = await api('/' + currentTournament.id + '/brackets/generate', {
          method: 'POST', body: {
            event_id: eid,
            format: format,
            groups: groups,
            teamsPerGroup: teamsPerGroup
          }
        });
        if (res.matches_created) {
          totalCreated += res.matches_created;
        }
      } catch (e) {
        console.error('Bracket generation error for event ' + eid, e);
      }
    }

    if (totalCreated > 0) {
      showToast(`총 ${totalCreated}경기 대진 일괄 생성 완료!`);
    } else {
      showToast(`새로 생성된 경기가 없습니다.이미 경기가 존재하거나 편성된 팀이 없습니다.`);
    }

    closeModal();
    renderTabContent();
  });

  setTimeout(() => {
    const confirmBtn = document.getElementById('modalConfirm');
    if (confirmBtn) {
      confirmBtn.innerHTML = '⚔️ 선택종목 대진표 생성';
      confirmBtn.style.background = '#10b981';
      confirmBtn.style.color = '#fff';
      confirmBtn.style.fontWeight = 'bold';
      confirmBtn.style.padding = '10px 24px';
    }
  }, 50);
}

function showGenerateFinals() {
  let evtOptions = events.map(e => `<option value="${e.id}">${e.name}</option> `).join('');
  showModal('결선 토너먼트 생성', `
      <div class="form-group"><label>종목</label><select class="form-control" id="finEvent">${evtOptions}</select></div>
        <div class="form-group"><label>조별 진출 팀수</label><input class="form-control" id="finTopN" type="number" value="2" min="1" max="4"></div>
    `, async () => {
    const res = await api('/' + currentTournament.id + '/brackets/generate-finals', {
      method: 'POST', body: {
        event_id: parseInt(document.getElementById('finEvent').value),
        topN: parseInt(document.getElementById('finTopN').value)
      }
    });
    showToast(`결선: ${res.qualified} 팀, ${res.matches_created}경기 생성`);
    closeModal();
    renderTabContent();
  });
}

// ─── 대진표 트리 시각화 ────────────────────────────────────────
async function showBracketTree(eventId) {
  const event = events.find(e => e.id == eventId);
  const eventName = event ? event.name : '종목';

  showModal('🏆 ' + eventName + ' 대진표', '<div style="text-align:center;padding:20px"><div class="spinner"></div> 불러오는 중...</div>', null, { confirmText: '닫기', hideCancel: true, wide: true });

  try {
    const data = await api('/' + currentTournament.id + '/brackets/tree?event_id=' + eventId);

    const renderMatch = (m, highlight) => {
      const t1Win = m.winner === 1;
      const t2Win = m.winner === 2;
      const pending = m.status === 'pending';
      const playing = m.status === 'playing';
      const scoreTxt = m.score1.length > 0 ? m.score1.join('-') + ' / ' + m.score2.join('-') : '';
      return `
        <div style="border:2px solid ${playing ? '#f97316' : t1Win || t2Win ? '#10b981' : '#e2e8f0'};border-radius:10px;padding:8px 12px;min-width:160px;background:${playing ? '#fff7ed' : '#fff'};margin-bottom:4px;position:relative;">
          ${playing ? '<div style="position:absolute;top:-8px;left:8px;background:#f97316;color:#fff;font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:10px;">진행중</div>' : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span style="font-size:0.85rem;font-weight:${t1Win ? '800' : '500'};color:${t1Win ? '#0f172a' : '#64748b'};">${m.team1 || '<span style="color:#94a3b8;font-style:italic;">TBD</span>'}</span>
            <span style="font-size:0.8rem;font-weight:700;color:${t1Win ? '#10b981' : '#94a3b8'}">${t1Win ? '✓' : m.score1.length > 0 ? m.score1.join('-') : '-'}</span>
          </div>
          <div style="border-top:1px dashed #e2e8f0;my:2px;margin:3px 0;"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span style="font-size:0.85rem;font-weight:${t2Win ? '800' : '500'};color:${t2Win ? '#0f172a' : '#64748b'};">${m.team2 || '<span style="color:#94a3b8;font-style:italic;">TBD</span>'}</span>
            <span style="font-size:0.8rem;font-weight:700;color:${t2Win ? '#10b981' : '#94a3b8'}">${t2Win ? '✓' : m.score2.length > 0 ? m.score2.join('-') : '-'}</span>
          </div>
          <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">코트 ${m.court_number || '-'} | R${m.round}-${m.match_order}</div>
        </div>`;
    };

    const renderSection = (rounds, title, color) => {
      if (!rounds || rounds.length === 0) return '';
      return `
        <div style="margin-bottom:24px;">
          <h3 style="font-size:1rem;font-weight:800;color:${color};margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid ${color}33;">${title}</h3>
          <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;">
            ${rounds.map(r => `
              <div style="flex-shrink:0;">
                <div style="font-size:0.78rem;font-weight:700;color:#64748b;margin-bottom:8px;text-align:center;background:#f8fafc;padding:4px 8px;border-radius:6px;">${r.label}</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${r.matches.map(m => renderMatch(m)).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    };

    let html = `<div style="min-width:600px;">`;

    if (data.winners && data.winners.length > 0) {
      html += renderSection(data.winners, data.type === 'double_elim' ? '🏆 승자 브래킷' : '📋 경기 목록', '#10b981');
    }
    if (data.losers && data.losers.length > 0) {
      html += renderSection(data.losers, '⬇️ 패자 브래킷', '#f97316');
    }
    if (data.grandFinal) {
      html += renderSection([data.grandFinal], '🔥 대결선 (Grand Final)', '#8b5cf6');
    }
    if (data.finals && data.finals.length > 0) {
      html += renderSection(data.finals, '🏅 결선 토너먼트', '#3b82f6');
    }
    html += `<p style="font-size:0.8rem;color:#94a3b8;text-align:right;margin-top:8px;">총 ${data.total_matches}경기</p></div>`;

    const modalBody = document.querySelector('.modal-body') || document.querySelector('.modal-content');
    if (modalBody) {
      const inner = modalBody.querySelector('div') || modalBody;
      inner.innerHTML = html;
    }
  } catch (e) {
    showToast('대진표를 불러올 수 없습니다: ' + e.message, 'error');
  }
}

function showScoreModal(matchId) {
  const m = matches.find(x => x.id === matchId);
  if (!m) return;
  const t1 = m.team1_name || (m.t1p1_name ? m.t1p1_name + ' · ' + m.t1p2_name : 'BYE');
  const t2 = m.team2_name || (m.t2p1_name ? m.t2p1_name + ' · ' + m.t2p2_name : 'BYE');

  showModal('점수 입력 — R' + m.round + ' #' + m.match_order, `
      <div style="text-align:center;margin-bottom:16px">
      <strong>${t1}</strong> <span style="color:var(--text-muted)">vs</span> <strong>${t2}</strong>
    </div>
    <div class="form-group"><label>상태</label><select class="form-control" id="scStatus">
      <option value="pending" ${m.status === 'pending' ? 'selected' : ''}>대기</option>
      <option value="playing" ${m.status === 'playing' ? 'selected' : ''}>진행중</option>
      <option value="completed" ${m.status === 'completed' ? 'selected' : ''}>완료</option>
    </select></div>
    <div style="font-size:0.8rem; color:var(--primary); margin-bottom:8px; text-align:center;">
      ℹ️ 대회 목표점수: 예선 ${currentTournament.score_rule_prelim || 25}점 / 본선 ${currentTournament.score_rule_final || 21}점 (최대 ${currentTournament.max_sets || 1}세트)
    </div>
    <table class="data-table" style="font-size:0.85rem">
      <tr>
        <th></th>
        <th>1세트</th>
        ${(currentTournament.max_sets || 1) >= 2 ? '<th>2세트</th>' : ''}
        ${(currentTournament.max_sets || 1) >= 3 ? '<th>3세트</th>' : ''}
      </tr>
      <tr><td>${t1}</td>
        <td><input class="form-control" id="sc11" type="number" value="${m.team1_set1 || 0}" min="0" style="width:60px"></td>
        ${(currentTournament.max_sets || 1) >= 2 ? `<td><input class="form-control" id="sc12" type="number" value="${m.team1_set2 || 0}" min="0" style="width:60px"></td>` : '<input type="hidden" id="sc12" value="0">'}
        ${(currentTournament.max_sets || 1) >= 3 ? `<td><input class="form-control" id="sc13" type="number" value="${m.team1_set3 || 0}" min="0" style="width:60px"></td>` : '<input type="hidden" id="sc13" value="0">'}
      </tr>
      <tr><td>${t2}</td>
        <td><input class="form-control" id="sc21" type="number" value="${m.team2_set1 || 0}" min="0" style="width:60px"></td>
        ${(currentTournament.max_sets || 1) >= 2 ? `<td><input class="form-control" id="sc22" type="number" value="${m.team2_set2 || 0}" min="0" style="width:60px"></td>` : '<input type="hidden" id="sc22" value="0">'}
        ${(currentTournament.max_sets || 1) >= 3 ? `<td><input class="form-control" id="sc23" type="number" value="${m.team2_set3 || 0}" min="0" style="width:60px"></td>` : '<input type="hidden" id="sc23" value="0">'}
      </tr>
    </table>
    <div class="form-group" style="margin-top:12px"><label>승자</label><select class="form-control" id="scWinner">
      <option value="">미정</option>
      <option value="1" ${m.winner_team === 1 ? 'selected' : ''}>${t1}</option>
      <option value="2" ${m.winner_team === 2 ? 'selected' : ''}>${t2}</option>
    </select></div>
    <div style="margin-top:20px; padding-top:16px; border-top:1px dashed var(--border);">
      <div onclick="document.getElementById('reassignSection').style.display = document.getElementById('reassignSection').style.display === 'none' ? 'block' : 'none'" 
           style="cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:8px;">
        <span style="font-size:0.85rem; font-weight:700; color:var(--primary);">🔄 경기 배정 변경 (코트/순서 이동)</span>
        <span style="font-size:0.7rem; color:var(--text-muted);">▼</span>
      </div>
      <div id="reassignSection" style="display:none; background:rgba(139,92,246,0.05); border:1px solid rgba(139,92,246,0.15); border-radius:12px; padding:16px; margin-bottom:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">코트 번호</label>
            <input class="form-control" id="scCourt" type="number" value="${m.court_number || 0}" min="0" max="20" style="text-align:center; font-weight:700;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">경기 순서</label>
            <input class="form-control" id="scOrder" type="number" value="${m.match_order || 1}" min="1" style="text-align:center; font-weight:700;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">예정 시간</label>
            <input class="form-control" id="scTime" type="time" value="${m.scheduled_time || ''}" style="text-align:center; font-weight:700;">
          </div>
        </div>
        <p style="font-size:0.72rem; color:var(--text-muted); margin:8px 0 10px; line-height:1.4;">
          예: 1코트 4번째 경기를 → 2코트 3번째로 옮기려면 코트를 <b>2</b>, 순서를 <b>3</b>으로 변경하세요.
        </p>
        <button type="button" class="btn btn-sm" style="width:100%; background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff; font-weight:700; border:none; padding:8px; border-radius:8px;" onclick="window.reassignMatch()">📍 배정 변경 적용</button>
      </div>
    </div>
    <div style="padding-top:12px; border-top:1px dashed var(--border);">
      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-align:center;">대비 / 돌발 상황 빠른 처리</div>
      <div style="display:flex; justify-content:center; gap:8px;">
        <button type="button" class="btn btn-sm" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);" onclick="window.handleWalkover(2)">${t1} 기권 (팀2 부전승)</button>
        <button type="button" class="btn btn-sm" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);" onclick="window.handleWalkover(1)">${t2} 기권 (팀1 부전승)</button>
      </div>
    </div>
    `, async () => {
    await api('/' + currentTournament.id + '/matches/' + matchId + '/score', {
      method: 'PUT', body: {
        team1_set1: parseInt(document.getElementById('sc11').value) || 0,
        team1_set2: parseInt(document.getElementById('sc12').value) || 0,
        team1_set3: parseInt(document.getElementById('sc13').value) || 0,
        team2_set1: parseInt(document.getElementById('sc21').value) || 0,
        team2_set2: parseInt(document.getElementById('sc22').value) || 0,
        team2_set3: parseInt(document.getElementById('sc23').value) || 0,
        winner_team: document.getElementById('scWinner').value ? parseInt(document.getElementById('scWinner').value) : null,
        status: document.getElementById('scStatus').value
      }
    });
    showToast('점수가 저장되었습니다');
    closeModal();
    renderTabContent();
  });

  // Reassign handler
  window.reassignMatch = async () => {
    const newCourt = parseInt(document.getElementById('scCourt').value);
    const newOrder = parseInt(document.getElementById('scOrder').value);
    const newTime = document.getElementById('scTime').value || null;
    const oldCourt = m.court_number || 0;
    const oldOrder = m.match_order || 1;
    const oldTime = m.scheduled_time || null;

    if (newCourt === oldCourt && newOrder === oldOrder && newTime === oldTime) {
      showToast('변경된 내용이 없습니다.', 'warning');
      return;
    }

    const desc = [];
    if (newCourt !== oldCourt) desc.push('코트 ' + oldCourt + ' → ' + newCourt);
    if (newOrder !== oldOrder) desc.push('순서 ' + oldOrder + ' → ' + newOrder);
    if (newTime !== oldTime) desc.push('시간 ' + (oldTime || '미정') + ' → ' + (newTime || '미정'));

    if (!confirm('경기 배정을 변경합니다:\n\n' + desc.join('\n') + '\n\n계속하시겠습니까?')) return;

    try {
      await api('/' + currentTournament.id + '/matches/' + matchId + '/reassign', {
        method: 'PUT',
        body: { court_number: newCourt, match_order: newOrder, scheduled_time: newTime }
      });
      showToast('✅ 경기 배정이 변경되었습니다! (' + desc.join(', ') + ')', 'success');
      closeModal();
      renderTabContent();
    } catch (e) {
      showToast('배정 변경 실패: ' + e.message, 'error');
    }
  };

  window.handleWalkover = (winnerNum) => {
    document.getElementById('scStatus').value = 'completed';
    document.getElementById('scWinner').value = winnerNum;

    // 부전승/기권승 기본 콜드스코어 세팅 (예: 배드민턴 0-0, 0-0 승리 처리 또는 테니스 규정에 맞는 6-0 등)
    // 여기서는 상대팀의 모든 점수를 0으로, 승리팀은 그대로 두거나 0-0 상태에서 승리만 마킹합니다.
    document.getElementById('sc11').value = 0; document.getElementById('sc12').value = 0; document.getElementById('sc13').value = 0;
    document.getElementById('sc21').value = 0; document.getElementById('sc22').value = 0; document.getElementById('sc23').value = 0;

    showToast('부전승(기권승) 처리가 세팅되었습니다. 확인을 눌러 저장하세요.', 'warning');
  };
}

// ===== Standings Tab =====
async function renderStandings(c) {
  c.innerHTML = '<div class="loading"><div class="spinner"></div>순위 계산중...</div>';
  standings = await api('/' + currentTournament.id + '/standings');

  if (!standings.length) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(249,115,22,0.15)); animation:floatIcon 3s ease-in-out infinite;">📈</div>
        <h3 style="font-size:1.3rem; margin-bottom:12px;">아직 순위 데이터가 없습니다</h3>
        <p style="font-size:1.05rem; margin-bottom:24px;">진행 중인 경기가 완료되고 점수가 입력되면<br>승자승 및 득실 차 원칙에 따라 <strong>자동으로 순위가 계산</strong>됩니다.</p>
        <div style="display:flex; justify-content:center;">
          <button class="btn btn-primary" onclick="switchTab('matches')">경기 탭으로 이동 →</button>
        </div>
      </div>
      `;
    return;
  }

  const isTennis = currentTournament.sport_type === 'tennis';
  const noticeMsg = isTennis ? '<p style="font-size:0.85rem; color:var(--primary); margin-bottom:16px; padding:10px; background:rgba(var(--primary-rgb, 16, 185, 129), 0.1); border-radius:8px;">🎾 <strong>순위 산정:</strong> 승자승 원칙 적용. 동률 시 "세트/게임 득실차" 우선</p>' : '';

  // Group by event + group_num
  const grouped = {};
  standings.forEach(s => {
    const key = s.event_name + (s.group_num ? ' - ' + s.group_num + '조' : '');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  c.innerHTML = noticeMsg + Object.entries(grouped).map(([key, items]) => `
      <div class="card" style = "margin-bottom:16px">
      <div class="card-title">${key}</div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>순위</th><th>팀</th><th>승</th><th>패</th><th>승점</th><th>${isTennis ? '득점(게임)' : '득점'}</th><th>${isTennis ? '실점(게임)' : '실점'}</th><th>${isTennis ? '게임득실차' : '득실차'}</th></tr></thead>
          <tbody>
          ${items.map((s, i) => `<tr>
            <td><strong>${i + 1}</strong></td>
            <td>${s.team_name || (s.p1_name + ' · ' + s.p2_name)}</td>
            <td style="color:#10b981;font-weight:600">${s.wins}</td>
            <td style="color:#ef4444">${s.losses}</td>
            <td><strong>${s.points}</strong></td>
            <td>${s.score_for}</td>
            <td>${s.score_against}</td>
            <td style="font-weight:600;color:${s.goal_difference > 0 ? '#10b981' : s.goal_difference < 0 ? '#ef4444' : 'inherit'}">${s.goal_difference > 0 ? '+' : ''}${s.goal_difference}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
      `).join('');
}

// ===== QR Scanner Tab =====

function renderQrScanner(c) {
  if (!isAuthenticated) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(239,68,68,0.15)); animation:floatIcon 3s ease-in-out infinite;">📷</div>
        <h3 style="font-size:1.3rem; margin-bottom:12px; color:var(--text-primary);">인증 권한 없음</h3>
        <p style="font-size:1.05rem; margin-bottom:24px;">QR 스캐너를 통해 현장에서 선수를 체크인하려면<br>진행 권한을 가진 관리자 인증이 필요합니다.</p>
        <button class="btn btn-warning" style="padding:14px 30px; font-size:1.1rem; border-radius:30px; box-shadow:0 10px 25px -5px rgba(245,158,11,0.5);" onclick="showAuthModal()">🔐 관리자 로그인</button>
      </div> `;
    return;
  }
  c.innerHTML = `
      <div class="card" style = "max-width:600px;margin:0 auto;text-align:center">
      <div class="card-title" style="font-size:1.4rem;color:#10b981">📷 현장 참가자 체크인</div>
      <p style="color:var(--text-muted);font-size:0.9rem;margin:12px 0 24px">선수의 모바일 화면(내 경기 확인 탭)의 QR코드를 카메라에 스캔해주세요.</p>
      
      <div id="qr-reader" style="width:100%;max-width:400px;margin:0 auto;border-radius:12px;overflow:hidden;background:#1e293b;box-shadow:0 10px 25px rgba(0,0,0,0.5)"></div>
      
      <div id="qr-result" style="margin-top:30px;font-weight:700;font-size:1.2rem;min-height:40px;padding:12px;background:rgba(255,255,255,0.03);border-radius:12px">대기 중...</div>
    </div>
      `;
  setTimeout(initQrScanner, 200);
}

function initQrScanner() {
  if (html5QrcodeScanner) html5QrcodeScanner.clear();

  if (typeof Html5QrcodeScanner === 'undefined') {
    document.getElementById('qr-result').innerHTML = '<span style="color:#ef4444">카메라 라이브러리를 불러오지 못했습니다. 새로고침 해주세요.</span>';
    return;
  }

  html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);

  html5QrcodeScanner.render(async (decodedText) => {
    try {
      const data = JSON.parse(decodedText);
      if (!data.pid || !data.tid) return;
      if (data.tid != currentTournament.id) {
        document.getElementById('qr-result').innerHTML = '<span style="color:#ef4444">❌ 다른 대회의 QR코드입니다!</span>';
        return;
      }
      if (lastScannedPid === data.pid) return; // debounce
      lastScannedPid = data.pid;

      document.getElementById('qr-result').innerHTML = '<span style="color:#38bdf8">⏳ 서버 통신 중...</span>';
      const res = await api('/' + data.tid + '/participants/' + data.pid + '/checkin', { method: 'PATCH' });

      const isCheckIn = res.checked_in;
      document.getElementById('qr-result').innerHTML = '<span style="color:' + (isCheckIn ? '#10b981' : '#f59e0b') + '">' +
        (isCheckIn ? '✅ <strong>ID ' + data.pid + '번 참가자 체크인 완료!</strong>' : '⚠️ <strong>ID ' + data.pid + '번 참가자 체크인 해제됨</strong>') + '</span>';

      setTimeout(() => { lastScannedPid = null; }, 4000);

    } catch (e) {
      console.error(e);
    }
  }, () => { });
}

// ===== Settings Tab =====
async function renderSettings(c) {
  if (!isAuthenticated) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="font-size:4.5rem; filter:drop-shadow(0 10px 15px rgba(245,158,11,0.15)); animation:floatIcon 3s ease-in-out infinite;">🔐</div>
        <h3 style="font-size:1.3rem; margin-bottom:12px; color:var(--text-primary);">관리자 전용 기능</h3>
        <p style="font-size:1.05rem; margin-bottom:24px;">대회 설정을 변경하거나 대회 삭제와 같은 권한은<br>관리자 인증을 완료한 유저만 접근할 수 있습니다.</p>
        <button class="btn btn-warning" style="padding:14px 30px; font-size:1.1rem; border-radius:30px; box-shadow:0 10px 25px -5px rgba(245,158,11,0.5);" onclick="showAuthModal()">🔐 관리자 인증하기</button>
      </div> `;
    return;
  }

  // Load venues
  venues = await api('/' + currentTournament.id + '/venues');

  const t = currentTournament;
  c.innerHTML = `
      <div class="grid-2">
      <div class="card">
        <div class="card-title">대회 정보</div>
        <div class="form-group" style="margin-top:12px"><label>대회명</label><input class="form-control" id="setName" value="${t.name}"></div>
        <div class="form-group"><label>설명</label><input class="form-control" id="setDesc" value="${t.description || ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>기본 코트 수</label><input class="form-control" id="setCourts" type="number" value="${t.courts}" min="1"></div>
          <div class="form-group"><label>팀당 경기수</label><input class="form-control" id="setGames" type="number" value="${t.games_per_player}" min="1"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>예선 목표점수 (예: 25)</label><input class="form-control" id="setScorePrelim" type="number" value="${t.score_rule_prelim || 25}" min="1"></div>
          <div class="form-group"><label>본선 목표점수 (예: 21)</label><input class="form-control" id="setScoreFinal" type="number" value="${t.score_rule_final || 21}" min="1"></div>
          <div class="form-group"><label>최대 세트수 (1~3)</label><input class="form-control" id="setMaxSets" type="number" value="${t.max_sets || 1}" min="1" max="3"></div>
        </div>
        <button class="btn btn-primary" onclick="saveTournamentSettings()">💾 저장</button>

        <hr style="border-color:var(--border);margin:24px 0">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
           <div class="card-title" style="margin:0">경기장 (Venues) 관리</div>
           <button class="btn btn-sm btn-primary" onclick="showCreateVenue()">+ 추가</button>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">대회가 여러 경기장에서 나뉘어 진행될 경우 각 경기장을 등록하세요.</p>
        
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>경기장명</th><th>할당 코트 수</th><th>방송 송출명</th><th>관리</th></tr></thead>
            <tbody>
              ${venues.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:15px;color:var(--text-muted)">등록된 경기장이 없습니다. (기본 경기장으로 운영)</td></tr>' : ''}
              ${venues.map(v => `
                <tr>
                  <td><strong>${v.name}</strong></td>
                  <td>${v.courts_count || 0}</td>
                  <td>${v.stream_name || '-'}</td>
                  <td>
                     <button class="btn btn-sm" onclick="showEditVenue(${v.id})" style="padding:4px 8px;font-size:0.75rem">수정</button>
                     <button class="btn btn-sm btn-danger" onclick="deleteVenue(${v.id})" style="padding:4px 8px;font-size:0.75rem">삭제</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title">대회 상태</div>
        <div class="form-group" style="margin-top:12px"><label>상태 변경</label>
          <select class="form-control" id="setStatus">
            ${['draft', 'open', 'in_progress', 'completed', 'cancelled'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${getStatusLabel(s)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-warning" onclick="changeStatus()">⚡ 상태 변경</button>
        <hr style="border-color:var(--border);margin:16px 0">
        <div class="card-title" style="color:#ef4444">⚠️ 위험 구역</div>
        <div class="form-group" style="margin-top:12px">
          <label>합병 기준 팀수: <strong id="mergeVal">${t.merge_threshold}</strong></label>
          <input type="range" id="setMerge" min="2" max="20" value="${t.merge_threshold}" oninput="document.getElementById('mergeVal').textContent=this.value">
        </div>
        <button class="btn btn-sm" onclick="saveMergeThreshold()">합병 기준 저장</button>
        <hr style="border-color:var(--border);margin:16px 0">
        <button class="btn btn-danger" onclick="deleteTournament()">🗑️ 대회 삭제</button>
      </div>
    </div>
    `;
}

async function saveTournamentSettings() {
  await api('/' + currentTournament.id, {
    method: 'PUT', body: {
      name: document.getElementById('setName').value,
      description: document.getElementById('setDesc').value,
      format: currentTournament.format,
      courts: parseInt(document.getElementById('setCourts').value),
      games_per_player: parseInt(document.getElementById('setGames').value),
      merge_threshold: currentTournament.merge_threshold,
      admin_password: currentTournament.admin_password,
      score_rule_prelim: parseInt(document.getElementById('setScorePrelim').value) || 25,
      score_rule_final: parseInt(document.getElementById('setScoreFinal').value) || 21,
      max_sets: parseInt(document.getElementById('setMaxSets').value) || 1
    }
  });
  currentTournament = await api('/' + currentTournament.id);
  showToast('설정이 저장되었습니다');
  renderApp();
}

async function changeStatus() {
  const status = document.getElementById('setStatus').value;
  await api('/' + currentTournament.id + '/status', { method: 'PATCH', body: { status } });
  currentTournament = await api('/' + currentTournament.id);
  showToast('상태가 변경되었습니다');
  renderApp();
}

async function saveMergeThreshold() {
  const val = parseInt(document.getElementById('setMerge').value);
  await api('/' + currentTournament.id, { method: 'PATCH', body: { merge_threshold: val } });
  currentTournament.merge_threshold = val;
  showToast('합병 기준이 ' + val + '으로 변경되었습니다');
}

async function deleteTournament() {
  if (!confirm('정말 이 대회를 삭제하시겠습니까?')) return;
  if (!confirm('모든 데이터가 삭제됩니다. 정말 실행하시겠습니까?')) return;
  await api('/' + currentTournament.id, { method: 'DELETE' });
  showToast('대회가 삭제되었습니다');
  goHome();
}

// ===== Venues Functions =====
function showCreateVenue() {
  showModal('경기장(Venue) 추가', `
      <div class="form-group"><label>경기장 이름</label><input class="form-control" id="vnName" placeholder="예: 제1체육관"></div>
    <div class="form-group"><label>할당 코트 수</label><input class="form-control" id="vnCourts" type="number" value="4" min="1"></div>
    <div class="form-group"><label>방송 송출명 (선택)</label><input class="form-control" id="vnStream" placeholder="예: venue1"></div>
    `, async () => {
    await api('/' + currentTournament.id + '/venues', {
      method: 'POST', body: {
        name: document.getElementById('vnName').value,
        courts_count: parseInt(document.getElementById('vnCourts').value) || 1,
        stream_name: document.getElementById('vnStream').value
      }
    });
    showToast('경기장이 추가되었습니다.');
    closeModal();
    renderTabContent();
  });
}

function showEditVenue(vid) {
  const v = venues.find(x => x.id === vid);
  if (!v) return;
  showModal('경기장 수정', `
      <div class="form-group"><label>경기장 이름</label><input class="form-control" id="vnName" value="${v.name}"></div>
    <div class="form-group"><label>할당 코트 수</label><input class="form-control" id="vnCourts" type="number" value="${v.courts_count}" min="1"></div>
    <div class="form-group"><label>방송 송출명 (선택)</label><input class="form-control" id="vnStream" value="${v.stream_name || ''}"></div>
    `, async () => {
    await api('/' + currentTournament.id + '/venues/' + vid, {
      method: 'PUT', body: {
        name: document.getElementById('vnName').value,
        courts_count: parseInt(document.getElementById('vnCourts').value) || 1,
        stream_name: document.getElementById('vnStream').value
      }
    });
    showToast('경기장 정보가 수정되었습니다.');
    closeModal();
    renderTabContent();
  });
}

async function deleteVenue(vid) {
  if (!confirm('해당 경기장을 삭제하시겠습니까? (이 경기장에 배정된 종목은 모두 기본 경기장으로 변경됩니다)')) return;
  await api('/' + currentTournament.id + '/venues/' + vid, { method: 'DELETE' });
  showToast('경기장이 삭제되었습니다.');
  renderTabContent();
}

// ===== Modal System =====
let modalOverlay = null;

function showModal(title, body, onConfirm, opts = {}) {
  if (modalOverlay) { modalOverlay.remove(); modalOverlay = null; }
  const { confirmText = '확인', hideCancel = false, wide = false, brutal = false } = opts;

  modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';

  let footerHtml = '';
  if (!brutal) {
    footerHtml = onConfirm
      ? `<div class="modal-footer">
        ${!hideCancel ? '<button class="btn" onclick="closeModal()">취소</button>' : ''}
      <button class="btn btn-primary" id="modalConfirm">${confirmText}</button>
         </div> `
      : opts.confirmText
        ? `<div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal()">${confirmText}</button>
           </div> `
        : '';
  } else {
    // brutal footer is embedded inside body typically
    footerHtml = '';
  }

  const modalClasses = ['modal'];
  if (wide) modalClasses.push('modal-wide');
  if (brutal) modalClasses.push('modal-brutal');

  modalOverlay.innerHTML = `
      <div class="${modalClasses.join(' ')}">
      <div class="modal-header"><h2>${title}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${body}</div>
      ${footerHtml}
    </div>
      `;
  document.body.appendChild(modalOverlay);
  requestAnimationFrame(() => modalOverlay.classList.add('active'));

  if (onConfirm) {
    document.getElementById('modalConfirm').onclick = onConfirm;
  }

  // Click outside to close
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

function closeModal() {
  if (modalOverlay) {
    const el = modalOverlay;
    el.classList.remove('active');
    setTimeout(() => { el?.remove(); if (modalOverlay === el) modalOverlay = null; }, 200);
  }
}


// ===== Organization (Tenant) Portal =====
async function renderOrgApp(slug) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div>조직 정보를 불러오는 중...</div>';

  try {
    const res = await apiFetch('/api/orgs', '/slug/' + slug);
    const org = res.org;
    const tList = res.tournaments || [];

    // Apply organization theme
    if (org.theme_color) {
      document.documentElement.style.setProperty('--primary', org.theme_color);
    }

    document.title = org.name + ' - Match Point';

    let html = `
      <!-- Top Navigation for Org -->
      <nav style="position:fixed; top:0; left:0; right:0; z-index:10000; display:flex; justify-content:space-between; align-items:center; padding:0 clamp(16px,4vw,32px); height:64px; background:#0A0A0A; border-bottom:1px solid rgba(255,255,255,0.05); transition:all 0.3s ease; box-sizing:border-box;">
        <div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="location.href='/org/${org.slug}'">
          <div style="width:32px;height:32px;background:#C8FF00;display:flex;align-items:center;justify-content:center;clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));position:relative;">
            <span style="font-family:'Bebas Neue',sans-serif;color:#0A0A0A;font-size:0.9rem;font-weight:bold;line-height:1;">M</span>
          </div>
          <span style="font-family:'Bebas Neue',sans-serif; font-size:1.5rem; color:#fff; letter-spacing:0.15em;">${org.name}</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px;" id="authNavArea"></div>
      </nav>

      <!-- Custom Hero -->
      <section style="padding:160px 20px 80px; text-align:center; background:linear-gradient(135deg, ${org.theme_color || '#8b5cf6'}1A 0%, rgba(255,255,255,1) 100%);">
        <h1 style="font-size: clamp(2rem, 5vw, 3.5rem); font-weight:900; color:#0f172a; margin-bottom:16px;">
          ${org.site_layout?.hero?.title || org.name + ' 공식 홈페이지'}
        </h1>
        <p style="font-size: clamp(1rem, 2.5vw, 1.2rem); color:#475569; font-weight:500; margin-bottom:24px;">
          ${org.site_layout?.hero?.subtitle || '환영합니다.'}
        </p>
        ${(typeof authGetUser === 'function' && authGetUser() && (authGetUser().global_role === 'super_admin' || (authGetUser().org_roles && authGetUser().org_roles[org.id] === 'admin'))) ?
        `<div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
           <button class="btn" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; box-shadow:0 8px 16px -4px #C8FF0066; background:#1e293b; color:#C8FF00; border:2px solid #C8FF00;" onclick="showCreateTournament()">➕ 이 단체 이름으로 새 대회 개설</button>
           <button class="btn btn-primary" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; box-shadow:0 8px 16px -4px rgba(139,92,246,0.4);" onclick="manageOrg('${org.id}')">⚙️ 이 단체 설정</button>
           <button class="btn" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; border:1px solid rgba(139,92,246,0.3); background:#fff; color:#475569;" onclick="manageOrgMembers('${org.id}')">👥 소속 회원 관리</button>
           <button class="btn" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; border:1px solid rgba(16,185,129,0.3); background:#fff; color:#475569;" onclick="manageOrgDues('${org.id}')">💳 단체 회비 결제</button>
           <button class="btn" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; border:1px solid rgba(249,115,22,0.3); background:#fff; color:#475569;" onclick="manageOrgSchedules('${org.id}')">📅 단체 일정 관리</button>
           <button class="btn" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; border:1px solid rgba(59,130,246,0.3); background:#fff; color:#475569;" onclick="manageOrgBoards('${org.id}')">📋 게시판 관리</button>
           <button class="btn" style="margin-top:10px; border-radius:24px; padding:10px 24px; font-weight:700; border:1px solid rgba(236,72,153,0.3); background:#fff; color:#ec4899;" onclick="manageOrgInventory('${org.id}')">📦 물품 재고관리</button>
         </div>` : ''
      }
      </section>

      <!-- Tournaments List -->
      <section style="padding:40px 20px; max-width:1200px; margin:0 auto;">
        <h2 style="font-size:1.6rem; font-weight:800; color:#0f172a; margin-bottom:24px;">🏆 공식 주최 대회</h2>

    `;

    let layoutTemplate = 'modern';
    if (org.site_layout) {
      if (typeof org.site_layout === 'string') {
        try { layoutTemplate = JSON.parse(org.site_layout).template || 'modern'; } catch (e) { }
      } else {
        layoutTemplate = org.site_layout.template || 'modern';
      }
    }

    if (tList.length === 0) {
      html += '<p style="color:#64748b; text-align:center; padding:40px;">아직 개설된 대회가 없습니다.</p>';
    } else {
      let gridStyle = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:24px;';
      let cardStyle = `border:1px solid ${org.theme_color}33; padding:24px; border-radius:20px; cursor:pointer; background:#fff;`;

      if (layoutTemplate === 'brutalism') {
        gridStyle = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:30px;';
        cardStyle = `border:3px solid #0f172a; padding:24px; box-shadow:8px 8px 0px ${org.theme_color}; border-radius:0; cursor:pointer; background:#fff; transform:translate(0,0); transition:transform 0.1s, box-shadow 0.1s;`;
      } else if (layoutTemplate === 'cards') {
        gridStyle = 'display:flex; flex-direction:column; gap:20px; max-width:800px; margin:0 auto;';
        cardStyle = `border:none; padding:24px 30px; border-radius:20px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05); cursor:pointer; background:linear-gradient(to right, #ffffff, #f8fafc); border-left:8px solid ${org.theme_color}; display:flex; justify-content:space-between; align-items:center;`;
      }

      html += `<div style="${gridStyle}">`;
      tList.forEach(t => {
        if (layoutTemplate === 'cards') {
          html += `
              <div class="tournament-card-t" onclick="location.href='/t?tid=${t.id}'" style="${cardStyle}">
                <div>
                  <h3 style="margin:0 0 8px; font-size:1.4rem; color:#0f172a;">${t.name}</h3>
                  <div style="color:#64748b; font-size:0.9rem;">${t.description || ''}</div>
                </div>
                <div>
                  <span class="badge ${t.status === 'in_progress' ? 'badge-warning' : 'badge-muted'}" style="font-size:1rem; padding:8px 16px;">${getStatusLabel(t.status)}</span>
                </div>
              </div>
            `;
        } else if (layoutTemplate === 'brutalism') {
          html += `
              <div class="tournament-card-b" onclick="location.href='/t?tid=${t.id}'" style="${cardStyle}" onmouseover="this.style.transform='translate(4px, 4px)'; this.style.boxShadow='4px 4px 0px ${org.theme_color}';" onmouseout="this.style.transform='translate(0, 0)'; this.style.boxShadow='8px 8px 0px ${org.theme_color}';">
                <h3 style="font-family:'Bebas Neue',sans-serif; font-size:2rem; letter-spacing:1px; margin-bottom:12px; color:#0f172a;">${t.name}</h3>
                <div style="font-weight:600; color:#475569; margin-bottom:20px;">${t.description || ''}</div>
                <div>
                  <span style="border:2px solid #0f172a; padding:6px 14px; font-weight:800; font-size:0.9rem; background:${t.status === 'in_progress' ? '#C8FF00' : '#e2e8f0'}; color:#0f172a; display:inline-block;">${getStatusLabel(t.status)}</span>
                </div>
              </div>
            `;
        } else {
          html += `
              <div class="tournament-card" onclick="location.href='/t?tid=${t.id}'" style="${cardStyle}">
                <h3>${t.name}</h3>
                <div class="desc">${t.description || ''}</div>
                <div style="margin-bottom:8px">
                  <span class="badge ${t.status === 'in_progress' ? 'badge-warning' : 'badge-muted'}">${getStatusLabel(t.status)}</span>
                </div>
              </div>
            `;
        }
      });
      html += '</div>';
    }

    html += `
      </section>
        <footer style="padding:60px 20px; text-align:center; color:#94a3b8; font-size:0.9rem; background:#f8fafc; border-top:1px solid #f1f5f9; margin-top:80px;">
          <p>${org.name} | 문의: ${org.contact_email || '-'} / ${org.contact_phone || '-'}</p>
          <p style="margin-top:16px;">Powered by <strong>Match Point</strong></p>
          <div style="margin-top:24px;">
            <a href="/" style="color:#64748b; text-decoration:none; font-weight:600; padding:8px 20px; border:1px solid #cbd5e1; border-radius:20px; display:inline-block; transition:all 0.2s; background:#fff;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">
              매치포인트 홈 🏠
            </a>
          </div>
        </footer>
      `;
    app.innerHTML = html;

    // Auth UI 갱신
    if (typeof updateAuthNav === 'function') updateAuthNav();
  } catch (e) {
    app.innerHTML = `<div style="text-align:center; padding:100px 20px;">
      <h2>⚠️ 단체 정보를 찾을 수 없습니다.</h2>
      <p style="color:#64748b; margin-top:10px;">URL을 확인하거나 메인 화면으로 돌아가세요.</p>
      <br><button class="btn btn-primary" onclick="location.href='/'">메인으로 가기</button>
    </div>`;
  }
}

// ===== navigateTo (대회 카드 클릭 시 이동) =====
function navigateTo(queryStr) {
  // queryStr 예: '?tid=5'
  const url = new URL(location);
  const params = new URLSearchParams(queryStr);
  const tid = params.get('tid');

  if (tid) {
    url.searchParams.set('tid', tid);
    history.pushState(null, '', url);

    // 대회 상세 로드
    api('/' + tid, { muteError: true }).then(function (t) {
      currentTournament = t;
      isAuthenticated = (typeof isLoggedIn === 'function' && isLoggedIn()) ? true : false;
      if (t.theme_color) document.documentElement.style.setProperty('--primary', t.theme_color);
      renderApp();
    }).catch(function () {
      renderApp();
    });
  } else {
    // tid 없으면 홈으로
    url.searchParams.delete('tid');
    history.pushState(null, '', url);
    currentTournament = null;
    currentTab = 'overview';
    document.documentElement.style.removeProperty('--primary');
    renderApp();
  }
}

// ===== Init =====
window.currentTenantSlug = null;

window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(location.search);
  const initTid = urlParams.get('tid');
  const initOrg = window.MP_CONFIG?.tenantSlug || urlParams.get('org');

  if (initTid) {
    // 비로그인 시 포털로 리다이렉트
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
      location.href = '/t?tid=' + initTid;
    } else {
      api('/' + initTid, { muteError: true }).then(t => {
        currentTournament = t;
        isAuthenticated = true;
        if (currentTournament.theme_color) document.documentElement.style.setProperty('--primary', currentTournament.theme_color);
        renderApp();
      }).catch(e => {
        renderApp();
      });
    }
  } else if (initOrg) {
    window.currentTenantSlug = initOrg;
    // 항상 단체 전용 홈페이지 랜딩 페이지 렌더링
    // (로그인 상태인 경우 렌더링 내에서 권한별 버튼 자동 노출됨)
    renderOrgApp(initOrg);
  } else {
    renderApp();
  }
});

window.addEventListener('popstate', (e) => {
  const tid = new URLSearchParams(location.search).get('tid');
  if (tid) {
    if (!currentTournament || currentTournament.id != tid) {
      api('/' + tid, { muteError: true }).then(t => {
        currentTournament = t;
        isAuthenticated = (typeof isLoggedIn === 'function' && isLoggedIn()) ? true : false;
        if (currentTournament.theme_color) document.documentElement.style.setProperty('--primary', currentTournament.theme_color);
        else document.documentElement.style.removeProperty('--primary');
        renderApp();
      }).catch(e => renderApp());
    } else renderApp();
  } else {
    currentTournament = null;
    currentTab = 'overview';
    if (html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
    document.documentElement.style.removeProperty('--primary');
    renderApp();
  }
});

// ===== 결과 공유 =====
function shareResults(tid) {
  const url = `${location.origin} /r/${tid} `;
  const title = currentTournament?.name || '대회 결과';

  if (navigator.share) {
    navigator.share({ title, url }).catch(() => { });
    return;
  }

  // 클립보드 복사 fallback
  navigator.clipboard.writeText(url).then(() => {
    showModal('📤 결과 공유', `
        <div style="text-align:center;padding:10px 0 16px;">
        <div style="font-size:2rem;margin-bottom:12px;">🔗</div>
        <p style="font-weight:700;font-size:1rem;margin-bottom:8px;">공개 결과 페이지 URL이 복사되었습니다!</p>
        <div style="background:var(--bg);padding:12px;border-radius:10px;font-family:monospace;font-size:0.82rem;word-break:break-all;color:var(--primary);margin-bottom:16px;">${url}</div>
        <p style="color:var(--text-muted);font-size:0.85rem;">카카오톡, 문자, SNS에 붙여넣기하면<br>순위표를 바로 공유할 수 있습니다.</p>
      </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank"
            style="padding:8px 16px;background:#1877f2;color:#fff;border-radius:20px;text-decoration:none;font-size:0.85rem;font-weight:700;">📘 Facebook</a>
          <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank"
            style="padding:8px 16px;background:#1da1f2;color:#fff;border-radius:20px;text-decoration:none;font-size:0.85rem;font-weight:700;">🐦 Twitter</a>
          <a href="/r/${tid}" target="_blank"
            style="padding:8px 16px;background:rgba(139,92,246,0.1);color:#8b5cf6;border:1px solid rgba(139,92,246,0.3);border-radius:20px;text-decoration:none;font-size:0.85rem;font-weight:700;">🔍 미리보기</a>
        </div>
      `, null, { confirmText: '닫기', hideCancel: true });
  }).catch(() => {
    window.open(`/ r / ${tid} `, '_blank');
  });
}

// ===== 참가 신청 링크 복사 =====
function copyJoinLink(tid) {
  const url = `${location.origin} /join/${tid} `;
  const title = currentTournament?.name || '대회';

  if (navigator.share) {
    navigator.share({ title: `${title} — 참가 신청`, url }).catch(() => { });
    return;
  }

  navigator.clipboard.writeText(url).then(() => {
    showModal('📋 참가 신청 링크', `
        <div style="text-align:center;padding:10px 0 16px;">
        <div style="font-size:2rem;margin-bottom:12px;">🔗</div>
        <p style="font-weight:700;font-size:1rem;margin-bottom:8px;">참가 신청 링크가 복사되었습니다!</p>
        <div style="background:var(--bg);padding:12px;border-radius:10px;font-family:monospace;font-size:0.82rem;word-break:break-all;color:#10b981;margin-bottom:16px;">${url}</div>
        <p style="color:var(--text-muted);font-size:0.85rem;">카카오톡, 문자, SNS에 붙여넣기하면<br>참가자가 직접 신청할 수 있습니다.</p>
      </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <a href="/join/${tid}" target="_blank"
            style="padding:8px 16px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:20px;text-decoration:none;font-size:0.85rem;font-weight:700;">🔍 미리보기</a>
        </div>
      `, null, { confirmText: '닫기', hideCancel: true });
  }).catch(() => {
    window.open(`/ join / ${tid} `, '_blank');
  });
}

// ===== AI 어시스턴트 플로팅 위젯 =====
(function () {
  let _aiChatOpen = false;
  let _aiMessages = [];

  // 위젯 HTML 삽입
  const aiWidget = document.createElement('div');
  aiWidget.id = 'ai-assistant-widget';
  aiWidget.innerHTML = `
    <button id="ai-fab" onclick="toggleAiChat()" style="
      position:fixed; bottom:24px; right:24px; z-index:9999;
      width:56px; height:56px; border-radius:50%;
      background:linear-gradient(135deg,#C8FF00,#a0e000); border:none;
      color:#0A0A0A; font-size:1.5rem; cursor:pointer;
      box-shadow:0 4px 20px rgba(200,255,0,0.3);
      transition:transform 0.2s, box-shadow 0.2s;
      display:flex; align-items:center; justify-content:center;
    " title="AI 어시스턴트">🧠</button>
    <div id="ai-chat-panel" style="
      display:none; position:fixed; bottom:90px; right:24px; z-index:9999;
      width:360px; max-height:500px; border-radius:16px;
      background:rgba(18,18,24,0.95); backdrop-filter:blur(20px);
      border:1px solid rgba(200,255,0,0.2);
      box-shadow:0 8px 40px rgba(0,0,0,0.5);
      display:none; flex-direction:column; overflow:hidden;
    ">
      <div style="padding:14px 16px; background:rgba(200,255,0,0.08); border-bottom:1px solid rgba(200,255,0,0.15); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:800; font-size:0.95rem; color:#C8FF00;">🧠 AI 어시스턴트</span>
        <button onclick="toggleAiChat()" style="background:none;border:none;color:#808090;cursor:pointer;font-size:1.2rem;">✕</button>
      </div>
      <div id="ai-chat-messages" style="flex:1; overflow-y:auto; padding:12px 16px; max-height:340px; min-height:200px;">
        <div style="background:rgba(200,255,0,0.08);border-radius:12px;padding:10px 14px;margin-bottom:8px;font-size:0.85rem;color:#c0c0cc;">
          안녕하세요! 🤖 대회 운영 AI 어시스턴트입니다.<br><br>
          💬 이렇게 물어보세요:<br>
          • "배드민턴 대회 만들어줘"<br>
          • "일정 자동 재조정해줘"<br>
          • "대회 리포트 만들어줘"<br>
          • "오늘 진행 현황 알려줘"
        </div>
      </div>
      <div style="padding:10px 12px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:8px;">
        <input id="ai-chat-input" type="text" placeholder="AI에게 물어보세요..."
          onkeydown="if(event.key==='Enter')sendAiMessage()"
          style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
            border-radius:10px; padding:10px 14px; color:#e8e8ec; font-size:0.88rem; outline:none;">
        <button onclick="sendAiMessage()" style="
          background:linear-gradient(135deg,#C8FF00,#a0e000); border:none;
          border-radius:10px; padding:10px 16px; color:#0A0A0A;
          font-weight:800; font-size:0.85rem; cursor:pointer;
        ">전송</button>
      </div>
    </div>
  `;
  document.body.appendChild(aiWidget);

  window.toggleAiChat = function () {
    const panel = document.getElementById('ai-chat-panel');
    if (!panel) return;
    _aiChatOpen = !_aiChatOpen;
    panel.style.display = _aiChatOpen ? 'flex' : 'none';
    if (_aiChatOpen) {
      setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 100);
    }
  };

  window.sendAiMessage = async function () {
    const input = document.getElementById('ai-chat-input');
    const msgArea = document.getElementById('ai-chat-messages');
    if (!input || !msgArea) return;
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    // 사용자 메시지 표시
    msgArea.innerHTML += `<div style="text-align:right;margin-bottom:8px;">
      <span style="display:inline-block;background:rgba(200,255,0,0.15);color:#e8e8ec;border-radius:12px;padding:8px 14px;font-size:0.85rem;max-width:80%;text-align:left;">${msg}</span>
    </div>`;
    msgArea.scrollTop = msgArea.scrollHeight;

    // 로딩 표시
    const loadId = 'ai-loading-' + Date.now();
    msgArea.innerHTML += `<div id="${loadId}" style="margin-bottom:8px;">
      <div style="display:inline-block;background:rgba(255,255,255,0.04);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#808090;">
        <span class="ai-typing">🧠 생각 중...</span>
      </div>
    </div>`;
    msgArea.scrollTop = msgArea.scrollHeight;

    try {
      // 특수 명령 처리
      const lowerMsg = msg.toLowerCase();

      if (lowerMsg.includes('재조정') || lowerMsg.includes('재스케줄') || lowerMsg.includes('리스케줄')) {
        // 실시간 자동 재스케줄링
        if (currentTournament) {
          const res = await fetch('/api/ai/' + currentTournament.id + '/reschedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }).then(r => r.json());
          document.getElementById(loadId)?.remove();
          const adj = res.adjustments || 0;
          msgArea.innerHTML += `<div style="margin-bottom:8px;">
            <div style="display:inline-block;background:rgba(200,255,0,0.08);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#c0c0cc;max-width:85%;">
              ✅ 자동 재스케줄링 완료!<br>
              📊 ${adj}개 경기 시간 조정됨<br>
              ${res.summary ? `⏰ 지연: ${res.summary.delayed}건 (평균 ${res.summary.avg_delay}분)<br>⏩ 앞당김: ${res.summary.advanced}건 (평균 ${res.summary.avg_advance}분)` : ''}
            </div>
          </div>`;
        } else {
          document.getElementById(loadId)?.remove();
          msgArea.innerHTML += `<div style="margin-bottom:8px;"><div style="display:inline-block;background:rgba(255,255,255,0.04);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#c0c0cc;">먼저 대회를 선택해주세요.</div></div>`;
        }
      } else if (lowerMsg.includes('리포트') || lowerMsg.includes('보고서') || lowerMsg.includes('분석')) {
        // AI 대회 리포트
        if (currentTournament) {
          const res = await fetch('/api/ai/' + currentTournament.id + '/report').then(r => r.json());
          document.getElementById(loadId)?.remove();
          let reportHtml = `📊 <b>${res.tournament?.name || '대회'} AI 리포트</b><br><br>`;
          reportHtml += `👥 참가자: ${res.summary?.total_participants || 0}명<br>`;
          reportHtml += `🏸 총 경기: ${res.summary?.total_matches || 0}경기<br>`;
          reportHtml += `✅ 완료율: ${res.summary?.completion_rate || 0}%<br><br>`;
          if (res.ai_insights && res.ai_insights.length > 0) {
            reportHtml += `<b>🧠 AI 인사이트:</b><br>`;
            reportHtml += res.ai_insights.map(i => `${i}`).join('<br>');
          }
          msgArea.innerHTML += `<div style="margin-bottom:8px;"><div style="display:inline-block;background:rgba(200,255,0,0.08);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#c0c0cc;max-width:85%;line-height:1.6;">${reportHtml}</div></div>`;
        } else {
          document.getElementById(loadId)?.remove();
          msgArea.innerHTML += `<div style="margin-bottom:8px;"><div style="display:inline-block;background:rgba(255,255,255,0.04);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#c0c0cc;">먼저 대회를 선택해주세요.</div></div>`;
        }
      } else {
        // AI 어시스턴트 (대회 설정/일반 질문)
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        }).then(r => r.json());

        document.getElementById(loadId)?.remove();
        const reply = res.explanation || res.raw || '응답을 생성하지 못했습니다.';
        let actionHtml = '';
        if (res.parsed && res.parsed.action === 'create_tournament' && res.parsed.tournament) {
          actionHtml = `<br><br><button onclick="applyAiTournamentSetup()" style="background:linear-gradient(135deg,#C8FF00,#a0e000);color:#0A0A0A;border:none;border-radius:8px;padding:6px 16px;font-weight:800;font-size:0.82rem;cursor:pointer;">✅ 이대로 생성하기</button>`;
          window._aiParsedSetup = res.parsed;
        }
        msgArea.innerHTML += `<div style="margin-bottom:8px;">
          <div style="display:inline-block;background:rgba(200,255,0,0.08);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#c0c0cc;max-width:85%;line-height:1.6;white-space:pre-wrap;">${reply}${actionHtml}</div>
        </div>`;
      }
    } catch (err) {
      document.getElementById(loadId)?.remove();
      msgArea.innerHTML += `<div style="margin-bottom:8px;"><div style="display:inline-block;background:rgba(239,68,68,0.1);border-radius:12px;padding:10px 14px;font-size:0.85rem;color:#f87171;">오류: ${err.message || err}</div></div>`;
    }
    msgArea.scrollTop = msgArea.scrollHeight;
  };

  // AI 추천 대회 생성 적용
  window.applyAiTournamentSetup = function () {
    if (!window._aiParsedSetup) return;
    const setup = window._aiParsedSetup;
    showCreateTournament();
    setTimeout(() => {
      const nameInput = document.getElementById('tournamentName');
      const sportSelect = document.getElementById('sportType');
      const courtsInput = document.getElementById('courts');
      if (nameInput && setup.tournament?.name) nameInput.value = setup.tournament.name;
      if (sportSelect && setup.tournament?.sport_type) sportSelect.value = setup.tournament.sport_type;
      if (courtsInput && setup.tournament?.courts) courtsInput.value = setup.tournament.courts;
      showToast('AI가 대회 정보를 입력했습니다. 확인 후 생성해주세요!', 'success');
    }, 300);
  };
})();

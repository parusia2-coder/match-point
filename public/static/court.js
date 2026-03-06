// ===== 코트 점수판 v3.0 - Club Tournament Scoreboard =====
// PWA Enhanced: Offline mode + Judge quick-access + Sound/Vibration
'use strict';

const params = new URLSearchParams(location.search);
const tid = params.get('tid');
const courtNum = params.get('court');
const locked = params.get('locked') === '1';
const autoNext = params.get('autonext') === 'true';
const vid = params.get('vid') || '';
const judgeMode = params.get('judge') === '1'; // 심판 퀵모드

let viewMode = (tid && courtNum) ? 'scoreboard' : (tid ? 'center' : 'list');

// === Data ===
let currentMatch = null;
let nextMatch = null;
let recentMatches = [];
let undoStack = [];
let tournaments = [];
let courtCenterData = [];
let venuesData = [];
let tInfo = null;
let centerTab = 'status';
let isOnline = navigator.onLine;

// =========================================================
//  🔌 오프라인 큐 시스템 (IndexedDB)
// =========================================================
const OFFLINE_DB = 'mp_offline_queue';
const OFFLINE_STORE = 'score_queue';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueOffline(data) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(OFFLINE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_STORE).add({ ...data, timestamp: Date.now() });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    showOfflineToast('📴 오프라인 저장됨 — 온라인 복구 시 자동 동기화');
  } catch (e) { console.error('Offline enqueue failed:', e); }
}

async function syncOfflineQueue() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(OFFLINE_STORE, 'readonly');
    const store = tx.objectStore(OFFLINE_STORE);
    const items = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (items.length === 0) return;
    showOfflineToast(`🔄 ${items.length}건 동기화 중...`);

    for (const item of items) {
      try {
        await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body)
        });
        // 성공 → 큐에서 제거
        const delTx = db.transaction(OFFLINE_STORE, 'readwrite');
        delTx.objectStore(OFFLINE_STORE).delete(item.id);
      } catch (e) { break; } // 아직 오프라인이면 중단
    }
    showOfflineToast('✅ 오프라인 데이터 동기화 완료!');
  } catch (e) { console.error('Sync failed:', e); }
}

function showOfflineToast(msg) {
  let toast = document.getElementById('offlineToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'offlineToast';
    toast.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 20px;background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#f8fafc;font-size:0.85rem;font-weight:600;z-index:99999;transition:opacity 0.5s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// Online/Offline 감지
window.addEventListener('online', () => {
  isOnline = true;
  syncOfflineQueue();
  showOfflineToast('🟢 온라인 복구!');
});
window.addEventListener('offline', () => {
  isOnline = false;
  showOfflineToast('📴 오프라인 모드 — 점수 입력은 계속 가능합니다');
});

// =========================================================
//  🔊 소리/진동 피드백 시스템
// =========================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playScoreSound() {
  try {
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) { }
}

function playFinishSound() {
  try {
    const ctx = ensureAudioCtx();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  } catch (e) { }
}

function playCourtChangeSound() {
  try {
    const ctx = ensureAudioCtx();
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.25);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.25);
    });
  } catch (e) { }
}

function vibrateStrong() {
  if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
}

// === Game State (핵심) ===
let gameState = {
  phase: 'waiting',      // waiting | setup | playing | court_change | finished | signature
  gameType: '25pt',       // 25pt | 21pt | 1set (Tennis)
  maxScore: 25,
  courtChangeAt: 13,
  courtChanged: false,
  leftTeamIdx: 1,         // 현재 좌측 팀 (1 or 2)
  rightTeamIdx: 2,
  serving: 1,             // 서브하는 팀 idx
  startTime: null,
  elapsed: '00:00',
  timerInterval: null
};

// === Render Router ===
function render() {
  const app = document.getElementById('court-app');
  if (!app) return;
  if (viewMode === 'list') return renderTournamentList(app);
  if (viewMode === 'center') return renderCourtCenter(app);

  switch (gameState.phase) {
    case 'waiting': return renderWaiting(app);
    case 'setup': return renderSetup(app);
    case 'playing': return renderScoreboard(app);
    case 'court_change': return renderCourtChange(app);
    case 'finished': return renderFinished(app);
    case 'signature': return renderSignature(app);
    default: return renderWaiting(app);
  }
}

// =========================================================
//  Phase 0: 대회 목록 / 코트 센터 (기존 유지)
// =========================================================
async function loadTournamentList() {
  const res = await fetch('/api/tournaments');
  tournaments = await res.json();
  render();
}

async function loadCourtCenterData() {
  try {
    const urls = [
      '/api/tournaments/' + tid,
      '/api/tournaments/' + tid + '/courts/overview' + (vid ? '?venue_id=' + vid : ''),
      '/api/tournaments/' + tid + '/venues'
    ];
    const [tRes, cRes, vRes] = await Promise.all(urls.map(url => fetch(url)));

    if (!tRes.ok || !cRes.ok) {
      alert('대회 정보를 불러올 수 없거나 삭제되었습니다.');
      location.href = '/court';
      return;
    }
    tInfo = await tRes.json();
    courtCenterData = await cRes.json();
    if (vRes && vRes.ok) venuesData = await vRes.json();

    if (!Array.isArray(courtCenterData)) courtCenterData = [];
    if (!Array.isArray(venuesData)) venuesData = [];
    render();
  } catch (e) {
    console.error(e);
    alert('데이터를 불러오는데 실패했습니다.');
    location.href = '/court';
  }
}

function renderTournamentList(app) {
  let html = `<div style="min-height:100vh;background:#1e222d;color:#e2e8f0;font-family:'Pretendard',sans-serif;display:flex;flex-direction:column;align-items:center;padding:40px 20px;">
    
    <div style="text-align:center;margin-bottom:40px;">
      <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);width:80px;height:80px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:3rem;margin:0 auto 20px;box-shadow:0 10px 25px rgba(59,130,246,0.3);">🏸</div>
      <h1 style="font-size:2.5rem;font-weight:900;color:#f8fafc;margin:0 0 10px;">코트 점수판</h1>
      <p style="color:#94a3b8;font-size:1.1rem;margin:0 0 10px;">코트에 배치할 태블릿에서 사용하세요</p>
      <p style="color:#64748b;font-size:0.9rem;margin:0;">고정 URL: /court?tid=대회ID&court=코트번호&locked=1</p>
    </div>

    <div style="width:100%;max-width:800px;">
      <div style="text-align:center;font-size:1.2rem;font-weight:700;color:#fbd38d;margin-bottom:20px;">📋 대회를 선택하세요</div>
      <div style="display:flex;flex-direction:column;gap:16px;">`;

  if (!tournaments.length) {
    html += `<div style="text-align:center;padding:40px;background:#2a303c;border-radius:16px;">진행 중인 대회가 없습니다.</div>`;
  } else {
    tournaments.forEach(t => {
      const isTennis = t.sport_type === 'tennis';
      const sportIcon = isTennis ? '🎾' : '🏸';
      const sportText = isTennis ? '테니스' : '배드민턴';
      const badge = t.status === 'in_progress' ? '<span style="color:#22c55e;font-weight:700;font-size:1rem;">진행중</span>' : '';
      html += `<div onclick="location.href='?tid=${t.id}'" style="padding:24px;background:#2a303c;border-radius:16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s;" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#2a303c'">
        <div>
          <h2 style="margin:0 0 8px 0;font-size:1.4rem;color:#f1f5f9;display:flex;align-items:center;gap:8px;">${sportIcon} ${t.name}</h2>
          <div style="color:#94a3b8;font-size:0.95rem;">${sportText} · ${t.courts || 2}코트</div>
        </div>
        <div>${badge}</div>
      </div>`;
    });
  }
  html += `</div></div></div>`;
  app.innerHTML = html;
}

function renderCourtCenter(app) {
  if (!tInfo) return;
  const sportIcon = tInfo.sport_type === 'tennis' ? '🎾' : '🏸';
  let html = `<div style="min-height:100vh;background:#1e222d;color:#f8fafc;font-family:'Pretendard',sans-serif;display:flex;flex-direction:column;align-items:center;padding:40px 20px;position:relative;">

    <!-- 좌상단 뒤로가기 -->
    <button onclick="location.href='/?tid=${tid}'" style="position:absolute;top:20px;left:20px;padding:8px 16px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#94a3b8;cursor:pointer;font-weight:600;font-size:0.85rem;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">← 대회 관리</button>

    <div style="text-align:center;margin-bottom:30px;width:100%;max-width:800px;">
      <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 16px;box-shadow:0 8px 20px rgba(59,130,246,0.2);">${sportIcon}</div>
      <h1 style="font-size:2.2rem;font-weight:900;color:#f8fafc;margin:0 0 8px;">코트 점수판</h1>
      <p style="color:#94a3b8;font-size:1rem;margin:0 0 8px;">코트에 배치할 태블릿에서 사용하세요</p>
      <p style="color:#64748b;font-size:0.85rem;margin:0 0 30px;">고정 URL: /court?tid=대회ID&court=코트번호&locked=1</p>
      
      <div style="font-size:1.3rem;font-weight:800;color:#60a5fa;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px;">${sportIcon} ${tInfo.name}</div>
      <div style="color:#94a3b8;font-size:1.1rem;margin-bottom:24px;">코트를 선택하세요</div>

      ${venuesData.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:24px;">
        <button onclick="location.href='/court?tid=${tid}'" style="padding:8px 16px;border-radius:20px;border:1px solid ${!vid ? '#3b82f6' : 'rgba(255,255,255,0.1)'};background:${!vid ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)'};color:${!vid ? '#60a5fa' : '#94a3b8'};cursor:pointer;font-weight:700;font-size:0.9rem;transition:all 0.2s;">전체 장소</button>
        ${venuesData.map(v => `
          <button onclick="location.href='/court?tid=${tid}&vid=${v.id}'" style="padding:8px 16px;border-radius:20px;border:1px solid ${vid == v.id ? '#3b82f6' : 'rgba(255,255,255,0.1)'};background:${vid == v.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)'};color:${vid == v.id ? '#60a5fa' : '#94a3b8'};cursor:pointer;font-weight:700;font-size:0.9rem;transition:all 0.2s;">${v.name}</button>
        `).join('')}
      </div>` : ''}

      <div style="display:flex;gap:12px;justify-content:center;">
        <button onclick="window.open('/board?tid=${tid}${vid ? '&vid=' + vid : ''}', '_blank')" style="padding:10px 20px;background:#252d3a;border:1px solid #3b82f6;border-radius:8px;color:#60a5fa;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:8px;">📺 대형 전광판</button>
        <button onclick="showQRCodeModal()" style="padding:10px 20px;background:#312e81;border:1px solid #4f46e5;border-radius:8px;color:#c7d2fe;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:8px;">📱 QR 코드 생성</button>
          <button onclick="enterJudgeMode()" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ef4444);border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:8px;">👨‍⚖️ 심판 퀵모드</button>
        </div>
    </div>

    <!-- 코트 그리드 -->
    <div style="width:100%;max-width:800px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:40px;">`;

  courtCenterData.forEach(c => {
    const hasMatch = c.current;

    if (hasMatch) {
      const isTennis = tInfo.sport_type === 'tennis';
      const t1 = c.current.team1_name || '?';
      const t2 = c.current.team2_name || '?';

      html += `<div onclick="location.href='/court?tid=${tid}&court=${c.court}${vid ? '&vid=' + vid : ''}'" style="padding:40px 20px;background:#22c55e;border-radius:24px;cursor:pointer;text-align:center;box-shadow:0 10px 20px rgba(34,197,94,0.3);transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
        <div style="font-size:3.5rem;font-weight:900;color:#ffffff;line-height:1;margin-bottom:12px;">${c.court}</div>
        <div style="font-size:1.2rem;font-weight:700;color:#ffffff;margin-bottom:20px;">${c.court}코트</div>
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.2);padding:8px 16px;border-radius:20px;color:#ffffff;font-size:0.95rem;font-weight:600;"><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:50%;box-shadow:0 0 5px #16a34a;"></span> ${t1} vs ${t2}</div>
      </div>`;
    } else {
      html += `<div onclick="location.href='/court?tid=${tid}&court=${c.court}${vid ? '&vid=' + vid : ''}'" style="padding:40px 20px;background:#3f4b5b;border-radius:24px;cursor:pointer;text-align:center;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
        <div style="font-size:3.5rem;font-weight:900;color:#ffffff;line-height:1;margin-bottom:12px;">${c.court}</div>
        <div style="font-size:1.2rem;font-weight:700;color:#cbd5e1;margin-bottom:20px;">${c.court}코트</div>
        <div style="color:#94a3b8;font-size:1rem;font-weight:600;">대기: ${c.pending}경기</div>
      </div>`;
    }
  });

  html += `</div>
    <div style="width:100%;max-width:1000px;">
      <button onclick="location.href='/court'" style="width:100%;padding:16px 0;background:#2a303c;border:none;border-radius:12px;color:#94a3b8;cursor:pointer;font-weight:700;font-size:1.1rem;transition:background 0.2s;" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='#2a303c'">📋 대회 다시 선택</button>
    </div>
  </div>`;

  app.innerHTML = html;
}

// =========================================================
//  QR Code Modal  (3 modes: judge / view / watch)
// =========================================================
window.showQRCodeModal = function () {
  const existing = document.getElementById('qrModal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'qrModal';
  backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

  // QR 카드 HTML 생성
  const courts = courtCenterData || [];
  const cardsHtml = courts.map(c => {
    const judReq = '&court=' + c.court + (vid ? '&vid=' + vid : '');
    const judgeUrl = location.origin + '/court?tid=' + tid + judReq;
    const viewUrl = location.origin + '/court?tid=' + tid + judReq + '&locked=1';
    const watchUrl = location.origin + '/watch?tid=' + tid + '&court=' + c.court + (vid ? '&vid=' + vid : '');
    const qrBase = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=';

    return [
      // 심판용 카드
      `<div class="qr-cell-judge" style="background:#fff;border-radius:16px;padding:20px;text-align:center;">
        <div style="font-weight:900;font-size:1.1rem;color:#0f172a;margin-bottom:4px;">${c.court}코트</div>
        <div style="font-size:0.7rem;color:#15803d;font-weight:700;margin-bottom:12px;">🏸 심판용 · 점수 입력 가능</div>
        <img src="${qrBase}${encodeURIComponent(judgeUrl)}" alt="QR" style="width:180px;height:180px;margin:0 auto 12px;display:block;">
        <div style="display:flex;gap:6px;justify-content:center;">
          <button onclick="window._copyQr('${judgeUrl}')" style="padding:7px 12px;background:#f1f5f9;border:none;border-radius:8px;color:#3b82f6;font-weight:600;cursor:pointer;font-size:0.85rem;">📋 복사</button>
          <button onclick="window.open('${judgeUrl}','_blank')" style="padding:7px 12px;background:#f1f5f9;border:none;border-radius:8px;color:#3b82f6;font-weight:600;cursor:pointer;font-size:0.85rem;">↗ 열기</button>
        </div>
      </div>`,
      // 관람용 카드
      `<div class="qr-cell-view" style="background:#0f1e35;border:2px solid #0ea5e9;border-radius:16px;padding:20px;text-align:center;display:none;">
        <div style="font-weight:900;font-size:1.1rem;color:#f8fafc;margin-bottom:4px;">${c.court}코트</div>
        <div style="font-size:0.7rem;color:#38bdf8;font-weight:700;margin-bottom:12px;">📺 관람용 · 읽기전용 (터치 비활성)</div>
        <img src="${qrBase}${encodeURIComponent(viewUrl)}" alt="QR" style="width:180px;height:180px;margin:0 auto 12px;display:block;border-radius:6px;">
        <div style="display:flex;gap:6px;justify-content:center;">
          <button onclick="window._copyQr('${viewUrl}')" style="padding:7px 12px;background:#1e293b;border:1px solid #0ea5e9;border-radius:8px;color:#38bdf8;font-weight:600;cursor:pointer;font-size:0.85rem;">📋 복사</button>
          <button onclick="window.open('${viewUrl}','_blank')" style="padding:7px 12px;background:#1e293b;border:1px solid #0ea5e9;border-radius:8px;color:#38bdf8;font-weight:600;cursor:pointer;font-size:0.85rem;">↗ 열기</button>
        </div>
      </div>`,
      // 워치용 카드
      `<div class="qr-cell-watch" style="background:#0f172a;border:2px solid #7c3aed;border-radius:16px;padding:20px;text-align:center;display:none;">
        <div style="font-weight:900;font-size:1.1rem;color:#f8fafc;margin-bottom:4px;">${c.court}코트</div>
        <div style="font-size:0.7rem;color:#a78bfa;font-weight:700;margin-bottom:12px;">⌚ 워치 / 소형화면 전용</div>
        <img src="${qrBase}${encodeURIComponent(watchUrl)}&color=a78bfa&bgcolor=0f172a" alt="Watch QR" style="width:180px;height:180px;margin:0 auto 12px;display:block;border-radius:12px;">
        <div style="display:flex;gap:6px;justify-content:center;">
          <button onclick="window._copyQr('${watchUrl}')" style="padding:7px 12px;background:#1e293b;border:1px solid #7c3aed;border-radius:8px;color:#a78bfa;font-weight:600;cursor:pointer;font-size:0.85rem;">📋 복사</button>
          <button onclick="window.open('${watchUrl}','_blank')" style="padding:7px 12px;background:#1e293b;border:1px solid #7c3aed;border-radius:8px;color:#a78bfa;font-weight:600;cursor:pointer;font-size:0.85rem;">↗ 열기</button>
        </div>
      </div>`
    ].join('');
  }).join('');

  backdrop.innerHTML = `
    <div style="background:#1e293b;width:100%;max-width:920px;border-radius:24px;box-shadow:0 20px 50px rgba(0,0,0,0.5);overflow:hidden;font-family:'Pretendard',sans-serif;max-height:90vh;display:flex;flex-direction:column;">
      <div style="padding:18px 24px;background:#0f172a;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <h2 style="margin:0;color:#f8fafc;font-size:1.3rem;">📱 코트별 QR 코드</h2>
        <button onclick="document.getElementById('qrModal').remove()" style="background:transparent;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="padding:20px 24px;overflow-y:auto;flex:1;">
        <!-- 탭 버튼 -->
        <div style="display:flex;gap:10px;margin-bottom:16px;">
          <button id="qrJudgeBtn" onclick="window._switchQr('judge')"
            style="flex:1;padding:11px;background:#22c55e;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:0.95rem;cursor:pointer;">🏸 심판용</button>
          <button id="qrViewBtn" onclick="window._switchQr('view')"
            style="flex:1;padding:11px;background:#334155;color:#94a3b8;border:none;border-radius:12px;font-weight:700;font-size:0.95rem;cursor:pointer;">📺 관람용</button>
          <button id="qrWatchBtn" onclick="window._switchQr('watch')"
            style="flex:1;padding:11px;background:#334155;color:#94a3b8;border:none;border-radius:12px;font-weight:700;font-size:0.95rem;cursor:pointer;">⌚ 워치용</button>
        </div>
        <!-- 설명 레이블 -->
        <div id="qrModeLabel" style="margin-bottom:18px;padding:9px 14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:10px;font-size:0.88rem;color:#94a3b8;">
          <span style="color:#22c55e;font-weight:700;">🏸 심판용</span> — 코트 태블릿 전용 · 터치로 실시간 점수 입력 · 잠금 없음
        </div>
        <!-- QR 그리드 -->
        <div id="qrGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;">
          ${cardsHtml}
        </div>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
};

window._copyQr = function (text) {
  navigator.clipboard.writeText(text).then(() => alert('링크가 복사되었습니다!'));
};

window._switchQr = function (mode) {
  const judgeEls = document.querySelectorAll('.qr-cell-judge');
  const viewEls = document.querySelectorAll('.qr-cell-view');
  const watchEls = document.querySelectorAll('.qr-cell-watch');
  const judgeBtn = document.getElementById('qrJudgeBtn');
  const viewBtn = document.getElementById('qrViewBtn');
  const watchBtn = document.getElementById('qrWatchBtn');
  const label = document.getElementById('qrModeLabel');
  const inactiveStyle = 'background:#334155;color:#94a3b8;';

  // 전체 숨김
  judgeEls.forEach(el => el.style.display = 'none');
  viewEls.forEach(el => el.style.display = 'none');
  watchEls.forEach(el => el.style.display = 'none');
  [judgeBtn, viewBtn, watchBtn].forEach(b => { if (b) { b.style.background = '#334155'; b.style.color = '#94a3b8'; } });

  if (mode === 'judge') {
    judgeEls.forEach(el => el.style.display = '');
    if (judgeBtn) { judgeBtn.style.background = '#22c55e'; judgeBtn.style.color = '#fff'; }
    if (label) label.innerHTML = '<span style="color:#22c55e;font-weight:700;">🏸 심판용</span> — 코트 태블릿 전용 · 터치로 실시간 점수 입력 · 잠금 없음';
    if (label) { label.style.background = 'rgba(34,197,94,0.08)'; label.style.borderColor = 'rgba(34,197,94,0.2)'; }
  } else if (mode === 'view') {
    viewEls.forEach(el => el.style.display = '');
    if (viewBtn) { viewBtn.style.background = '#0ea5e9'; viewBtn.style.color = '#fff'; }
    if (label) label.innerHTML = '<span style="color:#38bdf8;font-weight:700;">📺 관람용</span> — 심판용과 동일한 점수판 · 터치/입력 완전 비활성 · 대형 모니터·관중용';
    if (label) { label.style.background = 'rgba(14,165,233,0.08)'; label.style.borderColor = 'rgba(14,165,233,0.2)'; }
  } else {
    watchEls.forEach(el => el.style.display = '');
    if (watchBtn) { watchBtn.style.background = '#7c3aed'; watchBtn.style.color = '#fff'; }
    if (label) label.innerHTML = '<span style="color:#a78bfa;font-weight:700;">⌚ 워치용</span> — /watch 페이지 · 스마트워치·소형 화면 최적화';
    if (label) { label.style.background = 'rgba(124,58,237,0.08)'; label.style.borderColor = 'rgba(124,58,237,0.2)'; }
  }
};

// 하위호환 (기존 코드에서 copyQrLink 호출 대비)
window.copyQrLink = window._copyQr;

// (구버전 모달 코드 제거됨 - 위 showQRCodeModal 함수로 통합)

// =========================================================
//  Phase 1: 대기 화면 (Waiting)
// =========================================================
function renderWaiting(app) {
  const sportIcon = tInfo?.sport_type === 'tennis' ? '🎾' : '🏸';
  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(180deg, #0f172a 0%, #1e293b 100%);font-family:'Pretendard',sans-serif;padding:20px;text-align:center;">
      <button onclick="location.href='/court?tid=${tid}${vid ? '&vid=' + vid : ''}'" style="position:absolute;top:20px;left:20px;padding:8px 16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:10px;cursor:pointer;color:#94a3b8;font-weight:600;font-size:0.85rem;">← 코트 센터</button>

      <div style="font-size:5rem;margin-bottom:16px;animation:float 3s ease-in-out infinite;">${sportIcon}</div>
      <style>@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}</style>
      <h1 style="font-size:3.5rem;font-weight:900;background:linear-gradient(135deg,#f97316,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;">코트 ${courtNum}</h1>
      <p style="color:#64748b;margin:12px 0;font-size:1rem;letter-spacing:2px;">대기중... ${vid && tInfo ? '(' + (venuesData.find(v => v.id == vid)?.name || '장소') + ')' : ''}</p>

      ${nextMatch ? `
        <div style="margin-top:36px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:32px;max-width:500px;width:100%;">
          <div style="font-size:0.8rem;color:#f97316;margin-bottom:16px;font-weight:700;letter-spacing:2px;">⏭ 다음 예정 경기</div>
          <div style="font-size:1.4rem;font-weight:700;color:#f1f5f9;">${nextMatch.team1_name || 'TBD'}</div>
          <div style="color:#64748b;margin:8px 0;font-size:0.9rem;">VS</div>
          <div style="font-size:1.4rem;font-weight:700;color:#f1f5f9;">${nextMatch.team2_name || 'TBD'}</div>
          <div style="font-size:0.8rem;color:#64748b;margin-top:14px;padding:6px 12px;background:rgba(255,255,255,0.05);border-radius:8px;display:inline-block;">${nextMatch.event_name || ''}</div>
          ${!locked ? `<button onclick="enterSetup()" style="margin-top:28px;padding:18px 40px;background:linear-gradient(135deg,#f97316,#ef4444);border:none;border-radius:16px;color:#fff;font-size:1.2rem;font-weight:800;cursor:pointer;width:100%;box-shadow:0 8px 25px rgba(249,115,22,0.4);transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">▶ 경기 준비</button>` : ''}
        </div>` : `<div style="margin-top:36px;padding:24px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.1);border-radius:16px;"><p style="color:#475569;">배정된 경기가 없습니다</p></div>`}

      ${recentMatches.length > 0 ? `
        <div style="margin-top:32px;width:100%;max-width:500px;">
          <div style="font-size:0.8rem;color:#64748b;margin-bottom:10px;font-weight:600;text-align:left;">최근 완료 경기</div>
          ${recentMatches.map(m => `
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;margin-bottom:6px;font-size:0.85rem;display:flex;justify-content:space-between;color:#94a3b8;">
              <span>${m.team1_name || '?'} vs ${m.team2_name || '?'}</span>
              <span style="color:#10b981;font-weight:700;">팀${m.winner_team || '?'} 승</span>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
}

// =========================================================
//  Phase 2: 경기 준비 (Setup - 코트 선택 + 게임 타입)
// =========================================================
window.enterSetup = function () {
  if (!nextMatch) return;
  gameState.phase = 'setup';
  gameState.leftTeamIdx = 1;
  gameState.rightTeamIdx = 2;
  gameState.courtChanged = false;
  gameState.serving = 1;
  render();
};

function renderSetup(app) {
  if (!nextMatch) { gameState.phase = 'waiting'; return render(); }
  const t1 = nextMatch.team1_name || (nextMatch.t1p1_name + '·' + (nextMatch.t1p2_name || ''));
  const t2 = nextMatch.team2_name || (nextMatch.t2p1_name + '·' + (nextMatch.t2p2_name || ''));

  app.innerHTML = `
    <div style="position:absolute;top:24px;left:24px;z-index:100;">
      <button onclick="gameState.phase='waiting'; render();" style="padding:10px 16px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:12px;color:#f1f5f9;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:6px;transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
        ◀ 뒤로
      </button>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(180deg,#0f172a,#1e293b);font-family:'Pretendard',sans-serif;padding:24px;">
      <div style="max-width:700px;width:100%;text-align:center;">
        <div style="font-size:0.8rem;color:#f97316;font-weight:700;letter-spacing:2px;margin-bottom:8px;">코트 ${courtNum}</div>
        <h1 style="font-size:2rem;font-weight:800;color:#f1f5f9;margin:0 0 8px;">경기 준비</h1>
        <div style="color:#64748b;font-size:0.9rem;margin-bottom:32px;">${nextMatch.event_name || ''}</div>

        <!-- 게임 타입 선택 -->
        ${tInfo?.sport_type === 'tennis' ? `
        <div style="margin-bottom:32px;">
          <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:12px;font-weight:600;">게임 방식</div>
          <div style="display:flex;gap:12px;justify-content:center;">
             <button onclick="setGameType('1set')" style="flex:1;max-width:300px;padding:16px;border-radius:14px;border:2px solid ${gameState.gameType === '1set' ? '#f97316' : 'rgba(255,255,255,0.1)'};background:${gameState.gameType === '1set' ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.03)'};color:${gameState.gameType === '1set' ? '#f97316' : '#94a3b8'};cursor:pointer;font-weight:700;font-size:1rem;transition:all 0.2s;">
              <div style="font-size:1.4rem;font-weight:800;">1세트 (테니스)</div>
              <div style="font-size:0.75rem;margin-top:4px;opacity:0.7;">노애드 · 6:6 타이브레이크</div>
            </button>
          </div>
        </div>
        ` : `
        <div style="margin-bottom:32px;">
          <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:12px;font-weight:600;">게임 방식</div>
          <div style="display:flex;gap:12px;justify-content:center;">
            <button onclick="setGameType('prelim')" id="btnPrelim" style="flex:1;max-width:200px;padding:16px;border-radius:14px;border:2px solid ${gameState.gameType === 'prelim' ? '#f97316' : 'rgba(255,255,255,0.1)'};background:${gameState.gameType === 'prelim' ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.03)'};color:${gameState.gameType === 'prelim' ? '#f97316' : '#94a3b8'};cursor:pointer;font-weight:700;font-size:1rem;transition:all 0.2s;">
              <div style="font-size:1.4rem;font-weight:800;">예선 ${tInfo?.score_rule_prelim || 25}점</div>
              <div style="font-size:0.75rem;margin-top:4px;opacity:0.7;">예선 · 코트체인지 ${Math.ceil((tInfo?.score_rule_prelim || 25) / 2)}점</div>
            </button>
            <button onclick="setGameType('final')" id="btnFinal" style="flex:1;max-width:200px;padding:16px;border-radius:14px;border:2px solid ${gameState.gameType === 'final' ? '#8b5cf6' : 'rgba(255,255,255,0.1)'};background:${gameState.gameType === 'final' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)'};color:${gameState.gameType === 'final' ? '#8b5cf6' : '#94a3b8'};cursor:pointer;font-weight:700;font-size:1rem;transition:all 0.2s;">
              <div style="font-size:1.4rem;font-weight:800;">본선 ${tInfo?.score_rule_final || 21}점</div>
              <div style="font-size:0.75rem;margin-top:4px;opacity:0.7;">본선 · 코트체인지 ${Math.ceil((tInfo?.score_rule_final || 21) / 2)}점</div>
            </button>
          </div>
        </div>
        `}

        <!-- 코트 선택(좌/우 배치) -->
        <div style="margin-bottom:32px;">
          <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:12px;font-weight:600;">코트 위치 (좌/우 배치)</div>
          <div style="display:flex;gap:16px;align-items:center;justify-content:center;">
            <div style="flex:1;max-width:220px;padding:20px;background:rgba(14,165,233,0.08);border:2px solid rgba(14,165,233,0.3);border-radius:16px;text-align:center;">
              <div style="font-size:0.7rem;color:#0ea5e9;font-weight:700;margin-bottom:8px;letter-spacing:1px;">◀ 좌측 (근코트)</div>
              <div style="font-size:1.3rem;font-weight:800;color:#f1f5f9;" id="leftTeamName">${gameState.leftTeamIdx === 1 ? t1 : t2}</div>
            </div>
            <button onclick="swapSides()" style="padding:12px 16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:12px;cursor:pointer;font-size:1.5rem;color:#f1f5f9;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">↔</button>
            <div style="flex:1;max-width:220px;padding:20px;background:rgba(244,63,94,0.08);border:2px solid rgba(244,63,94,0.3);border-radius:16px;text-align:center;">
              <div style="font-size:0.7rem;color:#f43f5e;font-weight:700;margin-bottom:8px;letter-spacing:1px;">우측 (원코트) ▶</div>
              <div style="font-size:1.3rem;font-weight:800;color:#f1f5f9;" id="rightTeamName">${gameState.rightTeamIdx === 1 ? t1 : t2}</div>
            </div>
          </div>
        </div>

        <!-- 첫 서브 선택 -->
        <div style="margin-bottom:36px;">
          <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:12px;font-weight:600;">첫 서브</div>
          <div style="display:flex;gap:12px;justify-content:center;">
            <button onclick="setServing(gameState.leftTeamIdx)" style="padding:12px 24px;border-radius:12px;border:2px solid ${gameState.serving === gameState.leftTeamIdx ? '#10b981' : 'rgba(255,255,255,0.1)'};background:${gameState.serving === gameState.leftTeamIdx ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)'};color:${gameState.serving === gameState.leftTeamIdx ? '#10b981' : '#94a3b8'};cursor:pointer;font-weight:700;">🔴 좌측 팀</button>
            <button onclick="setServing(gameState.rightTeamIdx)" style="padding:12px 24px;border-radius:12px;border:2px solid ${gameState.serving === gameState.rightTeamIdx ? '#10b981' : 'rgba(255,255,255,0.1)'};background:${gameState.serving === gameState.rightTeamIdx ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)'};color:${gameState.serving === gameState.rightTeamIdx ? '#10b981' : '#94a3b8'};cursor:pointer;font-weight:700;">🔴 우측 팀</button>
          </div>
        </div>

        <button onclick="startGame()" style="padding:20px 48px;background:linear-gradient(135deg,#10b981,#0ea5e9);border:none;border-radius:18px;color:#fff;font-size:1.3rem;font-weight:900;cursor:pointer;box-shadow:0 10px 30px rgba(16,185,129,0.4);transition:transform 0.2s;width:100%;max-width:400px;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">🏸 경기 시작!</button>
      </div >
    </div > `;
}

window.setGameType = function (type) {
  gameState.gameType = type;
  if (type === '1set') {
    gameState.maxScore = 6;
    gameState.courtChangeAt = 1; // 테니스는 홀수 게임 종료마다 코트 체인지
  } else {
    gameState.maxScore = type === 'prelim' ? (tInfo?.score_rule_prelim || 25) : (tInfo?.score_rule_final || 21);
    gameState.courtChangeAt = Math.ceil(gameState.maxScore / 2);
  }
  render();
};

window.swapSides = function () {
  const tmp = gameState.leftTeamIdx;
  gameState.leftTeamIdx = gameState.rightTeamIdx;
  gameState.rightTeamIdx = tmp;
  render();
};

window.setServing = function (teamIdx) {
  gameState.serving = teamIdx;
  render();
};

window.startGame = async function () {
  if (!nextMatch) return;
  // 서버에 경기 시작 알림
  await fetch('/api/tournaments/' + tid + '/matches/' + nextMatch.id + '/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'playing' })
  });
  await loadCourtData();
  if (currentMatch) {
    gameState.phase = 'playing';
    gameState.courtChanged = false;
    gameState.startTime = Date.now();
    startTimer();
    saveScore(); // Sync initial manual side swap if any!
    render();
  }
};

// =========================================================
//  Phase 3: 점수판 (Playing - 핵심)
// =========================================================
function getTeamName(teamIdx) {
  if (!currentMatch) return '?';
  if (teamIdx === 1) return currentMatch.team1_name || ((currentMatch.t1p1_name || '') + (currentMatch.t1p2_name ? '·' + currentMatch.t1p2_name : ''));
  return currentMatch.team2_name || ((currentMatch.t2p1_name || '') + (currentMatch.t2p2_name ? '·' + currentMatch.t2p2_name : ''));
}

function getScore(teamIdx) {
  if (!currentMatch) return 0;
  return teamIdx === 1 ? (currentMatch.team1_set1 || 0) : (currentMatch.team2_set1 || 0);
}

// 테니스: 게임 스코어 (0, 15, 30, 40) 반환
function getTennisGameScore(myScore, oppScore) {
  const isTiebreak = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);
  if (isTiebreak) {
    return myScore; // 타이브레이크는 일반 숫자(0, 1, 2, 3...)
  }

  if (myScore <= 3 && oppScore <= 3) return [0, 15, 30, 40][myScore];
  if (myScore === oppScore) return "40"; // No-ad 룰이므로 보통 40:40(디사이딩 포인트)에서 끝남

  // 혹시 Ad 룰을 쓰게 될 경우를 대비한 가드코드
  return myScore > oppScore ? (myScore - oppScore >= 2 ? "승리" : "어드밴티지") : "40";
}

// 테니스: 세트 스코어 반환 (세트 승리 수 대신, 단세트 안에서의 딴 게임 수)
function getTennisSetScore(teamIdx) {
  if (!currentMatch) return 0;
  return teamIdx === 1 ? (currentMatch.team1_set2 || 0) : (currentMatch.team2_set2 || 0);
}

function isDeuce() {
  const s1 = getScore(1), s2 = getScore(2);
  const isTennis = gameState.gameType === '1set';
  const isTiebreak = isTennis && (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);

  if (isTennis) {
    if (isTiebreak) return s1 >= 6 && s2 >= 6 && s1 === s2;
    return s1 === 3 && s2 === 3; // 테니스 노애드 디사이딩 포인트 (40:40)
  }
  const deuceAt = gameState.maxScore - 1; // 24 or 20
  return s1 >= deuceAt && s2 >= deuceAt && s1 === s2;
}

function isDeuceMode() {
  const s1 = getScore(1), s2 = getScore(2);
  const isTennis = gameState.gameType === '1set';
  const isTiebreak = isTennis && (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);

  if (isTennis) {
    if (isTiebreak) return s1 >= 6 && s2 >= 6;
    return s1 === 3 && s2 === 3;
  }
  const deuceAt = gameState.maxScore - 1;
  return s1 >= deuceAt && s2 >= deuceAt;
}

function checkWinner() {
  const isTennis = gameState.gameType === '1set';

  if (isTennis) {
    const set1 = getTennisSetScore(1), set2 = getTennisSetScore(2);
    // 테니스 1세트 매치 승리 판단 (6:4 등)
    if (set1 >= 6 && set1 - set2 >= 2) return 1;
    if (set2 >= 6 && set2 - set1 >= 2) return 2;
    // 7:6 타이브레이크 승리 판단
    if (set1 === 7 && set2 === 6) return 1;
    if (set2 === 7 && set1 === 6) return 2;
    return 0;
  }

  const s1 = getScore(1), s2 = getScore(2);
  const max = gameState.maxScore;

  // 일반 승리: 먼저 max점 도달
  if (s1 >= max && s1 - s2 >= 2) return 1;
  if (s2 >= max && s2 - s1 >= 2) return 2;
  // 30점 캡: 29:29일 때 30점 선취
  if (s1 >= 30 && s1 > s2) return 1;
  if (s2 >= 30 && s2 > s1) return 2;
  return 0;
}

function checkTennisGameWinner() {
  const s1 = getScore(1), s2 = getScore(2);
  const isTiebreak = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);

  if (isTiebreak) {
    if (s1 >= 7 && s1 - s2 >= 2) return 1;
    if (s2 >= 7 && s2 - s1 >= 2) return 2;
  } else {
    // 노애드: 40(3점)에서 1점 더 따면 승리 (즉, 4점 선취)
    if (s1 >= 4) return 1;
    if (s2 >= 4) return 2;
  }
  return 0;
}

function shouldCourtChange() {
  if (gameState.courtChanged) return false;

  if (gameState.gameType === '1set') {
    const totalGames = getTennisSetScore(1) + getTennisSetScore(2);
    const isTiebreak = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);

    // 테니스 일반: 홀수 게임 끝날 때 코트 체인지
    if (!isTiebreak) {
      return false; // addScore 쪽에서 게임을 끝낼 때 판단함! 중간에는 안 바꿈.
    } else {
      // 타이브레이크: 포인트 합이 6의 배수일 때 체인지
      const totalPts = getScore(1) + getScore(2);
      return totalPts > 0 && totalPts % 6 === 0;
    }
  }

  const s1 = getScore(1), s2 = getScore(2);
  const changeAt = gameState.courtChangeAt;
  return (s1 === changeAt || s2 === changeAt) && (s1 !== s2 || s1 === changeAt);
}

function updateServing() {
  const isTennis = gameState.gameType === '1set';
  const totalPoints = getScore(1) + getScore(2);

  if (isTennis) {
    const isTiebreak = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);
    if (isTiebreak) {
      // 타이브레이크: 첫포인트는 A가, 다음 2/3포인트는 B가, 다음 4/5포인트는 A가 서브...
      if (totalPoints === 0) {
        // 서브 교대 안함
      } else {
        const serveBlock = Math.floor((totalPoints - 1) / 2);
        gameState.serving = serveBlock % 2 === 0 ? gameState.rightTeamIdx : gameState.leftTeamIdx;
      }
    } else {
      // 일반 게임: 이전에 게임 끝날 때 addScore에서 이미 serving을 넘겼으므로, 중간 점수때는 서브 안 바꿈
    }
    return;
  }

  if (isDeuceMode()) {
    // 듀스: 1점마다 교대
    gameState.serving = totalPoints % 2 === 0 ? gameState.leftTeamIdx : gameState.rightTeamIdx;
  } else {
    // 일반: 2점마다 교대 (first server alternation)
    const block = Math.floor(totalPoints / 2);
    gameState.serving = block % 2 === 0 ? gameState.leftTeamIdx : gameState.rightTeamIdx;
  }
}

function startTimer() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  gameState.timerInterval = setInterval(() => {
    if (gameState.startTime && gameState.phase === 'playing') {
      const diff = Math.floor((Date.now() - gameState.startTime) / 1000);
      const m = Math.floor(diff / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      gameState.elapsed = `${m}:${s} `;
      const el = document.getElementById('elapsed-time');
      if (el) el.textContent = gameState.elapsed;
    }
  }, 1000);
}

function renderScoreboard(app) {
  const m = currentMatch;
  if (!m) { gameState.phase = 'waiting'; return render(); }

  const leftIdx = gameState.leftTeamIdx;
  const rightIdx = gameState.rightTeamIdx;
  const leftName = getTeamName(leftIdx);
  const rightName = getTeamName(rightIdx);
  const isTennis = gameState.gameType === '1set';

  // 테니스 스코어 렌더링
  let leftDisplayObjData = { scoreLabel: '', mainScore: '' };
  let rightDisplayObjData = { scoreLabel: '', mainScore: '' };

  if (isTennis) {
    const isTiebreak = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);
    const lGetGamePtsNum = getScore(leftIdx);
    const rGetGamePtsNum = getScore(rightIdx);
    const lGetSetPtsNum = getTennisSetScore(leftIdx);
    const rGetSetPtsNum = getTennisSetScore(rightIdx);

    leftDisplayObjData.scoreLabel = `게임스코어: ${lGetSetPtsNum} `;
    rightDisplayObjData.scoreLabel = `게임스코어: ${rGetSetPtsNum} `;
    leftDisplayObjData.mainScore = getTennisGameScore(lGetGamePtsNum, rGetGamePtsNum);
    rightDisplayObjData.mainScore = getTennisGameScore(rGetGamePtsNum, lGetGamePtsNum);

    if (isDeuce() && !isTiebreak) {
      leftDisplayObjData.mainScore = "40";
      rightDisplayObjData.mainScore = "40";
    }
  } else {
    leftDisplayObjData.scoreLabel = `팀별 득점`;
    rightDisplayObjData.scoreLabel = `팀별 득점`;
    leftDisplayObjData.mainScore = getScore(leftIdx);
    rightDisplayObjData.mainScore = getScore(rightIdx);
  }

  const leftScore = leftDisplayObjData.mainScore;
  const rightScore = rightDisplayObjData.mainScore;
  const servingLeft = gameState.serving === leftIdx;
  const servingRight = gameState.serving === rightIdx;
  const deuceMode = isDeuceMode();
  const deuce = isDeuce();
  const maxLabel = isTennis ? '1세트 노애드 타이브레이크' : (gameState.gameType === '25pt' ? '예선 25점' : '결승 21점');
  const changeLabel = isTennis ? '홀수 게임 코트체인지' : `코트체인지: ${gameState.courtChangeAt} 점`;

  // 점수 영역 색상
  const leftColor = '#0ea5e9';
  const rightColor = '#f43f5e';
  const leftBg = 'rgba(14,165,233,0.06)';
  const rightBg = 'rgba(244,63,94,0.06)';

  app.innerHTML = `
  <div style="display:flex;flex-direction:column;height:100vh;background:#0f172a;font-family:'Pretendard',sans-serif;overflow:hidden;user-select:none;">
      <!-- 상단 바 -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:10px;">
          <button onclick="goToCourtCenter()" title="코트 센터로 이동" style="padding:5px 12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#94a3b8;cursor:pointer;font-size:0.8rem;font-weight:600;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">← 코트 센터</button>
          <span style="color:#f97316;font-weight:800;font-size:0.9rem;padding:4px 10px;background:rgba(249,115,22,0.15);border-radius:6px;">코트 ${courtNum}</span>
          ${vid ? `<span style="color:#8b5cf6;font-weight:700;font-size:0.85rem;padding:4px 10px;background:rgba(139,92,246,0.15);border-radius:6px;">${m.venue_name || venuesData.find(v => v.id == vid)?.name || '장소'}</span>` : ''}
          <span style="color:#64748b;font-size:0.8rem;">${m.event_name || ''}</span>
          <span style="color:#475569;font-size:0.75rem;">R${m.round || 0}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <button onclick="if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen();" style="padding:4px 8px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:6px;color:#60a5fa;cursor:pointer;font-size:0.75rem;font-weight:700;display:flex;align-items:center;gap:4px;"><span style="font-size:0.9rem;">⛶</span> 풀화면</button>
          <span style="color:#94a3b8;font-size:0.85rem;font-weight:600;padding:4px 10px;background:rgba(255,255,255,0.05);border-radius:6px;">${maxLabel}</span>
          <span style="color:#475569;font-size:0.8rem;">${changeLabel}</span>
          <span style="color:#64748b;font-size:0.8rem;">⏱ <span id="elapsed-time">${gameState.elapsed}</span></span>
          ${deuceMode ? `<span style="color:#fbbf24;font-weight:800;font-size:0.85rem;padding:4px 10px;background:rgba(251,191,36,0.15);border-radius:6px;animation:pulse 1.5s infinite;">⚡ ${deuce && !isTennis ? '듀스!' : (isTennis && deuce ? '디사이딩 포인트' : '듀스 진행중')}</span>` : ''}
          ${!locked ? `<button onclick="undoLast()" style="padding:6px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#94a3b8;cursor:pointer;font-size:0.8rem;font-weight:600;">↩ 되돌리기</button>` : ''}
        </div>
      </div>

    <!-- 메인 점수 영역 -->
  <div style="flex:1;display:flex;gap:3px;padding:0;">
    <!-- 좌측 팀 -->
    <div id="leftArea" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${leftBg};transition:background 0.1s;position:relative;">
      ${servingLeft ? `<div style="position:absolute;top:16px;right:16px;width:20px;height:20px;background:#ef4444;border-radius:50%;box-shadow:0 0 12px rgba(239,68,68,0.6);animation:pulse 1.5s infinite;"></div>` : ''}
      <div style="font-size:1.2rem;color:${leftColor};font-weight:700;letter-spacing:1px;margin-bottom:4px;padding:4px 12px;border:1px solid ${leftColor};border-radius:12px;pointer-events:none;">${leftDisplayObjData.scoreLabel}</div>
      <div style="font-size:0.75rem;color:${leftColor};font-weight:700;letter-spacing:1px;margin-bottom:4px;margin-top:10px;pointer-events:none;">◀ 좌측</div>
      <div style="font-size:1.6rem;font-weight:800;color:#e2e8f0;margin-bottom:12px;text-align:center;line-height:1.3;max-width:90%;overflow:hidden;pointer-events:none;">${leftName}</div>

      <!-- 클릭 영역 확장 -->
      <div ${!locked ? `onclick="addScore(${leftIdx}, event)" onmousedown="document.getElementById('leftArea').style.background='rgba(14,165,233,0.15)'" onmouseup="document.getElementById('leftArea').style.background='${leftBg}'" ontouchstart="document.getElementById('leftArea').style.background='rgba(14,165,233,0.15)'" ontouchend="document.getElementById('leftArea').style.background='${leftBg}'"` : ''} style="cursor:${locked ? 'default' : 'pointer'};font-size:min(20vw, 14rem);font-weight:900;color:#f1f5f9;line-height:1;text-shadow:0 0 40px rgba(14,165,233,0.3);position:absolute;top:0;left:0;right:0;bottom:80px;display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:1;">
        <span style="pointer-events:none;margin-top:auto;">${leftScore}</span>
        <div style="flex:1;"></div>
      </div>

      ${!locked ? `<button onclick="event.stopPropagation();subScore(${leftIdx})" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 24px;border-radius:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;cursor:pointer;font-size:1.5rem;font-weight:300;z-index:2;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">−</button>` : ''}
    </div>

    <!-- 중앙 디바이더 -->
    <div style="width:3px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.08), rgba(255,255,255,0.02));flex-shrink:0;display:flex;align-items:center;justify-content:center;position:relative;z-index:3;">
      <div style="position:absolute;width:40px;height:40px;background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:#64748b;">VS</div>
    </div>

    <!-- 우측 팀 -->
    <div id="rightArea" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${rightBg};transition:background 0.1s;position:relative;">
      ${servingRight ? `<div style="position:absolute;top:16px;left:16px;width:20px;height:20px;background:#ef4444;border-radius:50%;box-shadow:0 0 12px rgba(239,68,68,0.6);animation:pulse 1.5s infinite;"></div>` : ''}
      <div style="font-size:1.2rem;color:${rightColor};font-weight:700;letter-spacing:1px;margin-bottom:4px;padding:4px 12px;border:1px solid ${rightColor};border-radius:12px;pointer-events:none;">${rightDisplayObjData.scoreLabel}</div>
      <div style="font-size:0.75rem;color:${rightColor};font-weight:700;letter-spacing:1px;margin-bottom:4px;margin-top:10px;pointer-events:none;">우측 ▶</div>
      <div style="font-size:1.6rem;font-weight:800;color:#e2e8f0;margin-bottom:12px;text-align:center;line-height:1.3;max-width:90%;overflow:hidden;pointer-events:none;">${rightName}</div>

      <!-- 클릭 영역 확장 -->
      <div ${!locked ? `onclick="addScore(${rightIdx}, event)" onmousedown="document.getElementById('rightArea').style.background='rgba(244,63,94,0.15)'" onmouseup="document.getElementById('rightArea').style.background='${rightBg}'" ontouchstart="document.getElementById('rightArea').style.background='rgba(244,63,94,0.15)'" ontouchend="document.getElementById('rightArea').style.background='${rightBg}'"` : ''} style="cursor:${locked ? 'default' : 'pointer'};font-size:min(20vw, 14rem);font-weight:900;color:#f1f5f9;line-height:1;text-shadow:0 0 40px rgba(244,63,94,0.3);position:absolute;top:0;left:0;right:0;bottom:80px;display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:1;">
        <span style="pointer-events:none;margin-top:auto;">${rightScore}</span>
        <div style="flex:1;"></div>
      </div>

      ${!locked ? `<button onclick="event.stopPropagation();subScore(${rightIdx})" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 24px;border-radius:10px;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.2);color:#0ea5e9;cursor:pointer;font-size:1.5rem;font-weight:300;z-index:2;" onmouseover="this.style.background='rgba(14,165,233,0.2)'" onmouseout="this.style.background='rgba(14,165,233,0.1)'">−</button>` : ''}
    </div>
  </div>
    </div>
  <style>@keyframes pulse{0%, 100% { opacity: 1 }50%{opacity:0.5}}</style>`;
}

// =========================================================
//  Phase 4: 코트 체인지 오버레이
// =========================================================
function renderCourtChange(app) {
  const leftName = getTeamName(gameState.leftTeamIdx);
  const rightName = getTeamName(gameState.rightTeamIdx);
  const s1 = getScore(1), s2 = getScore(2);

  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#1e293b,#0f172a);font-family:'Pretendard',sans-serif;padding:24px;text-align:center;">
      <div style="font-size:6rem;margin-bottom:20px;animation:spin 2s linear infinite;">🔄</div>
      <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
      <h1 style="font-size:2.5rem;font-weight:900;color:#fbbf24;margin:0 0 16px;">코트 체인지!</h1>
      <p style="color:#94a3b8;font-size:1.1rem;margin-bottom:32px;">${gameState.courtChangeAt}점 도달 — 코트를 교체해 주세요</p>
      
      <div style="display:flex;gap:24px;align-items:center;margin-bottom:32px;">
        <div style="padding:20px 28px;background:rgba(14,165,233,0.1);border:2px solid rgba(14,165,233,0.3);border-radius:16px;">
          <div style="font-size:0.75rem;color:#64748b;margin-bottom:6px;">좌측 → 우측</div>
          <div style="font-size:1.2rem;font-weight:800;color:#0ea5e9;">${leftName}</div>
        </div>
        <div style="font-size:2rem;color:#fbbf24;">↔</div>
        <div style="padding:20px 28px;background:rgba(244,63,94,0.1);border:2px solid rgba(244,63,94,0.3);border-radius:16px;">
          <div style="font-size:0.75rem;color:#64748b;margin-bottom:6px;">우측 → 좌측</div>
          <div style="font-size:1.2rem;font-weight:800;color:#f43f5e;">${rightName}</div>
        </div>
      </div>

      <div style="font-size:1.8rem;font-weight:800;color:#f1f5f9;margin-bottom:32px;">현재 ${s1} : ${s2}</div>

      <button onclick="confirmCourtChange()" style="padding:18px 48px;background:linear-gradient(135deg,#fbbf24,#f97316);border:none;border-radius:16px;color:#0f172a;font-size:1.2rem;font-weight:900;cursor:pointer;box-shadow:0 8px 25px rgba(251,191,36,0.4);">✅ 확인 — 경기 재개</button>
      <div style="margin-top:12px;color:#475569;font-size:0.8rem;" id="autoCloseText">5초 후 자동 재개...</div>
    </div>`;

  // 5초 자동 닫기
  let countdown = 5;
  const autoCloseInterval = setInterval(() => {
    countdown--;
    const el = document.getElementById('autoCloseText');
    if (el) el.textContent = `${countdown}초 후 자동 재개...`;
    if (countdown <= 0) {
      clearInterval(autoCloseInterval);
      confirmCourtChange();
    }
  }, 1000);
  gameState._autoCloseInterval = autoCloseInterval;
}

window.confirmCourtChange = function () {
  if (gameState._autoCloseInterval) clearInterval(gameState._autoCloseInterval);
  // 좌우 팀 교체
  const tmp = gameState.leftTeamIdx;
  gameState.leftTeamIdx = gameState.rightTeamIdx;
  gameState.rightTeamIdx = tmp;
  gameState.courtChanged = true;
  gameState.phase = 'playing';
  saveScore(); // Sync court_swapped state to server
  render();
};

// =========================================================
//  Phase 5: 경기 종료
// =========================================================
function renderFinished(app) {
  const s1 = getScore(1), s2 = getScore(2);
  const winnerIdx = checkWinner();
  const winnerName = getTeamName(winnerIdx);
  const loserName = getTeamName(winnerIdx === 1 ? 2 : 1);

  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  app.innerHTML = `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(180deg,#0f172a,#1e293b);font-family:'Pretendard',sans-serif;padding:24px;text-align:center;">
      <div style="font-size:5rem;margin-bottom:16px;">🏆</div>
      <h1 style="font-size:2.5rem;font-weight:900;background:linear-gradient(135deg,#fbbf24,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 12px;">경기 종료!</h1>
      
      <div style="margin:20px 0;padding:24px 40px;background:rgba(251,191,36,0.08);border:2px solid rgba(251,191,36,0.2);border-radius:20px;">
        <div style="font-size:0.8rem;color:#fbbf24;font-weight:700;margin-bottom:8px;">🏆 승리</div>
        <div style="font-size:1.8rem;font-weight:900;color:#f1f5f9;">${winnerName}</div>
      </div>

      <div style="font-size:3rem;font-weight:900;color:#f1f5f9;margin:16px 0;">${gameState.gameType === '1set' ? (getTennisSetScore(1) + ' : ' + getTennisSetScore(2)) : (s1 + ' : ' + s2)}</div>
      
      <div style="color:#64748b;font-size:1rem;margin-bottom:8px;">vs ${loserName}</div>
      <div style="color:#475569;font-size:0.85rem;margin-bottom:32px;">경기 시간: ${gameState.elapsed}</div>

      <button onclick="goToSignature()" style="padding:18px 48px;background:linear-gradient(135deg,#10b981,#0ea5e9);border:none;border-radius:16px;color:#fff;font-size:1.2rem;font-weight:800;cursor:pointer;box-shadow:0 8px 25px rgba(16,185,129,0.4);width:100%;max-width:400px;margin-bottom:12px;">✍️ 승리팀 서명하기</button>
      <button onclick="skipSignature()" style="padding:12px 24px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#64748b;font-size:0.9rem;cursor:pointer;">서명 건너뛰기 →</button>
    </div>`;

  createConfetti();
}

window.goToSignature = function () {
  gameState.phase = 'signature';
  render();
};

window.skipSignature = async function () {
  await finishAndLoadNext();
};

// =========================================================
//  Phase 6: 서명 캔버스
// =========================================================
function renderSignature(app) {
  const winnerIdx = checkWinner();
  const winnerName = getTeamName(winnerIdx);

  app.innerHTML = `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;font-family:'Pretendard',sans-serif;padding:24px;">
      <h2 style="color:#f1f5f9;font-size:1.5rem;font-weight:800;margin:0 0 8px;">✍️ 승리팀 대표 서명</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:0.9rem;">${winnerName}</p>
      
      <canvas id="sigCanvas" width="500" height="200" style="background:rgba(255,255,255,0.95);border-radius:16px;border:2px solid rgba(255,255,255,0.2);cursor:crosshair;touch-action:none;max-width:90vw;"></canvas>

      <div style="display:flex;gap:12px;margin-top:20px;">
        <button onclick="clearSignature()" style="padding:12px 24px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#ef4444;cursor:pointer;font-weight:700;">🗑 지우기</button>
        <button onclick="saveSignature()" style="padding:12px 32px;background:linear-gradient(135deg,#10b981,#0ea5e9);border:none;border-radius:12px;color:#fff;cursor:pointer;font-weight:800;font-size:1rem;box-shadow:0 6px 20px rgba(16,185,129,0.3);">✅ 서명 완료</button>
      </div>
    </div>`;

  // Canvas 서명 로직
  setTimeout(() => {
    const canvas = document.getElementById('sigCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: x * (canvas.width / rect.width), y: y * (canvas.height / rect.height) };
    }

    canvas.addEventListener('mousedown', e => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup', () => { drawing = false; });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('touchend', () => { drawing = false; });
  }, 100);
}

window.clearSignature = function () {
  const canvas = document.getElementById('sigCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

window.saveSignature = async function () {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas || !currentMatch) return;
  const dataUrl = canvas.toDataURL('image/png');
  const winnerIdx = checkWinner();

  try {
    await fetch('/api/tournaments/' + tid + '/matches/' + currentMatch.id + '/signature', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(winnerIdx === 1 ? { team1_signature: dataUrl } : { team2_signature: dataUrl })
    });
  } catch (e) { console.error('Signature save error:', e); }

  await finishAndLoadNext();
};

// =========================================================
//  Score Actions (핵심 로직)
// =========================================================
window.addScore = function (teamIdx, event) {
  if (locked || !currentMatch || currentMatch.status === 'completed') return;
  undoStack.push(JSON.parse(JSON.stringify(currentMatch)));

  const key = teamIdx === 1 ? 'team1_set1' : 'team2_set1';
  currentMatch[key] = (currentMatch[key] || 0) + 1;

  // 서브 업데이트
  updateServing();

  // 파티클 애니메이션
  if (event && event.clientX) {
    createParticles(event.clientX, event.clientY, teamIdx === gameState.leftTeamIdx ? '#0ea5e9' : '#f43f5e');
  }

  // 🔊 소리 + 진동 피드백
  playScoreSound();
  if (navigator.vibrate) navigator.vibrate(30);

  // 서버 저장 (게임 도중)
  saveScore();

  // 테니스 로직: 게임 승리 체크
  if (gameState.gameType === '1set') {
    const gWinner = checkTennisGameWinner();
    if (gWinner) {
      // 게임 얻음 (set2 컬럼을 게임 카운트로 활용해봅니다.)
      const setKey = gWinner === 1 ? 'team1_set2' : 'team2_set2';
      currentMatch[setKey] = (currentMatch[setKey] || 0) + 1;

      // 점수 리셋 (set1은 게임 내 포인트)
      currentMatch.team1_set1 = 0;
      currentMatch.team2_set1 = 0;

      // 서브 교대 (새 게임은 상대편이 서브)
      const isTiebreakBefore = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);
      // 6:6이면 타이브레이크로 넘어가므로 이때 서브가 한 번 더 뒤집히진 않음(타이 룰에 따름). 
      if (!isTiebreakBefore) {
        gameState.serving = gameState.serving === gameState.leftTeamIdx ? gameState.rightTeamIdx : gameState.leftTeamIdx;
      }

      // 게임 땄을때 코트 체인지 조건 (홀수 게임 끝)
      const totalGames = (currentMatch.team1_set2 || 0) + (currentMatch.team2_set2 || 0);

      saveScore(); // 게임 딴 것 저장

      // 최종 매치 승리 체크 (6이상 & 2겜차 OR 7점)
      const matchWinner = checkWinner();
      if (matchWinner) {
        currentMatch.winner_team = matchWinner;
        currentMatch.status = 'completed';
        saveScore();
        gameState.phase = 'finished';
        render();
        return;
      }

      if (totalGames % 2 !== 0 && !isTiebreakBefore) {
        // 코트 체인지 모드 진입
        gameState.courtChangeAt = totalGames; // 그냥 알림용 라벨
        gameState.phase = 'court_change';
        render();
        return;
      }

      render();
      return;
    }

    // 타이브레이크 코트 체인지 체험 (포인트 합계 6점)
    const isTiebreak = (currentMatch.team1_set2 === 6 && currentMatch.team2_set2 === 6);
    if (isTiebreak && shouldCourtChange()) {
      gameState.courtChangeAt = (getScore(1) + getScore(2)) + "점 마다";
      gameState.phase = 'court_change';
      render();
      return;
    }

  } else {
    // 일반 배드민턴 종료 체크
    const winner = checkWinner();
    if (gameState.gameType !== '1set' && winner) {
      currentMatch.winner_team = winner;
      currentMatch.status = 'completed';
      saveScore();
      gameState.phase = 'finished';
      render();
      return;
    }

    // 코트 체인지 체크 (배드민턴)
    if (gameState.gameType !== '1set' && shouldCourtChange()) {
      gameState.phase = 'court_change';
      render();
      return;
    }
  }
  render();
};

window.subScore = function (teamIdx) {
  if (locked || !currentMatch || currentMatch.status === 'completed') return;
  const key = teamIdx === 1 ? 'team1_set1' : 'team2_set1';
  if ((currentMatch[key] || 0) > 0) {
    undoStack.push(JSON.parse(JSON.stringify(currentMatch)));
    currentMatch[key]--;
    updateServing();
    saveScore();
    render();
  }
};

window.undoLast = function () {
  if (undoStack.length === 0) return;
  currentMatch = undoStack.pop();
  updateServing();
  saveScore();
  render();
};

async function saveScore() {
  if (!currentMatch) return;
  const url = '/api/tournaments/' + tid + '/matches/' + currentMatch.id + '/score';
  const body = {
    team1_set1: currentMatch.team1_set1 || 0, team1_set2: currentMatch.team1_set2 || 0, team1_set3: currentMatch.team1_set3 || 0,
    team2_set1: currentMatch.team2_set1 || 0, team2_set2: currentMatch.team2_set2 || 0, team2_set3: currentMatch.team2_set3 || 0,
    winner_team: currentMatch.winner_team || null,
    status: currentMatch.status || 'playing',
    court_swapped: gameState.leftTeamIdx === 2 ? 1 : 0
  };

  if (!isOnline) {
    // 📴 오프라인 → IndexedDB 큐에 저장
    await enqueueOffline({ url, method: 'PUT', body });
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    // 경기 완료 시 다음 경기 제안 처리
    if (res.ok && currentMatch.status === 'completed') {
      try {
        const data = await res.json();
        if (data.next_suggestion) {
          showNextMatchToast(data.next_suggestion);
        }
      } catch (e) { }
    }
  } catch (e) {
    // 네트워크 에러 → 오프라인 큐로
    await enqueueOffline({ url, method: 'PUT', body });
  }
}

function showNextMatchToast(suggestion) {
  let toast = document.getElementById('nextMatchToast');
  if (toast) toast.remove();
  toast = document.createElement('div');
  toast.id = 'nextMatchToast';
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:16px 24px;background:linear-gradient(135deg,#10b981,#059669);border-radius:16px;color:#fff;font-size:1rem;font-weight:700;z-index:99999;box-shadow:0 8px 30px rgba(16,185,129,0.4);cursor:pointer;display:flex;align-items:center;gap:12px;';
  toast.innerHTML = `<span style="font-size:1.5rem;">▶️</span><div><div>다음 경기 준비됨</div><div style="font-size:0.82rem;font-weight:500;opacity:0.9;">${suggestion.teams}</div></div>`;
  toast.onclick = () => { toast.remove(); };
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000);
}

async function finishAndLoadNext() {
  // 🔊 경기 종료 사운드 + 진동
  playFinishSound();
  vibrateStrong();

  // 다음 경기 자동 시작
  if (autoNext) {
    try {
      await fetch('/api/tournaments/' + tid + '/court/' + courtNum + '/next', { method: 'POST' });
    } catch (e) { }
  }
  await loadCourtData();
  gameState.phase = 'waiting';
  gameState.courtChanged = false;
  gameState.elapsed = '00:00';
  gameState.startTime = null;
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  render();
}

// =========================================================
//  Animations
// =========================================================
function createParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.style.cssText = `position: fixed; left:${x} px; top:${y} px; width: 6px; height: 6px; background:${color}; border - radius: 50 %; pointer - events: none; z - index: 9999; `;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 50 + 15;
    p.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
    ], { duration: 500, easing: 'cubic-bezier(0,.9,.57,1)' });
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 500);
  }
}

function createConfetti() {
  const colors = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.style.cssText = `position: fixed; left:${Math.random() * 100} vw; top: -10px; width:${Math.random() * 8 + 4} px; height:${Math.random() * 16 + 8} px; background:${colors[Math.floor(Math.random() * colors.length)]}; pointer - events: none; z - index: 9999; transform: rotate(${Math.random() * 360}deg); `;
    document.body.appendChild(p);
    p.animate([
      { transform: `translate3d(0, 0, 0) rotate(0deg)`, opacity: 1 },
      { transform: `translate3d(${Math.random() * 200 - 100}px, 100vh, 0) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], { duration: Math.random() * 2000 + 1200, easing: 'cubic-bezier(.37,0,.63,1)' });
    setTimeout(() => p.remove(), 3200);
  }
}

// =========================================================
//  Data Loading
// =========================================================
async function loadCourtData() {
  if (!tid || !courtNum) return;
  try {
    const [courtRes, tRes] = await Promise.all([
      fetch('/api/tournaments/' + tid + '/court/' + courtNum + (vid ? '?venue_id=' + vid : '')),
      fetch('/api/tournaments/' + tid)
    ]);
    if (!courtRes.ok) return;
    const data = await courtRes.json();
    tInfo = await tRes.json();

    // 테니스 대회인 경우 강제 게임타입 고정 (새로고침 시 배드민턴으로 풀리는 현상 방지)
    if (tInfo && tInfo.sport_type === 'tennis') {
      gameState.gameType = '1set';
      gameState.maxScore = 6;
      gameState.courtChangeAt = 1;
    }

    currentMatch = data.current || null;
    nextMatch = data.next || null;
    recentMatches = data.recent || [];
    undoStack = [];
    if (currentMatch && gameState.phase === 'waiting') {
      // 이미 진행 중인 경기가 있으면 바로 점수판으로
      gameState.phase = 'playing';
      if (!gameState.startTime) {
        gameState.startTime = Date.now();
        startTimer();
      }
    }
    render();
  } catch (e) { console.error('Load error:', e); }
}

// =========================================================
//  WebSocket (Live Updates)
// =========================================================
function connectWebSocket() {
  try {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(wsProto + '//' + location.host + '/api/live/' + tid);
    ws.onmessage = () => {
      if (gameState.phase === 'waiting') loadCourtData();
    };
    ws.onclose = () => setTimeout(connectWebSocket, 5000);
  } catch (e) { }
}

// =========================================================
//  Navigation Helper
// =========================================================
window.goToCourtCenter = function () {
  if (gameState.phase === 'playing') {
    if (!confirm('경기가 진행 중입니다. 코트 센터로 이동하시겠습니까?\n(현재 점수는 서버에 저장되어 있습니다.)')) return;
  }
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  location.href = '/court?tid=' + tid + (vid ? '&vid=' + vid : '');
};

// =========================================================
//  👨‍⚖️ 심판 퀵모드 (코트 선택 → 바로 점수 입력)
// =========================================================
window.enterJudgeMode = function () {
  // 심판 퀵모드: 코트 목록을 큰 버튼으로 표시
  const courts = courtCenterData || [];
  const modal = document.createElement('div');
  modal.id = 'judgeModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;padding:20px;font-family:Pretendard,sans-serif;';

  let html = `
    <div style="text-align:center;margin-bottom:30px;">
      <div style="font-size:3rem;margin-bottom:12px;">👨‍⚖️</div>
      <h2 style="font-size:1.8rem;font-weight:900;color:#f8fafc;margin:0 0 8px;">심판 전용 모드</h2>
      <p style="color:#94a3b8;font-size:1rem;margin:0;">코트를 터치하면 바로 점수 입력 화면으로 이동합니다</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;width:100%;max-width:600px;">`;

  courts.forEach(c => {
    const hasMatch = c.current;
    const bg = hasMatch ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#334155,#1e293b)';
    const shadow = hasMatch ? '0 8px 25px rgba(16,185,129,0.3)' : 'none';
    const matchInfo = hasMatch ? `${c.current.team1_name || '?'} vs ${c.current.team2_name || '?'}` : `대기 ${c.pending}경기`;
    html += `
      <button onclick="location.href='/court?tid=${tid}&court=${c.court}${vid ? '&vid=' + vid : ''}&judge=1'" 
        style="padding:24px 16px;background:${bg};border:none;border-radius:20px;cursor:pointer;text-align:center;box-shadow:${shadow};transition:transform 0.15s;"
        ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
        <div style="font-size:2.5rem;font-weight:900;color:#fff;line-height:1;margin-bottom:8px;">${c.court}</div>
        <div style="font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.8);">${c.court}번 코트</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.6);margin-top:4px;">${matchInfo}</div>
      </button>`;
  });

  html += `</div>
    <button onclick="document.getElementById('judgeModal').remove()" style="margin-top:24px;padding:12px 32px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:12px;color:#94a3b8;cursor:pointer;font-weight:700;font-size:1rem;">← 닫기</button>`;

  modal.innerHTML = html;
  document.body.appendChild(modal);
};

// =========================================================
//  QR Modal Mode Switcher
// =========================================================
window.switchQrMode = function (mode) {
  const judgeEls = document.querySelectorAll('.qr-cell-judge');
  const viewEls = document.querySelectorAll('.qr-cell-view');
  const watchEls = document.querySelectorAll('.qr-cell-watch');
  const judgeBtn = document.getElementById('qrJudgeBtn');
  const viewBtn = document.getElementById('qrViewBtn');
  const watchBtn = document.getElementById('qrWatchBtn');
  const label = document.getElementById('qrModeLabel');

  // 전체 숨김 + 버튼 비활성화
  judgeEls.forEach(el => el.style.display = 'none');
  viewEls.forEach(el => el.style.display = 'none');
  watchEls.forEach(el => el.style.display = 'none');
  [judgeBtn, viewBtn, watchBtn].forEach(b => {
    if (b) { b.style.background = '#334155'; b.style.color = '#94a3b8'; }
  });

  if (mode === 'judge') {
    judgeEls.forEach(el => el.style.display = '');
    if (judgeBtn) { judgeBtn.style.background = '#22c55e'; judgeBtn.style.color = '#fff'; }
    if (label) {
      label.style.background = 'rgba(34,197,94,0.08)';
      label.style.borderColor = 'rgba(34,197,94,0.2)';
      label.innerHTML = '<span style="color:#22c55e;font-weight:700;">&#127992; 심판용</span> — 코트 태블릿 전용 · 터치로 실시간 점수 입력 · 잠금 없음';
    }
  } else if (mode === 'view') {
    viewEls.forEach(el => el.style.display = '');
    if (viewBtn) { viewBtn.style.background = '#0ea5e9'; viewBtn.style.color = '#fff'; }
    if (label) {
      label.style.background = 'rgba(14,165,233,0.08)';
      label.style.borderColor = 'rgba(14,165,233,0.2)';
      label.innerHTML = '<span style="color:#38bdf8;font-weight:700;">&#128250; 관람용</span> — 심판용과 동일한 점수판 · 터치/입력 완전 비활성 · 대형 모니터·관중용';
    }
  } else {
    watchEls.forEach(el => el.style.display = '');
    if (watchBtn) { watchBtn.style.background = '#7c3aed'; watchBtn.style.color = '#fff'; }
    if (label) {
      label.style.background = 'rgba(124,58,237,0.08)';
      label.style.borderColor = 'rgba(124,58,237,0.2)';
      label.innerHTML = '<span style="color:#a78bfa;font-weight:700;">&#8986; 워치용</span> — /watch 페이지 · 스마트워치·소형 화면 최적화';
    }
  }
};

// 하위호환
window._switchQr = window.switchQrMode;

// =========================================================
//  Init
// =========================================================
if (viewMode === 'list') {
  loadTournamentList();
} else if (viewMode === 'center') {
  loadCourtCenterData();
  setInterval(loadCourtCenterData, 10000);
} else {
  loadCourtData();
  setInterval(() => {
    if (gameState.phase === 'waiting') loadCourtData();
  }, 10000);
  connectWebSocket();
}

const params = new URLSearchParams(location.search);
const tid = params.get('tid');

let tInfo = null;
let eventsData = [];
let participantsData = [];
let matchesData = [];
let courtsData = [];

async function api(path) {
  const res = await fetch(`/api/tournaments/${tid}${path}`);
  if (!res.ok) throw new Error('API Error');
  return res.json();
}

async function initPortal() {
  if (!tid) return location.href = '/sitemap';

  try {
    document.getElementById('portal-app').innerHTML = '<div style="padding:100px;text-align:center;font-size:1.5rem;color:#64748b;">⏳ 대회 데이터를 불러오는 중입니다...</div>';

    tInfo = await api('');
    eventsData = await api('/events') || [];
    participantsData = await api('/participants') || [];
    matchesData = await api('/matches') || [];
    try {
      courtsData = await api('/courts/overview') || [];
    } catch (e) { }

    renderPortal();
  } catch (e) {
    document.getElementById('portal-app').innerHTML = `<div style="padding:100px;text-align:center;font-size:1.2rem;color:#ef4444;">🚨 데이터를 불러오지 못했습니다. 대회가 삭제되었거나 존재하지 않습니다.<br><br><button onclick="location.href='/sitemap'" style="margin-top:20px;padding:10px 20px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;">돌아가기</button></div>`;
  }
}

let activeTab = 'info';

function renderPortal() {
  const app = document.getElementById('portal-app');
  const isTennis = tInfo.sport_type === 'tennis';
  const sportIcon = isTennis ? '🎾' : '🏸';

  const tabs = [
    { id: 'info', icon: '📋', label: '대회 요강' },
    { id: 'draw', icon: '🏆', label: '대진표' },
    { id: 'schedule', icon: '⏱️', label: '경기 시간표' },
    { id: 'clubs', icon: '🛡️', label: '참가 클럽' },
    { id: 'participants', icon: '👥', label: '참가자 명단' },
    { id: 'winners', icon: '🏅', label: '입상자' },
    { id: 'ranking', icon: '📈', label: '단체 순위' }
  ];

  let tabHtml = `<div style="display:flex; justify-content:center; overflow-x:auto; gap:4px; padding:0 20px; background:#fff; border-bottom:1px solid #e2e8f0; position:sticky; top:0; z-index:100; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); scrollbar-width:none;">`;
  tabs.forEach(t => {
    const isActive = activeTab === t.id;
    tabHtml += `<button onclick="switchPortalTab('${t.id}')" style="white-space:nowrap; padding:16px 20px; border:none; background:${isActive ? 'rgba(249,115,22,0.05)' : 'transparent'}; color:${isActive ? '#ea580c' : '#64748b'}; border-bottom:${isActive ? '3px solid #ea580c' : '3px solid transparent'}; border-radius:0; font-weight:${isActive ? '800' : '600'}; font-size:1.05rem; cursor:pointer; transition:all 0.2s;">${t.icon} ${t.label}</button>`;
  });
  tabHtml += `</div>`;

  let contentHtml = `<div id="portal-content" style="padding:40px 20px; max-width:1200px; margin:0 auto; min-height:60vh;"></div>`;

  app.innerHTML = `
    <!-- Custom Styles -->
    <style>
      .portal-card { background:#fff; border-radius:24px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.05); margin-bottom:24px; }
      .portal-title { font-size:1.5rem; font-weight:800; color:#0f172a; margin-bottom:24px; display:flex; align-items:center; gap:10px; border-bottom:1px solid #f1f5f9; padding-bottom:16px; }
      .info-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px; }
      .info-item { background:#f8fafc; padding:20px; border-radius:16px; border:1px solid #e2e8f0; }
      .info-label { font-size:0.9rem; color:#64748b; font-weight:600; margin-bottom:8px; }
      .info-value { font-size:1.1rem; color:#0f172a; font-weight:800; }
      
      .table-wrapper { overflow-x:auto; border-radius:16px; border:1px solid #e2e8f0; }
      table { width:100%; border-collapse:collapse; text-align:left; }
      th { background:#f1f5f9; padding:16px; font-weight:700; color:#475569; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
      td { padding:16px; border-bottom:1px solid #f1f5f9; color:#1e293b; font-weight:500; }
      tr:last-child td { border-bottom:none; }
      tr:hover td { background:#f8fafc; }
      
      .badge { padding:4px 10px; border-radius:8px; font-size:0.8rem; font-weight:700; }
      .badge-orange { background:rgba(249,115,22,0.1); color:#ea580c; border:1px solid rgba(249,115,22,0.2); }
      .badge-blue { background:rgba(14,165,233,0.1); color:#0284c7; border:1px solid rgba(14,165,233,0.2); }
    </style>

    <!-- Header -->
    <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:60px 20px; text-align:center; position:relative; overflow:hidden;">
      <div style="position:absolute; inset:0; background:radial-gradient(circle at 80% 20%, rgba(249,115,22,0.15), transparent 40%); pointer-events:none;"></div>
      
      <button onclick="checkAdminAccess()" style="position:absolute; top:24px; right:24px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:10px 20px; font-weight:800; cursor:pointer; backdrop-filter:blur(10px); transition:all 0.2s; box-shadow:0 4px 6px rgba(0,0,0,0.1);" onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.background='rgba(255,255,255,0.1)'; this.style.transform='translateY(0)';">⚙️ 관리자 대시보드</button>
      <button onclick="location.href='/'" style="position:absolute; top:24px; left:24px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:10px 20px; font-weight:800; cursor:pointer; backdrop-filter:blur(10px); transition:all 0.2s;">🏠 메인 홈페이지로 이동</button>
      
      <span style="background:rgba(249,115,22,0.2); color:#fdba74; padding:6px 16px; border-radius:30px; font-size:0.9rem; font-weight:800; border:1px solid rgba(249,115,22,0.3); margin-bottom:20px; display:inline-block; letter-spacing:1px;">MATCH POINT 공식 대회</span>
      <h1 style="font-size:3.5rem; font-weight:900; margin:0 0 16px 0; letter-spacing:-1px; text-shadow:0 4px 10px rgba(0,0,0,0.3);">${sportIcon} ${tInfo.name}</h1>
      <p style="color:#cbd5e1; font-size:1.2rem; max-width:700px; margin:0 auto; line-height:1.6; font-weight:400;">${tInfo.description || '선수들의 뜨거운 열정이 펼쳐지는 공식 토너먼트입니다.'}</p>
    </div>
    
    ${tabHtml}
    ${contentHtml}
    
    <div style="text-align:center; padding:40px; color:#94a3b8; font-size:0.9rem; background:#fff; border-top:1px solid #e2e8f0;">
      Powered by <strong>MATCH POINT</strong> Tournament System
    </div>
  `;

  renderPortalContent();
}

window.switchPortalTab = function (tab) {
  activeTab = tab;
  renderPortal();
}

window.checkAdminAccess = function () {
  const token = localStorage.getItem('mp_admin_token');

  // 로그인 인증이 되어 있는 상태라면 대시보드 진입
  if (token) {
    location.href = '/?tid=' + tid;
    return;
  }

  // 비로그인 시 로그인 안내
  alert('관리자 대시보드는 로그인이 필요합니다.\n메인 페이지에서 로그인해주세요.');
  location.href = '/';
}

function renderPortalContent() {
  const content = document.getElementById('portal-content');
  if (!content) return;

  if (activeTab === 'info') renderInfo(content);
  else if (activeTab === 'draw') renderDraw(content);
  else if (activeTab === 'schedule') renderSchedule(content);
  else if (activeTab === 'clubs') renderClubs(content);
  else if (activeTab === 'participants') renderParticipants(content);
  else if (activeTab === 'winners') renderWinners(content);
  else if (activeTab === 'ranking') renderRanking(content);
}

// 1. 대회 요강
function renderInfo(el) {
  let html = `<div class="portal-card">
    <div class="portal-title">📋 대회 요강 (개요)</div>
    <div class="info-grid" style="margin-bottom:40px;">
      <div class="info-item">
        <div class="info-label">대회 명칭</div>
        <div class="info-value">${tInfo.name}</div>
      </div>
      <div class="info-item">
        <div class="info-label">대회 기간 / 장소</div>
        <div class="info-value">추후 공지 (상세 일정 참조)</div>
      </div>
      <div class="info-item">
        <div class="info-label">진행 방식</div>
        <div class="info-value">${tInfo.format?.toUpperCase() || 'KDK'} (팀당 ${tInfo.games_per_player || 4}경기)</div>
      </div>
      <div class="info-item">
        <div class="info-label">운영 코트 면수</div>
        <div class="info-value">총 ${tInfo.courts || '-'}면 운영</div>
      </div>
    </div>
    
    <div class="portal-title" style="margin-top:40px;">안내 사항 및 참가 요강</div>
    <div style="background:#f8fafc; padding:30px; border-radius:16px; border:1px solid #e2e8f0; line-height:1.8; color:#334155; font-size:1.05rem; white-space:pre-wrap;">${tInfo.description || '등록된 상세 요강이 없습니다.'}</div>
    
    <div style="margin-top:40px; padding:30px; border:2px dashed #cbd5e1; border-radius:20px; text-align:center; background:#fff;">
      <div style="font-size:3rem; margin-bottom:10px;">🗺️</div>
      <h3 style="margin:0 0 10px 0; color:#0f172a;">대회 장소 및 팜플렛 안내</h3>
      <p style="color:#64748b; margin:0;">대회 장소 약도 및 공식 팜플렛 이미지는 주최측 업데이트 후 제공됩니다.</p>
    </div>
  </div>`;
  el.innerHTML = html;
}

// 2. 대진표
function renderDraw(el) {
  if (eventsData.length === 0) {
    el.innerHTML = `<div class="portal-card" style="text-align:center; padding:60px;"><div style="font-size:4rem; margin-bottom:20px;">🔓</div><h3 style="font-size:1.5rem; margin-bottom:10px;">개설된 종목이 없습니다</h3><p style="color:#64748b;">주최측에서 대진표를 아직 생성하지 않았습니다.</p></div>`;
    return;
  }

  let html = `<div class="portal-card">
    <div class="portal-title">🏆 검색 가능한 대진표</div>
    <div style="margin-bottom:24px; display:flex; gap:12px;">
       <input type="text" id="drawSearch" placeholder="종별, 등급, 또는 팀 이름으로 검색..." style="flex:1; padding:16px 20px; border-radius:12px; border:1px solid #cbd5e1; font-size:1.1rem; outline:none; transition:border 0.2s;" onkeyup="filterDraw()">
    </div>
    <div id="drawList">
  `;

  eventsData.forEach(evt => {
    // get matches for this event, sorted by time then match_order
    const eMatches = matchesData.filter(m => m.event_id === evt.id).sort((a, b) => {
      if (a.scheduled_time && b.scheduled_time) return a.scheduled_time.localeCompare(b.scheduled_time);
      if (a.scheduled_time) return -1;
      if (b.scheduled_time) return 1;
      return a.match_order - b.match_order;
    });

    html += `<div class="draw-event-section" data-text="${evt.name} ${evt.category} ${evt.level_group}" style="margin-bottom:30px; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
      <div style="background:#f8fafc; padding:16px 24px; font-weight:800; font-size:1.2rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <span>${evt.name || (evt.category + ' ' + evt.level_group)}</span>
        <span class="badge badge-blue">${eMatches.length}경기 예정</span>
      </div>
      <div style="padding:20px;">
        ${eMatches.length === 0 ? '<div style="color:#94a3b8; text-align:center; font-style:italic;">배정된 대진이 없습니다.</div>' : ''}
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
        ${eMatches.map(m => {
      const t1 = m.team1_name || (m.t1p1_name ? m.t1p1_name + (m.t1p2_name ? '·' + m.t1p2_name : '') : '미정/BYE');
      const t2 = m.team2_name || (m.t2p1_name ? m.t2p1_name + (m.t2p2_name ? '·' + m.t2p2_name : '') : '미정/BYE');
      const statusTxt = m.status === 'completed' ? '종료' : (m.status === 'playing' ? '진행중' : '대기');
      const statusCol = m.status === 'completed' ? '#64748b' : (m.status === 'playing' ? '#ea580c' : '#94a3b8');
      const timeLabel = m.scheduled_time ? '<span style="background:rgba(99,102,241,0.1); color:#6366f1; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:800;">🕐 ' + m.scheduled_time + '</span>' : '';

      return `<div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px; background:#fff; position:relative;">
            <div style="font-size:0.8rem; font-weight:800; color:${statusCol}; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
              <span>#${m.match_order} / ${m.court_number ? m.court_number + '코트' : '코트미정'}</span>
              <span style="display:flex; gap:6px; align-items:center;">${timeLabel} ${statusTxt}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
               <span style="font-weight:700; color:#0f172a;">${t1}</span>
               <span style="font-weight:900; color:#475569;">${m.team1_set1 || 0}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
               <span style="font-weight:700; color:#0f172a;">${t2}</span>
               <span style="font-weight:900; color:#475569;">${m.team2_set1 || 0}</span>
            </div>
          </div>`;
    }).join('')}
        </div>
      </div>
    </div>`;
  });

  html += `</div></div>`;

  // adding filter logic inline
  html += `<script>
    function filterDraw() {
      const q = document.getElementById('drawSearch').value.toLowerCase();
      document.querySelectorAll('.draw-event-section').forEach(el => {
        if(el.innerText.toLowerCase().includes(q)) el.style.display = 'block';
        else el.style.display = 'none';
      });
    }
  </script>`;

  el.innerHTML = html;
}

// 3. 경기 시간표 (코트 관점)
function renderSchedule(el) {
  let html = `<div class="portal-card">
    <div class="portal-title">⏱️ 실시간 코트 경기 시간표</div>
    <div style="margin-bottom:24px; color:#64748b;">각 코트별로 현재 진행 중인 경기와 대기 중인 경기를 현장에서 바로 확인하세요.</div>
    <div class="info-grid">
  `;

  if (courtsData.length === 0) {
    html += `<div style="grid-column:1/-1; text-align:center; padding:50px; color:#94a3b8; font-style:italic;">코트 정보가 활성화되지 않았습니다.</div>`;
  }

  courtsData.forEach(c => {
    let currHtml = `<div style="color:#94a3b8; font-style:italic; padding:20px; text-align:center; background:#f8fafc; border-radius:12px;">현장 준비 중</div>`;

    if (c.current) {
      const m = c.current;
      const t1 = m.team1_name || (m.t1p1_name ? m.t1p1_name + (m.t1p2_name ? '·' + m.t1p2_name : '') : 'BYE');
      const t2 = m.team2_name || (m.t2p1_name ? m.t2p1_name + (m.t2p2_name ? '·' + m.t2p2_name : '') : 'BYE');
      currHtml = `
          <div style="background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.3); padding:16px; border-radius:12px; position:relative;">
            <div style="position:absolute; top:12px; right:12px; background:#ea580c; color:#fff; font-size:0.7rem; padding:2px 8px; border-radius:10px; font-weight:800; animation:pulse 2s infinite;">LIVE</div>
            <div style="font-size:0.85rem; font-weight:700; color:#ea580c; margin-bottom:8px;">${m.event_name || '진행 종목'}</div>
            <div style="font-weight:800; color:#0f172a; margin-bottom:4px; font-size:1.1rem;">${t1}</div>
            <div style="font-weight:400; color:#94a3b8; font-size:0.9rem; margin-bottom:4px;">VS</div>
            <div style="font-weight:800; color:#0f172a; font-size:1.1rem;">${t2}</div>
          </div>
        `;
    }

    html += `<div class="info-item" style="background:#fff; border:1px solid #e2e8f0; box-shadow:0 4px 6px rgba(0,0,0,0.02);">
      <div style="font-size:1.4rem; font-weight:900; color:#0f172a; margin-bottom:16px; border-bottom:2px solid #f1f5f9; padding-bottom:12px;">${c.court} 코트</div>
      ${currHtml}
      <div style="margin-top:16px; font-size:0.95rem; font-weight:700; color:#475569; display:flex; justify-content:space-between; align-items:center;">
        <span>대기 중인 경기</span>
        <span class="badge badge-blue">${c.pending || 0} 경기</span>
      </div>
    </div>`;
  });

  html += `</div></div><style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}</style>`;
  el.innerHTML = html;
}

// 4. 참가 클럽
function renderClubs(el) {
  // Extract unique clubs
  let clubMap = {}; // club Name -> { pCount: 0, clubs: clubStr }
  participantsData.forEach(p => {
    if (!p.club) return;
    const cName = p.club.trim();
    if (!cName) return;
    if (!clubMap[cName]) clubMap[cName] = { pCount: 0, members: [] };
    clubMap[cName].pCount++;
    clubMap[cName].members.push(p.name);
  });

  const clubs = Object.keys(clubMap).map(k => ({ name: k, ...clubMap[k] })).sort((a, b) => b.pCount - a.pCount);

  let html = `<div class="portal-card">
    <div class="portal-title">🛡️ 공식 출전 클럽 (${clubs.length}개)</div>
    <div class="info-grid">
  `;

  if (clubs.length === 0) {
    html += `<div style="grid-column:1/-1; text-align:center; padding:50px; color:#94a3b8; font-style:italic;">소속 클럽 정보가 등록된 참가자가 없습니다.</div>`;
  } else {
    clubs.forEach(c => {
      html += `<div class="info-item" style="background:#fff; border:1px solid #e2e8f0; display:flex; align-items:center; gap:20px; transition:all 0.2s; cursor:default;" onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
        <div style="width:60px; height:60px; border-radius:16px; background:linear-gradient(135deg, #f1f5f9, #e2e8f0); display:flex; align-items:center; justify-content:center; font-size:1.8rem; font-weight:900; color:#94a3b8;">${c.name.charAt(0)}</div>
        <div>
          <div style="font-weight:900; font-size:1.2rem; color:#0f172a; margin-bottom:4px;">${c.name}</div>
          <div style="font-weight:600; color:#ea580c;">출전 선수 ${c.pCount}명</div>
        </div>
      </div>`;
    });
  }

  html += `</div></div>`;
  el.innerHTML = html;
}

// 5. 참가자 명단
function renderParticipants(el) {
  let html = `<div class="portal-card">
    <div class="portal-title">👥 참가자 검색</div>
    <div style="margin-bottom:24px; display:flex; gap:12px;">
       <input type="text" id="pSearch" placeholder="선수 이름 또는 클럽 소속으로 검색..." style="flex:1; padding:16px 20px; border-radius:12px; border:1px solid #cbd5e1; font-size:1.1rem; outline:none; transition:border 0.2s;" onkeyup="filterParticipants()">
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>선수명</th>
            <th>소속 클럽</th>
            <th>성별</th>
            <th>급수/레벨</th>
          </tr>
        </thead>
        <tbody id="pTableBody">
        ${participantsData.map(p => `
          <tr class="p-row">
            <td style="font-weight:800; font-size:1.1rem;">${p.name}</td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569;">${p.club || '-'}</span></td>
            <td>${p.gender === 'm' ? '남성' : '여성'}</td>
            <td><span class="badge badge-orange">${p.level || '일반'}</span></td>
          </tr>
        `).join('')}
        ${participantsData.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;">등록된 참가자가 없습니다.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    function filterParticipants() {
      const q = document.getElementById('pSearch').value.toLowerCase();
      document.querySelectorAll('.p-row').forEach(tr => {
        if(tr.innerText.toLowerCase().includes(q)) tr.style.display = '';
        else tr.style.display = 'none';
      });
    }
  </script>`;
  el.innerHTML = html;
}

// 6. 입상자
function renderWinners(el) {
  // Find completed finals or use a logic to find top players.
  // We'll filter matches with highest match_order / final round per event.
  let html = `<div class="portal-card">
    <div class="portal-title">🏅 명예의 전당 (입상자 명단)</div>
    <div style="background:linear-gradient(135deg, rgba(234,179,8,0.1), rgba(245,158,11,0.1)); border:1px solid rgba(234,179,8,0.3); padding:40px; border-radius:20px; text-align:center; margin-bottom:30px;">
      <div style="font-size:4rem; margin-bottom:20px;">👑</div>
      <h2 style="margin:0; font-size:1.8rem; font-weight:900; color:#b45309;">본 대회의 최종 영광의 주역들입니다.</h2>
      <p style="color:#d97706; margin-top:10px; font-weight:600;">(결승전 결과 및 입상 성적이 확정되면 이곳에 등록됩니다.)</p>
    </div>
  </div>`;
  el.innerHTML = html;
}

// 7. 단체 순위
function renderRanking(el) {
  let html = `<div class="portal-card">
    <div class="portal-title">📈 전체 클럽(단체) 종합 순위</div>
    <p style="color:#64748b; margin-bottom:24px;">대회 운영 규정에 의거한 우승 포인트, 출전율을 합산한 소속 클럽 순위표입니다.</p>
    <div style="padding:60px; text-align:center; background:#f8fafc; border:2px dashed #cbd5e1; border-radius:20px;">
      <div style="font-size:3rem; margin-bottom:16px;">📊</div>
      <h3 style="margin:0 0 10px 0; color:#334155;">순위 산정 시스템 준비 중</h3>
      <p style="color:#94a3b8; margin:0;">대회가 시작되고 본선 경기 데이터가 누적되면 자동으로 클럽 순위가 집계됩니다.</p>
    </div>
  </div>`;
  el.innerHTML = html;
}

// Init execution
initPortal();

// =========================================================
//  👤 회원 마스터 DB 관리 UI  (members.js)
//  app.js에서 로드됩니다.
// =========================================================

// ─── 내비게이션 활성화 헬퍼 ──────────────────────────────────
function navActivate(btn) {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.color = '#475569';
  });
  btn.classList.add('active');
  btn.style.background = 'rgba(249,115,22,0.1)';
  btn.style.color = '#f97316';
}

// ─── 회원 DB 독립 페이지 (메인에 삽입) ─────────────────────
async function showMembersPage() {
  // 대회 상세가 열려 있으면 먼저 홈으로
  if (currentTournament) {
    currentTournament = null;
    currentTab = 'overview';
    document.documentElement.style.removeProperty('--primary');
    const url = new URL(location);
    url.searchParams.delete('tid');
    history.pushState(null, '', url);
  }

  const app = document.getElementById('app');
  if (!app) return;

  // 기존 홈 HTML이 이미 렌더됐으면 섹션만 교체, 아니면 전체 렌더
  let section = document.getElementById('membersPageSection');
  if (!section) {
    // 홈 렌더 후 다시 삽입
    await renderHome(app);
    // 잠시 후 섹션 교체
    await new Promise(r => setTimeout(r, 50));
  }

  const tournamentSection = document.getElementById('tournamentSection');
  if (!tournamentSection) return;

  // 섹션 내용을 회원 DB로 교체
  tournamentSection.id = 'membersPageSection';
  tournamentSection.style.padding = '0';
  tournamentSection.style.background = '#f8fafc';
  tournamentSection.innerHTML = `
    <div style="padding:80px 20px 40px; max-width:1300px; margin:0 auto;">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;flex-wrap:wrap;">
        <div>
          <h2 style="font-size:clamp(1.8rem,4vw,2.5rem);font-weight:900;color:#0f172a;margin:0 0 6px 0;display:flex;align-items:center;gap:10px;">
            👤 통합 회원 DB
          </h2>
          <p style="color:#64748b;margin:0;font-size:1rem;">대회와 독립적으로 회원 이력을 관리합니다.</p>
        </div>
      </div>
      <div id="membersPageContent"></div>
    </div>
  `;

  await renderMembersTab(document.getElementById('membersPageContent'));
}

let membersList = [];

// API 헬퍼 (members 전용)
async function memberApi(path, options = {}) {
  const res = await fetch('/api/members' + (path || ''), {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

// ─── 메인 탭 렌더 ─────────────────────────────────────────
async function renderMembersTab(c) {
  c.innerHTML = '<div class="loading"><div class="spinner"></div>회원 데이터 로딩중...</div>';
  try {
    const data = await memberApi('?limit=50');
    membersList = data.members || [];

    c.innerHTML = `
      <!-- 헤더 -->
      <div class="card-header" style="flex-wrap:wrap;gap:12px;align-items:center;">
        <div>
          <span style="font-size:1rem;font-weight:800;color:var(--text);">👤 통합 회원 DB</span>
          <span style="margin-left:8px;font-size:0.85rem;color:var(--text-muted);">
            총 <strong id="memberCount">${data.total || membersList.length}</strong>명
          </span>
        </div>
        <div class="btn-group" style="flex-wrap:wrap;gap:6px;">
          <button class="btn btn-primary btn-sm" onclick="showAddMember()">+ 회원 등록</button>
          <button class="btn btn-sm"
            style="background:rgba(249,115,22,0.1);color:#f97316;border:1px solid #f97316;"
            onclick="importMembersFromTournament()">
            📥 이번 대회 참가자 → 회원 등록
          </button>
          <button class="btn btn-sm" onclick="exportMembersExcel()">📊 Excel 내보내기</button>
        </div>
      </div>

      <!-- 검색 필터 -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;background:var(--bg-card);">
        <input type="text" id="mSearchQ" class="form-control"
          style="width:160px;padding:6px 12px;font-size:0.85rem;"
          placeholder="이름/연락처 검색" oninput="memberSearch()">
        <select id="mSearchLevel" class="form-control"
          style="width:auto;padding:6px 10px;font-size:0.85rem;" onchange="memberSearch()">
          <option value="">모든 급수</option>
          <option value="S">S급</option><option value="A">A급</option>
          <option value="B">B급</option><option value="C">C급</option>
          <option value="D">D급</option>
        </select>
        <select id="mSearchGender" class="form-control"
          style="width:auto;padding:6px 10px;font-size:0.85rem;" onchange="memberSearch()">
          <option value="">모든 성별</option>
          <option value="m">👨 남</option>
          <option value="f">👩 여</option>
        </select>
        <input type="text" id="mSearchClub" class="form-control"
          style="width:130px;padding:6px 12px;font-size:0.85rem;"
          placeholder="클럽명" oninput="memberSearch()">
      </div>

      <!-- 회원 테이블 -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>이름</th><th>성별</th><th>출생</th><th>급수</th><th>소속</th>
              <th>연락처</th><th>대회수</th><th>최근참가</th><th>관리</th>
            </tr>
          </thead>
          <tbody id="membersTbody"></tbody>
        </table>
      </div>
    `;
    renderMembersTable(membersList);
  } catch (e) {
    c.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

// ─── 테이블 렌더 ────────────────────────────────────────────
function renderMembersTable(list) {
  const tbody = document.getElementById('membersTbody');
  if (!tbody) return;

  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">등록된 회원이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(m => `
    <tr>
      <td>
        <strong style="cursor:pointer;color:var(--primary);"
          onclick="showMemberDetail(${m.id})">${m.name}</strong>
      </td>
      <td>${m.gender === 'm' ? '👨 남' : '👩 여'}</td>
      <td>${m.birth_year}</td>
      <td><span class="badge badge-level-${(m.level || 'd').toLowerCase()}">${(m.level || '-').toUpperCase()}</span></td>
      <td>${m.club || '-'}</td>
      <td style="font-size:0.8rem">${m.phone || '-'}</td>
      <td style="text-align:center">
        <span class="badge badge-info">${m.tournament_count || 0}회</span>
      </td>
      <td style="font-size:0.75rem;color:var(--text-muted)">
        ${m.last_tournament_at ? m.last_tournament_at.slice(0, 10) : '-'}
      </td>
      <td>
        <button class="btn btn-sm btn-primary" style="padding:3px 8px;"
          onclick="showEditMember(${m.id})">수정</button>
        <button class="btn btn-sm btn-danger" style="padding:3px 8px;"
          onclick="deleteMember(${m.id},'${m.name.replace(/'/g, "\\'")}')">삭제</button>
      </td>
    </tr>
  `).join('');
}

// ─── 실시간 검색 ────────────────────────────────────────────
let _mSearchTimer = null;
function memberSearch() {
  clearTimeout(_mSearchTimer);
  _mSearchTimer = setTimeout(async () => {
    const q = document.getElementById('mSearchQ')?.value || '';
    const level = document.getElementById('mSearchLevel')?.value || '';
    const gender = document.getElementById('mSearchGender')?.value || '';
    const club = document.getElementById('mSearchClub')?.value || '';

    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (level) p.set('level', level);
    if (gender) p.set('gender', gender);
    if (club) p.set('club', club);

    try {
      const data = await memberApi('/?' + p.toString());
      membersList = data.members || [];
      const cnt = document.getElementById('memberCount');
      if (cnt) cnt.textContent = data.total || membersList.length;
      renderMembersTable(membersList);
    } catch (e) { showToast(e.message, 'error'); }
  }, 300);
}

// ─── 회원 등록 모달 ─────────────────────────────────────────
function showAddMember() {
  showModal('회원 등록', `
    <div class="form-row">
      <div class="form-group"><label>이름 *</label><input class="form-control" id="mName" placeholder="홍길동"></div>
      <div class="form-group"><label>연락처</label><input class="form-control" id="mPhone" placeholder="010-0000-0000"></div>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>성별 *</label>
        <select class="form-control" id="mGender">
          <option value="m">남</option><option value="f">여</option>
        </select>
      </div>
      <div class="form-group"><label>출생년도 *</label>
        <input class="form-control" id="mBirth" type="number" placeholder="1980" min="1940" max="2010">
      </div>
      <div class="form-group"><label>급수 *</label>
        <select class="form-control" id="mLevel">
          <option value="S">S</option><option value="A">A</option>
          <option value="B" selected>B</option><option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>소속 클럽</label>
        <input class="form-control" id="mClub" placeholder="○○배드민턴클럽">
      </div>
      <div class="form-group"><label>메모</label>
        <input class="form-control" id="mMemo" placeholder="관리자 메모 (선택)">
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('mName').value.trim();
    const birth = parseInt(document.getElementById('mBirth').value);
    if (!name || !birth) { showToast('이름과 출생년도는 필수입니다.', 'error'); return; }

    await memberApi('', {
      method: 'POST',
      body: {
        name,
        phone: document.getElementById('mPhone').value.trim() || null,
        gender: document.getElementById('mGender').value,
        birth_year: birth,
        level: document.getElementById('mLevel').value,
        club: document.getElementById('mClub').value.trim() || null,
        memo: document.getElementById('mMemo').value.trim() || null
      }
    });
    showToast('회원이 등록되었습니다! 🎉');
    closeModal();
    await renderMembersTab(document.getElementById('tabContent'));
  });
}

// ─── 회원 수정 모달 ─────────────────────────────────────────
function showEditMember(id) {
  const m = membersList.find(x => x.id === id);
  if (!m) return;

  showModal('회원 정보 수정', `
    <div class="form-row">
      <div class="form-group"><label>이름 *</label>
        <input class="form-control" id="mName" value="${m.name}">
      </div>
      <div class="form-group"><label>연락처</label>
        <input class="form-control" id="mPhone" value="${m.phone || ''}">
      </div>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>성별 *</label>
        <select class="form-control" id="mGender">
          <option value="m" ${m.gender === 'm' ? 'selected' : ''}>남</option>
          <option value="f" ${m.gender === 'f' ? 'selected' : ''}>여</option>
        </select>
      </div>
      <div class="form-group"><label>출생년도 *</label>
        <input class="form-control" id="mBirth" type="number" value="${m.birth_year}">
      </div>
      <div class="form-group"><label>급수 *</label>
        <select class="form-control" id="mLevel">
          ${['S', 'A', 'B', 'C', 'D'].map(l =>
    `<option value="${l}" ${m.level === l ? 'selected' : ''}>${l}</option>`
  ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>소속 클럽</label>
        <input class="form-control" id="mClub" value="${m.club || ''}">
      </div>
      <div class="form-group"><label>메모</label>
        <input class="form-control" id="mMemo" value="${m.memo || ''}">
      </div>
    </div>
  `, async () => {
    await memberApi('/' + id, {
      method: 'PUT',
      body: {
        name: document.getElementById('mName').value.trim(),
        phone: document.getElementById('mPhone').value.trim() || null,
        gender: document.getElementById('mGender').value,
        birth_year: parseInt(document.getElementById('mBirth').value),
        level: document.getElementById('mLevel').value,
        club: document.getElementById('mClub').value.trim() || null,
        memo: document.getElementById('mMemo').value.trim() || null
      }
    });
    showToast('수정되었습니다.');
    closeModal();
    await renderMembersTab(document.getElementById('tabContent'));
  });
}

// ─── 회원 삭제 ──────────────────────────────────────────────
async function deleteMember(id, name) {
  if (!confirm(`'${name}' 회원을 비활성화하시겠습니까?\n\n(대회 이력은 보존됩니다)`)) return;
  try {
    await memberApi('/' + id, { method: 'DELETE' });
    showToast(`${name} 회원 비활성화 완료`);
    await renderMembersTab(document.getElementById('tabContent'));
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── 회원 상세 + 대회이력/경기기록 2탭 ─────────────────────
async function showMemberDetail(id) {
  try {
    const [{ member: m, history }, matchData] = await Promise.all([
      memberApi('/' + id),
      memberApi('/' + id + '/matches?limit=50')
    ]);
    const stat = matchData.stat || {};
    const winRate = stat.total > 0 ? Math.round((stat.wins || 0) / stat.total * 100) : 0;

    const histRow = h => `<tr>
      <td>${h.tournament_name}</td>
      <td>${h.event_name || '-'}</td>
      <td>${h.result_rank ? h.result_rank + '위' : '-'}</td>
      <td>${h.wins || 0}승 ${h.losses || 0}패</td>
      <td style="font-size:0.75rem">${(h.tournament_date || '').slice(0, 10)}</td>
    </tr>`;

    const matchRow = r => `<tr style="background:${r.result === 'win' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)'}">
      <td><span style="font-weight:700;color:${r.result === 'win' ? '#10b981' : '#ef4444'}">${r.result === 'win' ? '✅ 승' : '❌ 패'}</span></td>
      <td style="font-size:0.8rem">${r.tournament_name || '-'}</td>
      <td style="font-size:0.8rem">${r.event_name || '-'}</td>
      <td style="font-weight:700;font-family:monospace;letter-spacing:1px">
        ${r.my_set1}-${r.opp_set1}
        ${(r.my_set2 || r.opp_set2) ? ` / ${r.my_set2}-${r.opp_set2}` : ''}
        ${(r.my_set3 || r.opp_set3) ? ` / ${r.my_set3}-${r.opp_set3}` : ''}
      </td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${r.opp_names || '-'}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${(r.created_at || '').slice(0, 10)}</td>
    </tr>`;

    showModal(`👤 ${m.name} — 회원 상세`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div style="background:var(--bg);padding:10px 12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">성별/출생</div>
          <div style="font-weight:700;">${m.gender === 'm' ? '남' : '여'} / ${m.birth_year}년</div>
        </div>
        <div style="background:var(--bg);padding:10px 12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">급수/소속</div>
          <div style="font-weight:700;">${(m.level || '-').toUpperCase()} / ${m.club || '소속없음'}</div>
        </div>
        <div style="background:var(--bg);padding:10px 12px;border-radius:10px;">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">연락처</div>
          <div style="font-weight:700;">${m.phone || '-'}</div>
        </div>
        <div style="background:linear-gradient(135deg,rgba(249,115,22,0.08),rgba(139,92,246,0.08));padding:10px 12px;border-radius:10px;border:1px solid rgba(249,115,22,0.15);">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">전체 전적 / 승률</div>
          <div style="font-weight:800;color:var(--primary);">${stat.wins || 0}승 ${stat.losses || 0}패
            <span style="font-size:0.8rem;color:#64748b;font-weight:500;">(${winRate}%)</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:4px;margin-bottom:10px;background:var(--bg);padding:4px;border-radius:10px;">
        <button id="mTab1" onclick="mDetailSwitch(1)"
          style="flex:1;padding:7px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-weight:700;font-size:0.83rem;cursor:pointer;">
          📅 대회 이력 (${history.length}회)
        </button>
        <button id="mTab2" onclick="mDetailSwitch(2)"
          style="flex:1;padding:7px;border-radius:8px;border:none;background:transparent;color:var(--text-muted);font-weight:600;font-size:0.83rem;cursor:pointer;">
          ⚔️ 경기 기록 (${matchData.records?.length || 0}건)
        </button>
      </div>

      <div id="mPanel1" class="table-container" style="max-height:230px;overflow-y:auto;">
        <table class="data-table" style="font-size:0.84rem;">
          <thead><tr><th>대회명</th><th>종목</th><th>순위</th><th>전적</th><th>날짜</th></tr></thead>
          <tbody>${history.length ? history.map(histRow).join('') : '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;">대회 이력 없음</td></tr>'}</tbody>
        </table>
      </div>

      <div id="mPanel2" style="display:none;" class="table-container">
        <div style="max-height:230px;overflow-y:auto;">
          <table class="data-table" style="font-size:0.82rem;">
            <thead><tr><th>결과</th><th>대회</th><th>종목</th><th>스코어</th><th>상대</th><th>날짜</th></tr></thead>
            <tbody>${matchData.records?.length
        ? matchData.records.map(matchRow).join('')
        : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">경기 기록 없음<br><small style=\'color:#64748b\'>📥 대회 참가자를 회원DB로 가져오면 이후 경기부터 자동 저장됩니다.</small></td></tr>'
      }</tbody>
          </table>
        </div>
      </div>

      ${m.memo ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(249,115,22,0.05);border-left:3px solid var(--primary);border-radius:4px;font-size:0.85rem;">📝 ${m.memo}</div>` : ''}
    `);
  } catch (e) { showToast(e.message, 'error'); }
}

// 탭 전환
function mDetailSwitch(tab) {
  const p1 = document.getElementById('mPanel1');
  const p2 = document.getElementById('mPanel2');
  const t1 = document.getElementById('mTab1');
  const t2 = document.getElementById('mTab2');
  if (!p1) return;
  if (tab === 1) {
    p1.style.display = ''; p2.style.display = 'none';
    t1.style.cssText += ';background:var(--primary);color:#fff;';
    t2.style.cssText += ';background:transparent;color:var(--text-muted);';
  } else {
    p1.style.display = 'none'; p2.style.display = '';
    t2.style.cssText += ';background:var(--primary);color:#fff;';
    t1.style.cssText += ';background:transparent;color:var(--text-muted);';
  }
}


// ─── 이번 대회 참가자 → 회원 일괄 등록 ─────────────────────
async function importMembersFromTournament() {
  if (!currentTournament) { showToast('대회를 먼저 선택하세요.', 'error'); return; }
  if (!confirm(
    `현재 대회(${currentTournament.name})의 참가자를 회원 DB에 일괄 등록합니다.\n\n` +
    `동일 인물(이름+생년+성별 일치)이 이미 있으면 자동 연결됩니다.\n\n계속하시겠습니까?`
  )) return;

  try {
    const result = await memberApi('/import-from-tournament/' + currentTournament.id, { method: 'POST' });
    showToast(`완료! 신규 ${result.created}명 등록 / ${result.skipped}명 기존 연결 🎉`);
    await renderMembersTab(document.getElementById('tabContent'));
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── Excel 내보내기 ─────────────────────────────────────────
async function exportMembersExcel() {
  try {
    const data = await memberApi('?limit=9999');
    const rows = (data.members || []).map(m => ([
      m.name,
      m.gender === 'm' ? '남' : '여',
      m.birth_year,
      m.level || '',
      m.club || '',
      m.phone || '',
      m.tournament_count || 0,
      m.last_tournament_at ? m.last_tournament_at.slice(0, 10) : ''
    ]));

    if (typeof XLSX === 'undefined') {
      showToast('Excel 라이브러리가 로드되지 않았습니다.', 'error');
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet([
      ['이름', '성별', '출생년도', '급수', '소속클럽', '연락처', '참가대회수', '최근참가일'],
      ...rows
    ]);
    ws['!cols'] = [15, 8, 12, 8, 18, 18, 12, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '회원명단');
    XLSX.writeFile(wb, `회원DB_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Excel 파일 다운로드 완료!');
  } catch (e) { showToast(e.message, 'error'); }
}

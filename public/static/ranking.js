// =========================================================
//  🏅 개인 랭킹 시스템 UI  (ranking.js)
// =========================================================

// ── 랭킹 페이지 진입점 ───────────────────────────────────────
async function showRankingPage() {
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

  await renderHome(app);
  await new Promise(r => setTimeout(r, 50));
  if (typeof initAuth === 'function') initAuth();

  const section = document.getElementById('tournamentSection');
  if (!section) return;

  section.id = 'rankingSection';
  section.style.padding = '0';
  section.style.background = '#f8fafc';
  section.innerHTML = `
    <div style="padding:80px 20px 60px; max-width:1200px; margin:0 auto;">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;flex-wrap:wrap;">
        <div>
          <h2 style="font-size:clamp(1.8rem,4vw,2.5rem);font-weight:900;color:#0f172a;margin:0 0 6px 0;display:flex;align-items:center;gap:10px;">
            🏅 개인 랭킹
          </h2>
          <p style="color:#64748b;margin:0;font-size:1rem;">경기 기록 기반 실시간 레이팅 시스템</p>
        </div>
      </div>
      <div id="rankingContent"></div>
    </div>
  `;

  await renderRankingTab(document.getElementById('rankingContent'));
}

// ── API 헬퍼 (공용 apiFetch 사용) ───────────────────────────
function rankingApi(path, options = {}) {
  return apiFetch('/api/rankings', path || '', options);
}

// ── 메인 랭킹 탭 렌더 ────────────────────────────────────────
async function renderRankingTab(container) {
  if (!container) return;
  container.innerHTML = '<div class="loading"><div class="spinner"></div>랭킹 데이터 로딩중...</div>';

  try {
    const [{ rankings, total }, { summary, byLevel, top_clubs }] = await Promise.all([
      rankingApi('?limit=100'),
      rankingApi('/summary').catch(() => ({ summary: {}, byLevel: [], top_clubs: [] }))
    ]);

    const medalIcon = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const genderIcon = (g) => g === 'm' ? '👨' : '👩';
    const levelColor = { S: '#f97316', A: '#8b5cf6', B: '#3b82f6', C: '#10b981', D: '#64748b' };

    container.innerHTML = `
      <!-- 통계 요약 카드 -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">
        ${[
        ['🏅 참가 선수', summary?.total_members || 0, '명'],
        ['⚔️ 총 경기', summary?.total_matches || 0, '경기'],
        ['🏆 참가 대회', summary?.total_tournaments || 0, '개'],
        ['👨 남자', summary?.male_count || 0, '명'],
        ['👩 여자', summary?.female_count || 0, '명']
      ].map(([label, val, unit]) => `
          <div style="background:#fff;padding:16px;border-radius:16px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
            <div style="font-size:0.78rem;color:#64748b;margin-bottom:4px;">${label}</div>
            <div style="font-size:1.6rem;font-weight:900;color:#0f172a;">${val}<span style="font-size:0.85rem;color:#64748b;font-weight:500;margin-left:2px;">${unit}</span></div>
          </div>
        `).join('')}
      </div>

      <!-- 필터 바 -->
      <div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:20px;display:flex;gap:8px;flex-wrap:wrap;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
        <select id="rFilterGender" class="form-control" style="width:auto;padding:6px 12px;font-size:0.85rem;" onchange="applyRankingFilter()">
          <option value="">모든 성별</option>
          <option value="m">👨 남자</option>
          <option value="f">👩 여자</option>
        </select>
        <select id="rFilterLevel" class="form-control" style="width:auto;padding:6px 12px;font-size:0.85rem;" onchange="applyRankingFilter()">
          <option value="">모든 급수</option>
          ${['S', 'A', 'B', 'C', 'D'].map(l => `<option value="${l}">${l}급</option>`).join('')}
        </select>
        <select id="rFilterSport" class="form-control" style="width:auto;padding:6px 12px;font-size:0.85rem;" onchange="applyRankingFilter()">
          <option value="">모든 종목</option>
          <option value="badminton">🏸 배드민턴</option>
          <option value="tennis">🎾 테니스</option>
        </select>
        <span style="margin-left:auto;line-height:2;font-size:0.85rem;color:#64748b;">총 <strong>${total}</strong>명</span>
      </div>

      <!-- 랭킹 테이블 -->
      <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <div class="table-container">
          <table class="data-table" id="rankingTable">
            <thead>
              <tr>
                <th style="text-align:center;width:60px;">순위</th>
                <th>선수</th>
                <th>소속</th>
                <th style="text-align:center;">급수</th>
                <th style="text-align:center;">경기</th>
                <th style="text-align:center;">전적</th>
                <th style="text-align:center;">승률</th>
                <th style="text-align:center;">레이팅</th>
                <th style="text-align:center;">대회</th>
              </tr>
            </thead>
            <tbody id="rankingTbody">
              ${renderRankingRows(rankings)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 클럽 랭킹 -->
      ${top_clubs?.length ? `
        <div style="margin-top:24px;background:#fff;border-radius:20px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <h3 style="font-size:1.05rem;font-weight:800;margin-bottom:16px;">🏟️ 클럽별 승률 TOP 5</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
            ${top_clubs.map((cx, i) => `
              <div style="padding:14px;border-radius:12px;background:${i === 0 ? 'linear-gradient(135deg,rgba(249,115,22,0.1),rgba(139,92,246,0.1))' : '#f8fafc'};border:1px solid ${i === 0 ? 'rgba(249,115,22,0.2)' : '#e2e8f0'};">
                <div style="font-size:0.75rem;color:#64748b;margin-bottom:2px;">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'} ${i + 1}위</div>
                <div style="font-weight:800;font-size:0.95rem;color:#0f172a;margin-bottom:4px;">${cx.club}</div>
                <div style="font-size:0.82rem;color:#64748b;">${cx.member_count}명 · 승률 <strong style="color:${i === 0 ? '#f97316' : '#334155'}">${cx.club_win_rate}%</strong></div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderRankingRows(rankings) {
  if (!rankings?.length) {
    return '<tr><td colspan="9" style="text-align:center;padding:40px;color:#94a3b8;">📊 아직 랭킹 데이터가 없습니다.<br><small style="color:#64748b">대회 참가자를 회원DB로 가져오면 경기 완료 시 자동 저장됩니다.</small></td></tr>';
  }
  const levelColor = { S: '#f97316', A: '#8b5cf6', B: '#3b82f6', C: '#10b981', D: '#64748b' };
  const medal = r => r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;

  return rankings.map(r => `
    <tr style="${r.rank <= 3 ? 'background:rgba(249,115,22,0.03);' : ''}" onclick="showMemberRankCard(${r.id})" style="cursor:pointer;">
      <td style="text-align:center;font-size:${r.rank <= 3 ? '1.3' : '1'}rem;font-weight:${r.rank <= 3 ? '800' : '600'};">${medal(r)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,${r.gender === 'm' ? '#3b82f6,#6366f1' : '#f43f5e,#f97316'});display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">
            ${r.gender === 'm' ? '👨' : '👩'}
          </div>
          <div>
            <div style="font-weight:700;cursor:pointer;color:var(--primary)" onclick="event.stopPropagation();showMemberRankCard(${r.id})">${r.name}</div>
            <div style="font-size:0.75rem;color:#94a3b8;">${r.gender === 'm' ? '남' : '여'}</div>
          </div>
        </div>
      </td>
      <td style="font-size:0.85rem;color:#64748b;">${r.club || '-'}</td>
      <td style="text-align:center;">
        <span style="padding:3px 8px;border-radius:20px;font-size:0.78rem;font-weight:700;background:${levelColor[r.level] || '#94a3b8'}20;color:${levelColor[r.level] || '#94a3b8'}">
          ${(r.level || '-').toUpperCase()}
        </span>
      </td>
      <td style="text-align:center;font-weight:600;">${r.total_games}</td>
      <td style="text-align:center;font-size:0.88rem;">
        <span style="color:#10b981;font-weight:700">${r.wins}승</span>
        <span style="color:#94a3b8"> / </span>
        <span style="color:#ef4444;font-weight:600">${r.losses}패</span>
      </td>
      <td style="text-align:center;">
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
          <div style="width:50px;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
            <div style="height:100%;background:${r.win_rate >= 60 ? '#10b981' : r.win_rate >= 40 ? '#f59e0b' : '#ef4444'};width:${Math.min(r.win_rate, 100)}%;border-radius:3px;"></div>
          </div>
          <span style="font-weight:700;font-size:0.88rem;color:${r.win_rate >= 60 ? '#10b981' : r.win_rate >= 40 ? '#f59e0b' : '#ef4444'}">${r.win_rate}%</span>
        </div>
      </td>
      <td style="text-align:center;">
        <span style="font-size:1.1rem;font-weight:900;color:${r.rank <= 3 ? '#f97316' : '#334155'}">${r.rating}</span>
        <span style="font-size:0.72rem;color:#94a3b8;display:block;">pts</span>
      </td>
      <td style="text-align:center;font-size:0.85rem;color:#64748b;">${r.tournament_count}회</td>
    </tr>
  `).join('');
}

// ── 필터 적용 ─────────────────────────────────────────────────
let _rankTimer;
async function applyRankingFilter() {
  clearTimeout(_rankTimer);
  _rankTimer = setTimeout(async () => {
    const gender = document.getElementById('rFilterGender')?.value || '';
    const level = document.getElementById('rFilterLevel')?.value || '';
    const sport = document.getElementById('rFilterSport')?.value || '';
    const p = new URLSearchParams();
    if (gender) p.set('gender', gender);
    if (level) p.set('level', level);
    if (sport) p.set('sport', sport);
    p.set('limit', '100');
    try {
      const { rankings, total } = await rankingApi('/?' + p.toString());
      const tbody = document.getElementById('rankingTbody');
      if (tbody) tbody.innerHTML = renderRankingRows(rankings);
      const totEl = document.querySelector('#rankingContent span strong');
      if (totEl) totEl.textContent = total;
    } catch (e) { showToast(e.message, 'error'); }
  }, 300);
}

// ── 개인 랭킹 카드 상세 팝업 ─────────────────────────────────
async function showMemberRankCard(memberId) {
  try {
    const { member: m, stat, recent, rivals } = await rankingApi('/member/' + memberId);
    const levelColor = { S: '#f97316', A: '#8b5cf6', B: '#3b82f6', C: '#10b981', D: '#64748b' };
    const winBar = (rate) => `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
          <div style="height:100%;background:${rate >= 60 ? '#10b981' : rate >= 40 ? '#f59e0b' : '#ef4444'};width:${Math.min(rate, 100)}%;border-radius:4px;"></div>
        </div>
        <span style="font-weight:800;font-size:0.9rem;color:${rate >= 60 ? '#10b981' : rate >= 40 ? '#f59e0b' : '#ef4444'};min-width:38px;">${rate}%</span>
      </div>`;

    const recentBadge = r => `<span style="
      display:inline-block;width:28px;height:28px;border-radius:50%;font-size:0.75rem;font-weight:800;
      line-height:28px;text-align:center;
      background:${r.result === 'win' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};
      color:${r.result === 'win' ? '#10b981' : '#ef4444'}">${r.result === 'win' ? 'W' : 'L'}</span>`;

    showModal(`🏅 ${m.name} 랭킹 카드`, `
      <!-- 헤더 -->
      <div style="background:linear-gradient(135deg,rgba(249,115,22,0.08),rgba(139,92,246,0.08));border-radius:16px;padding:20px;margin-bottom:16px;text-align:center;border:1px solid rgba(249,115,22,0.15);">
        <div style="font-size:3rem;margin-bottom:8px;">${m.gender === 'm' ? '👨' : '👩'}</div>
        <div style="font-size:1.5rem;font-weight:900;color:#0f172a;">${m.name}</div>
        <div style="font-size:0.85rem;color:#64748b;margin-top:4px;">${m.club || '소속없음'} · ${m.gender === 'm' ? '남' : '여'}</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap;">
          <span style="padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:700;background:${levelColor[m.level] || '#94a3b8'}20;color:${levelColor[m.level] || '#94a3b8'}">${(m.level || '-').toUpperCase()}급</span>
          <span style="padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:700;background:rgba(249,115,22,0.1);color:#f97316;">🏅 ${stat.rank}위</span>
          <span style="padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:700;background:rgba(15,23,42,0.06);color:#334155;">${stat.rating} pts</span>
        </div>
      </div>

      <!-- 통계 그리드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
        ${[
        ['총 경기', stat.total_games, '경기'],
        ['승리', stat.wins, '승'],
        ['패배', stat.losses, '패'],
        ['참가 대회', stat.tournaments, '개'],
        ['총 득점', stat.total_pts_for || 0, '점'],
        ['총 실점', stat.total_pts_against || 0, '점']
      ].map(([l, v, u]) => `
          <div style="background:var(--bg);padding:10px;border-radius:10px;text-align:center;">
            <div style="font-size:0.7rem;color:var(--text-muted);">${l}</div>
            <div style="font-weight:800;font-size:1.1rem;">${v}<span style="font-size:0.7rem;color:#94a3b8;font-weight:400;"> ${u}</span></div>
          </div>`).join('')}
      </div>

      <!-- 승률 바 -->
      <div style="margin-bottom:16px;">
        <div style="font-size:0.8rem;color:#64748b;margin-bottom:6px;font-weight:600;">승률</div>
        ${winBar(stat.win_rate || 0)}
      </div>

      <!-- 최근 5경기 -->
      <div style="margin-bottom:12px;">
        <div style="font-size:0.8rem;color:#64748b;margin-bottom:8px;font-weight:600;">최근 경기 흐름</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${recent?.map(r => recentBadge(r)).join('') || '<span style="color:#94a3b8;font-size:0.85rem;">기록 없음</span>'}
          <span style="font-size:0.78rem;color:#94a3b8;margin-left:4px;">(최신순 →)</span>
        </div>
        ${recent?.[0] ? `<div style="font-size:0.78rem;color:#94a3b8;margin-top:6px;">vs ${recent[0].opp_names || '-'} · ${(recent[0].created_at || '').slice(0, 10)}</div>` : ''}
      </div>

      <!-- 라이벌 -->
      ${rivals?.length ? `
        <div>
          <div style="font-size:0.8rem;color:#64748b;margin-bottom:8px;font-weight:600;">⚔️ 자주 만난 상대</div>
          ${rivals.slice(0, 3).map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:0.85rem;font-weight:600;">${r.opp_names}</span>
              <span style="font-size:0.82rem;color:#64748b;">${r.games}전
                <span style="color:#10b981;font-weight:700"> ${r.wins}승</span>
                <span style="color:#ef4444;font-weight:600"> ${r.games - r.wins}패</span>
              </span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `, null, { confirmText: '닫기', hideCancel: true });
  } catch (e) { showToast(e.message, 'error'); }
}

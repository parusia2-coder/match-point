// =========================================================
//  🧠 AI 운영 대시보드 (ai_dashboard.js)
//  Phase 5: 실시간 운영 인텔리전스
//  - Elo 리더보드
//  - 대회 진행률
//  - 조 편성 균형도
//  - 선수 성장 히스토리
// =========================================================

// ── 대시보드 진입점 ──────────────────────────────────────────
async function showAiDashboard(tid) {
  if (!tid && currentTournament) tid = currentTournament.id;
  if (!tid) { showToast('대회를 먼저 선택하세요.', 'warning'); return; }

  showModal('🧠 AI 운영 대시보드', `
    <div class="loading" style="padding:40px 0;">
      <div class="spinner"></div>AI 데이터 분석 중...
    </div>
  `, null, { confirmText: '닫기', wide: true, hideCancel: true });

  try {
    // 병렬 데이터 Fetch
    const [dashboard, leaderboard, events, monitoring] = await Promise.all([
      api(`/${tid}/dashboard`).catch(e => null),
      rankingApi('/elo-leaderboard?limit=10').catch(() => ({ leaderboard: [] })),
      api(`/${tid}/events`).catch(() => []),
      api(`/${tid}/monitoring`).catch(() => ({ alerts: [], summary: {} }))
    ]);

    const overall = dashboard?.overall || {};
    const completionRate = dashboard?.completion_rate || 0;
    const eventStats = dashboard?.events || [];
    const clubStats = dashboard?.clubs || [];

    const lb = leaderboard?.leaderboard || [];

    // ── 조 편성 분석 (첫 이벤트) ──
    let groupAnalysis = null;
    if (events.length > 0) {
      try {
        groupAnalysis = await api(`/${tid}/events/${events[0].id}/group-analysis`);
      } catch (e) { }
    }

    const html = renderAiDashboardHtml(tid, overall, completionRate, eventStats, clubStats, lb, groupAnalysis, events, monitoring);

    const modalHeader = document.querySelector('.modal-header h2');
    const modalBody = document.querySelector('.modal-body');
    if (modalHeader) modalHeader.innerHTML = '🧠 AI 운영 대시보드';
    if (modalBody) modalBody.innerHTML = html;
    document.querySelector('.modal')?.classList.add('modal-wide');

  } catch (e) {
    const mb = document.querySelector('.modal-body');
    if (mb) mb.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderAiDashboardHtml(tid, overall, completionRate, eventStats, clubStats, leaderboard, groupAnalysis, events, monitoring) {
  const gradeColor = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
  const gradeLabel = { A: '매우 균형', B: '양호', C: '보통', D: '불균형' };

  return `
    <style>
      .ai-dash { font-family: 'Inter', sans-serif; }
      .ai-section { margin-bottom: 28px; }
      .ai-section-title {
        font-size: 1rem; font-weight: 800; color: #0f172a;
        margin-bottom: 14px; display: flex; align-items: center; gap: 8px;
        padding-bottom: 8px; border-bottom: 2px solid #f1f5f9;
      }
      .ai-grid { display: grid; gap: 10px; }
      .ai-card {
        background: #fff; border-radius: 16px; padding: 16px;
        border: 1px solid #e2e8f0; transition: transform 0.2s, box-shadow 0.2s;
      }
      .ai-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
      .ai-stat-val { font-size: 2rem; font-weight: 900; line-height: 1; margin-bottom: 4px; }
      .ai-stat-lbl { font-size: 0.75rem; color: #64748b; font-weight: 600; }
      .ai-progress { width: 100%; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
      .ai-progress-bar { height: 100%; border-radius: 5px; transition: width 1s ease; }
      .ai-lb-row {
        display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        border-radius: 12px; transition: background 0.2s;
      }
      .ai-lb-row:hover { background: rgba(249,115,22,0.04); }
      .ai-lb-rank {
        width: 32px; height: 32px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center;
        font-weight: 800; font-size: 0.85rem; flex-shrink: 0;
      }
      .ai-lb-info { flex: 1; }
      .ai-lb-name { font-weight: 700; font-size: 0.9rem; color: #0f172a; }
      .ai-lb-meta { font-size: 0.75rem; color: #94a3b8; }
      .ai-lb-elo { font-size: 1.2rem; font-weight: 900; text-align: right; }
      .ai-lb-delta { font-size: 0.75rem; font-weight: 700; }
      .ai-grp-card {
        background: #f8fafc; border-radius: 12px; padding: 12px;
        border: 1px solid #e2e8f0; text-align: center;
      }
      .ai-grp-num { font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 4px; }
      .ai-grp-elo { font-size: 1.3rem; font-weight: 900; color: #0f172a; }
      .ai-grp-std { font-size: 0.72rem; color: #94a3b8; }
      .ai-insight {
        padding: 10px 14px; border-radius: 10px; font-size: 0.85rem;
        background: rgba(59,130,246,0.05); border-left: 3px solid #3b82f6;
        margin-bottom: 6px; color: #334155;
      }
      .ai-alert {
        display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px;
        border-radius: 12px; margin-bottom: 6px; font-size: 0.85rem;
        transition: transform 0.15s;
      }
      .ai-alert:hover { transform: translateX(3px); }
      .ai-alert-critical { background: rgba(239,68,68,0.06); border-left: 3px solid #ef4444; }
      .ai-alert-warning { background: rgba(245,158,11,0.06); border-left: 3px solid #f59e0b; }
      .ai-alert-info { background: rgba(59,130,246,0.04); border-left: 3px solid #3b82f6; }
      .ai-alert-icon { font-size: 1.2rem; flex-shrink: 0; }
      .ai-alert-msg { font-weight: 700; color: #0f172a; }
      .ai-alert-detail { font-size: 0.78rem; color: #64748b; margin-top: 2px; }
      .ai-alert-badge {
        font-size: 0.7rem; font-weight: 800; padding: 2px 8px;
        border-radius: 10px; flex-shrink: 0;
      }
      @media (max-width: 640px) {
        .ai-stat-val { font-size: 1.5rem; }
        .ai-lb-elo { font-size: 1rem; }
      }
    </style>

    <div class="ai-dash">

      <!-- ═══ 1. 실시간 운영 현황 ═══ -->
      <div class="ai-section">
        <div class="ai-section-title">📡 실시간 운영 현황</div>
        <div class="ai-grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
          <div class="ai-card" style="text-align:center;">
            <div class="ai-stat-val" style="color:#0f172a;">${overall.total || 0}</div>
            <div class="ai-stat-lbl">총 경기</div>
          </div>
          <div class="ai-card" style="text-align:center;">
            <div class="ai-stat-val" style="color:#10b981;">${overall.completed || 0}</div>
            <div class="ai-stat-lbl">✅ 완료</div>
          </div>
          <div class="ai-card" style="text-align:center;">
            <div class="ai-stat-val" style="color:#f97316;">${overall.playing || 0}</div>
            <div class="ai-stat-lbl">▶️ 진행중</div>
          </div>
          <div class="ai-card" style="text-align:center;">
            <div class="ai-stat-val" style="color:#64748b;">${overall.pending || 0}</div>
            <div class="ai-stat-lbl">⏳ 대기</div>
          </div>
        </div>

        <!-- 진행률 바 -->
        <div style="margin-top: 14px;">
          <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#64748b; margin-bottom:6px;">
            <span>대회 진행률</span>
            <span style="font-weight:800; color:${completionRate >= 90 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444'}">${completionRate}%</span>
          </div>
          <div class="ai-progress">
            <div class="ai-progress-bar" style="width:${completionRate}%; background:${completionRate >= 90 ? 'linear-gradient(90deg,#10b981,#34d399)' : completionRate >= 50 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#ef4444,#f87171)'};"></div>
          </div>
        </div>

        <!-- 종목별 미니 진행  -->
        ${eventStats.length > 0 ? `
          <div style="margin-top: 14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px;">
            ${eventStats.map(ev => {
    const rate = ev.total_matches > 0 ? Math.round((ev.completed || 0) / ev.total_matches * 100) : 0;
    return `
                <div style="background:#f8fafc; border-radius:10px; padding:10px; border:1px solid #e2e8f0;">
                  <div style="font-weight:700; font-size:0.82rem; color:#0f172a; margin-bottom:6px;">${ev.name}</div>
                  <div class="ai-progress" style="height:6px;">
                    <div class="ai-progress-bar" style="width:${rate}%; background:${rate >= 90 ? '#10b981' : '#3b82f6'};"></div>
                  </div>
                  <div style="font-size:0.72rem; color:#94a3b8; margin-top:4px;">${ev.completed || 0}/${ev.total_matches || 0} (${rate}%)</div>
                </div>`;
  }).join('')}
          </div>
        ` : ''}
      </div>

      <!-- ═══ 1.5. 🚨 실시간 모니터링 알림 ═══ -->
      ${(monitoring?.alerts?.length > 0) ? `
        <div class="ai-section">
          <div class="ai-section-title">
            🚨 실시간 모니터링
            ${monitoring.summary?.critical > 0 ? `<span class="ai-alert-badge" style="background:#fef2f2;color:#ef4444;">긴급 ${monitoring.summary.critical}</span>` : ''}
            ${monitoring.summary?.warning > 0 ? `<span class="ai-alert-badge" style="background:#fffbeb;color:#f59e0b;">주의 ${monitoring.summary.warning}</span>` : ''}
            <span class="ai-alert-badge" style="background:#f0fdf4;color:#10b981;">${monitoring.summary?.playing_courts || 0}/${monitoring.summary?.total_courts || 0} 코트 가동</span>
          </div>
          ${monitoring.alerts.slice(0, 8).map(a => `
            <div class="ai-alert ai-alert-${a.severity}">
              <div class="ai-alert-icon">${a.icon}</div>
              <div style="flex:1;">
                <div class="ai-alert-msg">${a.message}</div>
                <div class="ai-alert-detail">${a.detail || ''}</div>
              </div>
              ${a.match_id ? `<button onclick="showMatchDetail(${a.match_id})" style="padding:4px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;font-size:0.75rem;font-weight:700;flex-shrink:0;">상세</button>` : ''}
              ${a.type === 'idle_court' ? `<button onclick="closeModal();showCourtCenter&&showCourtCenter()" style="padding:4px 10px;border-radius:8px;background:rgba(249,115,22,0.1);color:#f97316;border:1px solid rgba(249,115,22,0.2);cursor:pointer;font-size:0.75rem;font-weight:700;flex-shrink:0;">코트 관리</button>` : ''}
            </div>
          `).join('')}
          ${monitoring.alerts.length > 8 ? `<div style="text-align:center;font-size:0.82rem;color:#94a3b8;padding:8px;">+${monitoring.alerts.length - 8}건 더...</div>` : ''}
          <div style="text-align:right; margin-top:8px;">
            <button onclick="refreshMonitoring(${tid})" style="padding:6px 14px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;font-size:0.78rem;font-weight:700;">🔄 새로고침</button>
          </div>
        </div>
      ` : `
        <div class="ai-section">
          <div class="ai-section-title">🚨 실시간 모니터링</div>
          <div style="text-align:center;padding:20px;background:#f0fdf4;border-radius:12px;border:1px solid rgba(16,185,129,0.15);">
            <div style="font-size:1.5rem;margin-bottom:6px;">✅</div>
            <div style="font-weight:700;color:#10b981;">이상 없음 — 모든 경기가 정상 진행 중</div>
            <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px;">코트 ${monitoring?.summary?.playing_courts || 0}/${monitoring?.summary?.total_courts || 0} 가동 중</div>
          </div>
        </div>
      `}

      <!-- ═══ 2. 🏅 Elo 리더보드 ═══ -->
      <div class="ai-section">
        <div class="ai-section-title">🏅 Elo 리더보드 TOP 10</div>
        <div class="ai-card" style="padding:8px;">
          ${leaderboard.length > 0 ? leaderboard.map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    const rankBg = i < 3
      ? 'background:linear-gradient(135deg,rgba(249,115,22,0.15),rgba(251,191,36,0.15));color:#f97316;'
      : 'background:#f1f5f9;color:#64748b;';
    const deltaColor = (p.last_delta || 0) > 0 ? '#10b981' : (p.last_delta || 0) < 0 ? '#ef4444' : '#94a3b8';
    const deltaIcon = (p.last_delta || 0) > 0 ? '▲' : (p.last_delta || 0) < 0 ? '▼' : '—';

    return `
              <div class="ai-lb-row" onclick="showMemberRankCard(${p.id})" style="cursor:pointer; ${i < 3 ? 'background:rgba(249,115,22,0.02);' : ''}">
                <div class="ai-lb-rank" style="${rankBg}">
                  ${medal || (i + 1)}
                </div>
                <div class="ai-lb-info">
                  <div class="ai-lb-name">${p.name}</div>
                  <div class="ai-lb-meta">${p.club || '-'} · ${p.gender === 'm' ? '남' : '여'} · ${(p.level || '-').toUpperCase()}급 · ${p.total_games || 0}전 ${p.wins || 0}승 (${p.win_rate || 0}%)</div>
                </div>
                <div>
                  <div class="ai-lb-elo" style="color:${i < 3 ? '#f97316' : '#0f172a'}">${p.elo_rating}</div>
                  <div class="ai-lb-delta" style="color:${deltaColor}; text-align:right;">${deltaIcon} ${Math.abs(p.last_delta || 0)}</div>
                </div>
              </div>`;
  }).join('') : `
            <div style="text-align:center; padding:24px; color:#94a3b8; font-size:0.9rem;">
              📊 아직 Elo 데이터가 없습니다.<br>
              <small>경기가 완료되면 자동으로 Elo가 계산됩니다.</small>
            </div>
          `}
        </div>
      </div>

      <!-- ═══ 3. ⚖️ 조 편성 균형도 ═══ -->
      ${groupAnalysis ? `
        <div class="ai-section">
          <div class="ai-section-title">⚖️ 조 편성 균형도 분석</div>

          <!-- 균형 등급 카드 -->
          <div class="ai-card" style="display:flex; align-items:center; gap:16px; margin-bottom:12px; padding:20px;">
            <div style="width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:900; background:${gradeColor[groupAnalysis.balance_grade] || '#94a3b8'}15; color:${gradeColor[groupAnalysis.balance_grade] || '#94a3b8'}; border:3px solid ${gradeColor[groupAnalysis.balance_grade] || '#94a3b8'}; flex-shrink:0;">
              ${groupAnalysis.balance_grade}
            </div>
            <div>
              <div style="font-weight:800; font-size:1.1rem; color:#0f172a; margin-bottom:4px;">
                균형 등급: ${gradeLabel[groupAnalysis.balance_grade] || '미정'}
              </div>
              <div style="font-size:0.85rem; color:#64748b;">
                조 간 평균 Elo 편차: ±${groupAnalysis.group_spread} |
                총 ${groupAnalysis.total_teams}팀 → ${groupAnalysis.total_groups}조
              </div>
            </div>
          </div>

          <!-- 조별 Elo 히트맵 -->
          <div class="ai-grid" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); margin-bottom:12px;">
            ${(groupAnalysis.groups || []).map(g => {
    const eloNorm = Math.max(0, Math.min(100, ((g.avg_elo - 1400) / 200) * 100));
    const hue = 120 - (eloNorm * 1.2); // green(high) → red(low)
    return `
                <div class="ai-grp-card" style="border-color:hsl(${hue},60%,75%);">
                  <div class="ai-grp-num">${g.group}조 (${g.teams}팀)</div>
                  <div class="ai-grp-elo">${g.avg_elo}</div>
                  <div class="ai-grp-std">±${g.elo_std} | 클럽중복${g.club_duplicates}</div>
                </div>`;
  }).join('')}
          </div>

          <!-- AI 인사이트 -->
          ${(groupAnalysis.insights || []).map(i => `
            <div class="ai-insight">${i}</div>
          `).join('')}

          <!-- 다른 종목 분석 버튼 -->
          ${events.length > 1 ? `
            <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
              ${events.map(ev => `
                <button onclick="loadGroupAnalysis(${tid}, ${ev.id}, '${ev.name}')" class="btn"
                  style="padding:6px 12px; font-size:0.78rem; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; cursor:pointer; font-weight:600;">
                  ${ev.name}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- ═══ 4. 🏟️ 클럽별 활약도 ═══ -->
      ${clubStats.length > 0 ? `
        <div class="ai-section">
          <div class="ai-section-title">🏟️ 클럽별 활약도</div>
          <div class="ai-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
            ${clubStats.slice(0, 8).map((c, i) => `
              <div class="ai-card" style="text-align:center; ${i === 0 ? 'border-color:rgba(249,115,22,0.3); background:linear-gradient(135deg,rgba(249,115,22,0.03),rgba(251,191,36,0.03));' : ''}">
                <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:4px;">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'} ${i + 1}위</div>
                <div style="font-weight:800; font-size:1rem; color:#0f172a;">${c.club}</div>
                <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">${c.participants}명 · ${c.matches_played || 0}경기</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- ═══ 5. 🛠️ 액션 버튼 ═══ -->
      <div class="ai-section" style="border-top:2px solid #f1f5f9; padding-top:20px;">
        <div class="ai-section-title">🛠️ AI 운영 도구</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button onclick="closeModal(); showTournamentReport(${tid})" class="btn" style="padding:10px 18px; border-radius:12px; font-weight:700; background:linear-gradient(135deg,#f97316,#f59e0b); color:#fff; border:none; cursor:pointer; font-size:0.88rem;">
            📊 통계 리포트
          </button>
          <button onclick="closeModal(); showRankingPage()" class="btn" style="padding:10px 18px; border-radius:12px; font-weight:700; background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff; border:none; cursor:pointer; font-size:0.88rem;">
            🏅 개인 랭킹
          </button>
          <button onclick="refreshGroupBalance(${tid})" class="btn" style="padding:10px 18px; border-radius:12px; font-weight:700; background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.2); cursor:pointer; font-size:0.88rem;">
            ⚖️ 조 균형 재배정
          </button>
        </div>
      </div>

    </div>
  `;
}

// ── 특정 종목의 조 분석 로드 ──
async function loadGroupAnalysis(tid, eventId, eventName) {
  try {
    const data = await api(`/${tid}/events/${eventId}/group-analysis`);
    const gradeColor = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };
    const gradeLabel = { A: '매우 균형', B: '양호', C: '보통', D: '불균형' };

    let html = `
      <div style="font-weight:800; font-size:1rem; margin-bottom:12px; color:#0f172a;">⚖️ ${eventName} — 균형 등급: <span style="color:${gradeColor[data.balance_grade]}">${data.balance_grade} (${gradeLabel[data.balance_grade]})</span></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); gap:8px; margin-bottom:12px;">
        ${(data.groups || []).map(g => `
          <div style="background:#f8fafc; border-radius:10px; padding:10px; text-align:center; border:1px solid #e2e8f0;">
            <div style="font-size:0.75rem; font-weight:800; color:#64748b;">${g.group}조</div>
            <div style="font-size:1.2rem; font-weight:900; color:#0f172a;">${g.avg_elo}</div>
            <div style="font-size:0.7rem; color:#94a3b8;">±${g.elo_std}</div>
          </div>
        `).join('')}
      </div>
      ${(data.insights || []).map(i => `<div class="ai-insight">${i}</div>`).join('')}
    `;

    showModal(`⚖️ ${eventName} 조 분석`, html, null, { confirmText: '닫기', hideCancel: true });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── 조 균형 재배정 ──
async function refreshGroupBalance(tid) {
  if (!confirm('모든 종목의 조 편성을 Elo 균형 기반으로 재배정하시겠습니까? (기존 경기 결과는 유지됩니다)')) return;

  try {
    const events = await api(`/${tid}/events`);
    let total = 0;
    for (const ev of events) {
      try {
        const res = await api(`/${tid}/events/${ev.id}/assign-groups`, {
          method: 'POST',
          body: { teams_per_group: 5, avoid_club_in_group: true, use_elo: true }
        });
        if (res.balance_grade) total++;
      } catch (e) { }
    }
    showToast(`✅ ${total}개 종목 조 편성 완료!`);
    closeModal();
    showAiDashboard(tid);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── 모니터링 새로고침 ──
async function refreshMonitoring(tid) {
  try {
    const monitoring = await api(`/${tid}/monitoring`);
    const section = document.querySelector('.ai-section');
    // 간단히 전체 대시보드 새로고침
    closeModal();
    showAiDashboard(tid);
  } catch (e) {
    showToast('모니터링 새로고침 실패', 'error');
  }
}

// ── ▶️ 다음 경기 자동 시작 제안 팝업 ──
async function showNextMatchSuggestion(tid, matchId) {
  try {
    const data = await api(`/${tid}/matches/${matchId}/next-suggestion`);
    if (!data.has_next) {
      showToast('✅ 해당 코트에 다음 대기 경기가 없습니다.', 'success');
      return;
    }

    const s = data.suggestions[0]; // 최우선 제안
    const html = `
      <div style="text-align:center; padding:10px 0;">
        <div style="font-size:3rem; margin-bottom:12px;">▶️</div>
        <div style="font-size:1.1rem; font-weight:800; color:#0f172a; margin-bottom:8px;">다음 경기 준비됨</div>
        <div style="background:#f8fafc; border-radius:14px; padding:16px; border:1px solid #e2e8f0; margin-bottom:16px;">
          <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:4px;">${s.event || ''} · ${s.court}번 코트</div>
          <div style="font-size:1.1rem; font-weight:800; color:#0f172a;">${s.teams}</div>
          ${s.scheduled_time ? `<div style="font-size:0.82rem; color:#64748b; margin-top:4px;">예정: ${s.scheduled_time}</div>` : ''}
        </div>
        <button onclick="startNextMatch(${tid}, ${s.court})" style="width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;cursor:pointer;font-size:1rem;font-weight:800;">
          ▶️ 바로 시작 (${s.court}번 코트)
        </button>
        ${data.suggestions.length > 1 ? `<div style="margin-top:12px;font-size:0.82rem;color:#94a3b8;">+${data.suggestions.length - 1}건 추가 제안 있음</div>` : ''}
      </div>
    `;
    showModal('▶️ 다음 경기 시작', html, null, { confirmText: '닫기', hideCancel: true });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function startNextMatch(tid, courtNum) {
  try {
    await api(`/${tid}/court/${courtNum}/next`, { method: 'POST' });
    showToast(`✅ ${courtNum}번 코트 다음 경기 시작!`, 'success');
    closeModal();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── ✅ 점수 검증 ──
async function validateMatchScore(tid, matchId, scoreData) {
  try {
    const result = await api(`/${tid}/matches/${matchId}/validate`, {
      method: 'POST',
      body: scoreData
    });

    if (!result.valid) {
      // 에러 — 저장 불가
      const msgs = result.errors.map(e => `${e.icon} ${e.message}`).join('\n');
      alert(`🚫 점수 오류\n\n${msgs}\n\n수정 후 다시 시도해주세요.`);
      return false;
    }

    if (result.has_warnings) {
      // 경고 — 확인 후 저장 가능
      const msgs = result.warnings.map(w => `${w.icon} ${w.message}`).join('\n');
      return confirm(`⚠️ 확인 필요\n\n${msgs}\n\n그래도 저장하시겠습니까?`);
    }

    return true; // 정상
  } catch (e) {
    console.warn('점수 검증 API 실패:', e);
    return true; // API 실패 시 그냥 통과
  }
}

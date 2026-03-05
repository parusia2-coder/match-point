// =========================================================
//  📊 대회 통계 리포트 UI  (report.js)
//  화면 표시 + 인쇄 + Excel 다운로드
// =========================================================

async function showTournamentReport(tid) {
  const t = currentTournament;
  if (!t) return;

  // 로딩 모달 열기
  showModal('📊 통계 리포트', `
      <div class="loading" style="padding:40px 0;">
        <div class="spinner"></div>데이터 집계 중...
      </div>
    `, null, { confirmText: '닫기', wide: true });

  let d;
  try {
    d = await api(`/${tid}/report`);
  } catch (e) {
    // 모달 body만 에러 메시지로 교체
    const mb = document.querySelector('.modal-body');
    if (mb) mb.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
    return;
  }

  const p = d.participants?.stat || {};
  const m = d.matches || {};
  const byLevel = d.participants?.by_level || [];
  const byClub = d.participants?.by_club || [];
  const events = d.events || [];
  const podium = d.podium || [];
  const topScore = d.top_scorers || [];
  const mostWins = d.most_wins || [];
  const rbe = d.results_by_event || {};

  const sport = t.sport_type === 'tennis' ? '🎾 테니스' : '🏸 배드민턴';
  const date = d.generated_at?.slice(0, 10) || '';
  const completeRate = m.total > 0 ? Math.round((m.completed || 0) / m.total * 100) : 0;
  const maxClubs = Math.max(...byClub.map(c => c.cnt), 1);

  // 단계별 막대 색
  const levelColor = { S: '#f97316', A: '#8b5cf6', B: '#3b82f6', C: '#10b981', D: '#94a3b8' };
  const medal = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}위`;

  // 포디엄 HTML (종목별 TOP3)
  const podiumByEvent = {};
  for (const row of podium) {
    const k = row.event_name || '기타';
    if (!podiumByEvent[k]) podiumByEvent[k] = [];
    podiumByEvent[k].push(row);
  }
  const podiumHtml = Object.entries(podiumByEvent).map(([evtName, rows]) => `
    <div class="rpt-event-block">
      <div class="rpt-event-label">${evtName}</div>
      <div class="rpt-podium-row">
        ${rows.slice(0, 3).map((r, i) => `
          <div class="rpt-podium-item rpt-p${i}">
            <div class="rpt-medal">${medal(i)}</div>
            <div class="rpt-pname">${r.p1_name}${r.p2_name && r.p2_name !== r.p1_name ? ` · ${r.p2_name}` : ''}</div>
            <div class="rpt-pclub">${r.p1_club || '-'}</div>
            <div class="rpt-pstat">${r.wins || 0}승 ${r.losses || 0}패 · ${r.points || 0}점</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // 전체 종목 순위 테이블
  const fullResultHtml = Object.entries(rbe).map(([evtName, rows]) => `
    <div class="rpt-full-event">
      <div class="rpt-event-label">${evtName}</div>
      <table class="rpt-table">
        <thead><tr><th>순위</th><th>선수</th><th>클럽</th><th>전적</th><th>점수차</th><th>포인트</th></tr></thead>
        <tbody>
          ${rows.slice(0, 20).map((r, i) => `<tr ${i < 3 ? 'class="rpt-top"' : ''}>
            <td>${medal(i)}</td>
            <td><strong>${r.p1_name}</strong>${r.p2_name && r.p2_name !== r.p1_name ? ` · ${r.p2_name}` : ''}</td>
            <td style="color:#64748b;font-size:0.82rem">${r.p1_club || '-'}</td>
            <td>${r.wins || 0}승 ${r.losses || 0}패</td>
            <td>${r.goal_difference > 0 ? '+' : ''}${r.goal_difference || 0}</td>
            <td style="font-weight:800;color:#f97316">${r.points || 0}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  const html = `
    <style>
      .rpt-header{background:linear-gradient(135deg,#f97316,#8b5cf6);padding:24px;border-radius:16px;color:#fff;margin-bottom:20px;text-align:center;}
      .rpt-header h2{font-size:1.4rem;font-weight:900;margin:0 0 6px 0;}
      .rpt-header .rpt-sub{font-size:0.85rem;opacity:0.9;margin:4px 0;}
      .rpt-section{margin-bottom:24px;}
      .rpt-section-title{font-size:1rem;font-weight:800;color:#0f172a;margin:0 0 12px 0;display:flex;align-items:center;gap:8px;border-bottom:2px solid #f1f5f9;padding-bottom:8px;}
      .rpt-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;}
      .rpt-card{background:#f8fafc;padding:12px;border-radius:12px;text-align:center;}
      .rpt-card .val{font-size:1.6rem;font-weight:900;color:#0f172a;line-height:1;}
      .rpt-card .lbl{font-size:0.7rem;color:#64748b;margin-top:4px;}
      .rpt-card .unit{font-size:0.75rem;color:#94a3b8;font-weight:400;}
      .rpt-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
      .rpt-bar-label{font-size:0.82rem;font-weight:600;min-width:48px;color:#334155;}
      .rpt-bar-track{flex:1;height:20px;background:#f1f5f9;border-radius:10px;overflow:hidden;}
      .rpt-bar-fill{height:100%;border-radius:10px;display:flex;align-items:center;padding-left:8px;font-size:0.72rem;font-weight:700;color:#fff;transition:width 0.8s ease;}
      .rpt-bar-cnt{font-size:0.82rem;color:#64748b;min-width:24px;text-align:right;}
      .rpt-progress-wrap{background:#f1f5f9;border-radius:10px;height:12px;overflow:hidden;margin-bottom:6px;}
      .rpt-progress-fill{height:100%;border-radius:10px;background:linear-gradient(90deg,#10b981,#3b82f6);}
      /* 포디엄 */
      .rpt-event-block{margin-bottom:20px;}
      .rpt-event-label{font-size:0.88rem;font-weight:800;color:#334155;margin-bottom:10px;padding:6px 12px;background:#f8fafc;border-radius:8px;display:inline-block;}
      .rpt-podium-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
      .rpt-podium-item{padding:12px 8px;border-radius:12px;text-align:center;border:1px solid #e2e8f0;}
      .rpt-p0{background:linear-gradient(135deg,rgba(251,191,36,0.15),rgba(249,115,22,0.1));border-color:rgba(251,191,36,0.4);}
      .rpt-p1{background:rgba(148,163,184,0.1);border-color:rgba(148,163,184,0.3);}
      .rpt-p2{background:rgba(180,83,9,0.06);border-color:rgba(180,83,9,0.2);}
      .rpt-medal{font-size:1.5rem;margin-bottom:4px;}
      .rpt-pname{font-size:0.82rem;font-weight:700;color:#0f172a;line-height:1.3;}
      .rpt-pclub{font-size:0.72rem;color:#64748b;margin-top:2px;}
      .rpt-pstat{font-size:0.72rem;color:#94a3b8;margin-top:4px;}
      /* 개인 기록 */
      .rpt-top5{display:flex;flex-direction:column;gap:6px;}
      .rpt-top5-row{display:flex;align-items:center;gap:10px;padding:8px;background:#f8fafc;border-radius:10px;}
      .rpt-top5-rank{font-size:1.1rem;min-width:28px;text-align:center;}
      .rpt-top5-name{font-weight:700;font-size:0.88rem;flex:1;}
      .rpt-top5-club{font-size:0.75rem;color:#94a3b8;}
      .rpt-top5-score{font-weight:800;font-size:1rem;color:#f97316;}
      /* 전체 순위 테이블 */
      .rpt-full-event{margin-bottom:16px;}
      .rpt-table{width:100%;border-collapse:collapse;font-size:0.82rem;}
      .rpt-table th{background:#f8fafc;padding:8px;text-align:left;font-size:0.75rem;font-weight:700;color:#64748b;border-bottom:2px solid #e2e8f0;}
      .rpt-table td{padding:8px;border-bottom:1px solid #f1f5f9;}
      .rpt-top td{background:rgba(249,115,22,0.03);}
      /* 인쇄 */
      @media print{
        .modal-close,.modal-actions,.rpt-no-print{display:none!important;}
        .modal-body{max-height:none!important;overflow:visible!important;}
        body{background:#fff!important;}
        .rpt-header{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      }
    </style>

    <!-- 헤더 -->
    <div class="rpt-header">
      <h2>${t.name}</h2>
      <div class="rpt-sub">${sport}</div>
      <div class="rpt-sub">📅 리포트 생성: ${date} &nbsp;|&nbsp; 🏟️ ${t.courts}코트</div>
    </div>

    <!-- 액션 버튼 -->
    <div class="rpt-no-print" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      <button onclick="printReport()" class="btn" style="border-radius:10px;padding:8px 16px;font-size:0.85rem;background:rgba(15,23,42,0.06);font-weight:700;">🖨️ 인쇄</button>
      <button onclick="exportReportExcel(${tid})" class="btn btn-primary" style="border-radius:10px;padding:8px 16px;font-size:0.85rem;font-weight:700;">📥 Excel 다운로드</button>
      <a href="/r/${tid}" target="_blank" class="btn" style="border-radius:10px;padding:8px 16px;font-size:0.85rem;font-weight:700;background:rgba(139,92,246,0.1);color:#8b5cf6;text-decoration:none;">🔗 공개 결과 페이지</a>
    </div>

    <!-- 1. 참가자 현황 -->
    <div class="rpt-section">
      <h3 class="rpt-section-title">👥 참가자 현황</h3>
      <div class="rpt-cards" style="margin-bottom:16px;">
        <div class="rpt-card"><div class="val">${p.total || 0}<span class="unit">명</span></div><div class="lbl">총 참가</div></div>
        <div class="rpt-card"><div class="val">${p.male || 0}<span class="unit">명</span></div><div class="lbl">👨 남자</div></div>
        <div class="rpt-card"><div class="val">${p.female || 0}<span class="unit">명</span></div><div class="lbl">👩 여자</div></div>
        <div class="rpt-card"><div class="val">${p.club_count || 0}<span class="unit">개</span></div><div class="lbl">🏟️ 클럽</div></div>
        <div class="rpt-card"><div class="val">${p.paid || 0}<span class="unit">명</span></div><div class="lbl">💰 납부</div></div>
        <div class="rpt-card"><div class="val">${p.checked_in || 0}<span class="unit">명</span></div><div class="lbl">✅ 출석</div></div>
      </div>

      <!-- 급수별 분포 -->
      ${byLevel.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:8px;">급수별 분포</div>
          ${byLevel.map(lv => `
            <div class="rpt-bar-row">
              <div class="rpt-bar-label">${lv.level}급</div>
              <div class="rpt-bar-track">
                <div class="rpt-bar-fill" style="width:${Math.round(lv.cnt / (p.total || 1) * 100)}%;background:${levelColor[lv.level] || '#94a3b8'};">
                  ${Math.round(lv.cnt / (p.total || 1) * 100)}%
                </div>
              </div>
              <div class="rpt-bar-cnt">${lv.cnt}명</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- 클럽별 참가 TOP10 -->
      ${byClub.length ? `
        <div>
          <div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:8px;">클럽별 참가 (TOP ${byClub.length})</div>
          ${byClub.map(cx => `
            <div class="rpt-bar-row">
              <div class="rpt-bar-label" style="min-width:80px;font-size:0.78rem;">${(cx.club || '-').slice(0, 8)}</div>
              <div class="rpt-bar-track">
                <div class="rpt-bar-fill" style="width:${Math.round(cx.cnt / maxClubs * 100)}%;background:#3b82f6;">
                  ${cx.cnt}명
                </div>
              </div>
              <div class="rpt-bar-cnt">${cx.cnt}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- 2. 경기 현황 -->
    <div class="rpt-section">
      <h3 class="rpt-section-title">⚔️ 경기 현황</h3>
      <div class="rpt-cards" style="margin-bottom:12px;">
        <div class="rpt-card"><div class="val">${m.total || 0}<span class="unit">경기</span></div><div class="lbl">총 경기</div></div>
        <div class="rpt-card"><div class="val">${m.completed || 0}<span class="unit">경기</span></div><div class="lbl">✅ 완료</div></div>
        <div class="rpt-card"><div class="val">${m.in_progress || 0}<span class="unit">경기</span></div><div class="lbl">▶️ 진행중</div></div>
        <div class="rpt-card"><div class="val">${m.avg_score_winner || '-'}<span class="unit">점</span></div><div class="lbl">평균 득점</div></div>
        <div class="rpt-card"><div class="val">${m.max_total_score || '-'}<span class="unit">점</span></div><div class="lbl">최고 합산</div></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#64748b;margin-bottom:4px;">
          <span>경기 완료율</span><span style="font-weight:700;color:${completeRate >= 90 ? '#10b981' : completeRate >= 60 ? '#f59e0b' : '#ef4444'}">${completeRate}%</span>
        </div>
        <div class="rpt-progress-wrap">
          <div class="rpt-progress-fill" style="width:${completeRate}%;background:${completeRate >= 90 ? '#10b981' : completeRate >= 60 ? '#f97316' : '#ef4444'};"></div>
        </div>
      </div>
      <!-- 종목별 경기 -->
      ${events.length ? `
        <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;">
          ${events.map(ev => `
            <div style="background:#f8fafc;padding:10px;border-radius:10px;font-size:0.8rem;">
              <div style="font-weight:700;margin-bottom:3px;">${ev.event_name}</div>
              <div style="color:#64748b;">${ev.completed || 0}/${ev.match_count || 0} 완료</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- 3. 종목별 포디엄 -->
    ${podiumHtml ? `
      <div class="rpt-section">
        <h3 class="rpt-section-title">🏆 종목별 수상</h3>
        ${podiumHtml}
      </div>
    ` : ''}

    <!-- 4. 개인 기록 -->
    ${(topScore.length || mostWins.length) ? `
      <div class="rpt-section">
        <h3 class="rpt-section-title">🏅 개인 기록</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          ${mostWins.length ? `
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:8px;">🥇 최다 승리</div>
              <div class="rpt-top5">
                ${mostWins.map((r, i) => `
                  <div class="rpt-top5-row">
                    <div class="rpt-top5-rank">${medal(i)}</div>
                    <div>
                      <div class="rpt-top5-name">${r.name}</div>
                      <div class="rpt-top5-club">${r.club || '-'}</div>
                    </div>
                    <div class="rpt-top5-score">${r.wins}승</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          ${topScore.length ? `
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:8px;">🎯 최고 득점</div>
              <div class="rpt-top5">
                ${topScore.map((r, i) => `
                  <div class="rpt-top5-row">
                    <div class="rpt-top5-rank">${medal(i)}</div>
                    <div>
                      <div class="rpt-top5-name">${r.name}</div>
                      <div class="rpt-top5-club">${r.club || '-'}</div>
                    </div>
                    <div class="rpt-top5-score">${r.total_score}점</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- 5. 전체 순위표 -->
    ${fullResultHtml ? `
      <div class="rpt-section">
        <h3 class="rpt-section-title">📋 전체 순위표</h3>
        <div id="rptFullResults">${fullResultHtml}</div>
      </div>
    ` : ''}
  `;

  // 로딩 모달의 body와 title을 직접 교체 (닫힘 없이)
  const modalHeader = document.querySelector('.modal-header h2');
  const modalBody = document.querySelector('.modal-body');
  if (modalHeader) modalHeader.textContent = `📊 ${t.name} — 통계 리포트`;
  if (modalBody) modalBody.innerHTML = html;
  // 넓은 모달 클래스 추가
  document.querySelector('.modal')?.classList.add('modal-wide');
  // Excel 다운로드용 데이터 저장
  window._reportData = d;
}


// ── 인쇄 ──────────────────────────────────────────────────────
function printReport() {
  window.print();
}

// ── Excel 다운로드 ────────────────────────────────────────────
async function exportReportExcel(tid) {
  if (typeof XLSX === 'undefined') { showToast('XLSX 라이브러리 로딩 중...', 'warning'); return; }

  const d = window._reportData;
  if (!d) { showToast('먼저 리포트를 열어주세요.', 'error'); return; }

  const t = d.tournament;
  const p = d.participants?.stat || {};
  const wb = XLSX.utils.book_new();

  // ── 시트1: 요약 ──
  const summaryRows = [
    ['📊 대회 통계 리포트'],
    ['', ''],
    ['대회명', t.name],
    ['종목', t.sport_type === 'tennis' ? '테니스' : '배드민턴'],
    ['형식', t.format],
    ['상태', t.status],
    ['코트 수', t.courts],
    ['', ''],
    ['==== 참가자 ===='],
    ['총 참가자', p.total || 0],
    ['남자', p.male || 0],
    ['여자', p.female || 0],
    ['클럽 수', p.club_count || 0],
    ['납부 완료', p.paid || 0],
    ['출석 체크', p.checked_in || 0],
    ['', ''],
    ['==== 경기 ===='],
    ['총 경기', d.matches?.total || 0],
    ['완료', d.matches?.completed || 0],
    ['완료율', `${d.matches?.total > 0 ? Math.round((d.matches.completed || 0) / d.matches.total * 100) : 0}%`],
    ['평균 득점', d.matches?.avg_score_winner || '-'],
    ['', ''],
    ['리포트 생성일', d.generated_at?.slice(0, 10) || '']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), '📋 요약');

  // ── 시트2: 급수별 참가자 ──
  const lvRows = [['급수', '참가자 수'], ...(d.participants?.by_level || []).map(r => [r.level, r.cnt])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lvRows), '급수별');

  // ── 시트3: 클럽별 참가자 ──
  const clRows = [['클럽명', '참가자 수'], ...(d.participants?.by_club || []).map(r => [r.club, r.cnt])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clRows), '클럽별');

  // ── 시트4~: 종목별 순위 ──
  for (const [evtName, rows] of Object.entries(d.results_by_event || {})) {
    const evRows = [
      ['순위', '선수1', '선수2', '클럽', '승', '패', '점수차', '포인트'],
      ...(Array.isArray(rows) ? rows : []).map((r, i) => [
        i + 1, r.p1_name, r.p2_name || '', r.p1_club || '-',
        r.wins || 0, r.losses || 0, r.goal_difference || 0, r.points || 0
      ])
    ];
    const sheetName = evtName.slice(0, 31); // Excel 시트명 31자 제한
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(evRows), sheetName);
  }

  // ── 시트: 개인 기록 ──
  const indRows = [
    ['🥇 최다 승리'],
    ['순위', '이름', '클럽', '승수'],
    ...(d.most_wins || []).map((r, i) => [i + 1, r.name, r.club || '-', r.wins]),
    [],
    ['🎯 최고 득점'],
    ['순위', '이름', '클럽', '총득점', '경기수'],
    ...(d.top_scorers || []).map((r, i) => [i + 1, r.name, r.club || '-', r.total_score, r.games])
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indRows), '개인기록');

  XLSX.writeFile(wb, `${t.name}_통계리포트_${(d.generated_at || '').slice(0, 10)}.xlsx`);
  showToast('📥 Excel 다운로드 완료!');
}

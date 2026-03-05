const params = new URLSearchParams(location.search);
const tid = params.get('tid');

let tInfo = null;
let courtCenterData = [];

async function init() {
  if (!tid) {
    document.body.innerHTML = '<div style="color:white;text-align:center;padding:50px;">대회 ID가 없습니다.</div>';
    return;
  }
  await fetchAndRender();
  setInterval(fetchAndRender, 1500);
}

async function fetchAndRender() {
  try {
    const tRes = await fetch('/api/tournaments/' + tid);
    if (!tRes.ok) return;
    tInfo = await tRes.json();

    const cRes = await fetch('/api/tournaments/' + tid + '/courts/overview');
    if (!cRes.ok) return;
    courtCenterData = await cRes.json();

    renderBoard();
  } catch (e) { console.error(e); }
}

function renderBoard() {
  const app = document.getElementById('board-app');
  if (!app) return;
  const isTennis = tInfo.sport_type === 'tennis';
  const sportIcon = isTennis ? '🎾' : '🏸';

  let html = `<div style="min-height:100vh;background:#0f172a;color:#f8fafc;font-family:'Pretendard',sans-serif;padding:20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:20px;background:#1e293b;border-radius:16px;">
      <h1 style="margin:0;font-size:2.5rem;font-weight:900;">${sportIcon} ${tInfo.name} - 대형 전광판</h1>
      <div style="display:flex;gap:12px;">
        <button onclick="if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); } else { document.exitFullscreen(); }" style="padding:10px 20px;background:#3b82f6;border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:700;font-size:1.1rem;">⛶ 풀화면</button>
        <button onclick="if(window.toggleVoiceBroadcast) window.toggleVoiceBroadcast(${tInfo.id}, this)" style="padding:10px 20px;border:none;border-radius:8px;font-weight:700;font-size:1.1rem;cursor:pointer;${window.broadcastEnabled ? 'background:rgba(239, 68, 68, 0.2);color:#ef4444;border:1px solid rgba(239, 68, 68, 0.5);' : 'background:#334155;color:#cbd5e1;'}">${window.broadcastEnabled ? '🔴 방송 중 (ON)' : '🎙️ 방송 켜기 (OFF)'}</button>
        <button onclick="window.close()" style="padding:10px 20px;background:#334155;border:none;border-radius:8px;color:#cbd5e1;cursor:pointer;font-weight:700;font-size:1.1rem;">✕ 닫기</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:20px;">`;

  courtCenterData.forEach(c => {
    if (c.current) {
      const formatScore = (s, os, set1Game, set2Game) => {
        if (!isTennis) return s;
        const isTiebreak = (set1Game === 6 && set2Game === 6);
        if (isTiebreak) return s; // 타이브레이크는 숫자 그대로
        if (s <= 3 && os <= 3) return [0, 15, 30, 40][s];
        if (s === os) return "40";
        return s > os ? (s - os >= 2 ? "승리" : "어드밴티지") : "40";
      };
      const s1 = c.current.team1_set1 || 0;
      const s2 = c.current.team2_set1 || 0;
      const set1Game = c.current.team1_set2 || 0;
      const set2Game = c.current.team2_set2 || 0;
      const d1 = formatScore(s1, s2, set1Game, set2Game);
      const d2 = formatScore(s2, s1, set1Game, set2Game);

      const isSwapped = c.current.court_swapped === 1;

      const leftName = isSwapped ? (c.current.team2_name || '?') : (c.current.team1_name || '?');
      const rightName = isSwapped ? (c.current.team1_name || '?') : (c.current.team2_name || '?');

      const leftSet = isSwapped ? set2Game : set1Game;
      const rightSet = isSwapped ? set1Game : set2Game;

      const leftScore = isSwapped ? d2 : d1;
      const rightScore = isSwapped ? d1 : d2;

      html += `<div style="background:#22c55e;border-radius:24px;padding:30px;box-shadow:0 10px 30px rgba(0,0,0,0.3);position:relative;">
        <div style="position:absolute;top:20px;right:20px;background:#16a34a;color:#fff;padding:6px 16px;border-radius:12px;font-weight:800;animation:pulse 2s infinite;">🔴 LIVE</div>
        <div style="font-size:3rem;font-weight:900;color:#fff;line-height:1;margin-bottom:20px;">${c.court}코트</div>
        
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.15);border-radius:16px;padding:20px;">
          <div style="flex:1;text-align:center;width:40%;">
            <div style="font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:10px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${leftName}</div>
            <div style="font-size:1.2rem;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:5px;">게임: ${leftSet}</div>
            <div style="font-size:4.5rem;font-weight:900;color:#fff;">${leftScore}</div>
          </div>
          <div style="font-size:2rem;font-weight:900;color:rgba(255,255,255,0.7);margin:0 10px;">VS</div>
          <div style="flex:1;text-align:center;width:40%;">
            <div style="font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:10px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${rightName}</div>
            <div style="font-size:1.2rem;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:5px;">게임: ${rightSet}</div>
            <div style="font-size:4.5rem;font-weight:900;color:#fff;">${rightScore}</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:20px;color:rgba(255,255,255,0.9);font-weight:700;font-size:1.2rem;">${c.current.event_name || ''}</div>
      </div>`;
    } else if (c.recently_completed) {
      const rc = c.recently_completed;
      const t1 = rc.team1_name || '?';
      const t2 = rc.team2_name || '?';
      let winnerName = t1;
      if (rc.winner_team && rc.winner_team === rc.team2_id) winnerName = t2;
      else if (rc.winner_team && rc.winner_team === rc.team1_id) winnerName = t1;
      else if (rc.team2_set1 > rc.team1_set1) winnerName = t2;

      html += `<div style="background:linear-gradient(135deg, #f59e0b, #d97706);border-radius:24px;padding:30px;box-shadow:0 10px 30px rgba(217,119,6,0.5);text-align:center;display:flex;flex-direction:column;justify-content:center;position:relative;animation:celebrate 1s ease-in-out infinite alternate;">
        <div style="font-size:2rem;font-weight:900;color:rgba(255,255,255,0.9);line-height:1;margin-bottom:10px;">${c.court}코트 경기 종료</div>
        <div style="font-size:3rem;color:#fff;font-weight:900;margin-bottom:15px;text-shadow:0 4px 10px rgba(0,0,0,0.3);">🎉 승리 🎉</div>
        <div style="font-size:2.5rem;color:#fff;font-weight:900;background:rgba(0,0,0,0.2);border-radius:16px;padding:12px 20px;display:inline-block;margin:0 auto;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;max-width:90%;">${winnerName}</div>
      </div>`;
    } else {
      html += `<div style="background:#334155;border-radius:24px;padding:30px;box-shadow:0 10px 30px rgba(0,0,0,0.3);text-align:center;display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:3rem;font-weight:900;color:#94a3b8;line-height:1;margin-bottom:20px;">${c.court}코트</div>
        <div style="font-size:2.5rem;color:#cbd5e1;font-weight:700;margin-bottom:12px;">경기 대기 중</div>
        <div style="font-size:1.4rem;color:#94a3b8;">대기: ${c.pending}경기</div>
      </div>`;
    }
  });

  html += `</div></div><style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} @keyframes celebrate{from{transform:scale(1);}to{transform:scale(1.02);box-shadow:0 15px 40px rgba(217,119,6,0.6);}} body{margin:0;padding:0;background:#0f172a;}</style>`;
  app.innerHTML = html;
}

init();

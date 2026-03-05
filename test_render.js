const fetch = require('node-fetch');

async function test() {
    const res = await fetch('https://minton-tennis.pages.dev/api/tournaments/1/print-data', { headers: { 'User-Agent': 'Mozilla' } });
    const printData = await res.json();

    let html = '';
    // Test renderParticipants exactly as written in index.tsx
    const c = { innerHTML: '' };

    const byClub = {};
    printData.participants.forEach(function (p) {
        const club = p.club || '소속없음';
        if (!byClub[club]) byClub[club] = [];
        byClub[club].push(p);
    });
    for (const [club, members] of Object.entries(byClub)) {
        html += '<div class="group-title">' + club + ' (' + members.length + '명)</div>';
        html += '<table><tr><th>이름</th><th>성별</th><th>출생</th><th>급수</th><th>연락처</th><th>참가비</th><th>체크인</th></tr>';
        members.forEach(function (p) {
            // THE SUSPECTED LINE
            html += '<tr><td>' + p.name + '</td><td>' + (p.gender === 'm' ? '남' : '여') + '</td><td>' + p.birth_year + '</td><td>' + p.level.toUpperCase() + '</td><td>' + (p.phone || '') + '</td><td style="text-align:center">' + (p.paid ? '✅' : '☐') + '</td><td style="text-align:center">' + (p.checked_in ? '✅' : '☐') + '</td></tr>';
        });
        html += '</table>';
    }
    c.innerHTML = html;
    console.log("SUCCESS! Length:", c.innerHTML.length);
}

test().catch(e => console.error("ERROR CAUGHT: ", e));

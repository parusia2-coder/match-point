const fs = require('fs');
const path = require('path');

// 1. Update index.tsx commonHead
const indexFile = 'C:\\new_대회운영관리시스템\\minton_tennis\\src\\index.tsx';
let idxContent = fs.readFileSync(indexFile, 'utf8');

const headScript = `
<script>
  (function() {
    try {
      if (localStorage.getItem('mpDarkMode') === 'true' || localStorage.getItem('mp_theme') === 'dark') {
        document.documentElement.classList.add('dark-mode');
        // also add to body when possible
        window.addEventListener('DOMContentLoaded', () => document.body.classList.add('dark-mode'));
      }
    } catch(e){}
  })();
</script>
`;

if (!idxContent.includes('mpDarkMode')) {
  idxContent = idxContent.replace(
    '<link rel="stylesheet" href="/static/style.css">\n`',
    '<link rel="stylesheet" href="/static/style.css">\n' + headScript + '`'
  );
  fs.writeFileSync(indexFile, idxContent);
}

const updatePage = (filePath, replacer) => {
  if (fs.existsSync(filePath)) {
    let text = fs.readFileSync(filePath, 'utf8');
    let initText = text;
    text = replacer(text);
    if (initText !== text) {
      fs.writeFileSync(filePath, text);
      console.log('Updated ' + filePath);
    } else {
      console.log('No changes needed or regex failed for ' + filePath);
    }
  } else {
    console.log('File not found ' + filePath);
  }
}

// 2. my.html
updatePage('C:\\new_대회운영관리시스템\\minton_tennis\\src\\pages\\my.html', (text) => {
  return text.replace(/body\s*\{.*?background:\s*#080b12;.*?color:\s*#f1f5f9;.*?\}/,
    "body { background: var(--bg-primary); color: var(--text-primary); font-family: 'Outfit', 'Pretendard', sans-serif; margin: 0; padding: 20px; min-height: 100vh; display: flex; justify-content: center; transition: var(--transition); }")
    .replace(/rgba\(30,\s*41,\s*59,\s*0\.6\)/g, 'var(--bg-card)')
    .replace(/rgba\(30,\s*41,\s*59,\s*0\.4\)/g, 'var(--bg-card)')
    .replace(/rgba\(15,\s*23,\s*42,\s*0\.6\)/g, 'var(--bg-secondary)')
    .replace(/rgba\(15,\s*23,\s*42,\s*0\.8\)/g, 'var(--bg-secondary)')
    .replace(/border:\s*1px\s*solid\s*rgba\(255,255,255,0\.05\)/g, 'border: 1px solid var(--border)')
    .replace(/border:\s*1px\s*solid\s*rgba\(255,255,255,0\.08\)/g, 'border: 1px solid var(--border)')
    .replace(/border:\s*1px\s*solid\s*rgba\(255,255,255,0\.06\)/g, 'border: 1px solid var(--border)')
    .replace(/color:\s*#f8fafc;/g, 'color: var(--text-primary);')
    .replace(/color:\s*#94a3b8;/g, 'color: var(--text-muted);')
    .replace(/color:\s*#64748b;/g, 'color: var(--text-muted);')
    .replace(/background:\s*rgba\(30,41,59,0\.3\)/g, 'background: var(--bg-card)')
    .replace(/background:\s*rgba\(30,41,59,0\.7\)/g, 'background: var(--bg-card)')
    .replace(/color:\s*#f8fafc/g, 'color: var(--text-primary)')
    .replace(/color:\s*#94a3b8/g, 'color: var(--text-muted)')
    .replace(/color:\s*#64748b/g, 'color: var(--text-muted)');
});

// 3. timeline.html
updatePage('C:\\new_대회운영관리시스템\\minton_tennis\\src\\pages\\timeline.html', (text) => {
  return text.replace(/body\s*\{.*?background:\s*#080b12;.*?color:\s*#f1f5f9;.*?\}/,
    "body { background: var(--bg-primary); color: var(--text-primary); font-family: 'Outfit', sans-serif; margin: 0; padding: 20px; transition: var(--transition); }")
    .replace(/rgba\(30,\s*41,\s*59,\s*0\.3\)/g, 'var(--bg-card)')
    .replace(/rgba\(30,\s*41,\s*59,\s*0\.8\)/g, 'var(--bg-secondary)')
    .replace(/rgba\(15,\s*23,\s*42,\s*0\.4\)/g, 'var(--bg-card)')
    .replace(/rgba\(15,\s*23,\s*42,\s*0\.2\)/g, 'var(--bg-secondary)')
    .replace(/rgba\(255,\s*255,\s*255,\s*0\.05\)/g, 'var(--border)')
    .replace(/rgba\(255,\s*255,\s*255,\s*0\.03\)/g, 'var(--border)')
    .replace(/background:\s*rgba\(15,23,42,0\.95\)/g, 'background: var(--bg-card-hover)')
    .replace(/color:\s*#94a3b8/g, 'color: var(--text-muted)')
    .replace(/color:\s*#f8fafc/g, 'color: var(--text-primary)')
    .replace(/color:\s*#f1f5f9/g, 'color: var(--text-primary)')
    .replace(/color:\s*#64748b/g, 'color: var(--text-muted)');
});

// 4. dashboard.html
updatePage('C:\\new_대회운영관리시스템\\minton_tennis\\src\\dashboard.html', (text) => {
  let finalHtml = text;
  // Inject commonHead equivalent styles so dashboard behaves correctly
  if (!finalHtml.includes("localStorage.getItem('mpDarkMode')")) {
    let regex = /<head>([\s\S]*?)<\/head>/m;
    let match = finalHtml.match(regex);
    let headContent = match[1];

    // Remove old dark mode detection if any
    let newHeadContent = headContent + `
    <link rel="stylesheet" href="/static/style.css">
    ${headScript}
    <style>
      body { background: var(--bg-primary); color: var(--text-primary); transition: var(--transition); }
      .sc, .cc, .lc, .cw, .tc { background: var(--bg-card); color: var(--text-primary); border-color: var(--border); box-shadow: var(--shadow-sm); }
      .cc:hover { background: var(--bg-card-hover); border-color: var(--text-primary); }
      .er, .ed th, .st, .rn, .cd { color: var(--text-primary) !important; background: var(--bg-secondary) !important; border-color: var(--border) !important; }
      .ed td { border-bottom: 1px solid var(--border); color: var(--text-muted); }
      .sub, .ls, .ep { color: var(--text-muted); }
      canvas { max-width: 100%; }
      .back { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); }
      .back:hover { background: var(--bg-card-hover); }
      
      /* Reset hard-coded light colors */
      .sc { background-color: var(--bg-card) !important; color: var(--text-primary) !important; border: 1px solid var(--border) !important; box-shadow: var(--shadow-sm) !important; backdrop-filter: blur(var(--glass-blur)) !important; }
      body.dark-mode .ed th { background: rgba(0,0,0,0.3) !important; color: #fff !important; }
      body.dark-mode .ed td { color: #cbd5e1 !important; border-bottom: 1px solid rgba(255,255,255,0.05) !important; }
      body.dark-mode .er { background: rgba(0,0,0,0.3) !important; color: #fff !important; border: 1px solid rgba(255,255,255,0.05) !important; }
      body.dark-mode .rn { background: none !important; color: #94a3b8 !important; border: none !important; }
      body.dark-mode .st { background: none !important; color: #fff !important; }
      body.dark-mode .cd { background: none !important; color: #e2e8f0 !important; }
    </style>`;

    finalHtml = finalHtml.replace(/<head>[\s\S]*?<\/head>/m, '<head>' + newHeadContent + '</head>');

    if (finalHtml.includes('new Chart(ctx,')) {
      finalHtml = finalHtml.replace(
        'options: {',
        'options: { color: document.documentElement.classList.contains("dark-mode") ? "#f1f5f9" : "#334155", scales: { x: { ticks: { color: document.documentElement.classList.contains("dark-mode") ? "#94a3b8" : "#64748b" } }, y: { ticks: { color: document.documentElement.classList.contains("dark-mode") ? "#94a3b8" : "#64748b" } } }, '
      );
    }
  }
  return finalHtml;
});

// Update portal.html / t.html
updatePage('C:\\new_대회운영관리시스템\\minton_tennis\\src\\pages\\t.html', (text) => {
  return text.replace(/<body style="background:#f8fafc; margin:0; padding:0; color:#0f172a;/g, '<body style="background:var(--bg-primary); margin:0; padding:0; color:var(--text-primary); transition:var(--transition);');
});

// Update board.html
updatePage('C:\\new_대회운영관리시스템\\minton_tennis\\src\\pages\\board.html', (text) => {
  return text.replace(/<body style="background:#0f172a;/g, '<body style="background:var(--bg-primary); transition:var(--transition);');
});

console.log('Finished updating files.');

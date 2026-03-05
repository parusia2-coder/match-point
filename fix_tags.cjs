const fs = require('fs');
const files = ['public/static/app.js', 'public/static/auth.js', 'public/static/members.js', 'public/static/ranking.js', 'public/static/report.js'];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix: </tag > → </tag>
    content = content.replace(/<\/([a-z][a-z0-9]*) >/g, '</$1>');
    // Fix: < tag  → <tag 
    content = content.replace(/< ([a-z][a-z0-9]*) /g, '<$1 ');
    // Fix: < tag> 
    content = content.replace(/< ([a-z][a-z0-9]*)>/g, '<$1>');
    // Fix: <option value = "..."
    content = content.replace(/<option value = "([^"]*)">(\s*)/g, '<option value="$1">');
    content = content.replace(/<option value = "/g, '<option value="');
    content = content.replace(/<\/option >/g, '</option>');
    // Fix attribute spacing
    content = content.replace(/<p style = "/g, '<p style="');
    content = content.replace(/<div style = "/g, '<div style="');
    content = content.replace(/<div class = "/g, '<div class="');
    content = content.replace(/<\/section >/g, '</section>');
    content = content.replace(/<\/tr >/g, '</tr>');
    content = content.replace(/<\/td >/g, '</td>');
    content = content.replace(/<\/th >/g, '</th>');

    fs.writeFileSync(filePath, content, 'utf8');

    const r1 = (content.match(/<\/[a-z]+ >/g) || []).length;
    const r2 = (content.match(/< [a-z][a-z0-9]* /g) || []).length;
    console.log(filePath, '→', 'remaining:</tag>:', r1, '< tag:', r2);
});

console.log('\nAll files fixed!');

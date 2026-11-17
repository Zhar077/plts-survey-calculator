// Salin web/engine.js -> apps-script/Engine.gs supaya browser dan server memakai rumus identik.
// Jalankan setiap kali engine.js berubah:  node scripts/sync-engine.js
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(root, 'web', 'engine.js'), 'utf8');
var head = '// FILE INI DIBUAT OTOMATIS dari web/engine.js oleh scripts/sync-engine.js. Jangan edit langsung.\n';
fs.writeFileSync(path.join(root, 'apps-script', 'Engine.gs'), head + src);
console.log('apps-script/Engine.gs diperbarui (' + src.length + ' karakter)');

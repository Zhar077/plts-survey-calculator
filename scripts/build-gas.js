// Bangun 2 file siap tempel ke editor Apps Script:
//   deploy/Code.gs     = Engine + Code + Setup (semua kode server dalam satu file)
//   deploy/Index.html  = web/index.html dengan CSS dan JS di-inline (dilayani doGet)
// Jalankan: node scripts/build-gas.js
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

// Pastikan Engine.gs sinkron dengan web/engine.js
require('./sync-engine.js');

var out = path.join(root, 'deploy');
if (!fs.existsSync(out)) fs.mkdirSync(out);

var head = '// FILE INI DIBUAT OTOMATIS oleh scripts/build-gas.js. Edit sumbernya di apps-script/ dan web/, lalu build ulang.\n\n';
var code = head + ['apps-script/Engine.gs', 'apps-script/Code.gs', 'apps-script/Setup.gs'].map(function (f) {
  return '// ===== ' + f + ' =====\n' + read(f);
}).join('\n\n');
fs.writeFileSync(path.join(out, 'Code.gs'), code);

var html = read('web/index.html');
function inlineScript(src) {
  var js = read('web/' + src);
  if (/<\/script/i.test(js)) throw new Error(src + ' mengandung </script>');
  return '<script>\n' + js + '\n</script>';
}
html = html.replace(/<link rel="stylesheet" href="style\.css[^"]*">/, function () { return '<style>\n' + read('web/style.css') + '\n</style>'; });
html = html.replace(/<script src="engine\.js[^"]*"><\/script>/, function () { return inlineScript('engine.js'); });
html = html.replace(/<script src="app\.js[^"]*"><\/script>/, function () { return inlineScript('app.js'); });
if (/src="(engine|app)\.js|href="style\.css/.test(html)) throw new Error('inline gagal');
fs.writeFileSync(path.join(out, 'Index.html'), html);

console.log('deploy/Code.gs   ' + code.length + ' karakter');
console.log('deploy/Index.html ' + html.length + ' karakter');

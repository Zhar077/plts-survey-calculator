/**
 * PLTS Residensial — Web App API (Google Apps Script).
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me   |   Who has access: Anyone
 * Buka URL /exec langsung: aplikasi web tampil (dilayani dari Index.html).
 * Versi web di luar Google (mis. GitHub Pages) memakai URL yang sama sebagai API.
 *
 * Endpoint
 *   GET  ?action=context[&token=]           -> config + katalog + versi
 *   GET  ?action=list[&token=]              -> daftar survey (ringkas)
 *   GET  ?action=get&id=SV-...[&token=]     -> input + hasil satu survey
 *   POST {action:'calculate', input, token} -> hitung di server, tidak disimpan
 *   POST {action:'save', input, id?, token} -> hitung di server + simpan (id ada = revisi baru)
 *
 * POST dikirim sebagai text/plain (bukan application/json) supaya browser
 * tidak mengirim preflight CORS yang tidak didukung Apps Script.
 *
 * Token opsional: Project Settings > Script properties > API_TOKEN.
 * Jika diisi, semua request wajib membawa token yang sama.
 */

var SHEETS = {
  config: 'Config', orient: 'Orientasi', tarif: 'Tarif', wilayah: 'Wilayah', panel: 'Panel',
  inverter: 'Inverter', kabel: 'Kabel', harga: 'HargaBoQ', survey: 'Survey', rules: 'RuleLog', snap: 'ConfigSnapshot'
};

var SURVEY_HEADERS = ['id', 'revisi_dari', 'tanggal_simpan', 'surveyor', 'nama_pelanggan', 'alamat', 'status', 'kwp', 'inverter',
  'n_panel', 'e_pv_tahun0_kwh', 'capex', 'hemat_th1', 'payback_th', 'npv', 'irr', 'config_version', 'engine_version', 'input_json', 'result_json'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  // Tanpa ?action: tampilkan aplikasi web (file Index.html di proyek Apps Script).
  if (!p.action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Kalkulator Survey PLTS')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return handle_(function () { checkToken_(p.token); return routeGet_(p); });
}

function doPost(e) {
  return handle_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    return routePost_(body);
  });
}

function routeGet_(p) {
  switch (p.action) {
    case 'context': return loadContext_();
    case 'list': return listSurveys_();
    case 'get': return getSurvey_(p.id);
    case 'ping': return { ok: true, time: new Date().toISOString() };
    default: throw new Error('action tidak dikenal: ' + p.action);
  }
}

function routePost_(body) {
  var ctx = loadContext_();
  if (body.action === 'calculate') return { result: PLTS.calculate(body.input, ctx) };
  if (body.action === 'save') return saveSurvey_(body.input, ctx, body.id, body.surveyor);
  throw new Error('action tidak dikenal: ' + body.action);
}

/**
 * Dipanggil dari halaman yang dilayani Apps Script lewat google.script.run.
 * Akses dijaga oleh URL web app itu sendiri, jadi token tidak diperiksa di sini.
 * Hasil dikirim sebagai string JSON supaya tipe data aman melewati google.script.run.
 */
function apiGet(p) { return JSON.stringify(routeGet_(p || {})); }
function apiPost(body) { return JSON.stringify(routePost_(body || {})); }

function handle_(fn) {
  var out;
  try { out = { ok: true, data: fn() }; }
  catch (err) { out = { ok: false, error: String(err && err.message ? err.message : err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(t) {
  var want = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (want && String(t || '') !== want) throw new Error('Token tidak valid');
}

// ---------------------------------------------------------------------------
// Baca sheet -> objek
// ---------------------------------------------------------------------------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function readTable_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (h) { return String(h).trim(); });
  var tz = ss_().getSpreadsheetTimeZone();
  return v.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x !== null; }); }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) {
      if (!h) return;
      var x = r[i];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      o[h] = x;
    });
    return o;
  });
}

/** Config: ambil baris dengan tanggal_berlaku <= hari ini, versi tertinggi per key. */
function readConfig_() {
  var rows = readTable_(SHEETS.config);
  var today = Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var pick = {};
  rows.forEach(function (r) {
    var k = String(r.key || '').trim();
    if (!k) return;
    var tb = String(r.tanggal_berlaku || '');
    if (tb && tb > today) return;
    var ver = Number(r.versi) || 0;
    if (!pick[k] || ver > pick[k].ver || (ver === pick[k].ver && tb > pick[k].tb)) pick[k] = { ver: ver, tb: tb, v: r.nilai };
  });
  var cfg = {};
  Object.keys(pick).forEach(function (k) { cfg[k] = pick[k].v; });
  return cfg;
}

function loadContext_() {
  var ctx = {
    config: readConfig_(),
    orient: readTable_(SHEETS.orient),
    tarif: readTable_(SHEETS.tarif),
    wilayah: readTable_(SHEETS.wilayah),
    panels: readTable_(SHEETS.panel),
    inverters: readTable_(SHEETS.inverter),
    cables: readTable_(SHEETS.kabel),
    hargaBoq: readTable_(SHEETS.harga)
  };
  // Versi = hash isi konfigurasi + katalog. Survey menyimpan versi ini; snapshot disimpan sekali.
  var json = JSON.stringify(ctx);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, json, Utilities.Charset.UTF_8);
  var hex = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  ctx.configVersion = 'cfg-' + hex.slice(0, 10);
  ensureSnapshot_(ctx.configVersion, json);
  return ctx;
}

function ensureSnapshot_(version, json) {
  var cache = CacheService.getScriptCache();
  if (cache.get('snap:' + version)) return;
  var sh = ss_().getSheetByName(SHEETS.snap);
  if (!sh) return;
  var finder = sh.getRange('A:A').createTextFinder(version).matchEntireCell(true).findNext();
  if (!finder) {
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      if (!sh.getRange('A:A').createTextFinder(version).matchEntireCell(true).findNext()) {
        // Batas sel 50.000 karakter: pecah ke beberapa kolom bila perlu.
        var parts = []; for (var i = 0; i < json.length; i += 45000) parts.push(json.slice(i, i + 45000));
        sh.appendRow([version, new Date()].concat(parts));
      }
    } finally { lock.releaseLock(); }
  }
  cache.put('snap:' + version, '1', 21600);
}

function readSnapshot_(version) {
  var sh = ss_().getSheetByName(SHEETS.snap);
  var cell = sh && sh.getRange('A:A').createTextFinder(version).matchEntireCell(true).findNext();
  if (!cell) return null;
  var row = sh.getRange(cell.getRow(), 1, 1, sh.getLastColumn()).getValues()[0];
  var ctx = JSON.parse(row.slice(2).join(''));
  ctx.configVersion = version;
  return ctx;
}

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------
function compactResult_(r) {
  var c = JSON.parse(JSON.stringify(r));
  delete c.segments; // segmentsOut sudah memuat ringkasan per bidang
  var s = JSON.stringify(c);
  if (s.length > 49000 && c.economics) { delete c.economics.cashflow; s = JSON.stringify(c); }
  return s.length > 49000 ? JSON.stringify({ status: r.status, rules: r.rules, truncated: true }) : s;
}

function saveSurvey_(input, ctx, prevId, surveyor) {
  if (!input) throw new Error('input kosong');
  var result = PLTS.calculate(input, ctx);
  var tz = ss_().getSpreadsheetTimeZone();
  var id = 'SV-' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  var inJson = JSON.stringify(input);
  if (inJson.length > 49000) throw new Error('Input terlalu besar');
  var a = result.array || {}, ec = result.economics || {};
  var row = [id, prevId || '', new Date(), surveyor || Session.getActiveUser().getEmail() || '', input.nama_pelanggan || '', input.alamat || '',
    result.status, a.kwp || '', result.inverter ? result.inverter.id : '', a.n_panel || '',
    result.production ? result.production.e_pv_year0 : '', ec.capex || '', ec.savings_y1 || '', ec.payback_simple || '',
    ec.npv === undefined ? '' : ec.npv, ec.irr === undefined || ec.irr === null ? '' : ec.irr, result.configVersion, result.engineVersion, inJson, compactResult_(result)];
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    ss_().getSheetByName(SHEETS.survey).appendRow(row);
    var rl = ss_().getSheetByName(SHEETS.rules);
    var rows = result.rules.map(function (q) { return [id, q.id, q.level, q.message, String(q.value)]; });
    if (rows.length) rl.getRange(rl.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  } finally { lock.releaseLock(); }
  return { id: id, result: result };
}

function listSurveys_() {
  return readTable_(SHEETS.survey).map(function (r) {
    var o = {}; SURVEY_HEADERS.forEach(function (h) { if (h !== 'input_json' && h !== 'result_json') o[h] = r[h]; }); return o;
  }).reverse().slice(0, 300);
}

function getSurvey_(id) {
  var r = readTable_(SHEETS.survey).filter(function (x) { return x.id === id; })[0];
  if (!r) throw new Error('Survey tidak ditemukan: ' + id);
  return { id: r.id, input: JSON.parse(r.input_json), result: JSON.parse(r.result_json), config_version: r.config_version };
}

// ---------------------------------------------------------------------------
// Menu sheet
// ---------------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('PLTS')
    .addItem('Siapkan sheet (isi default bila kosong)', 'setupSheets')
    .addItem('Audit: hitung ulang survey terpilih (config tersimpan)', 'auditSelected')
    .addItem('Hitung ulang survey terpilih (config sekarang)', 'recalcSelected')
    .addItem('Cek konfigurasi', 'checkContext')
    .addToUi();
}

function selectedSurvey_() {
  var sh = ss_().getActiveSheet();
  if (sh.getName() !== SHEETS.survey) throw new Error('Pilih satu baris di sheet Survey dulu.');
  var r = sh.getActiveRange().getRow();
  if (r < 2) throw new Error('Pilih baris data, bukan header.');
  var v = sh.getRange(r, 1, 1, SURVEY_HEADERS.length).getValues()[0];
  var o = {}; SURVEY_HEADERS.forEach(function (h, i) { o[h] = v[i]; });
  return o;
}

function auditSelected() {
  var s = selectedSurvey_();
  var ctx = readSnapshot_(s.config_version);
  if (!ctx) throw new Error('Snapshot ' + s.config_version + ' tidak ditemukan.');
  var r = PLTS.calculate(JSON.parse(s.input_json), ctx);
  var same = r.status === s.status && Math.abs((r.array ? r.array.kwp : 0) - (Number(s.kwp) || 0)) < 1e-6;
  SpreadsheetApp.getUi().alert('Audit ' + s.id + '\nConfig: ' + s.config_version + '\n\nTersimpan: ' + s.status + ', ' + s.kwp + ' kWp\nHitung ulang: ' +
    r.status + ', ' + (r.array ? r.array.kwp : '-') + ' kWp\n\n' + (same ? 'COCOK' : 'BERBEDA — periksa versi engine'));
}

function recalcSelected() {
  var s = selectedSurvey_();
  var out = saveSurvey_(JSON.parse(s.input_json), loadContext_(), s.id, s.surveyor);
  SpreadsheetApp.getUi().alert('Revisi baru: ' + out.id + '\nStatus: ' + out.result.status + '\nkWp: ' + (out.result.array ? out.result.array.kwp.toFixed(2) : '-'));
}

function checkContext() {
  var ctx = loadContext_();
  SpreadsheetApp.getUi().alert('Versi config: ' + ctx.configVersion + '\nKey config: ' + Object.keys(ctx.config).length +
    '\nPanel: ' + ctx.panels.length + '\nInverter: ' + ctx.inverters.length + '\nTarif: ' + ctx.tarif.length + '\nWilayah: ' + ctx.wilayah.length);
}

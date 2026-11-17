/* UI Kalkulator Survey PLTS. Rumus ada di engine.js (identik dengan Apps Script). */
(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  // ---------------------------------------------------------------- storage
  function load(k, d) { try { var v = localStorage.getItem('plts.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem('plts.' + k, JSON.stringify(v)); } catch (e) { /* abaikan */ } }

  var S = { url: load('url', ''), token: load('token', ''), surveyor: load('surveyor', ''), ctx: null, online: false,
    last: null, lastInput: null, lastId: null, editingId: null, list: [] };

  // ---------------------------------------------------------------- format
  var nf = function (d) { return new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  function f(n, d) { return n === null || n === undefined || !isFinite(n) ? '–' : nf(d === undefined ? 1 : d).format(n); }
  function rp(n) { return n === null || n === undefined || !isFinite(n) ? '–' : 'Rp' + nf(0).format(Math.round(n)); }
  function pct(n, d) { return n === null || n === undefined || !isFinite(n) ? '–' : f(n * 100, d === undefined ? 1 : d) + '%'; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, ms || 2800); }

  // ---------------------------------------------------------------- API
  var API = {
    get: function (action, params) {
      var q = new URLSearchParams(Object.assign({ action: action, token: S.token }, params || {}));
      return fetch(S.url + '?' + q.toString(), { redirect: 'follow' }).then(API.parse);
    },
    post: function (body) {
      body.token = S.token;
      return fetch(S.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(API.parse);
    },
    parse: function (r) {
      return r.text().then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error('Respons bukan JSON. Cek URL /exec dan akses "Anyone".'); }
        if (!j.ok) throw new Error(j.error || 'Galat server');
        return j.data;
      });
    }
  };

  function setConn(on, text) {
    S.online = on;
    var c = $('#conn'); c.classList.toggle('on', on); c.textContent = text || (on ? 'Sheet terhubung' : 'offline');
  }

  function initContext() {
    var cached = load('ctx', null);
    S.ctx = cached || {};
    if (!S.url) { setConn(false, 'offline · fixture'); showBanner(); return Promise.resolve(); }
    setConn(false, 'menghubungkan…');
    return API.get('context').then(function (ctx) {
      S.ctx = ctx; save('ctx', ctx); setConn(true, 'Sheet · ' + ctx.configVersion); showBanner();
    }).catch(function (e) {
      setConn(false, cached ? 'offline · cache' : 'gagal terhubung'); showBanner(e.message);
    });
  }
  function showBanner(err) {
    var b = $('#banner'), msg = '';
    if (!S.url) msg = 'Mode offline: konfigurasi default dan katalog <b>fixture fiktif</b> dari PRD. Hubungkan Google Sheet di ⚙ untuk katalog nyata dan penyimpanan.';
    else if (err) msg = 'Tidak bisa memuat konfigurasi dari Sheet (' + esc(err) + '). ' + (load('ctx', null) ? 'Memakai cache terakhir.' : 'Memakai default bawaan.');
    b.innerHTML = msg; b.classList.toggle('hidden', !msg);
  }
  function ctxNorm() { return PLTS.makeCtx(S.ctx); }

  // ---------------------------------------------------------------- form
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(label === undefined ? v : label) + '</option>'; }
  function field(name, label, type, o) {
    o = o || {};
    var cls = o.wide ? ' class="wide"' : '';
    var attrs = ' name="' + name + '"' + (o.step ? ' step="' + o.step + '"' : ' step="any"') + (o.min !== undefined ? ' min="' + o.min + '"' : '') +
      (o.max !== undefined ? ' max="' + o.max + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '');
    if (type === 'select') return '<label' + cls + '>' + label + '<select name="' + name + '">' + o.options.map(function (x) { return Array.isArray(x) ? opt(x[0], x[1]) : opt(x); }).join('') + '</select></label>';
    if (type === 'textarea') return '<label' + cls + '>' + label + '<textarea name="' + name + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '></textarea></label>';
    return '<label' + cls + '>' + label + '<input type="' + type + '"' + attrs + (type === 'number' ? ' inputmode="decimal"' : '') + '></label>';
  }

  function buildForm() {
    var X = ctxNorm();
    var wil = X.wilayah.map(function (w) { return [w.wilayah, w.wilayah + ' (PSH ' + w.psh + ')']; });
    var pan = X.panels.map(function (p) { return [p.id, p.id + ' · ' + (p.merek + ' ' + p.tipe).trim() + ' · ' + p.wp + ' Wp']; });
    var h = '';
    h += '<fieldset><legend>A. Pelanggan dan PLN</legend><div class="grid">' +
      field('nama_pelanggan', 'Nama pelanggan *', 'text') + field('alamat', 'Alamat *', 'text', { wide: true }) +
      field('lat', 'Lintang (°)', 'number', { min: -11, max: 6.5, ph: '-7' }) + field('lon', 'Bujur (°)', 'number', { min: 95, max: 141 }) +
      field('golongan_tarif', 'Golongan tarif *', 'select', { options: PLTS.GOLONGAN }) +
      field('daya_va', 'Daya tersambung (VA) *', 'number', { step: 1, min: 1 }) +
      field('jumlah_fasa', 'Jumlah fasa *', 'select', { options: [['1', '1 fasa'], ['3', '3 fasa']] }) +
      field('jenis_meter', 'Jenis meter *', 'select', { options: ['pascabayar', 'prabayar'] }) +
      field('kuota_up3', 'Kuota UP3 *', 'select', { options: [['belum_diketahui', 'belum diketahui'], ['tersedia', 'tersedia'], ['tidak_tersedia', 'tidak tersedia']] }) +
      field('tanggal_survey', 'Tanggal survey', 'date') + '</div></fieldset>';

    h += '<fieldset><legend>B. Beban listrik</legend><h3>kWh per bulan (min. 3 bulan)</h3><div class="grid months">' +
      BULAN.map(function (b, i) { return field('kwh_' + i, b, 'number', { min: 0 }); }).join('') + '</div>' +
      '<h3>Tagihan Rp per bulan (opsional, untuk cross-check)</h3><div class="grid months">' +
      BULAN.map(function (b, i) { return field('tag_' + i, b, 'number', { min: 0 }); }).join('') + '</div>' +
      '<h3>Profil &amp; target</h3><div class="grid">' +
      field('profil_siang', 'Profil siang *', 'select', { options: [['siang_dominan', 'siang dominan (0,60)'], ['campuran', 'campuran (0,45)'], ['malam_dominan', 'malam dominan (0,30)'], ['manual', 'f_day manual']] }) +
      field('f_day_manual', 'f_day manual (0,10–0,90)', 'number', { min: 0.1, max: 0.9, step: 0.01 }) +
      field('beban_tambahan_kwh_bulan', 'Beban tambahan rencana (kWh/bln)', 'number', { min: 0 }) +
      field('target_offset', 'Target offset (%)', 'number', { min: 10, max: 100, ph: '100' }) +
      field('mode_sizing', 'Mode sizing', 'select', { options: [['cap_siang', 'cap_siang (default)'], ['penuh', 'penuh']] }) +
      field('catatan_fday', 'Catatan pembenaran f_day', 'textarea', { wide: true, ph: 'Jam rumah ditempati, AC siang, pompa…' }) + '</div></fieldset>';

    h += '<fieldset><legend>C. Lokasi dan iklim</legend><div class="grid">' +
      field('wilayah_iklim', 'Wilayah iklim *', 'select', { options: wil }) +
      field('psh_override', 'PSH override (3,0–6,5)', 'number', { min: 3, max: 6.5 }) +
      field('t_min_site', 't_min site (°C)', 'number', { min: -5, max: 30 }) +
      field('t_cell_max', 't_cell max (°C)', 'number', { min: 50, max: 85, ph: '70' }) + '</div></fieldset>';

    h += '<fieldset><legend>D. Bidang atap (1–4)</legend><p class="hint">Panjang = sisi sepanjang bubungan; lebar = sisi miring sepanjang kemiringan. Azimut: 0 Utara, 90 Timur, 180 Selatan, 270 Barat.</p>' +
      '<div id="segs"></div><div class="actions"><button type="button" class="secondary small" id="btnAddSeg">+ Tambah bidang</button></div></fieldset>';

    h += '<fieldset><legend>E. Kelistrikan eksisting</legend><div class="grid">' +
      field('rating_mcb_utama', 'Rating MCB utama (A) *', 'number', { min: 1 }) +
      field('rating_busbar_mdp', 'Rating busbar MDP (A)', 'number', { min: 1 }) +
      field('jarak_dc', 'Jarak DC panel→inverter (m) *', 'number', { min: 1, max: 100 }) +
      field('jarak_ac', 'Jarak AC inverter→MDP (m) *', 'number', { min: 1, max: 100 }) +
      field('tahanan_grounding', 'Tahanan pembumian (Ω)', 'number', { min: 0.1, max: 100, ph: 'kosong = belum diukur' }) +
      field('lps_eksisting', 'Penangkal petir eksternal *', 'select', { options: ['tidak', 'ya'] }) +
      field('lokasi_inverter', 'Lokasi inverter *', 'select', { options: [['dalam_ruang', 'dalam ruang'], ['luar_teduh', 'luar teduh'], ['luar_terbuka', 'luar terbuka']] }) + '</div></fieldset>';

    h += '<fieldset><legend>F. Komponen dan ekonomi</legend><div class="grid">' +
      field('panel_id', 'Panel (katalog) *', 'select', { options: pan, wide: true }) +
      field('tarif_rp_kwh', 'Tarif Rp/kWh (override)', 'number', { min: 0, ph: 'default dari golongan' }) +
      field('ppj_persen', 'PPJ (%)', 'number', { min: 0, max: 15, ph: '0' }) +
      field('capex_mode', 'Satuan capex', 'select', { options: [['per_kwp', 'Rp/kWp'], ['total', 'Rp total']] }) +
      field('capex_nilai', 'Capex * (dari BoQ/penawaran)', 'number', { min: 0 }) + '</div></fieldset>';

    $('#form').innerHTML = h;
    $('#btnAddSeg').addEventListener('click', function () { addSeg(); });
  }

  function segHtml(i) {
    return '<div class="seg" data-i="' + i + '"><div class="seg-head"><span>Bidang ' + (i + 1) + '</span>' +
      '<button type="button" class="ghost small" data-del>Hapus</button></div><div class="grid">' +
      field('nama', 'Nama bidang *', 'text') +
      field('jenis_atap', 'Jenis atap *', 'select', { options: PLTS.JENIS_ATAP.map(function (j) { return [j, j.replace(/_/g, ' ')]; }) }) +
      field('azimut', 'Azimut (°) *', 'number', { min: 0, max: 360 }) +
      field('kemiringan', 'Kemiringan atap (°) *', 'number', { min: 0, max: 60 }) +
      field('panjang', 'Panjang (m) *', 'number', { min: 1, max: 30 }) +
      field('lebar', 'Lebar (m) *', 'number', { min: 1, max: 30 }) +
      field('luas_halangan', 'Luas halangan (m²)', 'number', { min: 0, ph: '0' }) +
      field('status_struktur', 'Status struktur *', 'select', { options: [['baik', 'baik'], ['perlu_perkuatan', 'perlu perkuatan'], ['tidak_layak', 'tidak layak']] }) +
      field('kelas_shading', 'Kelas shading *', 'select', { options: [['0', '0 tanpa'], ['1', '1 ringan (<1 jam)'], ['2', '2 sedang (1–2 jam)'], ['3', '3 berat (>2 jam / tengah)']] }) +
      field('tilt_pasang', 'Tilt pasang dak (5–20°)', 'number', { min: 5, max: 20, ph: '10' }) +
      field('orientasi_modul', 'Orientasi modul', 'select', { options: ['auto', 'portrait', 'landscape'] }) + '</div></div>';
  }
  function addSeg(data) {
    var box = $('#segs');
    if (box.children.length >= 4) { toast('Maksimal 4 bidang atap'); return; }
    box.insertAdjacentHTML('beforeend', segHtml(box.children.length));
    var el = box.lastElementChild;
    el.querySelector('[data-del]').addEventListener('click', function () {
      if (box.children.length <= 1) { toast('Minimal 1 bidang'); return; }
      el.remove(); renumber(); save('draft', readForm());
    });
    data = data || { nama: String.fromCharCode(65 + box.children.length - 1), jenis_atap: 'genteng_tanah_liat', status_struktur: 'baik', kelas_shading: 0, orientasi_modul: 'auto', luas_halangan: 0 };
    Object.keys(data).forEach(function (k) { var inp = el.querySelector('[name="' + k + '"]'); if (inp && data[k] !== null && data[k] !== undefined) inp.value = data[k]; });
    updateHints();
  }
  function renumber() { $$('#segs .seg').forEach(function (s, i) { s.dataset.i = i; s.querySelector('.seg-head span').textContent = 'Bidang ' + (i + 1); }); }

  function updateHints() {
    var form = $('#form');
    var p = form.elements.profil_siang; if (!p) return;
    form.elements.f_day_manual.closest('label').classList.toggle('hidden', p.value !== 'manual');
    $$('#segs .seg').forEach(function (s) {
      var dak = s.querySelector('[name=jenis_atap]').value === 'dak_beton';
      s.querySelector('[name=tilt_pasang]').closest('label').classList.toggle('hidden', !dak);
      if (dak) s.querySelector('[name=kemiringan]').value = 0;
    });
    // placeholder tarif default dari golongan
    var X = ctxNorm(), g = form.elements.golongan_tarif.value;
    var t = X.tarif.filter(function (r) { return r.golongan === g; }).sort(function (a, b) { return String(b.tanggal_berlaku).localeCompare(String(a.tanggal_berlaku)); })[0];
    form.elements.tarif_rp_kwh.placeholder = t ? 'default ' + f(Number(t.tarif), 2) : 'isi manual';
  }

  function val(el) { var v = el.value; return el.type === 'number' ? (v === '' ? null : Number(v)) : v; }
  function readForm() {
    var E = $('#form').elements, o = {};
    ['nama_pelanggan', 'alamat', 'lat', 'lon', 'golongan_tarif', 'daya_va', 'jenis_meter', 'kuota_up3', 'tanggal_survey', 'beban_tambahan_kwh_bulan',
      'target_offset', 'mode_sizing', 'catatan_fday', 'wilayah_iklim', 'psh_override', 't_min_site', 't_cell_max', 'rating_mcb_utama', 'rating_busbar_mdp',
      'jarak_dc', 'jarak_ac', 'tahanan_grounding', 'lps_eksisting', 'lokasi_inverter', 'panel_id', 'tarif_rp_kwh', 'ppj_persen', 'capex_mode', 'capex_nilai'
    ].forEach(function (k) { if (E[k]) o[k] = val(E[k]); });
    o.jumlah_fasa = Number(E.jumlah_fasa.value);
    o.kwh_bulanan = BULAN.map(function (_, i) { return val(E['kwh_' + i]); });
    o.tagihan_rp_bulanan = BULAN.map(function (_, i) { return val(E['tag_' + i]); });
    o.profil_siang = E.profil_siang.value === 'manual' ? val(E.f_day_manual) : E.profil_siang.value;
    o.bidang = $$('#segs .seg').map(function (s) {
      var b = {};
      $$('input,select', s).forEach(function (el) { b[el.name] = val(el); });
      b.kelas_shading = Number(b.kelas_shading);
      if (b.jenis_atap !== 'dak_beton') delete b.tilt_pasang;
      return b;
    });
    return o;
  }
  function fillForm(o) {
    buildForm();
    var E = $('#form').elements;
    Object.keys(o).forEach(function (k) {
      if (E[k] && !Array.isArray(o[k]) && typeof o[k] !== 'object') E[k].value = o[k] === null || o[k] === undefined ? '' : o[k];
    });
    (o.kwh_bulanan || []).forEach(function (v, i) { if (E['kwh_' + i]) E['kwh_' + i].value = v === null ? '' : v; });
    (o.tagihan_rp_bulanan || []).forEach(function (v, i) { if (E['tag_' + i]) E['tag_' + i].value = v === null ? '' : v; });
    if (typeof o.profil_siang === 'number') { E.profil_siang.value = 'manual'; E.f_day_manual.value = o.profil_siang; }
    else if (o.profil_siang) E.profil_siang.value = o.profil_siang;
    if (o.jumlah_fasa) E.jumlah_fasa.value = String(o.jumlah_fasa);
    (o.bidang && o.bidang.length ? o.bidang : [null]).forEach(function (b) { addSeg(b || undefined); });
    updateHints();
  }
  function blank() {
    return { golongan_tarif: 'R2-3500-5500', jenis_meter: 'pascabayar', kuota_up3: 'belum_diketahui', profil_siang: 'campuran', mode_sizing: 'cap_siang',
      wilayah_iklim: 'DEFAULT', lps_eksisting: 'tidak', lokasi_inverter: 'dalam_ruang', capex_mode: 'per_kwp', jumlah_fasa: 1,
      tanggal_survey: new Date().toISOString().slice(0, 10), bidang: [] };
  }
  function example() {
    var X = ctxNorm();
    return Object.assign(blank(), {
      nama_pelanggan: 'Contoh TC-02', alamat: 'Jl. Contoh No. 1', golongan_tarif: 'R3-6600+', daya_va: 7700, kuota_up3: 'tersedia',
      kwh_bulanan: Array(12).fill(1200), profil_siang: 'siang_dominan', target_offset: 100, panel_id: X.panels[0] ? X.panels[0].id : '',
      rating_mcb_utama: 35, jarak_dc: 20, jarak_ac: 15, tahanan_grounding: 3, capex_nilai: 13000000, tarif_rp_kwh: '',
      bidang: [
        { nama: 'A', jenis_atap: 'genteng_beton', azimut: 0, kemiringan: 20, panjang: 6, lebar: 4, luas_halangan: 0, status_struktur: 'baik', kelas_shading: 0, orientasi_modul: 'auto' },
        { nama: 'B', jenis_atap: 'metal_spandek', azimut: 90, kemiringan: 20, panjang: 8, lebar: 5, luas_halangan: 0, status_struktur: 'baik', kelas_shading: 1, orientasi_modul: 'auto' }]
    });
  }

  // ---------------------------------------------------------------- actions
  function calcLocal() {
    var inp = readForm();
    var r = PLTS.calculate(inp, ctxNorm());
    S.last = r; S.lastInput = inp;
    renderResult(r, null);
    switchTab('hasil');
  }
  function calcSave() {
    if (!S.url) { toast('Belum terhubung ke Sheet. Atur URL di ⚙'); return; }
    var inp = readForm(), btn = $('#btnSave');
    btn.disabled = true; btn.textContent = 'Menyimpan…';
    API.post({ action: 'save', input: inp, id: S.editingId, surveyor: S.surveyor }).then(function (d) {
      S.last = d.result; S.lastInput = inp; S.lastId = d.id; S.editingId = d.id;
      renderResult(d.result, d.id); switchTab('hasil'); toast('Tersimpan: ' + d.id);
    }).catch(function (e) { toast('Gagal simpan: ' + e.message, 5000); })
      .then(function () { btn.disabled = false; btn.textContent = 'Hitung & simpan'; });
  }

  // ---------------------------------------------------------------- render hasil
  function lvl(l) { return '<span class="lvl lvl-' + esc(l) + '">' + esc(l) + '</span>'; }
  function kv(rows) { return '<dl class="kv">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>'; }
  function table(head, rows, numCols) {
    numCols = numCols || [];
    return '<table><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function card(title, body) { return '<div class="card"><h2>' + title + '</h2>' + body + '</div>'; }
  function kpi(v, label) { return '<div class="kpi"><b>' + v + '</b><span>' + label + '</span></div>'; }

  function renderResult(r, id) {
    var h = '', st = r.blocked ? 'BLOCK' : r.status === 'LAYAK' ? 'LAYAK' : 'CATATAN';
    var inp = S.lastInput || {};
    h += '<div class="status st-' + st + '">' + esc(r.status) + '<small>' + esc(inp.nama_pelanggan || '') + (id ? ' · ' + esc(id) : ' · belum disimpan') +
      ' · config ' + esc(r.configVersion) + ' · engine ' + esc(r.engineVersion) + '</small></div>';

    if (!r.blocked && r.array) {
      h += '<div class="kpis">' + kpi(f(r.array.kwp, 2) + ' kWp', r.array.n_panel + ' panel · ' + esc(r.inverter.id)) +
        kpi(f(r.production.e_pv_day, 1) + ' kWh', 'produksi/hari') + kpi(pct(r.production.sc), 'self-consumption (SC)') +
        (r.economics ? kpi(rp(r.economics.savings_y1), 'hemat tahun 1') + kpi(f(r.economics.payback_simple, 1) + ' th', 'payback sederhana') +
          kpi(r.economics.irr === null ? '–' : pct(r.economics.irr), 'IRR') : kpi('–', 'ekonomi: capex kosong')) + '</div>';
    }

    // A. Status
    var order = { BLOCKER: 0, WARN: 1, INFO: 2 };
    var rules = r.rules.slice().sort(function (a, b) { return order[a.level] - order[b.level]; });
    h += card('A. Status dan aturan terpicu', rules.length ? table(['ID', 'Tingkat', 'Pesan', 'Nilai pemicu'],
      rules.map(function (q) { return [esc(q.id), lvl(q.level), esc(q.message), esc(q.value)]; })) : '<p>Tidak ada aturan terpicu.</p>');

    // B. Beban
    if (r.load) {
      var L = r.load;
      h += card('B. Beban', kv([
        ['E_bulan', f(L.e_month, 1) + ' kWh' + (L.beban_tambahan ? ' (termasuk rencana ' + f(L.beban_tambahan, 1) + ')' : '')],
        ['E_hari', f(L.e_day, 1) + ' kWh'], ['f_day', f(L.fday, 2)], ['E_siang', f(L.e_day_load, 1) + ' kWh'],
        ['E_target', f(L.e_target, 1) + ' kWh (' + esc(L.mode_sizing) + ', offset ' + pct(L.offset, 0) + ')'],
        ['PR sizing', f(L.pr_sizing, 3)], ['Tarif', 'Rp' + f(L.tarif, 2) + '/kWh'],
        ['PSH / t_min', r.climate ? f(r.climate.psh, 2) + ' kWh/m²/hari · ' + f(r.climate.t_min, 0) + ' °C (' + esc(r.climate.wilayah) + ')' : '–']
      ].concat(L.catatan_fday ? [['Catatan f_day', esc(L.catatan_fday)]] : [])));
    }

    if (r.blocked) {
      if (r.segments) h += card('Kapasitas bidang', table(['Bidang', 'Jenis', 'Kapasitas', 'Orientasi', 'Status'],
        r.segments.map(function (s) { return [esc(s.nama), esc(s.jenis_atap), s.cap, esc(s.ori || '–'), esc(s.status_struktur)]; }), [2]));
      h += '<p class="empty">Ada BLOCKER: tidak ada output rekomendasi. Perbaiki input lalu hitung ulang.</p>';
      $('#result').innerHTML = h; return;
    }

    // C. Array
    var A = r.array;
    h += card('C. Array dan layout', table(['Bidang', 'Kap.', 'Panel', 'Orientasi', 'kWp', 'F_orient', 'Shading', 'y_s', 'Luas array', 'Pemanfaatan', 'q struktur'],
      r.segmentsOut.map(function (s) {
        return [esc(s.nama) + '<br><small>' + esc(s.jenis_atap) + '</small>', s.cap, s.panel + (s.alloc !== s.panel ? ' <small>(alok. ' + s.alloc + ')</small>' : ''),
          esc(s.ori || '–') + (s.ncol ? '<br><small>' + s.ncol + ' kol × ' + s.nrow + ' brs</small>' : ''),
          f(s.kwp, 2), f(s.f_orient, 2), pct(s.rugi_shading), f(s.y, 3), f(s.luas_array, 1) + ' m²', pct(s.pemanfaatan), f(s.q_kgm2, 1) + ' kg/m²'];
      }), [1, 2, 4, 5, 6, 7, 8, 9, 10]) +
      '<h3>Total</h3>' + kv([['Panel', esc(A.panel_tipe) + ' × ' + A.n_panel], ['kWp final', f(A.kwp, 2) + ' kWp (target ' + f(r.kwp_target, 2) + ')'],
        ['Luas array', f(A.luas_array, 1) + ' m²'], ['Pemanfaatan atap', pct(A.pemanfaatan)]]) +
      '<p class="hint">q struktur hanya untuk review insinyur; tidak ada batas otomatis.</p>');

    // D. Inverter
    var I = r.inverter, lim = I.limits;
    h += card('D. Inverter dan string', kv([
      ['Model', esc(I.id) + ' ' + esc((I.merek + ' ' + I.tipe).trim()) + ' · ' + I.fasa + ' fasa'],
      ['Pac nominal', f(I.pac / 1000, 2) + ' kW (kapasitas regulasi)'], ['DC/AC', f(I.dcac, 2) + ' ' + lvl(I.kelas)],
      ['Batas string', 'Ns ' + lim.ns_min + '–' + lim.ns_max + ' (batas atas MPPT ' + lim.ns_mppt_max + ')'],
      ['Voc dingin / Vmp panas modul', f(lim.voc_cold, 2) + ' V / ' + f(lim.vmp_hot, 2) + ' V']
    ]) + '<h3>Per MPPT</h3>' + table(['Bidang', 'MPPT', 'Ns', 'Npar', 'Panel', 'Voc dingin string', 'Vmp panas string', 'Isc total', 'Imp total'],
      r.mppt.map(function (m) { return [esc(m.bidang), m.k, m.ns, m.npar, m.panel, f(m.voc_cold_string, 1) + ' V', f(m.vmp_hot_string, 1) + ' V', f(m.isc_total, 2) + ' A', f(m.imp_total, 2) + ' A']; }),
      [1, 2, 3, 4, 5, 6, 7, 8]) +
      '<details><summary>Kandidat inverter</summary>' + table(['ID', 'DC/AC', 'Kelas', 'Panel', 'Harga'],
        r.inverterCandidates.map(function (c) { return [esc(c.id) + (c.id === I.id ? ' ✔' : ''), f(c.dcac, 2), lvl(c.kelas), c.panel, rp(c.harga)]; }), [1, 3, 4]) +
      (r.inverterRejected.length ? '<h3>Ditolak</h3>' + table(['ID', 'Alasan'], r.inverterRejected.map(function (x) { return [esc(x.id), esc(x.alasan)]; })) : '') + '</details>');

    // E. Kabel
    var C = r.cable;
    h += card('E. Kabel dan proteksi', kv([
      ['Kabel DC', f(C.dc_mm2, 0) + ' mm² · KHA×derating ' + f(C.dc_kha_derated, 1) + ' A ≥ ' + f(C.i_dc_string, 2) + ' A · dv ' + f(C.dv_dc, 2) + '%'],
      ['Arus DC utama', f(C.i_dc_main, 2) + ' A (setelah titik paralel)'],
      ['Kabel AC', f(C.ac_mm2, 1) + ' mm² ' + C.ac_inti + ' inti · dv ' + f(C.dv_ac, 2) + '%'],
      ['dv total', f(C.dv_total, 2) + '%'], ['MCB AC PLTS', 'In ' + C.mcb + ' A (Iac ' + f(C.i_ac, 1) + ' A)'],
      ['Saklar DC', '≥ ' + f(C.dc_switch.v_min, 1) + ' V DC, ≥ ' + f(C.dc_switch.i_min, 2) + ' A' + (C.dc_switch.terintegrasi === true ? ' (terintegrasi)' : '')],
      ['Sekring string', C.fuse.wajib ? 'WAJIB · ' + f(C.fuse.i_min, 1) + '–' + f(C.fuse.i_max, 0) + ' A, ≥ ' + f(C.fuse.v_min, 1) + ' V' : 'tidak wajib'],
      ['SPD DC Tipe 2', 'Ucpv ≥ ' + f(C.spd_dc.uc_min, 1) + ' V · kelas ' + (C.spd_dc.kelas ? C.spd_dc.kelas + ' V' : 'di luar deret')],
      ['SPD AC Tipe 2', esc(C.spd_ac.tegangan)],
      ['Pembumian', (C.grounding.ohm === null ? 'belum diukur' : f(C.grounding.ohm, 1) + ' Ω') + ' ' + lvl(C.grounding.status === 'PASS' ? 'PASS' : 'WARN') + ' · bonding rangka ≥ ' + C.grounding.bonding_mm2 + ' mm² Cu'],
      ['RCD', C.rcd ? 'Pasang (RCD-001)' : 'sesuai manual inverter'],
      ['Busbar 120%', C.mdp_ok === null ? 'cek nonaktif' : C.mdp_ok ? 'OK' : 'GAGAL']
    ]));

    // F. Produksi
    var P = r.production, mx = Math.max.apply(null, P.monthly);
    h += card('F. Produksi', kv([['PR final', f(P.pr_final, 3)], ['E_pv_hari', f(P.e_pv_day, 1) + ' kWh'], ['E_pv_tahun0', f(P.e_pv_year0, 1) + ' kWh'],
      ['E_self_hari', f(P.e_self_day, 1) + ' kWh'], ['SC / SF', pct(P.sc) + ' / ' + pct(P.sf)]]) +
      '<h3>Produksi bulanan (kWh)</h3><div class="bars">' + P.monthly.map(function (m, i) {
        return '<div style="height:' + (m / mx * 100).toFixed(1) + '%" title="' + BULAN[i] + ': ' + f(m, 1) + ' kWh"></div>';
      }).join('') + '</div><div class="bars-x">' + BULAN.map(function (b) { return '<span>' + b + '</span>'; }).join('') + '</div>');

    // G. Ekonomi
    if (r.economics) {
      var G = r.economics;
      h += card('G. Ekonomi', kv([
        ['Capex', rp(G.capex)], ['Rekening minimum', G.rm ? rp(G.rm) + '/bulan' : 'tidak berlaku (prabayar)'],
        ['Tagihan sebelum → sesudah', rp(G.bill_before) + ' → ' + rp(G.bill_after) + ' /bulan'],
        ['Hemat bulanan / tahun 1', rp(G.savings_month_y1) + ' / ' + rp(G.savings_y1)],
        ['Payback sederhana', f(G.payback_simple, 1) + ' tahun'],
        ['Payback terdiskonto', G.disc_payback_year === null ? 'tidak tercapai' : 'tahun ke-' + G.disc_payback_year],
        ['NPV', rp(G.npv)], ['IRR', G.irr === null ? '–' : pct(G.irr)], ['LCOE', rp(G.lcoe) + '/kWh'],
        ['Degradasi', pct(G.deg1) + ' tahun 1, ' + pct(G.deg, 2) + '/tahun']
      ]) + '<h3>Sensitivitas (E-13)</h3>' + table(['Skenario', 'Status', 'kWp', 'Inverter', 'Payback', 'NPV'],
        (r.sensitivity || []).map(function (s) { return [esc(s.skenario), esc(s.status), f(s.kwp, 2), esc(s.inverter || '–'), s.payback === null ? '–' : f(s.payback, 1) + ' th', rp(s.npv)]; }), [2, 4, 5]) +
        '<details><summary>Arus kas ' + G.cashflow.length + ' tahun</summary>' + table(['Tahun', 'Produksi kWh', 'Hemat', 'O&amp;M', 'Ganti inverter', 'CF', 'Kumulatif terdiskonto'],
          G.cashflow.map(function (c) { return [c.tahun, f(c.produksi, 0), rp(c.hemat), rp(c.opex), c.ganti ? rp(c.ganti) : '–', rp(c.cf), rp(c.kum_diskonto)]; }), [0, 1, 2, 3, 4, 5, 6]) + '</details>');
    } else if (r.sensitivity) {
      h += card('Sensitivitas kWp (E-13)', table(['Skenario', 'kWp', 'Inverter'], r.sensitivity.map(function (s) { return [esc(s.skenario), f(s.kwp, 2), esc(s.inverter || '–')]; }), [1]));
    }

    // BoQ
    var B = r.boq;
    h += card('BoQ indikatif', table(['Item', 'Qty', 'Satuan', 'Harga satuan', 'Total', 'Keterangan'],
      B.rows.map(function (x) {
        return [esc(x.item.replace(/_/g, ' ')), f(x.qty, x.qty % 1 ? 1 : 0), esc(x.satuan), x.perlu_harga ? '<span class="lvl lvl-WARN">perlu harga</span>' : rp(x.harga_satuan),
          x.total === null ? '–' : rp(x.total), esc(x.ket)];
      }), [1, 3, 4]) + '<p><b>Total terharga: ' + rp(B.total_terharga) + '</b>' + (B.ada_tanpa_harga ? ' · baris "perlu harga" tidak masuk total' : '') + '</p>' +
      '<p class="hint">' + B.n_string + ' string · ' + B.n_mppt + ' MPPT aktif. Kuantitas indikatif; denah detail tetap dicek manual.</p>');

    // H. Checklist
    h += card('H. Daftar periksa', '<ul class="check">' + r.checklist.map(function (c, i) {
      return '<li><label style="flex-direction:row;align-items:center;color:inherit"><input type="checkbox" id="ck' + i + '">' + esc(c) + '</label></li>';
    }).join('') + '</ul>');

    $('#result').innerHTML = h;
  }

  // ---------------------------------------------------------------- daftar
  function loadList() {
    if (!S.url) return;
    $('#list').innerHTML = '<p class="empty">Memuat…</p>';
    API.get('list').then(function (rows) { S.list = rows; renderList(); })
      .catch(function (e) { $('#list').innerHTML = '<p class="empty">Gagal memuat: ' + esc(e.message) + '</p>'; });
  }
  function renderList() {
    var q = $('#q').value.toLowerCase();
    var rows = S.list.filter(function (r) { return !q || [r.id, r.nama_pelanggan, r.alamat, r.status].join(' ').toLowerCase().indexOf(q) >= 0; });
    if (!rows.length) { $('#list').innerHTML = '<p class="empty">Belum ada survey.</p>'; return; }
    $('#list').innerHTML = '<div class="card">' + table(['ID', 'Tanggal', 'Pelanggan', 'Status', 'kWp', 'Inverter', 'Payback'],
      rows.map(function (r) {
        return ['<span data-id="' + esc(r.id) + '">' + esc(r.id) + '</span>' + (r.revisi_dari ? '<br><small>rev. dari ' + esc(r.revisi_dari) + '</small>' : ''),
          esc(String(r.tanggal_simpan).slice(0, 10)), esc(r.nama_pelanggan) + '<br><small>' + esc(r.alamat) + '</small>', esc(r.status),
          r.kwp === '' ? '–' : f(Number(r.kwp), 2), esc(r.inverter), r.payback_th === '' ? '–' : f(Number(r.payback_th), 1)];
      }), [4, 6]) + '</div>';
    $$('#list tbody tr').forEach(function (tr) {
      tr.classList.add('click');
      tr.addEventListener('click', function () { openSurvey(tr.querySelector('[data-id]').dataset.id); });
    });
  }
  function openSurvey(id) {
    toast('Membuka ' + id + '…');
    API.get('get', { id: id }).then(function (d) {
      fillForm(d.input); S.lastInput = d.input; S.last = d.result; S.lastId = d.id; S.editingId = d.id;
      renderResult(d.result, d.id); switchTab('hasil');
      toast('Dibuka. "Hitung & simpan" membuat revisi baru.');
    }).catch(function (e) { toast('Gagal: ' + e.message, 5000); });
  }

  // ---------------------------------------------------------------- misc
  function switchTab(t) {
    $$('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t); });
    $$('.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + t); });
    if (t === 'daftar' && S.url && !S.list.length) loadList();
    window.scrollTo(0, 0);
  }
  function debounce(fn, ms) { var h; return function () { clearTimeout(h); var a = arguments; h = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  function bind() {
    $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { switchTab(b.dataset.tab); }); });
    $('#form').addEventListener('input', debounce(function () { save('draft', readForm()); updateHints(); }, 400));
    $('#form').addEventListener('change', updateHints);
    $('#btnCalc').addEventListener('click', calcLocal);
    $('#btnSave').addEventListener('click', calcSave);
    $('#btnNew').addEventListener('click', function () { if (confirm('Kosongkan form?')) { S.editingId = null; fillForm(blank()); save('draft', null); } });
    $('#btnExample').addEventListener('click', function () { S.editingId = null; fillForm(example()); toast('Contoh TC-02 dimuat'); });
    $('#btnPrint').addEventListener('click', function () { window.print(); });
    $('#btnJson').addEventListener('click', function () {
      if (!S.last) { toast('Belum ada hasil'); return; }
      var blob = new Blob([JSON.stringify({ id: S.lastId, input: S.lastInput, result: S.last }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (S.lastId || 'survey-plts') + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $('#btnReload').addEventListener('click', loadList);
    $('#q').addEventListener('input', renderList);
    var dlg = $('#dlgSettings');
    $('#btnSettings').addEventListener('click', function () {
      $('#setUrl').value = S.url; $('#setToken').value = S.token; $('#setSurveyor').value = S.surveyor; $('#testOut').textContent = '';
      dlg.showModal();
    });
    $('#btnTest').addEventListener('click', function () {
      var old = { url: S.url, token: S.token };
      S.url = $('#setUrl').value.trim(); S.token = $('#setToken').value;
      $('#testOut').textContent = 'Mengetes…';
      API.get('ping').then(function (d) { $('#testOut').textContent = 'OK · server ' + d.time; })
        .catch(function (e) { $('#testOut').textContent = 'Gagal: ' + e.message; })
        .then(function () { S.url = old.url; S.token = old.token; });
    });
    dlg.addEventListener('close', function () {
      if (dlg.returnValue !== 'ok') return;
      S.url = $('#setUrl').value.trim(); S.token = $('#setToken').value; S.surveyor = $('#setSurveyor').value.trim();
      save('url', S.url); save('token', S.token); save('surveyor', S.surveyor);
      S.list = [];
      var draft = readForm();
      initContext().then(function () { fillForm(draft); });
    });
  }

  bind();
  initContext().then(function () { fillForm(load('draft', null) || blank()); });
})();

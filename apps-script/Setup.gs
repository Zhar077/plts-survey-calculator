/**
 * Menyiapkan struktur Google Sheet. Aman dijalankan berulang:
 * sheet yang sudah ada dan berisi data TIDAK ditimpa.
 * Jalankan dari menu PLTS > Siapkan sheet, atau dari editor (fungsi setupSheets).
 */

// [key, satuan, catatan] — nilai default diambil dari PLTS.DEFAULT_CONFIG (Engine.gs)
var CONFIG_META = [
  ['psh_default', 'kWh/m²/hari', 'Fallback konservatif (asumsi). Tabel Wilayah menimpa nilai ini'],
  ['t_min_site', '°C', 'Dataran rendah/sedang. Dataran tinggi (>1000 m) isi 0 s/d 5'],
  ['t_cell_max', '°C', 'Untuk Vmp panas dan Voc panas'],
  ['t_cell_avg', '°C', 'Untuk rugi suhu rata-rata (asumsi)'],
  ['lat_default', 'derajat', 'Dipakai jika lat kosong. lat > 0: kolom Utara/Selatan ditukar'],
  ['f_day_siang_dominan', 'fraksi', 'Porsi konsumsi di jam matahari (asumsi)'],
  ['f_day_campuran', 'fraksi', '(asumsi)'],
  ['f_day_malam_dominan', 'fraksi', '(asumsi)'],
  ['k_sc', '-', 'Pengali batas konsumsi siang'],
  ['days_per_month', 'hari', '365/12'],
  ['mode_sizing', 'enum', 'cap_siang atau penuh'],
  ['setback_tepi', 'm', 'Jarak bebas dari tepi bidang'],
  ['celah_antar_panel', 'm', ''],
  ['alpha_min', '°', 'Elevasi matahari minimum untuk jarak baris di dak (asumsi)'],
  ['berat_rangka', 'kg/m²', 'Rel dan klem (asumsi)'],
  ['shade_loss_0', 'fraksi', 'Shading kelas 0'],
  ['shade_loss_1', 'fraksi', 'Kelas 1: ringan di tepi, < 1 jam/hari (asumsi)'],
  ['shade_loss_2', 'fraksi', 'Kelas 2: sebagian 1–2 jam/hari (asumsi)'],
  ['shade_loss_3', 'fraksi', 'Kelas 3: > 2 jam/hari atau di tengah bidang (asumsi)'],
  ['pr_mode', 'enum', 'detail atau cepat'],
  ['pr_quick', 'fraksi', 'PR tetap mode cepat'],
  ['soiling', 'fraksi', '(asumsi)'],
  ['mismatch', 'fraksi', '(asumsi)'],
  ['rugi_kabel_dc_default', 'fraksi', 'Saat sizing; diganti hasil hitung aktual'],
  ['eff_inverter_default', 'fraksi', 'Saat sizing; diganti nilai katalog'],
  ['rugi_kabel_ac_default', 'fraksi', 'Saat sizing; diganti hasil hitung aktual'],
  ['availability', 'fraksi', 'Ketersediaan sistem (asumsi)'],
  ['rugi_lain', 'fraksi', 'Low light, IAM, toleransi (asumsi)'],
  ['dcac_pass_min', '-', ''], ['dcac_pass_max', '-', ''], ['dcac_warn_min', '-', ''], ['dcac_warn_max', '-', ''],
  ['dcac_pref', '-', 'Tie-breaker'],
  ['voc_margin', 'fraksi', 'Margin tambahan terhadap Vdc maks'],
  ['k_isc_kabel', '-', 'Verifikasi IEC 62548-1'],
  ['rho_cu_20', 'Ω·mm²/m', ''], ['alpha_cu', '/°C', ''], ['t_konduktor', '°C', ''],
  ['dv_dc_pass', '%', ''], ['dv_dc_fail', '%', ''], ['dv_ac_pass', '%', ''], ['dv_ac_fail', '%', ''], ['dv_total_pass', '%', ''],
  ['derating_dc', '-', 'Atap panas & berkelompok (asumsi)'],
  ['derating_ac', '-', 'Suhu sekitar 40°C (asumsi)'],
  ['seri_mcb', 'A', 'Dipisah koma'],
  ['k_mcb', '-', 'MCB ≥ k × Iac maks'],
  ['pf', '-', 'Dipakai bila Iac katalog kosong'],
  ['batas_inv_1fasa_pada_3fasa_w', 'W', 'Konfirmasi ke PLN setempat'],
  ['k_fuse_min', '-', 'Verifikasi IEC 62548-1'],
  ['k_spd', '-', 'Ucpv ≥ k × Ns × Voc dingin'],
  ['kelas_spd_dc', 'V', 'Dipisah koma'],
  ['batas_grounding_ohm', 'Ω', 'Belum dicek ke PUIL 2020'],
  ['bonding_mm2', 'mm²', ''],
  ['busbar_120', 'ya/tidak', 'Aktifkan cek MDP-001 (praktik NEC 705.12)'],
  ['k_busbar', '-', ''],
  ['degradasi_tahun1', 'fraksi', 'Ditimpa datasheet panel bila diisi'],
  ['degradasi_tahunan', 'fraksi', 'Ditimpa datasheet panel bila diisi'],
  ['om_persen_capex', 'fraksi/tahun', '(asumsi)'],
  ['tahun_ganti_inverter', 'tahun', '(asumsi)'],
  ['biaya_ganti_inverter', 'fraksi harga inverter', 'Konservatif'],
  ['diskonto', 'fraksi', ''], ['horizon', 'tahun', ''], ['kenaikan_tarif', 'fraksi/tahun', ''],
  ['ppj_default', 'fraksi', 'Isi dari lembar tagihan jika ingin akurat'],
  ['rm_jam', 'jam', 'Rekening minimum pascabayar. Sumber PLN 2020, verifikasi'],
  ['jarak_penyangga', 'm', 'BoQ (asumsi)'], ['cadangan_kabel', 'fraksi', 'BoQ'], ['lebih_rel', 'm', 'BoQ'], ['bonding_ekstra_m', 'm', 'BoQ'],
  ['load_min_ratio', 'fraksi', 'LOAD-001'], ['spike_ratio', '×', 'INP-004'], ['tagihan_tol', 'fraksi', 'INP-005'],
  ['size_warn_ratio', 'fraksi', 'SIZE-001'], ['sc_warn', 'fraksi', 'REG-004'], ['payback_warn', 'tahun', 'ECO-001'],
  ['slo_info_w', 'W', 'REG-005'], ['sens_fday', 'fraksi', 'E-13'], ['sens_tarif', 'fraksi', 'E-13'], ['sens_capex', 'fraksi', 'E-13']
];

var PANEL_COLS = ['id', 'merek', 'tipe', 'wp', 'voc', 'vmp', 'isc', 'imp', 'b_voc', 'g_pmax', 'panjang_mm', 'lebar_mm', 'tebal_mm',
  'berat_kg', 'max_fuse', 'deg1', 'deg', 'vsys_max', 'harga', 'aktif'];
var INV_COLS = ['id', 'merek', 'tipe', 'fasa', 'pac', 'vdc_max', 'vmppt_min', 'vmppt_max', 'vstart', 'n_mppt', 'string_per_mppt',
  'impp_max', 'isc_max', 'iac_max', 'eff', 'transformerless', 'rcmu', 'dc_switch', 'sertifikasi', 'harga', 'aktif'];
var HARGA_ITEMS = [
  ['rel_per_m', 'm'], ['hook_genteng', 'unit'], ['klem_lfeet_spandek', 'unit'], ['kaki_rangka_dak', 'unit'], ['penyangga_lainnya', 'unit'],
  ['klem_ujung', 'unit'], ['klem_tengah', 'unit'], ['konektor_mc4_pasang', 'pasang'], ['saklar_dc', 'unit'], ['mcb_ac', 'unit'],
  ['spd_dc', 'set'], ['spd_ac', 'set'], ['sekring_string', 'unit'], ['rcd', 'unit'], ['elektroda_pembumian', 'unit'],
  ['kabel_bonding_6mm2', 'm'], ['boks_aksesori', 'lot']
];

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var C = PLTS.DEFAULT_CONFIG;

  makeSheet_(ss, SHEETS.config, ['key', 'nilai', 'satuan', 'tanggal_berlaku', 'catatan', 'versi'],
    CONFIG_META.map(function (m) {
      var v = C[m[0]];
      if (Array.isArray(v)) v = v.join(',');
      if (typeof v === 'boolean') v = v ? 'ya' : 'tidak';
      return [m[0], String(v), m[1], today, m[2], 1];
    }), { textCols: [2] });

  makeSheet_(ss, SHEETS.orient, ['maks', 'U', 'T', 'S', 'B', 'catatan'],
    PLTS.DEFAULT_ORIENT.map(function (r) { return [r.maks, r.U, r.T, r.S, r.B, 'Kemiringan ≤ ' + r.maks + '° (asumsi, lat ≈ -7°)']; }));

  makeSheet_(ss, SHEETS.tarif, ['golongan', 'tarif', 'tanggal_berlaku', 'sumber'],
    PLTS.DEFAULT_TARIF.map(function (r) { return [r.golongan, r.tarif, r.tanggal_berlaku, 'Triwulan IV 2026 (Fortune IDN, Kompas)']; }));

  var wHead = ['wilayah', 'psh', 't_min'];
  for (var i = 1; i <= 12; i++) wHead.push('f' + i);
  wHead.push('catatan');
  makeSheet_(ss, SHEETS.wilayah, wHead, PLTS.DEFAULT_WILAYAH.map(function (w) {
    var r = [w.wilayah, w.psh, w.t_min]; for (var j = 0; j < 12; j++) r.push(''); r.push(w.catatan); return r;
  }));

  makeSheet_(ss, SHEETS.panel, PANEL_COLS, PLTS.FIXTURE_PANELS.map(function (p) {
    return PANEL_COLS.map(function (k) { return k === 'aktif' ? 'ya' : (p[k] === undefined ? '' : p[k]); });
  }));
  makeSheet_(ss, SHEETS.inverter, INV_COLS, PLTS.FIXTURE_INVERTERS.map(function (p) {
    return INV_COLS.map(function (k) { return k === 'aktif' ? 'ya' : (p[k] === undefined ? '' : p[k]); });
  }));

  var kab = [];
  PLTS.DEFAULT_CABLES.dc.forEach(function (c) { kab.push(['DC', c.mm2, c.kha, '', 'Kabel PV. Ambil KHA dari datasheet']); });
  PLTS.DEFAULT_CABLES.ac.forEach(function (c) { kab.push(['AC', c.mm2, c.kha, '', 'Cek PUIL 2020 & jenis kabel']); });
  makeSheet_(ss, SHEETS.kabel, ['jenis', 'mm2', 'kha', 'harga_m', 'catatan'], kab);

  makeSheet_(ss, SHEETS.harga, ['item', 'satuan', 'harga', 'catatan'],
    HARGA_ITEMS.map(function (h) { return [h[0], h[1], '', 'Kosong = perlu harga (tidak masuk total)']; }));

  makeSheet_(ss, SHEETS.survey, SURVEY_HEADERS, []);
  makeSheet_(ss, SHEETS.rules, ['survey_id', 'rule_id', 'level', 'message', 'value'], []);
  makeSheet_(ss, SHEETS.snap, ['version', 'created', 'json'], []);

  var sv = ss.getSheetByName(SHEETS.survey);
  sv.getRange('S:T').setWrap(false);
  sv.setColumnWidth(19, 120); sv.setColumnWidth(20, 120);
  var dflt = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (dflt && dflt.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(dflt);
  SpreadsheetApp.getActive().toast('Sheet siap. Catatan: katalog berisi fixture FIKTIF dari PRD — ganti dengan produk nyata.', 'PLTS', 8);
}

function makeSheet_(ss, name, headers, rows, opt) {
  opt = opt || {};
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() > 1) return sh; // sudah ada data: jangan ditimpa
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eef7');
  sh.setFrozenRows(1);
  (opt.textCols || []).forEach(function (c) { sh.getRange(1, c, Math.max(rows.length + 200, 200), 1).setNumberFormat('@'); });
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.autoResizeColumns(1, Math.min(headers.length, 8));
  return sh;
}

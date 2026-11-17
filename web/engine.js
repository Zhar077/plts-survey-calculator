/**
 * PLTS Residensial — engine kalkulasi (PRD Aturan Teknis v1).
 *
 * Satu file ini dipakai di tiga tempat, tanpa diubah:
 *   - browser (web/index.html)            -> global `PLTS`
 *   - Google Apps Script (apps-script/Engine.gs, salinan identik) -> global `PLTS`
 *   - Node (tests/run-tests.js)           -> module.exports
 *
 * Prinsip: semua asumsi dari ctx.config; pembulatan hanya di UI; setiap
 * hasil aturan membawa ID, tingkat, pesan, dan nilai pemicu.
 */
var PLTS = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Default konfigurasi (bagian 3). Sheet "Config" menimpa nilai ini.
  // ---------------------------------------------------------------------------
  var DEFAULT_CONFIG = {
    // Iklim
    psh_default: 4.2, t_min_site: 10, t_cell_max: 70, t_cell_avg: 50, lat_default: -7,
    // Beban & sizing
    f_day_siang_dominan: 0.60, f_day_campuran: 0.45, f_day_malam_dominan: 0.30,
    k_sc: 1.0, days_per_month: 365 / 12, mode_sizing: 'cap_siang',
    // Layout
    setback_tepi: 0.30, celah_antar_panel: 0.02, alpha_min: 25, berat_rangka: 3,
    // Shading (rugi energi)
    shade_loss_0: 0, shade_loss_1: 0.03, shade_loss_2: 0.08, shade_loss_3: 0.15,
    // Rantai rugi PR
    pr_mode: 'detail', pr_quick: 0.78,
    soiling: 0.03, mismatch: 0.02, rugi_kabel_dc_default: 0.015, eff_inverter_default: 0.975,
    rugi_kabel_ac_default: 0.005, availability: 0.01, rugi_lain: 0.02,
    // Inverter, string, kabel
    dcac_pass_min: 1.00, dcac_pass_max: 1.35, dcac_warn_min: 0.80, dcac_warn_max: 1.50, dcac_pref: 1.20,
    voc_margin: 0, k_isc_kabel: 1.25, rho_cu_20: 0.0175, alpha_cu: 0.00393, t_konduktor: 70,
    dv_dc_pass: 1.5, dv_dc_fail: 3.0, dv_ac_pass: 2.0, dv_ac_fail: 3.0, dv_total_pass: 3.0,
    derating_dc: 0.80, derating_ac: 0.87,
    seri_mcb: [6, 10, 16, 20, 25, 32, 40, 50, 63], k_mcb: 1.25, pf: 1.0,
    batas_inv_1fasa_pada_3fasa_w: 5000,
    k_fuse_min: 1.4, k_spd: 1.2, kelas_spd_dc: [600, 800, 1000, 1200, 1500],
    batas_grounding_ohm: 5, bonding_mm2: 6,
    busbar_120: false, k_busbar: 1.2,
    // Ekonomi
    degradasi_tahun1: 0.01, degradasi_tahunan: 0.004, om_persen_capex: 0.01,
    tahun_ganti_inverter: 12, biaya_ganti_inverter: 1.0, diskonto: 0.08, horizon: 25,
    kenaikan_tarif: 0, ppj_default: 0, rm_jam: 40,
    // BoQ
    jarak_penyangga: 1.2, cadangan_kabel: 0.10, lebih_rel: 0.10, bonding_ekstra_m: 5,
    // Ambang aturan
    load_min_ratio: 0.60, spike_ratio: 3, tagihan_tol: 0.15, size_warn_ratio: 0.80,
    sc_warn: 0.80, payback_warn: 10, slo_info_w: 10000,
    sens_fday: 0.10, sens_tarif: 0.10, sens_capex: 0.10
  };

  // Faktor orientasi (bagian 3), lintang sekitar -7.
  var DEFAULT_ORIENT = [
    { maks: 10, U: 1.00, T: 0.98, S: 0.98, B: 0.98 },
    { maks: 20, U: 1.00, T: 0.96, S: 0.95, B: 0.96 },
    { maks: 30, U: 0.99, T: 0.93, S: 0.89, B: 0.93 },
    { maks: 45, U: 0.96, T: 0.88, S: 0.80, B: 0.88 },
    { maks: 60, U: 0.90, T: 0.80, S: 0.68, B: 0.80 }
  ];

  var DEFAULT_CABLES = {
    dc: [{ mm2: 4, kha: 55 }, { mm2: 6, kha: 70 }, { mm2: 10, kha: 98 }],
    ac: [{ mm2: 2.5, kha: 21 }, { mm2: 4, kha: 28 }, { mm2: 6, kha: 36 }, { mm2: 10, kha: 50 }, { mm2: 16, kha: 68 }, { mm2: 25, kha: 89 }]
  };

  var DEFAULT_TARIF = [
    { golongan: 'R1-900RTM', tarif: 1352, tanggal_berlaku: '2026-10-01' },
    { golongan: 'R1-1300', tarif: 1444.70, tanggal_berlaku: '2026-10-01' },
    { golongan: 'R1-2200', tarif: 1444.70, tanggal_berlaku: '2026-10-01' },
    { golongan: 'R2-3500-5500', tarif: 1699.53, tanggal_berlaku: '2026-10-01' },
    { golongan: 'R3-6600+', tarif: 1699.53, tanggal_berlaku: '2026-10-01' }
  ];

  var DEFAULT_WILAYAH = [
    { wilayah: 'DEFAULT', psh: 4.2, t_min: 10, catatan: 'Fallback konservatif (asumsi). Ganti dengan data Global Solar Atlas / PVGIS.' }
  ];

  // Fixture uji (fiktif, bagian 11) — bukan produk nyata.
  var FIXTURE_PANELS = [
    { id: 'FX575', merek: 'Fixture', tipe: 'Uji 575 Wp (fiktif)', wp: 575, voc: 52.0, vmp: 43.5, isc: 13.9, imp: 13.22,
      b_voc: -0.25, g_pmax: -0.30, panjang_mm: 2278, lebar_mm: 1134, tebal_mm: 35, berat_kg: 28, max_fuse: 25,
      deg1: '', deg: '', vsys_max: '', harga: '' }
  ];
  var FIXTURE_INVERTERS = [
    ['I1K5', 1, 1500, 500, 60, 450, 80, 1, 1, 16, 20, 6.8, 96.5, 5.0e6],
    ['I2K', 1, 2000, 500, 60, 450, 80, 1, 2, 16, 20, 9.1, 97.0, 6.0e6],
    ['I3K', 1, 3000, 550, 70, 500, 80, 2, 1, 16, 20, 13.6, 97.5, 7.5e6],
    ['I4K', 1, 4000, 600, 80, 550, 90, 2, 1, 16, 20, 18.2, 97.5, 9.0e6],
    ['I5K', 1, 5000, 600, 80, 550, 90, 2, 1, 16, 20, 22.7, 97.6, 10.5e6],
    ['I6K', 1, 6000, 600, 80, 550, 90, 2, 2, 16, 20, 27.3, 97.7, 12.0e6],
    ['I5K3P', 3, 5000, 1000, 160, 850, 180, 2, 1, 16, 20, 7.6, 97.8, 17e6],
    ['I6K3P', 3, 6000, 1000, 160, 850, 180, 2, 1, 16, 20, 9.1, 97.9, 19e6],
    ['I10K3P', 3, 10000, 1000, 160, 850, 180, 2, 2, 16, 20, 15.2, 98.0, 25e6]
  ].map(function (r) {
    return { id: r[0], merek: 'Fixture', tipe: r[0] + ' (fiktif)', fasa: r[1], pac: r[2], vdc_max: r[3], vmppt_min: r[4],
      vmppt_max: r[5], vstart: r[6], n_mppt: r[7], string_per_mppt: r[8], impp_max: r[9], isc_max: r[10], iac_max: r[11],
      eff: r[12], transformerless: '', rcmu: '', dc_switch: '', sertifikasi: '', harga: r[13] };
  });

  var GOLONGAN = ['R1-900RTM', 'R1-1300', 'R1-2200', 'R2-3500-5500', 'R3-6600+'];
  var JENIS_ATAP = ['genteng_tanah_liat', 'genteng_beton', 'metal_spandek', 'dak_beton', 'lainnya'];
  var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // ---------------------------------------------------------------------------
  // Pesan aturan (bagian 9)
  // ---------------------------------------------------------------------------
  var RULES = {
    'INP-001': ['BLOCKER', 'Data konsumsi kurang dari 3 bulan. Lengkapi minimal 3 bulan tagihan.'],
    'INP-002': ['BLOCKER', 'Jumlah fasa 3 padahal daya ≤ 5500 VA. Periksa daya atau fasa.'],
    'INP-003': ['BLOCKER', 'kWh bulanan melebihi batas fisik daya_va/1000 × 24 × 30,4. Periksa input.'],
    'INP-004': ['WARN', 'Ada bulan lebih dari 3× median. Periksa lonjakan (tagihan salah, usaha musiman).'],
    'INP-005': ['WARN', 'Tagihan Rp berbeda lebih dari 15% dari kWh × tarif. Periksa tarif atau PPJ.'],
    'INP-006': ['BLOCKER', 'Tidak ada bidang atap dengan kapasitas panel > 0. Periksa status struktur dan dimensi.'],
    'INP-007': ['BLOCKER', 'f_day di luar 0,10 s/d 0,90. Koreksi nilai.'],
    'INP-008': ['WARN', 'Capex belum diisi. Hasil teknis tetap keluar; ekonomi tidak dihitung.'],
    'REG-001': ['BLOCKER', 'Kuota klaster UP3 habis; masuk daftar tunggu (Pasal 15).'],
    'REG-001b': ['WARN', 'Kuota UP3 belum diketahui. Cek kuota klaster UP3 yang dipublikasikan PLN sebelum penawaran.'],
    'REG-002': ['WARN', 'Pac total inverter > daya tersambung. Batas 100% sudah dihapus, tetapi konfirmasi kecukupan kuota untuk kapasitas ini.'],
    'REG-003': ['INFO', 'Permohonan hanya dibuka Januari dan Juli (Pasal 14); jadwalkan pengajuan.'],
    'REG-004': ['WARN', 'Lebih dari 20% produksi tidak terpakai langsung dan tidak bernilai; pertimbangkan kapasitas lebih kecil atau baterai (di luar v1).'],
    'REG-005': ['INFO', 'Kemungkinan wajib SLO; sistem di bawah batas tertentu dikecualikan jika memenuhi syarat plug and play (Pasal 24 dan 25). Verifikasi ke naskah.'],
    'REG-006': ['INFO', 'Sistem hanya boleh tersambung setelah persetujuan; sambungan tanpa persetujuan dikenai denda (Pasal 22 dan 23).'],
    'LOAD-001': ['WARN', 'Bulan terendah < 60% rata-rata. Risiko oversize pada bulan sepi.'],
    'SIZE-001': ['WARN', 'kWp final < 80% dari kWp target. Ruang atap atau batas string membatasi kapasitas.'],
    'ROOF-001': ['WARN', 'Status struktur tidak layak. Bidang dikecualikan dari alokasi.'],
    'ROOF-002': ['WARN', 'Status struktur perlu perkuatan. Perlu perkuatan sebelum pasang.'],
    'SHD-001': ['WARN', 'Bidang dengan shading kelas 3. Pertimbangkan optimizer atau microinverter.'],
    'INV-001': ['BLOCKER', 'Tidak ada inverter yang lolos. Saran: tambah inverter kedua, gunakan microinverter atau optimizer, atau kurangi bidang yang dipakai.'],
    'INV-004': ['WARN', 'Inverter 1 fasa dipakai pada pelanggan 3 fasa. Risiko ketidakseimbangan fasa, konfirmasi PLN.'],
    'STR-001': ['BLOCKER', 'Ns × Voc dingin > Vdc maks. Tegangan dapat merusak inverter.'],
    'STR-004': ['WARN', 'Ns di atas batas atas MPPT. Clipping saat pagi dingin.'],
    'STR-005': ['WARN', 'Imp × Npar > Impp maks MPPT. Clipping arus.'],
    'STR-006': ['WARN', 'Ada bidang/panel dilewati karena batas string.'],
    'DCAC-WARN': ['WARN', 'Rasio DC/AC di luar rentang PASS.'],
    'CAB-001': ['WARN', 'Kabel DC tidak memenuhi batas dv atau KHA. Perpendek jalur atau naikkan penampang.'],
    'CAB-002': ['WARN', 'Kabel AC tidak memenuhi batas dv atau KHA. Perpendek jalur atau naikkan penampang.'],
    'CAB-003': ['WARN', 'dv total > 3%. Total rugi kabel terlalu besar.'],
    'GND-001': ['WARN', 'Tahanan pembumian > 5 Ω. Perbaiki elektroda.'],
    'GND-002': ['WARN', 'Tahanan pembumian belum diukur. Wajib ukur sebelum energize.'],
    'LPS-001': ['WARN', 'Ada penangkal petir eksternal. Jaga jarak aman, ikat ekuipotensial, konsultasi ahli.'],
    'RCD-001': ['INFO', 'Inverter transformerless tanpa RCMU. Pasang RCD sesuai manual inverter (umumnya tipe B atau A+).'],
    'MDP-001': ['WARN', 'Cek busbar 120% gagal. Periksa rating busbar.'],
    'ECO-001': ['WARN', 'Payback sederhana > 10 tahun. Ekonomi kurang menarik.'],
    'ECO-002': ['WARN', 'NPV < 0. Pada diskonto dan asumsi ini proyek merugi.']
  };

  // ---------------------------------------------------------------------------
  // Util
  // ---------------------------------------------------------------------------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s/g, '');
    if (s === '') return null;
    // Terima "1.699,53" (format ID) atau "1699.53"
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function bool(v) {
    if (v === true || v === false) return v;
    var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
    if (['ya', 'y', 'yes', 'true', '1'].indexOf(s) >= 0) return true;
    if (['tidak', 'no', 'n', 'false', '0'].indexOf(s) >= 0) return false;
    return null; // tidak diketahui
  }
  function frac(v) { // persen -> fraksi bila > 1
    var n = num(v);
    if (n === null) return null;
    return n > 1 ? n / 100 : n;
  }
  function list(v) {
    if (Array.isArray(v)) return v.map(num).filter(function (x) { return x !== null; });
    return String(v).split(/[;|]/).join(',').split(',').map(num).filter(function (x) { return x !== null; });
  }
  function median(a) {
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function rad(d) { return d * Math.PI / 180; }

  function buildConfig(raw) {
    var c = clone(DEFAULT_CONFIG);
    raw = raw || {};
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (v === '' || v === null || v === undefined) return;
      if (k === 'seri_mcb' || k === 'kelas_spd_dc') c[k] = list(v);
      else if (k === 'pr_mode' || k === 'mode_sizing') c[k] = String(v).trim();
      else if (k === 'busbar_120') c[k] = bool(v) === true;
      else { var n = num(v); c[k] = n === null ? v : n; }
    });
    return c;
  }

  function normPanel(p) {
    return {
      id: String(p.id), merek: p.merek || '', tipe: p.tipe || '', wp: num(p.wp), voc: num(p.voc), vmp: num(p.vmp),
      isc: num(p.isc), imp: num(p.imp), b_voc: num(p.b_voc), g_pmax: num(p.g_pmax),
      L: num(p.panjang_mm) / 1000, W: num(p.lebar_mm) / 1000, kg: num(p.berat_kg), fuse: num(p.max_fuse),
      deg1: frac(p.deg1), deg: frac(p.deg), vsys: num(p.vsys_max), harga: num(p.harga)
    };
  }
  function normInverter(i) {
    var eff = num(i.eff);
    return {
      id: String(i.id), merek: i.merek || '', tipe: i.tipe || '', ph: num(i.fasa), pac: num(i.pac), vdcmax: num(i.vdc_max),
      vmin: num(i.vmppt_min), vmax: num(i.vmppt_max), vstart: num(i.vstart), nm: num(i.n_mppt), spm: num(i.string_per_mppt),
      impp: num(i.impp_max), iscmax: num(i.isc_max), iac: num(i.iac_max), eff: eff === null ? null : (eff > 1 ? eff / 100 : eff),
      tl: bool(i.transformerless), rcmu: bool(i.rcmu), dcsw: bool(i.dc_switch), sert: i.sertifikasi || '', harga: num(i.harga),
      aktif: i.aktif === undefined || i.aktif === '' ? true : bool(i.aktif) !== false
    };
  }

  function makeCtx(ctx) {
    ctx = ctx || {};
    if (ctx.__norm) return ctx;
    var cfg = buildConfig(ctx.config);
    var orient = (ctx.orient && ctx.orient.length ? ctx.orient : DEFAULT_ORIENT).map(function (r) {
      return { maks: num(r.maks), U: num(r.U), T: num(r.T), S: num(r.S), B: num(r.B) };
    }).sort(function (a, b) { return a.maks - b.maks; });
    var cables = { dc: [], ac: [] };
    if (ctx.cables && ctx.cables.length) {
      ctx.cables.forEach(function (r) {
        var j = String(r.jenis || '').toLowerCase();
        if (j !== 'dc' && j !== 'ac') return;
        cables[j].push({ mm2: num(r.mm2), kha: num(r.kha), harga_m: num(r.harga_m) });
      });
    } else cables = clone(DEFAULT_CABLES);
    ['dc', 'ac'].forEach(function (j) { cables[j].sort(function (a, b) { return a.mm2 - b.mm2; }); });
    return {
      __norm: true,
      cfg: cfg,
      version: ctx.configVersion || 'default-builtin',
      orient: orient,
      cables: cables,
      panels: (ctx.panels && ctx.panels.length ? ctx.panels : FIXTURE_PANELS).map(normPanel),
      inverters: (ctx.inverters && ctx.inverters.length ? ctx.inverters : FIXTURE_INVERTERS).map(normInverter).filter(function (i) { return i.aktif; }),
      tarif: ctx.tarif && ctx.tarif.length ? ctx.tarif : DEFAULT_TARIF,
      wilayah: ctx.wilayah && ctx.wilayah.length ? ctx.wilayah : DEFAULT_WILAYAH,
      harga: ctx.hargaBoq || []
    };
  }

  // ---------------------------------------------------------------------------
  // Fungsi teknis (bagian 3-8) — mengikuti plts_ref.py
  // ---------------------------------------------------------------------------
  function dirGroup(az, lat) {
    az = ((az % 360) + 360) % 360;
    var g = (az >= 315 || az < 45) ? 'U' : az < 135 ? 'T' : az < 225 ? 'S' : 'B';
    if (lat > 0 && (g === 'U' || g === 'S')) g = g === 'U' ? 'S' : 'U';
    return g;
  }
  function fOrient(az, tilt, lat, orient) {
    orient = orient || DEFAULT_ORIENT;
    var row = orient[orient.length - 1];
    for (var i = 0; i < orient.length; i++) { if (tilt <= orient[i].maks) { row = orient[i]; break; } }
    return row[dirGroup(az, lat)];
  }
  function rho(c) { return c.rho_cu_20 * (1 + c.alpha_cu * (c.t_konduktor - 20)); }

  function layoutOne(seg, mod, c, ori) {
    var Lu = seg.panjang - 2 * c.setback_tepi, Wu = seg.lebar - 2 * c.setback_tepi;
    if (Lu <= 0 || Wu <= 0) return { n: 0, ncol: 0, nrow: 0 };
    var g = c.celah_antar_panel;
    var dB = ori === 'portrait' ? mod.W : mod.L; // searah bubungan
    var dK = ori === 'portrait' ? mod.L : mod.W; // searah kemiringan
    var ncol = Math.max(0, Math.floor((Lu + g) / (dB + g)));
    var nrow, pitch = null;
    if (seg.jenis_atap === 'dak_beton') {
      var b = rad(seg.tilt_pasang), h = dK * Math.cos(b);
      pitch = h + dK * Math.sin(b) / Math.tan(rad(c.alpha_min));
      nrow = Wu < h ? 0 : Math.floor((Wu - h) / pitch) + 1;
    } else {
      nrow = Math.floor((Wu + g) / (dK + g));
    }
    nrow = Math.max(0, nrow);
    return { n: ncol * nrow, ncol: ncol, nrow: nrow, pitch: pitch, dB: dB, dK: dK };
  }
  /** R-01..R-05. Hasil: {cap, ori, ncol, ...}. */
  function layoutCap(seg, mod, c) {
    if (seg.status_struktur === 'tidak_layak') return { cap: 0, ori: null, gross: 0, ncol: 0, nrow: 0, detail: {} };
    var oris = seg.orientasi_modul && seg.orientasi_modul !== 'auto' ? [seg.orientasi_modul] : ['portrait', 'landscape'];
    var best = null, detail = {};
    oris.forEach(function (o) {
      var r = layoutOne(seg, mod, c, o); detail[o] = r;
      if (best === null || r.n > best.r.n) best = { o: o, r: r }; // seri -> portrait (dicoba pertama)
    });
    if (!best || best.r.n <= 0) return { cap: 0, ori: null, gross: 0, ncol: 0, nrow: 0, detail: detail };
    var area = seg.panjang * seg.lebar;
    var cap = Math.floor(best.r.n * (1 - (seg.luas_halangan || 0) / area));
    cap = Math.max(0, cap);
    return { cap: cap, ori: cap > 0 ? best.o : null, gross: best.r.n, ncol: best.r.ncol, nrow: best.r.nrow,
      pitch: best.r.pitch, dB: best.r.dB, dK: best.r.dK, detail: detail };
  }

  function prDetailed(mod, invEff, dcLoss, acLoss, c) {
    var temp = Math.abs(mod.g_pmax) / 100 * (c.t_cell_avg - 25);
    return (1 - temp) * (1 - c.soiling) * (1 - c.mismatch) * (1 - dcLoss) * invEff * (1 - acLoss) * (1 - c.availability) * (1 - c.rugi_lain);
  }

  function stringLimits(mod, inv, tmin, tcell, c) {
    var voc_cold = mod.voc * (1 + mod.b_voc / 100 * (tmin - 25));
    var voc_hot = mod.voc * (1 + mod.b_voc / 100 * (tcell - 25));
    var vmp_hot = mod.vmp * (1 + mod.g_pmax / 100 * (tcell - 25));
    var vmp_cold = mod.vmp * (1 + mod.g_pmax / 100 * (tmin - 25));
    var vlim = inv.vdcmax;
    if (mod.vsys) vlim = Math.min(vlim, mod.vsys);
    var ns_max = Math.floor(vlim * (1 - c.voc_margin) / voc_cold);
    var ns_min = Math.max(Math.ceil(inv.vmin / vmp_hot), Math.ceil(inv.vstart / voc_hot));
    var ns_mppt_max = Math.floor(inv.vmax / vmp_cold);
    return { voc_cold: voc_cold, voc_hot: voc_hot, vmp_hot: vmp_hot, vmp_cold: vmp_cold, ns_max: ns_max, ns_min: ns_min, ns_mppt_max: ns_mppt_max };
  }

  // I-05: (Ns, Npar) dengan Ns×Npar ≤ n, Ns×Npar terbesar; seri -> Ns terbesar
  function bestString(n, lim, inv, mod) {
    var best = null;
    for (var ns = lim.ns_min; ns <= lim.ns_max; ns++) {
      for (var npar = 1; npar <= inv.spm; npar++) {
        var used = ns * npar;
        if (used > n) continue;
        if (mod.isc * npar > inv.iscmax) continue;
        if (best === null || used > best.used || (used === best.used && ns > best.ns)) best = { ns: ns, npar: npar, used: used };
      }
    }
    return best;
  }

  // I-04 / I-06
  function assign(allocs, inv, lim, mod) {
    var options = allocs.map(function (a) {
      var opts = [];
      for (var k = 1; k <= inv.nm; k++) {
        var nk = Math.floor(a.n / k);
        if (nk < lim.ns_min) continue;
        var bs = bestString(nk, lim, inv, mod);
        if (!bs) continue;
        opts.push({ seg: a.seg, alloc: a.n, k: k, ns: bs.ns, npar: bs.npar, used: k * bs.used });
      }
      opts.push({ seg: a.seg, alloc: a.n, k: 0, ns: 0, npar: 0, used: 0 });
      return opts;
    });
    var best = null;
    (function walk(i, combo) {
      if (i === options.length) {
        var kk = 0, uu = 0;
        combo.forEach(function (o) { kk += o.k; uu += o.used; });
        if (kk > inv.nm) return;
        if (best === null || uu > best.u || (uu === best.u && -kk > -best.k)) best = { u: uu, k: kk, combo: combo.slice() };
        return;
      }
      options[i].forEach(function (o) { combo.push(o); walk(i + 1, combo); combo.pop(); });
    })(0, []);
    if (!best || best.u === 0) return null;
    return best.combo;
  }

  function dcacClass(r, c) {
    if (r >= c.dcac_pass_min && r <= c.dcac_pass_max) return 'PASS';
    if ((r >= c.dcac_warn_min && r < c.dcac_pass_min) || (r > c.dcac_pass_max && r <= c.dcac_warn_max)) return 'WARN';
    return 'BLOCKER';
  }

  function tarifFor(golongan, tanggal, tabel) {
    var rows = tabel.filter(function (r) { return String(r.golongan) === String(golongan); });
    if (!rows.length) return null;
    var t = tanggal ? String(tanggal).slice(0, 10) : '9999-12-31';
    rows.sort(function (a, b) { return String(b.tanggal_berlaku).localeCompare(String(a.tanggal_berlaku)); });
    var hit = rows.filter(function (r) { return String(r.tanggal_berlaku).slice(0, 10) <= t; })[0] || rows[rows.length - 1];
    return num(hit.tarif);
  }

  // ---------------------------------------------------------------------------
  // Validasi input (bagian 2) -> aturan VAL-xxx (BLOCKER)
  // ---------------------------------------------------------------------------
  function validate(inp, X, add) {
    function bad(id, msg, val) { add('VAL-' + id, 'BLOCKER', msg, val); }
    function rng(id, label, v, lo, hi, req) {
      var n = num(v);
      if (n === null) { if (req) bad(id, label + ' wajib diisi.', v); return; }
      if (n < lo || n > hi) bad(id, label + ' harus ' + lo + ' s/d ' + hi + '.', n);
    }
    if (!String(inp.nama_pelanggan || '').trim()) bad('A01', 'Nama pelanggan wajib diisi.', '');
    if (!String(inp.alamat || '').trim()) bad('A01', 'Alamat wajib diisi.', '');
    rng('A02', 'Lintang', inp.lat, -11, 6.5, false);
    rng('A02', 'Bujur', inp.lon, 95, 141, false);
    if (GOLONGAN.indexOf(inp.golongan_tarif) < 0) bad('A03', 'Golongan tarif tidak dikenal.', inp.golongan_tarif);
    var d = num(inp.daya_va);
    if (d === null || d <= 0 || Math.round(d) !== d) bad('A04', 'Daya VA harus bilangan bulat > 0.', inp.daya_va);
    if ([1, 3].indexOf(num(inp.jumlah_fasa)) < 0) bad('A05', 'Jumlah fasa harus 1 atau 3.', inp.jumlah_fasa);
    if (['pascabayar', 'prabayar'].indexOf(inp.jenis_meter) < 0) bad('A06', 'Jenis meter harus pascabayar atau prabayar.', inp.jenis_meter);
    if (inp.kuota_up3 && ['tersedia', 'tidak_tersedia', 'belum_diketahui'].indexOf(inp.kuota_up3) < 0) bad('A07', 'Kuota UP3 tidak dikenal.', inp.kuota_up3);
    (inp.kwh_bulanan || []).forEach(function (v, i) { var n = num(v); if (n !== null && n < 0) bad('B01', 'kWh bulan ' + (i + 1) + ' tidak boleh negatif.', n); });
    var bt = num(inp.beban_tambahan_kwh_bulan); if (bt !== null && bt < 0) bad('B04', 'Beban tambahan harus ≥ 0.', bt);
    rng('B05', 'Target offset (%)', inp.target_offset, 10, 100, false);
    if (inp.mode_sizing && ['cap_siang', 'penuh'].indexOf(inp.mode_sizing) < 0) bad('B06', 'Mode sizing harus cap_siang atau penuh.', inp.mode_sizing);
    if (inp.wilayah_iklim && !X.wilayah.some(function (w) { return w.wilayah === inp.wilayah_iklim; })) bad('C01', 'Wilayah iklim tidak ada di tabel.', inp.wilayah_iklim);
    rng('C02', 'PSH override', inp.psh_override, 3.0, 6.5, false);
    rng('C03', 't_min_site', inp.t_min_site, -5, 30, false);
    rng('C04', 't_cell_max', inp.t_cell_max, 50, 85, false);
    var bid = inp.bidang || [];
    if (bid.length < 1 || bid.length > 4) bad('D00', 'Jumlah bidang atap harus 1 s/d 4.', bid.length);
    var names = {};
    bid.forEach(function (b, i) {
      var p = 'Bidang ' + (b.nama || (i + 1)) + ': ';
      if (!String(b.nama || '').trim()) bad('D01', p + 'nama bidang wajib.', '');
      else if (names[b.nama]) bad('D01', p + 'nama bidang harus unik.', b.nama);
      names[b.nama] = 1;
      if (JENIS_ATAP.indexOf(b.jenis_atap) < 0) bad('D02', p + 'jenis atap tidak dikenal.', b.jenis_atap);
      rng('D03', p + 'azimut', b.azimut, 0, 360, true);
      rng('D04', p + 'kemiringan', b.kemiringan, 0, 60, true);
      if (b.jenis_atap === 'dak_beton' && num(b.kemiringan) !== 0) bad('D04', p + 'dak beton wajib kemiringan 0.', b.kemiringan);
      rng('D05', p + 'panjang', b.panjang, 1, 30, true);
      rng('D05', p + 'lebar', b.lebar, 1, 30, true);
      var h = num(b.luas_halangan) || 0, ar = (num(b.panjang) || 0) * (num(b.lebar) || 0);
      if (h < 0 || (ar > 0 && h >= 0.5 * ar)) bad('D06', p + 'luas halangan harus ≥ 0 dan < 50% luas kotor.', h);
      if (['baik', 'perlu_perkuatan', 'tidak_layak'].indexOf(b.status_struktur) < 0) bad('D07', p + 'status struktur tidak dikenal.', b.status_struktur);
      if ([0, 1, 2, 3].indexOf(num(b.kelas_shading)) < 0) bad('D08', p + 'kelas shading harus 0 s/d 3.', b.kelas_shading);
      if (b.jenis_atap === 'dak_beton') rng('D09', p + 'tilt pasang', b.tilt_pasang, 5, 20, false);
      if (b.orientasi_modul && ['auto', 'portrait', 'landscape'].indexOf(b.orientasi_modul) < 0) bad('D10', p + 'orientasi modul tidak dikenal.', b.orientasi_modul);
    });
    var m = num(inp.rating_mcb_utama); if (m === null || m <= 0) bad('E01', 'Rating MCB utama wajib > 0.', inp.rating_mcb_utama);
    var bb = num(inp.rating_busbar_mdp); if (bb !== null && bb <= 0) bad('E02', 'Rating busbar harus > 0.', bb);
    rng('E03', 'Jarak DC', inp.jarak_dc, 1, 100, true);
    rng('E04', 'Jarak AC', inp.jarak_ac, 1, 100, true);
    rng('E05', 'Tahanan pembumian', inp.tahanan_grounding, 0.1, 100, false);
    if (bool(inp.lps_eksisting) === null) bad('E06', 'LPS eksisting wajib ya/tidak.', inp.lps_eksisting);
    if (['dalam_ruang', 'luar_teduh', 'luar_terbuka'].indexOf(inp.lokasi_inverter) < 0) bad('E07', 'Lokasi inverter tidak dikenal.', inp.lokasi_inverter);
    rng('F02', 'PPJ (%)', inp.ppj_persen, 0, 15, false);
    if (!X.panels.some(function (p) { return p.id === String(inp.panel_id); })) bad('G01', 'Panel harus dipilih dari katalog.', inp.panel_id);
  }

  // ---------------------------------------------------------------------------
  // Kalkulasi utama
  // ---------------------------------------------------------------------------
  function calculate(input, ctxRaw, opts) {
    opts = opts || {};
    var X = makeCtx(ctxRaw);
    var c = X.cfg, inp = clone(input);
    var rules = [];
    function add(id, level, msg, value) {
      var def = RULES[id];
      rules.push({ id: id, level: level || (def ? def[0] : 'INFO'), message: msg || (def ? def[1] : id), value: value === undefined ? '' : value });
    }
    function rule(id, value, extra) { add(id, null, extra ? RULES[id][1] + ' ' + extra : null, value); }
    var out = { engineVersion: '1.0.1', configVersion: X.version, calculatedAt: new Date().toISOString(), rules: rules };

    validate(inp, X, add);
    var mod = X.panels.filter(function (p) { return p.id === String(inp.panel_id); })[0];

    // --- L-01..L-05 Beban
    var kwh = (inp.kwh_bulanan || []).map(num);
    var filled = kwh.filter(function (v) { return v !== null; });
    if (filled.length < 3) rule('INP-001', filled.length);
    var fasa = num(inp.jumlah_fasa), daya = num(inp.daya_va);
    if (fasa === 3 && daya !== null && daya <= 5500) rule('INP-002', daya);
    var fday;
    if (typeof inp.profil_siang === 'number' || num(inp.profil_siang) !== null) fday = num(inp.profil_siang);
    else fday = c['f_day_' + inp.profil_siang];
    if (fday === undefined || fday === null || fday < 0.10 || fday > 0.90) rule('INP-007', fday);
    if (inp.kuota_up3 === 'tidak_tersedia') rule('REG-001', inp.kuota_up3);
    else if (!inp.kuota_up3 || inp.kuota_up3 === 'belum_diketahui') rule('REG-001b', 'belum_diketahui');

    var stop = function () { return rules.some(function (r) { return r.level === 'BLOCKER'; }); };
    if (stop() && (filled.length < 3 || !mod || fday === undefined || fday === null || rules.some(function (r) { return r.id.indexOf('VAL-') === 0; }))) return finish(out);

    var phys = daya / 1000 * 24 * 30.4;
    var over = filled.filter(function (v) { return v > phys; });
    if (over.length) rule('INP-003', over.join(', '));
    var med = median(filled);
    var spikes = [];
    kwh.forEach(function (v, i) { if (v !== null && v > c.spike_ratio * med) spikes.push('bln ' + (i + 1) + ': ' + v); });
    if (spikes.length) rule('INP-004', spikes.join('; '));
    var avg = mean(filled);
    var minK = Math.min.apply(null, filled);
    if (minK < c.load_min_ratio * avg) rule('LOAD-001', minK + ' < ' + (c.load_min_ratio * 100) + '% × ' + avg.toFixed(1));

    var tarif = num(inp.tarif_rp_kwh);
    if (tarif === null) tarif = tarifFor(inp.golongan_tarif, inp.tanggal_survey, X.tarif);
    var ppj = num(inp.ppj_persen); ppj = ppj === null ? c.ppj_default : ppj / 100;
    var tag = (inp.tagihan_rp_bulanan || []).map(num);
    var tagBad = [];
    tag.forEach(function (t, i) {
      if (t === null || kwh[i] === null || kwh[i] === undefined || !tarif) return;
      var ref = kwh[i] * tarif;
      if (ref > 0 && Math.abs(t - ref) / ref > c.tagihan_tol) tagBad.push('bln ' + (i + 1) + ': ' + Math.round(t) + ' vs ' + Math.round(ref));
    });
    if (tagBad.length) rule('INP-005', tagBad.join('; '));

    var beban = num(inp.beban_tambahan_kwh_bulan) || 0;
    var e_month = avg + beban;
    var e_day = e_month / c.days_per_month;
    var e_day_load = e_day * fday * c.k_sc;
    var offset = (num(inp.target_offset) === null ? 100 : num(inp.target_offset)) / 100;
    var mode = inp.mode_sizing || c.mode_sizing;
    var e_target = mode === 'penuh' ? e_day * offset : Math.min(e_day * offset, e_day_load);
    out.load = { kwh_avg: avg, beban_tambahan: beban, e_month: e_month, e_day: e_day, fday: fday, e_day_load: e_day_load,
      e_target: e_target, mode_sizing: mode, offset: offset, tarif: tarif, ppj: ppj, catatan_fday: inp.catatan_fday || '' };

    // --- Iklim
    var wil = X.wilayah.filter(function (w) { return w.wilayah === (inp.wilayah_iklim || 'DEFAULT'); })[0];
    var psh = num(inp.psh_override);
    if (psh === null) psh = wil && num(wil.psh) !== null ? num(wil.psh) : c.psh_default;
    var tmin = num(inp.t_min_site);
    if (tmin === null) tmin = wil && num(wil.t_min) !== null ? num(wil.t_min) : c.t_min_site;
    var tcell = num(inp.t_cell_max); if (tcell === null) tcell = c.t_cell_max;
    var lat = num(inp.lat); if (lat === null) lat = c.lat_default;
    var fm = [];
    for (var mi = 1; mi <= 12; mi++) fm.push(wil ? num(wil['f' + mi]) : null);
    if (fm.some(function (x) { return x === null; })) fm = DAYS_IN_MONTH.map(function () { return 1; });
    else { var fa = mean(fm); fm = fm.map(function (x) { return x / fa; }); }
    out.climate = { wilayah: wil ? wil.wilayah : '-', psh: psh, t_min: tmin, t_cell_max: tcell, lat: lat };

    // --- PR sizing
    var quick = c.pr_mode === 'cepat' || c.pr_mode === 'quick';
    var pr_s = quick ? c.pr_quick : prDetailed(mod, c.eff_inverter_default, c.rugi_kabel_dc_default, c.rugi_kabel_ac_default, c);
    out.load.pr_sizing = pr_s;

    // --- R-xx Layout per bidang & L-06
    var segs = (inp.bidang || []).map(function (b) {
      var s = {
        nama: String(b.nama), jenis_atap: b.jenis_atap, azimut: num(b.azimut), kemiringan: num(b.kemiringan),
        panjang: num(b.panjang), lebar: num(b.lebar), luas_halangan: num(b.luas_halangan) || 0, status_struktur: b.status_struktur,
        kelas_shading: num(b.kelas_shading) || 0, tilt_pasang: num(b.tilt_pasang) === null ? 10 : num(b.tilt_pasang),
        orientasi_modul: b.orientasi_modul || 'auto'
      };
      var lay = layoutCap(s, mod, c);
      s.cap = lay.cap; s.ori = lay.ori; s.layout = lay;
      s.tilt_array = s.jenis_atap === 'dak_beton' ? s.tilt_pasang : s.kemiringan;
      s.fo = fOrient(s.azimut, s.tilt_array, lat, X.orient);
      s.sh = c['shade_loss_' + s.kelas_shading];
      s.y = psh * s.fo * (1 - s.sh) * pr_s;
      s.q_kgm2 = mod.kg / (mod.L * mod.W) + c.berat_rangka;
      if (s.status_struktur === 'tidak_layak') rule('ROOF-001', s.nama);
      if (s.status_struktur === 'perlu_perkuatan') rule('ROOF-002', s.nama);
      if (s.kelas_shading === 3) rule('SHD-001', s.nama);
      return s;
    });
    out.segments = segs;
    var order = segs.filter(function (s) { return s.cap > 0; }).sort(function (a, b) { return b.y - a.y; });
    if (!order.length) { rule('INP-006', 0); return finish(out); }

    // --- L-07 Alokasi
    var wp = mod.wp / 1000, rem = e_target;
    segs.forEach(function (s) { s.alloc = 0; });
    order.forEach(function (s) {
      if (rem <= 0) { s.alloc = 0; return; }
      var per = wp * s.y, lo = Math.floor(rem / per), hi = lo + 1;
      var n = Math.abs(lo * per - rem) <= Math.abs(hi * per - rem) ? lo : hi;
      n = Math.min(n, s.cap); s.alloc = n; rem -= n * per;
    });
    var kwp_target = e_target / order[0].y;
    out.kwp_target = kwp_target;

    // --- Bagian 6: inverter & string
    var act = order.filter(function (s) { return s.alloc > 0; }).map(function (s) { return { seg: s, n: s.alloc }; });
    var cands = [], tried = [];
    X.inverters.forEach(function (inv) {
      var why = null;
      if (fasa === 1 && inv.ph !== 1) why = 'fasa';
      if (fasa === 3 && inv.ph === 1 && inv.pac > c.batas_inv_1fasa_pada_3fasa_w) why = 'fasa (1 fasa > batas)';
      if (why) { tried.push({ id: inv.id, alasan: why }); return; }
      var lim = stringLimits(mod, inv, tmin, tcell, c);
      var combo = act.length ? assign(act, inv, lim, mod) : null;
      if (!combo) { tried.push({ id: inv.id, alasan: 'batas string/arus' }); return; }
      var n_used = combo.reduce(function (s, o) { return s + o.used; }, 0);
      var kwp = n_used * wp, r = kwp / (inv.pac / 1000), cl = dcacClass(r, c);
      if (cl === 'BLOCKER') { tried.push({ id: inv.id, alasan: 'DC/AC ' + r.toFixed(2) }); return; }
      cands.push({ inv: inv, lim: lim, combo: combo, n_used: n_used, kwp: kwp, dcac: r, cl: cl, warnPhase: fasa === 3 && inv.ph === 1 });
    });
    if (fasa === 3 && cands.some(function (x) { return x.inv.ph === 3; })) cands = cands.filter(function (x) { return x.inv.ph === 3; });
    out.inverterCandidates = cands.map(function (x) { return { id: x.inv.id, dcac: x.dcac, kelas: x.cl, panel: x.n_used, harga: x.inv.harga }; });
    out.inverterRejected = tried;
    if (!cands.length) { rule('INV-001', ''); return finish(out); }
    var allPriced = cands.every(function (x) { return x.inv.harga !== null && x.inv.harga > 0; });
    var pri = { PASS: 0, WARN: 1 };
    cands.sort(function (a, b) {
      return (pri[a.cl] - pri[b.cl]) || ((a.warnPhase ? 1 : 0) - (b.warnPhase ? 1 : 0)) ||
        (allPriced ? a.inv.harga - b.inv.harga : a.inv.pac - b.inv.pac) ||
        (Math.abs(a.dcac - c.dcac_pref) - Math.abs(b.dcac - c.dcac_pref));
    });
    var sel = cands[0], inv = sel.inv, lim = sel.lim;
    var kwp = sel.kwp;
    if (sel.cl === 'WARN') rule('DCAC-WARN', sel.dcac.toFixed(3));
    if (sel.warnPhase) rule('INV-004', inv.id);
    if (kwp < c.size_warn_ratio * kwp_target) rule('SIZE-001', kwp.toFixed(3) + ' < 80% × ' + kwp_target.toFixed(3));

    var combo = sel.combo;
    var unused = [];
    combo.forEach(function (o) {
      o.seg.used = o.used;
      if (o.used < o.alloc) unused.push(o.seg.nama + ': ' + (o.alloc - o.used) + ' panel tidak terpakai' + (o.used === 0 ? ' (bidang dilewati)' : ''));
    });
    if (unused.length) rule('STR-006', unused.join('; '));
    var active = combo.filter(function (o) { return o.used > 0; });
    var mppt = [];
    active.forEach(function (o) {
      var vocStr = o.ns * lim.voc_cold, vmpStr = o.ns * lim.vmp_hot;
      if (vocStr > inv.vdcmax) rule('STR-001', o.seg.nama + ': ' + vocStr.toFixed(1) + ' V > ' + inv.vdcmax + ' V');
      if (o.ns > lim.ns_mppt_max) rule('STR-004', o.seg.nama + ': Ns ' + o.ns + ' > ' + lim.ns_mppt_max);
      if (mod.imp * o.npar > inv.impp) rule('STR-005', o.seg.nama + ': ' + (mod.imp * o.npar).toFixed(2) + ' A > ' + inv.impp + ' A');
      mppt.push({ bidang: o.seg.nama, k: o.k, ns: o.ns, npar: o.npar, panel: o.used, voc_cold_string: vocStr, vmp_hot_string: vmpStr,
        isc_total: mod.isc * o.npar, imp_total: mod.imp * o.npar });
    });
    out.inverter = { id: inv.id, merek: inv.merek, tipe: inv.tipe, fasa: inv.ph, pac: inv.pac, dcac: sel.dcac, kelas: sel.cl, harga: inv.harga,
      eff: inv.eff === null ? c.eff_inverter_default : inv.eff, limits: lim, kapasitas_regulasi_w: inv.pac };
    out.mppt = mppt;
    out.array = { panel_id: mod.id, panel_tipe: (mod.merek + ' ' + mod.tipe).trim(), wp: mod.wp, n_panel: sel.n_used, kwp: kwp };

    // Regulasi
    if (inv.pac > daya) rule('REG-002', inv.pac + ' W > ' + daya + ' VA');
    var tgl = inp.tanggal_survey ? new Date(inp.tanggal_survey) : new Date();
    var bln = isNaN(tgl.getTime()) ? new Date().getMonth() + 1 : tgl.getMonth() + 1;
    if (bln !== 1 && bln !== 7) rule('REG-003', 'bulan ' + bln);
    if (inv.pac >= c.slo_info_w) rule('REG-005', inv.pac + ' W');
    rule('REG-006', '');

    // --- Bagian 7 Kabel & proteksi
    var R = rho(c), isc = mod.isc, imp = mod.imp;
    var I_dc = c.k_isc_kabel * isc;
    var ldc = num(inp.jarak_dc), lac = num(inp.jarak_ac);
    var dvDcOf = function (a) { return Math.max.apply(null, active.map(function (o) { return (2 * ldc * imp * R / a) / (o.ns * mod.vmp) * 100; })); };
    var dcSel = null;
    X.cables.dc.forEach(function (cb) { if (!dcSel && cb.kha * c.derating_dc >= I_dc && dvDcOf(cb.mm2) <= c.dv_dc_pass) dcSel = cb; });
    if (!dcSel) { dcSel = X.cables.dc[X.cables.dc.length - 1]; rule('CAB-001', dcSel.mm2 + ' mm², dv ' + dvDcOf(dcSel.mm2).toFixed(2) + '%'); }
    var dv_dc = dvDcOf(dcSel.mm2);
    var npar_max = Math.max.apply(null, active.map(function (o) { return o.npar; }));
    var I_dc_main = c.k_isc_kabel * isc * npar_max;
    var V = inv.ph === 1 ? 230 : 400, kf = inv.ph === 1 ? 2 : Math.sqrt(3);
    var I_ac = inv.iac !== null ? inv.iac : (inv.ph === 1 ? inv.pac / (230 * c.pf) : inv.pac / (Math.sqrt(3) * 400 * c.pf));
    var mcb = null;
    c.seri_mcb.forEach(function (m) { if (mcb === null && m >= c.k_mcb * I_ac) mcb = m; });
    if (mcb === null) mcb = c.seri_mcb[c.seri_mcb.length - 1];
    var dvAcOf = function (a) { return (kf * lac * I_ac * R / a) / V * 100; };
    var acSel = null;
    X.cables.ac.forEach(function (cb) { if (!acSel && cb.kha * c.derating_ac >= mcb && dvAcOf(cb.mm2) <= c.dv_ac_pass) acSel = cb; });
    if (!acSel) { acSel = X.cables.ac[X.cables.ac.length - 1]; rule('CAB-002', acSel.mm2 + ' mm², dv ' + dvAcOf(acSel.mm2).toFixed(2) + '%'); }
    var dv_ac = dvAcOf(acSel.mm2), dv_total = dv_dc + dv_ac;
    if (dv_total > c.dv_total_pass) rule('CAB-003', dv_total.toFixed(2) + '%');
    var ns_long = Math.max.apply(null, active.map(function (o) { return o.ns; }));
    var voc_str = ns_long * lim.voc_cold;
    var spd_uc = c.k_spd * voc_str;
    var spdKelas = null;
    c.kelas_spd_dc.forEach(function (k) { if (spdKelas === null && k >= spd_uc) spdKelas = k; });
    var fuseReq = (npar_max - 1) * isc > mod.fuse;
    var rg = num(inp.tahanan_grounding), gnd;
    if (rg === null) { gnd = 'BELUM DIUKUR'; rule('GND-002', ''); }
    else if (rg > c.batas_grounding_ohm) { gnd = 'WARN'; rule('GND-001', rg + ' Ω'); }
    else gnd = 'PASS';
    if (bool(inp.lps_eksisting) === true) rule('LPS-001', 'ya');
    var rcd = inv.tl === true && inv.rcmu === false;
    if (rcd) rule('RCD-001', inv.id);
    var mdp = null;
    var bus = num(inp.rating_busbar_mdp);
    if (c.busbar_120 && bus) {
      mdp = (num(inp.rating_mcb_utama) + mcb) <= c.k_busbar * bus;
      if (!mdp) rule('MDP-001', num(inp.rating_mcb_utama) + ' + ' + mcb + ' > ' + c.k_busbar + ' × ' + bus);
    }
    out.cable = {
      rho: R, i_dc_string: I_dc, i_dc_main: I_dc_main, dc_mm2: dcSel.mm2, dc_kha_derated: dcSel.kha * c.derating_dc, dv_dc: dv_dc,
      i_ac: I_ac, mcb: mcb, ac_mm2: acSel.mm2, ac_kha_derated: acSel.kha * c.derating_ac, dv_ac: dv_ac, dv_total: dv_total,
      ac_inti: inv.ph === 1 ? 3 : 5, v_ac: V,
      dc_switch: { v_min: voc_str, i_min: I_dc_main, terintegrasi: inv.dcsw },
      fuse: { wajib: fuseReq, i_min: c.k_fuse_min * isc, i_max: mod.fuse, v_min: voc_str },
      spd_dc: { uc_min: spd_uc, kelas: spdKelas },
      spd_ac: { tegangan: inv.ph === 1 ? '230 V (1 fasa)' : '230/400 V (3 fasa)' },
      grounding: { ohm: rg, status: gnd, bonding_mm2: c.bonding_mm2 },
      rcd: rcd, mdp_ok: mdp, voc_cold_string: voc_str
    };

    // --- Bagian 8 Produksi
    var prd = quick ? c.pr_quick : prDetailed(mod, out.inverter.eff, dv_dc / 100, dv_ac / 100, c);
    var e_pv_day = 0;
    active.forEach(function (o) {
      var s = o.seg; s.e_day = o.used * wp * psh * s.fo * (1 - s.sh) * prd; e_pv_day += s.e_day;
    });
    var e_self = Math.min(e_pv_day, e_day_load);
    var sc = e_self / e_pv_day, sf = e_self / e_day;
    if (sc < c.sc_warn) rule('REG-004', (sc * 100).toFixed(1) + '%');
    out.production = {
      pr_final: prd, e_pv_day: e_pv_day, e_pv_year0: e_pv_day * 365, e_self_day: e_self, sc: sc, sf: sf,
      monthly: DAYS_IN_MONTH.map(function (d, i) { return e_pv_day * d * fm[i]; })
    };

    // Ringkasan per bidang
    var areaArr = 0, areaRoof = 0;
    out.segmentsOut = segs.map(function (s) {
      var n = s.used || 0;
      var a = n * mod.L * mod.W; areaArr += a; areaRoof += s.panjang * s.lebar;
      return { nama: s.nama, jenis_atap: s.jenis_atap, cap: s.cap, ori: s.ori, alloc: s.alloc || 0, panel: n, kwp: n * wp, f_orient: s.fo,
        rugi_shading: s.sh, y: s.y, luas_array: a, pemanfaatan: a / (s.panjang * s.lebar), q_kgm2: s.q_kgm2, e_day: s.e_day || 0,
        ncol: s.layout.ncol, nrow: s.layout.nrow, pitch: s.layout.pitch };
    });
    out.array.luas_array = areaArr;
    out.array.pemanfaatan = areaArr / areaRoof;

    // --- Ekonomi
    var capexV = num(inp.capex_nilai);
    var deg1 = mod.deg1 !== null ? mod.deg1 : c.degradasi_tahun1;
    var deg = mod.deg !== null ? mod.deg : c.degradasi_tahunan;
    if (capexV === null || capexV <= 0) rule('INP-008', '');
    else {
      var capex = inp.capex_mode === 'total' ? capexV : capexV * kwp;
      var rm = inp.jenis_meter === 'pascabayar' ? c.rm_jam * (daya / 1000) * tarif : 0;
      var bill = function (e, t) { var b = e * t * (1 + ppj); var rmT = inp.jenis_meter === 'pascabayar' ? c.rm_jam * (daya / 1000) * t : 0; return rmT ? Math.max(rmT * (1 + ppj), b) : b; };
      var cash = [-capex], sav = [], prods = [], table = [];
      var invPrice = inv.harga || 0;
      for (var y = 1; y <= c.horizon; y++) {
        var e_y = out.production.e_pv_year0 * (1 - deg1) * Math.pow(1 - deg, y - 1);
        var self_y = Math.min(e_y / 365, e_day_load);
        var tar = tarif * Math.pow(1 + c.kenaikan_tarif, y - 1);
        var s_y = (bill(e_month, tar) - bill(Math.max(e_month - self_y * c.days_per_month, 0), tar)) * 12;
        var opex = c.om_persen_capex * capex;
        var repl = y === c.tahun_ganti_inverter ? invPrice * c.biaya_ganti_inverter : 0;
        cash.push(s_y - opex - repl); sav.push(s_y); prods.push(e_y);
        table.push({ tahun: y, produksi: e_y, hemat: s_y, opex: opex, ganti: repl, cf: s_y - opex - repl });
      }
      var r = c.diskonto;
      var npv = function (rr) { return cash.reduce(function (s, cf, i) { return s + cf / Math.pow(1 + rr, i); }, 0); };
      var irr = null, lo = -0.9, hi = 1.0;
      if (npv(lo) * npv(hi) < 0) {
        for (var it = 0; it < 200; it++) { var mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
        irr = (lo + hi) / 2;
      }
      var cum = 0, dp = null;
      cash.forEach(function (cf, i) { cum += cf / Math.pow(1 + r, i); table[i - 1] && (table[i - 1].kum_diskonto = cum); if (cum >= 0 && dp === null) dp = i; });
      var pvCost = capex, pvE = 0;
      for (var yy = 1; yy <= c.horizon; yy++) { pvCost += (c.om_persen_capex * capex) / Math.pow(1 + r, yy); pvE += prods[yy - 1] / Math.pow(1 + r, yy); }
      pvCost += invPrice * c.biaya_ganti_inverter / Math.pow(1 + r, c.tahun_ganti_inverter);
      var payback = capex / sav[0];
      out.economics = {
        capex: capex, rm: rm, tarif: tarif, ppj: ppj, bill_before: bill(e_month, tarif), bill_after: bill(Math.max(e_month - Math.min(out.production.e_pv_year0 * (1 - deg1) / 365, e_day_load) * c.days_per_month, 0), tarif),
        savings_month_y1: sav[0] / 12, savings_y1: sav[0], payback_simple: payback, npv: npv(r), irr: irr, disc_payback_year: dp,
        lcoe: pvCost / pvE, deg1: deg1, deg: deg, cashflow: table
      };
      if (payback > c.payback_warn) rule('ECO-001', payback.toFixed(1) + ' tahun');
      if (out.economics.npv < 0) rule('ECO-002', Math.round(out.economics.npv));
    }

    // --- BoQ & checklist
    out.boq = buildBoq(out, active, mod, inv, c, X, inp);
    out.checklist = [
      'Inverter memiliki anti-islanding dan proteksi jaringan' + (inv.sert ? ' (sertifikasi: ' + inv.sert + ')' : ''),
      'Modul sesuai SNI IEC 61215',
      'Instalasi dan pembumian sesuai PUIL 2020 (SNI 0225:2020)',
      'Pemasang adalah Badan Usaha bersertifikat (Pasal 21)',
      'Kuota klaster UP3 sudah dicek',
      'Jadwal pengajuan (Januari/Juli) sudah ditentukan',
      'Tahanan pembumian sudah diukur sebelum energize'
    ];

    // --- E-13 Sensitivitas
    if (!opts.skipSensitivity) out.sensitivity = sensitivity(inp, X, fday);
    return finish(out);
  }

  function buildBoq(out, active, mod, inv, c, X, inp) {
    var H = {};
    (X.harga || []).forEach(function (h) { H[h.item] = num(h.harga); });
    var rows = [];
    function add(item, qty, sat, hargaSat, ket) {
      var h = hargaSat === undefined ? H[item] : hargaSat;
      if (h === undefined) h = null;
      rows.push({ item: item, qty: qty, satuan: sat, harga_satuan: h, total: h === null ? null : h * qty, perlu_harga: h === null, ket: ket || '' });
    }
    var g = c.celah_antar_panel;
    add('Panel ' + out.array.panel_tipe, out.array.n_panel, 'unit', mod.harga);
    add('Inverter ' + inv.id + ' ' + (inv.merek + ' ' + inv.tipe).trim(), 1, 'unit', inv.harga);
    var rail = 0, sup = { hook: 0, lfeet: 0, kaki_rangka: 0, penyangga_lain: 0 }, kU = 0, kT = 0;
    active.forEach(function (o) {
      var s = o.seg, n = o.used, col = s.layout.ncol, dB = s.layout.dB;
      if (!col) return;
      var rowsN = Math.ceil(n / col);
      for (var r = 0; r < rowsN; r++) {
        var m = r < rowsN - 1 ? col : n - (rowsN - 1) * col;
        var len = m * dB + (m - 1) * g + c.lebih_rel;
        rail += 2 * len;
        var ns = 2 * (Math.ceil(len / c.jarak_penyangga) + 1);
        var key = (s.jenis_atap === 'genteng_tanah_liat' || s.jenis_atap === 'genteng_beton') ? 'hook' :
          s.jenis_atap === 'metal_spandek' ? 'lfeet' : s.jenis_atap === 'dak_beton' ? 'kaki_rangka' : 'penyangga_lain';
        sup[key] += ns;
        kU += 4; kT += 2 * (m - 1);
      }
    });
    add('rel_per_m', rail, 'm');
    if (sup.hook) add('hook_genteng', sup.hook, 'unit');
    if (sup.lfeet) add('klem_lfeet_spandek', sup.lfeet, 'unit');
    if (sup.kaki_rangka) add('kaki_rangka_dak', sup.kaki_rangka, 'unit', undefined, 'dengan pemberat atau angkur');
    if (sup.penyangga_lain) add('penyangga_lainnya', sup.penyangga_lain, 'unit', undefined, 'tentukan jenis');
    add('klem_ujung', kU, 'unit');
    add('klem_tengah', kT, 'unit');
    var nStr = active.reduce(function (s, o) { return s + o.k * o.npar; }, 0);
    var nMppt = active.reduce(function (s, o) { return s + o.k; }, 0);
    var ldc = num(inp.jarak_dc), lac = num(inp.jarak_ac), cad = 1 + c.cadangan_kabel;
    var dcC = X.cables.dc.filter(function (x) { return x.mm2 === out.cable.dc_mm2; })[0] || {};
    var acC = X.cables.ac.filter(function (x) { return x.mm2 === out.cable.ac_mm2; })[0] || {};
    add('Kabel DC PV ' + out.cable.dc_mm2 + ' mm²', 2 * ldc * nStr * cad, 'm', dcC.harga_m === undefined ? null : dcC.harga_m);
    add('konektor_mc4_pasang', nStr, 'pasang');
    add('Kabel AC ' + out.cable.ac_mm2 + ' mm² ' + out.cable.ac_inti + ' inti', lac * cad, 'm', acC.harga_m === undefined ? null : acC.harga_m);
    if (inv.dcsw !== true) add('saklar_dc', nMppt, 'unit', undefined, '≥ ' + out.cable.dc_switch.v_min.toFixed(1) + ' V, ≥ ' + out.cable.dc_switch.i_min.toFixed(2) + ' A');
    add('mcb_ac', 1, 'unit', H['mcb_ac_' + out.cable.mcb] !== undefined ? H['mcb_ac_' + out.cable.mcb] : undefined, 'In ' + out.cable.mcb + ' A');
    add('spd_dc', 1, 'set', undefined, 'kelas ' + (out.cable.spd_dc.kelas || '>' + c.kelas_spd_dc[c.kelas_spd_dc.length - 1]) + ' V DC');
    add('spd_ac', 1, 'set', undefined, out.cable.spd_ac.tegangan);
    if (out.cable.fuse.wajib) add('sekring_string', nStr, 'unit', undefined, out.cable.fuse.i_min.toFixed(1) + '–' + out.cable.fuse.i_max + ' A');
    if (out.cable.rcd) add('rcd', 1, 'unit', undefined, 'tipe B atau A+ sesuai manual');
    var rg = out.cable.grounding.ohm;
    add('elektroda_pembumian', rg !== null && rg <= c.batas_grounding_ohm ? 1 : 2, 'unit');
    add('kabel_bonding_' + c.bonding_mm2 + 'mm2', ldc + c.bonding_ekstra_m, 'm');
    add('boks_aksesori', 1, 'lot', undefined, 'harga manual');
    var total = rows.reduce(function (s, r) { return s + (r.total || 0); }, 0);
    return { rows: rows, total_terharga: total, ada_tanpa_harga: rows.some(function (r) { return r.perlu_harga; }), n_string: nStr, n_mppt: nMppt };
  }

  function sensitivity(inp, X, fday) {
    var c = X.cfg, list = [];
    function run(label, mut) {
      var i2 = clone(inp); mut(i2);
      var r = calculate(i2, X, { skipSensitivity: true });
      list.push({ skenario: label, status: r.status, kwp: r.array ? r.array.kwp : null, inverter: r.inverter ? r.inverter.id : null,
        payback: r.economics ? r.economics.payback_simple : null, npv: r.economics ? r.economics.npv : null });
    }
    run('Basis', function () {});
    [-1, 1].forEach(function (sg) {
      var f = Math.min(0.9, Math.max(0.1, fday + sg * c.sens_fday));
      run('f_day ' + (sg > 0 ? '+' : '−') + c.sens_fday.toFixed(2) + ' (' + f.toFixed(2) + ')', function (x) { x.profil_siang = f; });
    });
    var t0 = num(inp.tarif_rp_kwh) || tarifFor(inp.golongan_tarif, inp.tanggal_survey, X.tarif);
    [-1, 1].forEach(function (sg) {
      run('Tarif ' + (sg > 0 ? '+' : '−') + Math.round(c.sens_tarif * 100) + '%', function (x) { x.tarif_rp_kwh = t0 * (1 + sg * c.sens_tarif); });
    });
    if (num(inp.capex_nilai)) [-1, 1].forEach(function (sg) {
      run('Capex ' + (sg > 0 ? '+' : '−') + Math.round(c.sens_capex * 100) + '%', function (x) { x.capex_nilai = num(inp.capex_nilai) * (1 + sg * c.sens_capex); });
    });
    return list;
  }

  function finish(out) {
    var lv = out.rules.map(function (r) { return r.level; });
    out.blocked = lv.indexOf('BLOCKER') >= 0;
    out.status = out.blocked ? 'TIDAK LAYAK DIPROSES' : lv.indexOf('WARN') >= 0 ? 'LAYAK DENGAN CATATAN' : 'LAYAK';
    if (out.segments) out.segments.forEach(function (s) { delete s.layout.detail; });
    return out;
  }

  return {
    calculate: calculate,
    makeCtx: makeCtx,
    // diekspor untuk uji & UI
    layoutCap: layoutCap, stringLimits: stringLimits, fOrient: fOrient, prDetailed: prDetailed, rho: rho, buildConfig: buildConfig,
    normPanel: normPanel, normInverter: normInverter,
    DEFAULT_CONFIG: DEFAULT_CONFIG, DEFAULT_ORIENT: DEFAULT_ORIENT, DEFAULT_CABLES: DEFAULT_CABLES, DEFAULT_TARIF: DEFAULT_TARIF,
    DEFAULT_WILAYAH: DEFAULT_WILAYAH, FIXTURE_PANELS: FIXTURE_PANELS, FIXTURE_INVERTERS: FIXTURE_INVERTERS, RULES: RULES,
    GOLONGAN: GOLONGAN, JENIS_ATAP: JENIS_ATAP
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PLTS;

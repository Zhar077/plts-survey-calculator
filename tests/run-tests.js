// Kasus uji numerik PRD bagian 11. Jalankan: node tests/run-tests.js
// Toleransi: integer persis; energi/kWp ±0,1%; rupiah ±0,5%; IRR ±0,1 poin persen.
var PLTS = require('../web/engine.js');

var pass = 0, fail = 0;
function ok(name, cond, got, exp) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + ': dapat ' + JSON.stringify(got) + ', harap ' + JSON.stringify(exp)); }
}
function eqI(n, g, e) { ok(n, g === e, g, e); }
function rel(n, g, e, tol) { ok(n, g !== null && g !== undefined && Math.abs(g - e) <= Math.abs(e) * tol + 1e-9, g, e); }
function abs(n, g, e, tol) { ok(n, g !== null && g !== undefined && Math.abs(g - e) <= tol, g, e); }
var E = 0.001, RP = 0.005;

function base(over) {
  var b = {
    nama_pelanggan: 'Uji', alamat: 'Uji', golongan_tarif: 'R2-3500-5500', daya_va: 5500, jumlah_fasa: 1,
    jenis_meter: 'pascabayar', kuota_up3: 'tersedia', kwh_bulanan: Array(12).fill(450), profil_siang: 'campuran',
    mode_sizing: 'cap_siang', target_offset: 100, wilayah_iklim: 'DEFAULT', panel_id: 'FX575',
    bidang: [{ nama: 'A', jenis_atap: 'genteng_tanah_liat', azimut: 0, kemiringan: 20, panjang: 8, lebar: 5, luas_halangan: 0,
      status_struktur: 'baik', kelas_shading: 0, orientasi_modul: 'auto' }],
    rating_mcb_utama: 25, jarak_dc: 15, jarak_ac: 10, tahanan_grounding: 3, lps_eksisting: 'tidak', lokasi_inverter: 'dalam_ruang',
    tarif_rp_kwh: 1699.53, ppj_persen: 0, capex_mode: 'per_kwp', capex_nilai: 14e6, tanggal_survey: '2026-11-16'
  };
  Object.keys(over || {}).forEach(function (k) { b[k] = over[k]; });
  return b;
}
function warns(r) { return r.rules.filter(function (x) { return x.level !== 'INFO'; }).map(function (x) { return x.id; }).sort(); }

function full(name, inp, x) {
  console.log('== ' + name);
  var r = PLTS.calculate(inp);
  rel('E_hari', r.load.e_day, x.e_day, E);
  rel('E_siang', r.load.e_day_load, x.e_siang, E);
  rel('PR sizing', r.load.pr_sizing, 0.8152, 0.0001);
  Object.keys(x.cap).forEach(function (s) {
    var seg = r.segmentsOut.filter(function (q) { return q.nama === s; })[0];
    eqI('cap ' + s, seg.cap, x.cap[s][0]); eqI('ori ' + s, seg.ori, x.cap[s][1]);
    abs('y ' + s, seg.y, x.cap[s][2], 0.00005);
    eqI('alloc ' + s, seg.alloc, x.cap[s][3]);
  });
  eqI('inverter', r.inverter.id, x.inv);
  rel('kWp', r.array.kwp, x.kwp, E);
  abs('DC/AC', r.inverter.dcac, x.dcac, 0.005); eqI('kelas DC/AC', r.inverter.kelas, 'PASS');
  x.mppt.forEach(function (m, i) { eqI('Ns ' + i, r.mppt[i].ns, m[0]); eqI('Npar ' + i, r.mppt[i].npar, m[1]); eqI('k ' + i, r.mppt[i].k, m[2]); });
  abs('Voc dingin string', r.cable.voc_cold_string, x.voc, 0.0501);
  eqI('kabel DC', r.cable.dc_mm2, x.dc[0]); abs('dv_dc', r.cable.dv_dc, x.dc[1], 0.005);
  eqI('MCB', r.cable.mcb, x.ac[0]); eqI('kabel AC', r.cable.ac_mm2, x.ac[1]); abs('dv_ac', r.cable.dv_ac, x.ac[2], 0.005);
  abs('SPD Uc', r.cable.spd_dc.uc_min, x.spd[0], 0.05); eqI('SPD kelas', r.cable.spd_dc.kelas, x.spd[1]);
  abs('PR final', r.production.pr_final, x.pr, 0.00005);
  rel('E_pv_hari', r.production.e_pv_day, x.epv, E);
  abs('SC', r.production.sc * 100, x.sc, 0.05); abs('SF', r.production.sf * 100, x.sf, 0.05);
  rel('E_pv_tahun0', r.production.e_pv_year0, x.ey0, E);
  rel('Capex', r.economics.capex, x.capex, RP); rel('RM', r.economics.rm, x.rm, RP);
  rel('Hemat th1', r.economics.savings_y1, x.sav, RP); abs('Payback', r.economics.payback_simple, x.pb, 0.005);
  rel('NPV', r.economics.npv, x.npv, RP); abs('IRR', r.economics.irr * 100, x.irr, 0.1);
  eqI('Payback terdiskonto', r.economics.disc_payback_year, x.dpb); rel('LCOE', r.economics.lcoe, x.lcoe, RP);
  eqI('Status', r.status, x.status);
  if (x.warns) eqI('Aturan WARN/BLOCKER', warns(r).join(','), x.warns.join(','));
  return r;
}

full('TC-01', base(), {
  e_day: 14.795, e_siang: 6.658, cap: { A: [9, 'landscape', 3.4238, 3] }, inv: 'I1K5', kwp: 1.725, dcac: 1.15, mppt: [[3, 1, 1]],
  voc: 161.9, dc: [6, 1.06], ac: [10, 2.5, 0.50], spd: [194.2, 600], pr: 0.8105, epv: 5.872, sc: 100.0, sf: 39.7, ey0: 2143,
  capex: 24150000, rm: 373897, sav: 3606090, pb: 6.70, npv: 8545287, irr: 12.1, dpb: 14, lcoe: 1310, status: 'LAYAK', warns: []
});
full('TC-02', base({
  kwh_bulanan: Array(12).fill(1200), profil_siang: 'siang_dominan', daya_va: 7700, golongan_tarif: 'R3-6600+', jarak_dc: 20, jarak_ac: 15, capex_nilai: 13e6, rating_mcb_utama: 35,
  bidang: [
    { nama: 'A', jenis_atap: 'genteng_beton', azimut: 0, kemiringan: 20, panjang: 6, lebar: 4, luas_halangan: 0, status_struktur: 'baik', kelas_shading: 0 },
    { nama: 'B', jenis_atap: 'metal_spandek', azimut: 90, kemiringan: 20, panjang: 8, lebar: 5, luas_halangan: 0, status_struktur: 'baik', kelas_shading: 1 }]
}), {
  e_day: 39.452, e_siang: 23.671, cap: { A: [4, 'portrait', 3.4238, 4], B: [9, 'landscape', 3.1883, 9] }, inv: 'I6K', kwp: 7.475, dcac: 1.25,
  mppt: [[4, 1, 1], [9, 1, 1]], voc: 485.6, dc: [6, 1.06], ac: [40, 10, 0.75], spd: [582.7, 600], pr: 0.8185, epv: 24.473, sc: 96.7, sf: 60.0,
  ey0: 8933, capex: 97175000, rm: 523455, sav: 14683939, pb: 6.62, npv: 42004577, irr: 12.9, dpb: 11, lcoe: 1229, status: 'LAYAK', warns: []
});
full('TC-03', base({
  kwh_bulanan: Array(12).fill(1200), profil_siang: 'siang_dominan', daya_va: 13200, jumlah_fasa: 3, golongan_tarif: 'R3-6600+', jarak_dc: 20, jarak_ac: 15, capex_nilai: 13e6, rating_mcb_utama: 20,
  bidang: [{ nama: 'A', jenis_atap: 'genteng_beton', azimut: 0, kemiringan: 20, panjang: 10, lebar: 6, luas_halangan: 0, status_struktur: 'baik', kelas_shading: 0 }]
}), {
  e_day: 39.452, e_siang: 23.671, cap: { A: [16, 'portrait', 3.4238, 12] }, inv: 'I6K3P', kwp: 6.900, dcac: 1.15, mppt: [[12, 1, 1]],
  voc: 647.4, dc: [4, 0.53], ac: [16, 2.5, 0.50], spd: [776.9, 800], pr: 0.8266, epv: 23.956, sc: 98.8, sf: 60.0, ey0: 8744,
  capex: 89700000, rm: 897352, sav: 13705010, pb: 6.55, npv: 39264469, irr: 13.0, dpb: 11, lcoe: 1194, status: 'LAYAK', warns: []
});

console.log('== TC-04 batas string I4K');
var X = PLTS.makeCtx();
var mod = X.panels[0], i4 = X.inverters.filter(function (i) { return i.id === 'I4K'; })[0];
[[10, 53.95, 11, 45.46, 12], [0, 55.25, 10, 46.76, 11], [-5, 55.90, 10, 47.42, 11]].forEach(function (t) {
  var l = PLTS.stringLimits(mod, i4, t[0], 70, X.cfg);
  abs('Voc dingin ' + t[0], l.voc_cold, t[1], 0.005); eqI('Ns maks ' + t[0], l.ns_max, t[2]);
  abs('Vmp dingin ' + t[0], l.vmp_cold, t[3], 0.005); eqI('Ns MPPT ' + t[0], l.ns_mppt_max, t[4]);
  abs('Voc panas', l.voc_hot, 46.15, 0.005); abs('Vmp panas', l.vmp_hot, 37.63, 0.005); eqI('Ns min', l.ns_min, 3);
});

console.log('== TC-05 layout');
var g = PLTS.layoutCap({ jenis_atap: 'genteng_tanah_liat', panjang: 8, lebar: 5, luas_halangan: 0, status_struktur: 'baik' }, mod, X.cfg);
eqI('genteng cap', g.cap, 9); eqI('genteng ori', g.ori, 'landscape');
var d = PLTS.layoutCap({ jenis_atap: 'dak_beton', panjang: 10, lebar: 6, luas_halangan: 0, status_struktur: 'baik', tilt_pasang: 10 }, mod, X.cfg);
eqI('dak cap', d.cap, 16); eqI('dak ori', d.ori, 'portrait'); eqI('dak kolom', d.ncol, 8); eqI('dak baris', d.nrow, 2); abs('dak pitch', d.pitch, 3.092, 0.0005);
var t = PLTS.layoutCap({ jenis_atap: 'genteng_tanah_liat', panjang: 8, lebar: 5, luas_halangan: 0, status_struktur: 'tidak_layak' }, mod, X.cfg);
eqI('tidak layak cap', t.cap, 0);

console.log('== TC-06 mode penuh');
var r6 = PLTS.calculate(base({ mode_sizing: 'penuh' }));
rel('E_target', r6.load.e_target, 14.795, E); eqI('panel', r6.array.n_panel, 8); rel('kWp', r6.array.kwp, 4.60, E);
eqI('inverter', r6.inverter.id, 'I4K'); abs('DC/AC', r6.inverter.dcac, 1.15, 0.005);
rel('E_pv_hari', r6.production.e_pv_day, 15.886, E); abs('SC', r6.production.sc * 100, 41.9, 0.05); abs('SF', r6.production.sf * 100, 45.0, 0.05);
rel('Capex', r6.economics.capex, 64400000, RP); rel('Hemat', r6.economics.savings_y1, 4129858, RP);
abs('Payback', r6.economics.payback_simple, 15.6, 0.05); rel('NPV', r6.economics.npv, -30763271, RP); abs('IRR', r6.economics.irr * 100, 1.5, 0.1);
eqI('Payback terdiskonto', r6.economics.disc_payback_year, null);
eqI('Aturan', warns(r6).join(','), 'ECO-001,ECO-002,REG-004');

console.log('== TC-07 blocker & lookup');
var b7 = base(); b7.bidang[0].status_struktur = 'tidak_layak';
var r7 = PLTS.calculate(b7);
eqI('Aturan', warns(r7).join(','), 'INP-006,ROOF-001'); eqI('Status', r7.status, 'TIDAK LAYAK DIPROSES');
ok('Tanpa rekomendasi', !r7.inverter && !r7.economics, null, null);
abs('F_orient 0/20', PLTS.fOrient(0, 20, -7), 1.00, 1e-9); abs('F_orient 90/20', PLTS.fOrient(90, 20, -7), 0.96, 1e-9);
abs('F_orient 180/20', PLTS.fOrient(180, 20, -7), 0.95, 1e-9); abs('F_orient 270/35', PLTS.fOrient(270, 35, -7), 0.88, 1e-9);
abs('F_orient 180/35', PLTS.fOrient(180, 35, -7), 0.80, 1e-9); abs('F_orient 0/20 lat+1', PLTS.fOrient(0, 20, 1), 0.95, 1e-9);
abs('rho 70', PLTS.rho(X.cfg), 0.020939, 0.0000005);
abs('PR sizing', PLTS.prDetailed(mod, 0.975, 0.015, 0.005, X.cfg), 0.8152, 0.00005);

console.log('== Tambahan: aturan lain');
var rx = PLTS.calculate(base({ jumlah_fasa: 3 }));
ok('INP-002', rx.rules.some(function (q) { return q.id === 'INP-002'; }), warns(rx), 'INP-002');
var ry = PLTS.calculate(base({ kuota_up3: 'belum_diketahui', tahanan_grounding: '', lps_eksisting: 'ya', capex_nilai: '' }));
eqI('Aturan', warns(ry).join(','), 'GND-002,INP-008,LPS-001,REG-001b'); eqI('Status', ry.status, 'LAYAK DENGAN CATATAN');
var rz = PLTS.calculate(base(), PLTS.makeCtx({}));
eqI('ctx ternormalisasi dipakai ulang', rz.array && rz.array.kwp, 1.7249999999999999);
ok('Sensitivitas 7 skenario', PLTS.calculate(base()).sensitivity.length === 7, null, 7);

console.log('\n' + pass + ' lolos, ' + fail + ' gagal');
process.exit(fail ? 1 : 0);

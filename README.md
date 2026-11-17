# Kalkulator Survey PLTS Residensial

Analisis cepat PLTS atap on-grid residensial (1 dan 3 fasa) sesuai **PRD Aturan Teknis Kalkulator Survey PLTS Residensial v1**:
sizing dari tagihan, layout panel per bidang atap, pemilihan inverter dan string, kabel dan proteksi, produksi, ekonomi,
rules engine (PASS / WARN / BLOCKER), sensitivitas, dan BoQ indikatif.

```
 ┌──────────────────────┐  google.script.run    ┌───────────────────────┐   baca/tulis   ┌──────────────────────┐
 │ Aplikasi web         │ ────────────────────▶ │ Apps Script Web App   │ ─────────────▶ │ Google Sheet         │
 │ (Index.html, dibuka  │ ◀──────────────────── │ Code.gs               │ ◀───────────── │ Config, katalog,     │
 │  dari URL /exec)     │      JSON             │ (hitung ulang + simpan)│                │ Survey, RuleLog      │
 └──────────────────────┘                       └───────────────────────┘                └──────────────────────┘
```

Semua gratis: cukup akun Google. GitHub hanya menyimpan kode. Hosting di GitHub Pages opsional (lihat bagian akhir).

- **Satu engine**: `web/engine.js` berisi semua rumus. `apps-script/Engine.gs` adalah salinan identiknya
  (`node scripts/sync-engine.js`). Browser menghitung instan untuk preview; saat disimpan, server menghitung ulang
  dengan config Sheet, jadi angka yang tersimpan selalu dari server.
- **Semua asumsi di Sheet** (`Config`, `Orientasi`, `Tarif`, `Wilayah`, `Kabel`, `HargaBoQ`), bukan di kode.
- **Audit**: tiap survey menyimpan `config_version` (hash isi config + katalog). Snapshot lengkap disimpan sekali di
  sheet `ConfigSnapshot`, jadi survey lama bisa dihitung ulang persis (menu **PLTS › Audit**).
- **Tanpa Sheet** web tetap jalan offline dengan default PRD dan katalog **fixture fiktif**.

## Struktur

| Path | Isi |
|---|---|
| `web/` | Situs statis: `index.html`, `app.js` (UI), `engine.js` (rumus), `style.css` |
| `apps-script/` | Sumber server: `Code.gs` (API + halaman), `Setup.gs` (membuat sheet), `Engine.gs` (salinan engine) |
| `deploy/` | **2 file siap tempel** ke Apps Script: `Code.gs` (semua kode server) dan `Index.html` (aplikasi web). Dibuat oleh `npm run build` |
| `tests/run-tests.js` | Kasus uji PRD bagian 11 (TC-01 s/d TC-07) — 178 cek |
| `reference/plts_ref.py` | Implementasi referensi Python |
| `.github/workflows/ci-pages.yml` | Jalankan uji, cek Engine.gs sinkron, deploy `web/` ke GitHub Pages |

## Setup

### 1. Google Sheet + Apps Script (gratis)

1. Buka https://sheets.new → beri nama, misalnya *PLTS Survey*.
2. **Extensions › Apps Script**. Di file `Code.gs`, hapus isinya lalu tempel seluruh isi `deploy/Code.gs`. Simpan (Ctrl+S).
3. Klik **+** di samping *Files* › **HTML**, beri nama `Index` (tanpa `.html`). Hapus isinya, tempel `deploy/Index.html`. Simpan.
4. Di toolbar pilih fungsi `setupSheets` › **Run**. Izinkan akses (*Advanced › Go to … (unsafe)* wajar untuk skrip milik sendiri).
   Kembali ke tab Sheet: sheet Config, Panel, Inverter, dst. sudah terisi.
5. **Deploy › New deployment** › ikon ⚙ › **Web app**. *Execute as*: **Me**. *Who has access*: **Anyone with Google account**
   (atau **Anyone** bila surveyor tidak punya akun Google). **Deploy**, lalu salin URL `/exec`.
6. Buka URL itu di HP/laptop: aplikasi tampil dan langsung terhubung ke Sheet. Simpan sebagai bookmark / *Add to Home screen*.

Setelah kode berubah: tempel ulang kedua file, lalu **Deploy › Manage deployments › ✏ › Version: New version › Deploy**
(URL tetap sama).

(Alternatif tanpa tempel manual: `clasp` — `npx @google/clasp login`, `clasp create --type sheets`, salin `deploy/*` ke
folder rootDir, `clasp push`.)

### 2. Isi data

Isi sheet:
   - `Panel` dan `Inverter`: **ganti fixture fiktif dengan produk nyata** (kolom `aktif` = `tidak` untuk menonaktifkan).
     `eff` boleh persen (97,5) atau fraksi (0,975).
   - `Wilayah`: PSH per lokasi dari Global Solar Atlas / PVGIS; `f1..f12` opsional (profil bulanan, dinormalkan otomatis).
   - `Tarif`: tambah baris baru dengan `tanggal_berlaku` tiap triwulan (baris lama jangan dihapus).
   - `Config`: ubah nilai dengan **menambah baris** key yang sama, `versi` lebih tinggi, dan `tanggal_berlaku`.
     Persen ditulis sebagai fraksi (3% = `0.03`).
   - `Kabel` (`harga_m`) dan `HargaBoQ`: harga untuk BoQ. Kosong = "perlu harga", tidak masuk total.
### 3. (Opsional) Hosting tambahan di GitHub Pages

Butuh GitHub Actions aktif di akun. **Settings › Pages › Source: GitHub Actions**, lalu tab **Actions › Uji & deploy web ›
Run workflow**. Di situs `github.io` buka ⚙ → tempel URL `/exec` (+ token bila `API_TOKEN` diisi) → Simpan.

Lokal: `npm run serve` lalu buka http://localhost:8765.

## Mengubah rumus

1. Edit `web/engine.js`.
2. `npm test` (wajib lolos — toleransi PRD: integer persis, energi/kWp ±0,1%, rupiah ±0,5%, IRR ±0,1 poin).
3. `npm run build` → tempel ulang `deploy/Code.gs` dan `deploy/Index.html` → deploy versi baru.
4. Naikkan `?v=` di `web/index.html` dan `engineVersion` di engine agar cache browser ter-refresh dan survey tercatat versinya.

## Catatan keamanan

Siapa pun yang tahu URL `/exec` bisa membuka aplikasi dan menyimpan/membaca survey. Bagikan URL hanya ke surveyor.
Pilih akses *Anyone with Google account* agar pengunjung minimal harus login Google. `API_TOKEN` (Script properties)
hanya melindungi akses API dari luar (mis. versi GitHub Pages), bukan halaman yang dibuka dari URL `/exec` itu sendiri.
Autentikasi penuh di luar ruang lingkup v1.

## Daftar verifikasi sebelum produksi (PRD bagian 12)

Angka bertanda *(asumsi)* di `Config` — PSH, F_orient, f_day, soiling, mismatch, ketersediaan, KHA kabel dan derating,
faktor 1,25 / 1,4 / 1,2, ambang pembumian 5 Ω, rekening minimum 40 jam, batas inverter 1 fasa 5 kW — wajib
diverifikasi terhadap Permen ESDM 2/2024, PUIL 2020, IEC 62548-1, dan datasheet sebelum dipakai untuk penawaran.

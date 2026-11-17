# Kalkulator Survey PLTS Residensial

Analisis cepat PLTS atap on-grid residensial (1 dan 3 fasa) sesuai **PRD Aturan Teknis Kalkulator Survey PLTS Residensial v1**:
sizing dari tagihan, layout panel per bidang atap, pemilihan inverter dan string, kabel dan proteksi, produksi, ekonomi,
rules engine (PASS / WARN / BLOCKER), sensitivitas, dan BoQ indikatif.

```
 ┌──────────────────────┐   fetch (GET/POST)    ┌───────────────────────┐   baca/tulis   ┌──────────────────────┐
 │ Web statis           │ ────────────────────▶ │ Apps Script Web App   │ ─────────────▶ │ Google Sheet         │
 │ GitHub Pages (web/)  │ ◀──────────────────── │ Code.gs + Engine.gs   │ ◀───────────── │ Config, katalog,     │
 │ engine.js (preview)  │      JSON             │ (hitung ulang + simpan)│                │ Survey, RuleLog      │
 └──────────────────────┘                       └───────────────────────┘                └──────────────────────┘
```

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
| `apps-script/` | `Code.gs` (API), `Setup.gs` (membuat sheet), `Engine.gs` (salinan engine), `appsscript.json` |
| `tests/run-tests.js` | Kasus uji PRD bagian 11 (TC-01 s/d TC-07) — 178 cek |
| `reference/plts_ref.py` | Implementasi referensi Python |
| `.github/workflows/ci-pages.yml` | Jalankan uji, cek Engine.gs sinkron, deploy `web/` ke GitHub Pages |

## Setup

### 1. Google Sheet + Apps Script

1. Buat Google Sheet baru → **Extensions › Apps Script**.
2. Buat file `Code`, `Setup`, `Engine` lalu tempel isi `apps-script/Code.gs`, `Setup.gs`, `Engine.gs`.
   Di **Project Settings** centang *Show "appsscript.json"* dan tempel `apps-script/appsscript.json`.
   (Alternatif: `npm i -g @google/clasp`, `clasp clone <scriptId>` ke folder `apps-script/`, lalu `clasp push`.)
3. Jalankan fungsi `setupSheets` sekali (izinkan akses). Muat ulang Sheet; menu **PLTS** muncul.
4. Isi sheet:
   - `Panel` dan `Inverter`: **ganti fixture fiktif dengan produk nyata** (kolom `aktif` = `tidak` untuk menonaktifkan).
     `eff` boleh persen (97,5) atau fraksi (0,975).
   - `Wilayah`: PSH per lokasi dari Global Solar Atlas / PVGIS; `f1..f12` opsional (profil bulanan, dinormalkan otomatis).
   - `Tarif`: tambah baris baru dengan `tanggal_berlaku` tiap triwulan (baris lama jangan dihapus).
   - `Config`: ubah nilai dengan **menambah baris** key yang sama, `versi` lebih tinggi, dan `tanggal_berlaku`.
     Persen ditulis sebagai fraksi (3% = `0.03`).
   - `Kabel` (`harga_m`) dan `HargaBoQ`: harga untuk BoQ. Kosong = "perlu harga", tidak masuk total.
5. (Opsional) **Project Settings › Script properties**: `API_TOKEN` = string acak. Web wajib mengisi token yang sama.
6. **Deploy › New deployment › Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Salin URL `/exec`.
   Setelah mengubah kode, pakai **Manage deployments › Edit › New version** agar URL tetap sama.

### 2. Web di GitHub

1. Buat repo, push folder ini ke branch `main`.
2. **Settings › Pages › Source: GitHub Actions**. Workflow akan menjalankan uji lalu mempublikasi `web/`.
3. Buka situs → ⚙ → tempel URL `/exec` (+ token) → **Tes koneksi** → Simpan.

Lokal: `npm run serve` lalu buka http://localhost:8765.

## Mengubah rumus

1. Edit `web/engine.js`.
2. `npm test` (wajib lolos — toleransi PRD: integer persis, energi/kWp ±0,1%, rupiah ±0,5%, IRR ±0,1 poin).
3. `npm run sync` → tempel ulang `Engine.gs` ke Apps Script (atau `clasp push`) → deploy versi baru.
4. Naikkan `?v=` di `web/index.html` dan `engineVersion` di engine agar cache browser ter-refresh dan survey tercatat versinya.

## Catatan keamanan

Web App "Anyone" berarti siapa pun yang tahu URL bisa memanggil API. Isi `API_TOKEN` jika data pelanggan sensitif.
Token disimpan di `localStorage` perangkat surveyor; ini bukan autentikasi penuh (di luar ruang lingkup v1).

## Daftar verifikasi sebelum produksi (PRD bagian 12)

Angka bertanda *(asumsi)* di `Config` — PSH, F_orient, f_day, soiling, mismatch, ketersediaan, KHA kabel dan derating,
faktor 1,25 / 1,4 / 1,2, ambang pembumian 5 Ω, rekening minimum 40 jam, batas inverter 1 fasa 5 kW — wajib
diverifikasi terhadap Permen ESDM 2/2024, PUIL 2020, IEC 62548-1, dan datasheet sebelum dipakai untuk penawaran.

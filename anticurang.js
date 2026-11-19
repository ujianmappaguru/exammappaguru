"use strict";
// =====================================================================
//  ANTI CURANG SISWA
//  Dipakai portal siswa (siswa.html) saat mengerjakan ujian.
//
//  Yang dilakukan:
//   - Layar penuh (Android/iPad/laptop). iPhone tidak mendukung layar penuh
//     di Safari, jadi siswa diarahkan memakai "Tambah ke Layar Utama".
//   - Deteksi pindah aplikasi/tab, kehilangan fokus, split-screen/jendela
//     mengambang, keluar layar penuh.
//   - GPS: lokasi dicek di SERVER terhadap titik & radius dari admin.
//   - Satu akun = satu perangkat selama ujian.
//   - Blok salin/tempel/klik kanan/cetak/refresh tidak sengaja/tombol Back.
//   - Layar tetap menyala (Wake Lock) agar HP tidak mati sendiri.
//   - Laporan ringan ke server tiap ~45 detik (acak, supaya tidak serempak).
//
//  Batas teknis (web tidak bisa memblokir aplikasi lain): sistem ini
//  MENDETEKSI, MEMPERINGATKAN, MENCATAT, lalu menindak sesuai pengaturan admin.
// =====================================================================

const AC = {
  cfg: null,            // pengaturan dari server (null = fitur tidak ada / nonaktif)
  cfgWaktu: 0,
  sesi: null,           // hasil cek_syarat_ujian
  aktif: false,
  ujianId: null,
  opsi: null,
  pelanggaran: 0,       // nilai dari server
  terbang: 0,           // pelanggaran yang sedang dikirim (belum dikonfirmasi server)
  maks: 3,
  aksi: "kumpul",
  intervalMs: 45000,
  antre: [],            // kejadian belum terkirim
  kondisi: { ambil_alih: false, gps: false, layar_penuh: false, peringatan: "", kumpul: false, info_iphone: false },
  jenisOverlay: null,
  pelepas: [],
  mengirim: false,
  kirimLagi: false,
  gpsGagal: 0,
  gpsMati: false,       // 3x gagal membaca GPS berturut-turut
  gpsKode: null,        // sebab gagal baca GPS terakhir: ditolak | tidak_tersedia | timeout | https | tidak_didukung
  lokTerakhir: null,    // {lat,lng,akurasi,t} bacaan GPS terakhir (hanya untuk tampilan peta, tidak dikirim ke server)
  lokLuar: false,       // server menyatakan di luar area
  jarak: null,
  lastHitung: 0,
  lastSalin: 0,
};

const AC_HITUNG = ["pindah_aplikasi", "kehilangan_fokus", "keluar_layar_penuh", "layar_terbagi", "keluar_area", "lompat_lokasi", "gps_mati"];
const acHitung = (j) => AC_HITUNG.includes(j);

const AC_ALASAN = {
  pindah_aplikasi: "Anda meninggalkan halaman ujian atau berpindah aplikasi/tab.",
  kehilangan_fokus: "Jendela ujian kehilangan fokus (ada aplikasi atau jendela lain yang aktif).",
  keluar_layar_penuh: "Anda keluar dari mode layar penuh.",
  layar_terbagi: "Layar terbagi (split-screen) atau jendela mengambang terdeteksi.",
  keluar_area: "Anda berada di luar area ujian.",
  lompat_lokasi: "Lokasi berpindah secara tidak wajar (kemungkinan aplikasi lokasi palsu).",
  gps_mati: "GPS tidak aktif atau lokasi tidak dapat dibaca.",
};

// ---------------------------------------------------------------------
//  Deteksi perangkat & kemampuan
// ---------------------------------------------------------------------
const acAcak = () => (window.crypto && crypto.getRandomValues
  ? Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")
  : Math.random().toString(36).slice(2) + Date.now().toString(36));

function acDevId() {
  try {
    let v = localStorage.getItem("ac_dev");
    if (!v) { v = acAcak(); localStorage.setItem("ac_dev", v); }
    return v;
  } catch (_) {
    return AC._devMem || (AC._devMem = acAcak());
  }
}

// Hanya untuk aplikasi yang DIPASANG (Tambah ke Layar Utama / PWA).
// Jangan menyertakan "(display-mode: fullscreen)": media query itu juga menyala saat
// halaman masuk layar penuh lewat Fullscreen API, sehingga sistem salah mengira
// siswa memakai aplikasi terpasang dan menonaktifkan pemeriksaan layar penuh.
function acStandalone() {
  return !!(navigator.standalone ||
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
}
const acIphone = () => /iPhone|iPod/.test(navigator.userAgent || "");

function acInfoPerangkat() {
  const u = navigator.userAgent || "";
  const os = /Android/i.test(u) ? "Android"
    : /iPhone|iPod/.test(u) ? "iPhone"
    : (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) ? "iPad"
    : /Windows/.test(u) ? "Windows" : /Mac OS X/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "Lainnya";
  const br = /SamsungBrowser/.test(u) ? "Samsung Internet"
    : /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera"
    : /Firefox|FxiOS/.test(u) ? "Firefox" : /CriOS|Chrome/.test(u) ? "Chrome"
    : /Safari/.test(u) ? "Safari" : "Browser";
  return `${os} · ${br}${acStandalone() ? " (aplikasi)" : ""}`;
}

function acFsDidukung() {
  const d = document, e = d.documentElement;
  return !!((d.fullscreenEnabled || d.webkitFullscreenEnabled) && (e.requestFullscreen || e.webkitRequestFullscreen));
}
const acFsAktif = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || acStandalone();

async function acMintaFs() {
  const e = document.documentElement;
  try {
    if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: "hide" });
    else if (e.webkitRequestFullscreen) e.webkitRequestFullscreen();
  } catch (_) { /* ditolak browser: overlay akan meminta lagi */ }
}

function acKeluarFs() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (_) { /* abaikan */ }
}

async function acPastikanWakeLock() {
  try {
    if (!navigator.wakeLock || AC.wake) return;
    AC.wake = await navigator.wakeLock.request("screen");
    AC.wake.addEventListener("release", () => { AC.wake = null; });
  } catch (_) { /* tidak didukung / ditolak */ }
}
function acLepasWakeLock() {
  try { if (AC.wake) AC.wake.release(); } catch (_) { /* abaikan */ }
  AC.wake = null;
}

const acSedangMengetik = () => {
  const a = document.activeElement;
  return !!a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT" || a.tagName === "SELECT" || a.isContentEditable);
};

// ---------------------------------------------------------------------
//  GPS
// ---------------------------------------------------------------------
function acPesanGps(kode) {
  if (kode === 1) return "Izin lokasi ditolak. Buka pengaturan browser, izinkan akses lokasi untuk situs ini, lalu coba lagi.";
  if (kode === 2) return "Lokasi tidak tersedia. Aktifkan GPS (layanan lokasi) di perangkat Anda lalu coba lagi.";
  return "Lokasi terlalu lama dibaca. Pindah ke tempat terbuka/dekat jendela lalu coba lagi.";
}

function acAmbilLokasi({ tinggi = false } = {}) {
  return new Promise((res, rej) => {
    if (!window.isSecureContext) return rej(Object.assign(new Error("GPS hanya berfungsi lewat alamat HTTPS."), { kode: "https" }));
    if (!navigator.geolocation) return rej(Object.assign(new Error("Browser ini tidak mendukung GPS. Gunakan Chrome (Android) atau Safari (iPhone)."), { kode: "tidak_didukung" }));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }),
      (e) => rej(Object.assign(new Error(acPesanGps(e.code)), { kode: e.code === 1 ? "ditolak" : e.code === 2 ? "tidak_tersedia" : "timeout" })),
      { enableHighAccuracy: !!tinggi, timeout: tinggi ? 20000 : 10000, maximumAge: tinggi ? 0 : 60000 }
    );
  });
}

// Format jarak mudah dibaca: 850 m / 1,3 km
function acFmtJarak(m) {
  const n = Math.max(0, Number(m) || 0);
  return n >= 1000
    ? n / 1000 < 10 ? (n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " km" : Math.round(n / 1000).toLocaleString("id-ID") + " km"
    : Math.round(n).toLocaleString("id-ID") + " m";
}

const acPerangkatIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent || "")
  || (/Macintosh/.test(navigator.userAgent || "") && navigator.maxTouchPoints > 1);

// Diagnosa GPS yang ramah siswa: apa masalahnya + langkah memperbaiki (sesuai perangkat).
// kunci: ditolak | tidak_tersedia | timeout | https | tidak_didukung (dari browser)
//        di_luar_area | akurasi_rendah | lokasi_tidak_valid | titik_belum_diatur | tanpa_lokasi (dari server)
// d: { jarak, radius, akurasi, akurasiMaks } (opsional)
function acDiagnosaGps(kunci, d = {}) {
  const ios = acPerangkatIos();
  switch (kunci) {
    case "ditolak":
      return {
        ikon: "🚫", judul: "Izin lokasi ditolak",
        isi: "Browser belum diizinkan membaca lokasi Anda, sedangkan ujian ini <b>mewajibkan GPS</b>.",
        langkah: ios
          ? ["Buka <b>Pengaturan</b> → <b>Privasi &amp; Keamanan</b> → <b>Layanan Lokasi</b>, pastikan aktif.",
             "Pilih <b>Safari</b> (atau browser yang dipakai) → pilih <b>Saat Menggunakan App</b>, aktifkan <b>Lokasi Akurat</b>.",
             "Kembali ke halaman ini lalu ketuk <b>Coba Lagi</b>."]
          : ["Ketuk ikon <b>gembok</b> / <b>pengaturan</b> di sebelah alamat situs.",
             "Pilih <b>Izin</b> → <b>Lokasi</b> → <b>Izinkan</b>.",
             "Muat ulang halaman, lalu ketuk <b>Coba Lagi</b>."],
      };
    case "tidak_tersedia":
      return {
        ikon: "📡", judul: "GPS belum aktif",
        isi: "Layanan lokasi di perangkat Anda <b>mati</b> atau belum menemukan sinyal.",
        langkah: ios
          ? ["Buka <b>Pengaturan</b> → <b>Privasi &amp; Keamanan</b> → <b>Layanan Lokasi</b> → aktifkan.",
             "Matikan <b>Mode Daya Rendah</b> bila menyala.",
             "Kembali ke halaman ini lalu ketuk <b>Coba Lagi</b>."]
          : ["Geser panel notifikasi dari atas layar, lalu ketuk <b>Lokasi / GPS</b> sampai menyala.",
             "Bila ada pilihan mode, pilih <b>Akurasi tinggi</b> dan matikan <b>Penghemat Baterai</b>.",
             "Kembali ke halaman ini lalu ketuk <b>Coba Lagi</b>."],
      };
    case "timeout":
      return {
        ikon: "⏳", judul: "Lokasi belum berhasil dibaca",
        isi: "GPS aktif, tetapi posisi Anda belum terbaca. Biasanya karena sinyal lemah di dalam ruangan.",
        langkah: ["Pindah ke <b>dekat jendela</b> atau area terbuka.",
                  "Tunggu sekitar 20 detik, lalu ketuk <b>Coba Lagi</b>.",
                  "Jika berulang, matikan lalu nyalakan kembali GPS."],
      };
    case "https":
      return {
        ikon: "🔒", judul: "Alamat situs belum aman (HTTPS)",
        isi: "Browser hanya mengizinkan GPS pada alamat yang diawali <b>https://</b>. Hubungi pengawas ujian untuk mendapatkan alamat yang benar.",
        langkah: [],
      };
    case "tidak_didukung":
      return {
        ikon: "🌐", judul: "Browser tidak mendukung GPS",
        isi: "Buka ujian memakai <b>Chrome</b> (Android) atau <b>Safari</b> (iPhone), lalu coba lagi.",
        langkah: [],
      };
    case "akurasi_rendah":
      return {
        ikon: "📶", judul: "Sinyal GPS kurang akurat",
        isi: d.akurasi && d.akurasiMaks
          ? `Ketelitian GPS Anda sekitar <b>±${esc(acFmtJarak(d.akurasi))}</b>, sedangkan batas yang diizinkan <b>±${esc(acFmtJarak(d.akurasiMaks))}</b>.`
          : "Ketelitian GPS perangkat Anda belum cukup untuk memastikan lokasi.",
        langkah: ["Pindah ke <b>dekat jendela</b> atau area terbuka.",
                  ios ? "Aktifkan <b>Lokasi Akurat</b> untuk browser di Pengaturan → Privasi → Layanan Lokasi."
                      : "Pastikan GPS pada mode <b>Akurasi tinggi</b> (bukan hanya jaringan/Wi-Fi).",
                  "Tunggu 10–20 detik, lalu ketuk <b>Coba Lagi</b>."],
      };
    case "lokasi_tidak_valid":
      return {
        ikon: "🛰️", judul: "Lokasi tidak valid terdeteksi",
        isi: "Lokasi yang terbaca tidak wajar. Ini sering terjadi bila ada aplikasi <b>lokasi palsu (fake GPS)</b> atau opsi pengembang <i>mock location</i> aktif.",
        langkah: ["Matikan/uninstall aplikasi lokasi palsu dan nonaktifkan <i>Mock location</i> di Opsi Pengembang.",
                  "Mulai ulang browser, lalu ketuk <b>Coba Lagi</b>."],
      };
    case "titik_belum_diatur":
      return {
        ikon: "⚙️", judul: "Lokasi ujian belum diatur",
        isi: "Admin belum menentukan titik lokasi ujian. Bukan kesalahan Anda — <b>hubungi pengawas ujian</b>.",
        langkah: [],
      };
    case "di_luar_area": {
      const jarak = Number(d.jarak), radius = Number(d.radius);
      const ada = Number.isFinite(jarak) && Number.isFinite(radius) && jarak > 0 && radius > 0;
      return {
        ikon: "📍", judul: "Anda berada di luar area ujian",
        isi: ada
          ? `Posisi Anda sekitar <b>${esc(acFmtJarak(jarak))}</b> dari titik ujian. Batas yang diizinkan <b>${esc(acFmtJarak(radius))}</b>, jadi Anda perlu mendekat sekitar <b>${esc(acFmtJarak(Math.max(0, jarak - radius)))}</b> lagi.`
          : "Posisi Anda berada di luar area ujian yang ditentukan sekolah.",
        langkah: ["Menuju <b>area / ruang ujian</b> di sekolah.",
                  "Sudah di sekolah tapi tetap ditolak? Ketuk <b>Coba Lagi</b> setelah 10–20 detik di tempat terbuka/dekat jendela (GPS kadang meleset).",
                  "Bila masih gagal, <b>lapor ke pengawas</b>."],
      };
    }
    default:
      return {
        ikon: "📍", judul: "Lokasi belum terbaca",
        isi: "Lokasi Anda belum dapat dipastikan. Ujian ini mewajibkan GPS aktif.",
        langkah: ["Aktifkan GPS dan izinkan akses lokasi untuk situs ini.", "Ketuk <b>Coba Lagi</b>."],
      };
  }
}

const acLangkahHtml = (l) => (l && l.length ? `<ol class="ac-langkah">${l.map((x) => `<li>${x}</li>`).join("")}</ol>` : "");

// Error berpesan + diagnosa terstruktur (dipakai layar "tidak dapat membuka ujian")
const acErrGps = (info, pesan) => Object.assign(new Error(pesan), { gpsInfo: info });

// Kartu masalah lokasi (sebelum ujian dibuka). Tombol #ac-coba-lagi dipasang oleh pemanggil.
AC.htmlMasalahLokasi = function (info) {
  return `<div class="kosong ac-masalah">
    <div class="ac-ikon" aria-hidden="true">${info.ikon}</div>
    <h3>${esc(info.judul)}</h3>
    <p class="ac-isi">${info.isi}</p>
    ${acLangkahHtml(info.langkah)}
    <div class="ac-aksi-baris">
      <button class="btn btn-primary" type="button" id="ac-coba-lagi">Coba Lagi</button>
      <a class="btn" href="#ujian">&larr; Kembali ke Daftar Ujian</a>
    </div>
  </div>`;
};

// ---------------------------------------------------------------------
//  Peta mini: digambar lokal dengan SVG (tanpa layanan peta luar, tanpa iframe,
//  tanpa pustaka, tanpa panggilan server). Hanya tampilan; penentu tetap server.
// ---------------------------------------------------------------------
const AC_ARAH = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];
const acNamaArah = (derajat) => AC_ARAH[Math.round(derajat / 45) % 8];

// Selisih posisi dalam meter (cukup akurat untuk jarak sekolah)
function acPosisi(lok, cfg) {
  const dx = (lok.lng - cfg.gps_lng) * Math.cos(cfg.gps_lat * Math.PI / 180) * 111320; // ke timur dari titik ujian
  const dy = (lok.lat - cfg.gps_lat) * 110574;                                         // ke utara dari titik ujian
  return {
    dx, dy,
    jarak: Math.sqrt(dx * dx + dy * dy),
    sudut: (Math.atan2(-dx, -dy) * 180 / Math.PI + 360) % 360, // arah dari siswa MENUJU titik ujian
  };
}

function acPetaTersedia() {
  const c = AC.cfg;
  return !!(c && c.aktif && c.wajib_gps && c.gps_lat != null && c.gps_lng != null);
}
AC.petaTersedia = acPetaTersedia;

function acSvgPeta(p, radius, akurasi, kelasMurid) {
  const C = 110;
  const ref = Math.max(radius, Math.min(p.jarak, radius * 3));
  const s = 78 / ref;
  let px = p.dx * s, py = -p.dy * s;
  const px2 = Math.hypot(px, py);
  if (px2 > 92) { px *= 92 / px2; py *= 92 / px2; } // terlalu jauh: titik ditempel di tepi peta
  const rAkur = Math.min(60, (Number(akurasi) || 0) * s);
  return `<svg viewBox="0 0 220 220" role="img" aria-label="Peta mini posisi Anda terhadap area ujian">
    <circle class="pm-bg" cx="${C}" cy="${C}" r="106"/>
    <line class="pm-garis" x1="${C}" y1="22" x2="${C}" y2="198"/><line class="pm-garis" x1="22" y1="${C}" x2="198" y2="${C}"/>
    <text class="pm-u" x="${C}" y="17" text-anchor="middle">U</text>
    <circle class="pm-area" cx="${C}" cy="${C}" r="${(radius * s).toFixed(1)}"/>
    <text x="${C}" y="${C}" text-anchor="middle" dominant-baseline="central" font-size="17">🏫</text>
    <line class="pm-tali" x1="${C}" y1="${C}" x2="${(C + px).toFixed(1)}" y2="${(C + py).toFixed(1)}"/>
    ${rAkur > 3 ? `<circle class="pm-akur" cx="${(C + px).toFixed(1)}" cy="${(C + py).toFixed(1)}" r="${rAkur.toFixed(1)}"/>` : ""}
    <circle class="pm-murid ${kelasMurid}" cx="${(C + px).toFixed(1)}" cy="${(C + py).toFixed(1)}" r="6.5"/>
  </svg>`;
}

// lok: {lat,lng,akurasi}; ringkas=true -> hanya gambar + arah (untuk layar kunci)
function acHtmlPeta(lok, cfg, { ringkas = false } = {}) {
  const radius = Number(cfg.gps_radius_m) || 200;
  const akurMaks = Number(cfg.gps_akurasi_maks_m) || 150;
  const akur = Number(lok.akurasi) || 0;
  const p = acPosisi(lok, cfg);
  const dalam = p.jarak <= radius;
  const pastiLuar = !dalam && p.jarak - akur > radius;
  const kurangAkurat = akur > akurMaks;

  let kelas, chip;
  if (pastiLuar) { kelas = "luar"; chip = '<span class="pm-chip luar">✗ Anda berada di luar area ujian</span>'; }
  else if (kurangAkurat) { kelas = "warn"; chip = `<span class="pm-chip warn">⚠ Sinyal GPS kurang akurat (±${esc(acFmtJarak(akur))})</span>`; }
  else if (dalam) { kelas = "dalam"; chip = '<span class="pm-chip ok">✓ Anda berada di dalam area ujian</span>'; }
  else { kelas = "luar"; chip = '<span class="pm-chip luar">✗ Anda berada di luar area ujian</span>'; }

  const arah = acNamaArah(p.sudut);
  let ket = "";
  if (ringkas) {
    if (!dalam) ket = `<p class="pm-ket">Titik ujian ada di arah <b>${arah}</b> dari Anda.</p>`;
  } else {
    ket = `<p class="pm-ket">Jarak dari titik ujian <b>${esc(acFmtJarak(p.jarak))}</b> · batas area <b>${esc(acFmtJarak(radius))}</b>`
      + (!dalam ? `<br>Titik ujian ada di arah <b>${arah}</b> dari Anda. Dekati sekitar <b>${esc(acFmtJarak(Math.max(0, p.jarak - radius)))}</b> lagi.` : "")
      + (kurangAkurat ? `<br>Batas ketelitian yang diizinkan ±${esc(acFmtJarak(akurMaks))}. Pindah ke dekat jendela atau area terbuka.` : "")
      + `</p><p class="pm-legenda"><span class="pm-tanda murid"></span> Posisi Anda &nbsp;<span class="pm-tanda area"></span> Area ujian &nbsp;· Atas = utara</p>`
      + `<p class="pm-legenda">Peta hanya gambaran. Penentu akhir adalah pemeriksaan sistem saat ujian.</p>`;
  }
  return `<div class="peta-kotak">${acSvgPeta(p, radius, akur, kelas)}<div class="pm-teks">${chip}${ket}</div></div>`;
}

// SEBELUM ujian: baca GPS sekali di perangkat (tanpa server) lalu gambar peta di elemen el.
// Sekaligus meminta izin lokasi lebih awal, jadi siswa tidak kaget saat ujian dibuka.
AC.isiPetaAwal = function (el) {
  if (!el || !acPetaTersedia()) return;
  const cfg = AC.cfg;
  const muat = async () => {
    el.innerHTML = '<div class="peta-kotak"><div class="memuat" style="padding:.6rem 0">Memeriksa lokasi Anda… izinkan akses lokasi bila diminta.</div></div>';
    try {
      const lok = await acAmbilLokasi({ tinggi: true });
      if (!el.isConnected) return;
      AC.lokTerakhir = { lat: lok.lat, lng: lok.lng, akurasi: lok.akurasi, t: Date.now() };
      el.innerHTML = acHtmlPeta(lok, cfg);
    } catch (e) {
      if (!el.isConnected) return;
      const info = acDiagnosaGps(e && e.kode);
      el.innerHTML = `<div class="peta-kotak peta-galat"><div class="pm-teks"><b>${info.ikon} ${esc(info.judul)}</b><p class="pm-ket">${info.isi}</p></div>${acLangkahHtml(info.langkah)}<button class="btn btn-kecil" type="button" data-peta-ulang>Cek Lokasi Lagi</button></div>`;
    }
    const b = el.querySelector("[data-peta-ulang]");
    if (b) b.onclick = muat;
  };
  muat();
};

// SAAT ujian: jendela peta dari bacaan terakhir. "Perbarui" hanya membaca GPS di perangkat
// (tidak mengirim apa pun ke server, tidak menambah pelanggaran).
AC.tampilPeta = function () {
  if (!acPetaTersedia()) return;
  const cfg = AC.cfg;
  const m = tampilModal("Posisi Anda saat ini", '<div id="peta-modal"></div>', {
    aksi: [
      {
        label: "Perbarui Lokasi",
        onClick: async () => {
          try {
            const lok = await acAmbilLokasi({ tinggi: true });
            AC.lokTerakhir = { lat: lok.lat, lng: lok.lng, akurasi: lok.akurasi, t: Date.now() };
            gambar();
          } catch (e) {
            toast(acDiagnosaGps(e && e.kode).judul + ". Aktifkan GPS lalu coba lagi.", "error");
          }
          return false; // jendela tetap terbuka
        },
      },
      { label: "Tutup", kelas: "btn-primary" },
    ],
  });
  function gambar() {
    const k = m.body.querySelector("#peta-modal");
    if (!k) return;
    const l = AC.lokTerakhir;
    if (!l) { k.innerHTML = '<div class="memuat">Belum ada data lokasi. Ketuk “Perbarui Lokasi”.</div>'; return; }
    const dtk = Math.max(0, Math.round((Date.now() - l.t) / 1000));
    const umur = dtk < 5 ? "baru saja" : dtk < 90 ? `${dtk} detik lalu` : `${Math.round(dtk / 60)} menit lalu`;
    k.innerHTML = acHtmlPeta(l, cfg) + `<p class="pm-legenda" style="text-align:center">Diperbarui ${umur}</p>`;
  }
  gambar();
};

function acPesanSyarat(d) {
  switch (d && d.alasan) {
    case "di_luar_area": return `Anda berada sekitar ${d.jarak_m} m dari lokasi ujian (batas ${d.radius_m} m). Ujian hanya dapat dikerjakan di area sekolah.`;
    case "akurasi_rendah": return "Sinyal GPS kurang akurat. Pindah ke dekat jendela atau area terbuka, aktifkan \"Lokasi akurat\", lalu coba lagi.";
    case "lokasi_tidak_valid": return "Lokasi tidak valid terdeteksi. Matikan aplikasi lokasi palsu (fake GPS) lalu coba lagi.";
    case "titik_belum_diatur": return "Titik lokasi ujian belum diatur oleh admin. Hubungi pengawas ujian.";
    default: return "Lokasi belum terbaca. Aktifkan GPS dan izinkan akses lokasi, lalu coba lagi.";
  }
}

// ---------------------------------------------------------------------
//  Pengaturan & syarat awal (dipanggil sebelum soal diminta)
// ---------------------------------------------------------------------
async function acMuatPengaturan(paksa = false) {
  if (!paksa && AC.cfgWaktu && Date.now() - AC.cfgWaktu < 30000) return AC.cfg;
  try {
    const { data, error } = await sb.from("pengaturan_anticurang").select("*").eq("id", 1).maybeSingle();
    AC.cfg = error ? null : (data || null);
  } catch (_) {
    AC.cfg = null;
  }
  AC.cfgWaktu = Date.now();
  return AC.cfg;
}

// Melempar Error (pesan siap tampil) bila syarat tidak terpenuhi.
AC.prasyarat = async function (ujianId) {
  AC.sesi = null;
  const cfg = await acMuatPengaturan(true);
  if (!cfg || !cfg.aktif) return null;

  let lok = {};
  if (cfg.wajib_gps) {
    const el = document.querySelector("#konten");
    if (el) el.innerHTML = '<div class="memuat">Memeriksa lokasi Anda... Izinkan akses lokasi bila diminta.</div>';
    try {
      lok = await acAmbilLokasi({ tinggi: true });
    } catch (e) {
      throw acErrGps(acDiagnosaGps(e && e.kode), (e && e.message) || "Lokasi belum terbaca.");
    }
  }

  const { data, error } = await sb.rpc("cek_syarat_ujian", {
    p_ujian_id: ujianId,
    p_lat: lok.lat ?? null,
    p_lng: lok.lng ?? null,
    p_akurasi: lok.akurasi ?? null,
    p_perangkat: acDevId(),
    p_info: acInfoPerangkat(),
  });
  if (error) {
    // SQL 22 belum dijalankan: lewati saja agar ujian tetap bisa dibuka.
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message || "")) { AC.cfg = null; return null; }
    throw error;
  }
  if (!data || data.aktif === false) return null;
  if (!data.ok) {
    throw acErrGps(
      acDiagnosaGps(data.alasan || "tanpa_lokasi", {
        jarak: data.jarak_m, radius: data.radius_m,
        akurasi: lok.akurasi, akurasiMaks: cfg.gps_akurasi_maks_m,
      }),
      acPesanSyarat(data)
    );
  }
  AC.sesi = data;
  return data;
};

AC.mintaLayarPenuh = function () {
  if (AC.cfg && AC.cfg.aktif && AC.cfg.wajib_layar_penuh && acFsDidukung() && !acStandalone()) acMintaFs();
};

AC.ringkasTataTertib = function () {
  const c = AC.cfg;
  if (!c || !c.aktif) return "";
  const li = [];
  if (c.wajib_layar_penuh) li.push('Ujian dikerjakan dalam <b>layar penuh</b>. Di iPhone, buka lewat ikon &ldquo;Tambah ke Layar Utama&rdquo; agar tampil penuh.');
  if (c.wajib_gps) li.push(`<b>GPS wajib aktif</b>. Ujian hanya dapat dikerjakan di area sekolah (radius ${esc(c.gps_radius_m)} m). Nyalakan GPS (mode akurat) dan izinkan akses lokasi di browser <b>sebelum</b> menekan tombol mulai. Jika GPS dimatikan atau Anda keluar area, layar ujian akan <b>dikunci</b> dan kejadian dicatat.`);
  li.push("Dilarang berpindah aplikasi/tab, membuka layar terbagi (split-screen), serta menyalin &amp; menempel soal.");
  li.push(c.aksi_melebihi === "kumpul"
    ? `Batas pelanggaran <b>${esc(c.maks_pelanggaran)} kali</b>. Setelah itu ujian <b>dikumpulkan otomatis</b>.`
    : `Setiap pelanggaran dicatat dan dapat dilihat oleh pengawas/guru (batas peringatan ${esc(c.maks_pelanggaran)} kali).`);
  li.push("Satu akun hanya boleh dipakai di satu perangkat selama ujian.");
  return li.map((x) => `<li>${x}</li>`).join("");
};

// ---------------------------------------------------------------------
//  Antrean kejadian & pengiriman (ringan: 1 panggilan kecil per interval)
// ---------------------------------------------------------------------
function acSimpanAntre() {
  try { localStorage.setItem(AC.kunciAntre, JSON.stringify(AC.antre.slice(-40))); } catch (_) { /* abaikan */ }
}
function acBacaAntre() {
  try { const v = JSON.parse(localStorage.getItem(AC.kunciAntre) || "[]"); return Array.isArray(v) ? v.slice(-40) : []; } catch (_) { return []; }
}

const acTotal = () => AC.pelanggaran + AC.terbang + AC.antre.filter((e) => acHitung(e.j)).length;

function acCatat(jenis, d) {
  if (!AC.aktif) return;
  const hitung = acHitung(jenis);
  if (hitung) {
    const kini = Date.now();
    if (kini - AC.lastHitung < 4000) return; // satu kejadian beruntun dihitung sekali
    AC.lastHitung = kini;
  }
  AC.antre.push({ j: jenis, d: d == null ? null : d });
  if (AC.antre.length > 40) AC.antre.splice(0, AC.antre.length - 40);
  acSimpanAntre();
  if (hitung) {
    acTanggapi(jenis);
    acKirim({ tanpaGps: document.hidden });
  }
}

function acTanggapi(jenis) {
  const total = acTotal();
  acPerbaruiStatus();
  if (AC.aksi === "kumpul" && total >= AC.maks) {
    AC.kondisi.kumpul = true;
    acRender();
    acKumpul();
    return;
  }
  const sisa = AC.maks - total;
  const akhir = AC.aksi === "kumpul"
    ? (sisa <= 1 ? "Satu pelanggaran lagi, ujian Anda akan dikumpulkan otomatis." : `Sisa kesempatan: ${sisa} kali sebelum ujian dikumpulkan otomatis.`)
    : "Pelanggaran ini dicatat dan dilaporkan kepada pengawas/guru.";
  AC.kondisi.peringatan = `<b>Peringatan ${Math.min(total, AC.maks)} dari ${AC.maks}.</b><br>${esc(AC_ALASAN[jenis] || "Pelanggaran terdeteksi.")}<br><br>${esc(akhir)}`;
  acRender();
}

async function acKirim({ tanpaGps = false, paksa = false, tinggi = false } = {}) {
  if (!AC.aktif) return;
  if (AC.mengirim) { AC.kirimLagi = true; return; }
  AC.mengirim = true;
  const kirimKe = AC.ujianId;
  const events = AC.antre.splice(0, 10);
  AC.terbang = events.filter((e) => acHitung(e.j)).length;
  let lok = null;
  try {
    if (AC.cfg && AC.cfg.wajib_gps && !tanpaGps && !document.hidden) {
      try {
        lok = await acAmbilLokasi({ tinggi });
        AC.lokTerakhir = { lat: lok.lat, lng: lok.lng, akurasi: lok.akurasi, t: Date.now() };
        AC.gpsGagal = 0;
        AC.gpsMati = false;
        AC.gpsKode = null;
      } catch (eg) {
        AC.gpsGagal++;
        AC.gpsKode = (eg && eg.kode) || "tidak_tersedia";
        // Peringatan dini (tidak memblokir) sebelum dicatat sebagai pelanggaran pada kegagalan ke-3
        if (AC.gpsGagal < 3 && typeof toast === "function") {
          toast(`GPS tidak terbaca (${AC.gpsGagal}/3). Aktifkan GPS & izinkan lokasi agar tidak tercatat sebagai pelanggaran.`, "error");
        }
        if (AC.gpsGagal === 3) { events.push({ j: "gps_mati", d: null }); AC.terbang++; }
        if (AC.gpsGagal >= 3) AC.gpsMati = true;
      }
    }
    const { data, error } = await sb.rpc("lapor_aktivitas_ujian", {
      p_ujian_id: kirimKe,
      p_perangkat: AC.dev,
      p_events: events,
      p_lat: lok ? lok.lat : null,
      p_lng: lok ? lok.lng : null,
      p_akurasi: lok ? lok.akurasi : null,
      p_layar: acFsAktif() ? "penuh" : "biasa",
    });
    if (error) throw error;
    AC.terbang = 0;
    if (!AC.aktif) return;
    acTerapkan(data);
  } catch (_) {
    // Gagal kirim (offline dsb.): kembalikan ke antrean, coba lagi di jadwal berikutnya.
    AC.antre.unshift(...events);
    if (AC.antre.length > 40) AC.antre.splice(0, AC.antre.length - 40);
    AC.terbang = 0;
  } finally {
    acSimpanAntre();
    AC.mengirim = false;
    if (AC.kirimLagi && AC.aktif) { AC.kirimLagi = false; setTimeout(() => acKirim({ tanpaGps: true }), 300); }
  }
}

function acTerapkan(d) {
  if (!d) return;
  if (d.aktif === false) { AC.berhenti(); return; } // admin mematikan fitur saat ujian berjalan
  if (d.sesi === false) return;
  if (d.ambil_alih) {
    AC.kondisi.ambil_alih = true;
    clearTimeout(AC.tmr);
    acRender();
    return;
  }
  if (typeof d.pelanggaran === "number") AC.pelanggaran = d.pelanggaran;
  if (d.maks) AC.maks = d.maks;
  if (d.aksi) AC.aksi = d.aksi;
  if (d.interval) AC.intervalMs = d.interval * 1000;
  if (AC.cfg && AC.cfg.wajib_gps) {
    AC.lokLuar = d.lokasi_ok === false;
    if (d.jarak_m != null) AC.jarak = d.jarak_m;
    AC.kondisi.gps = AC.lokLuar || AC.gpsMati;
  }
  acPerbaruiStatus();
  if (d.kumpul && !AC.kondisi.kumpul) {
    AC.kondisi.kumpul = true;
    acRender();
    acKumpul();
    return;
  }
  acRender();
}

async function acKumpul() {
  if (AC.sedangKumpul || !AC.aktif) return;
  AC.sedangKumpul = true;
  try { await acKirim({ tanpaGps: true }); } catch (_) { /* abaikan */ }
  try { if (AC.opsi && AC.opsi.kumpul) await AC.opsi.kumpul(); } catch (_) { /* dicoba lagi di bawah */ }
  AC.sedangKumpul = false;
  // Bila pengumpulan gagal (mis. offline), coba lagi sampai berhasil.
  if (AC.aktif) setTimeout(acKumpul, 8000);
}

function acJadwal(ms) {
  clearTimeout(AC.tmr);
  if (!AC.aktif) return;
  AC.tmr = setTimeout(async () => {
    await acKirim();
    acJadwal(Math.round(AC.intervalMs * (0.85 + Math.random() * 0.3)));
  }, ms);
}

// ---------------------------------------------------------------------
//  Tampilan: status kecil di footer ujian + overlay peringatan/penguncian
// ---------------------------------------------------------------------
function acPerbaruiStatus() {
  let el = document.querySelector("#ac-status");
  if (!el) {
    const f = document.querySelector(".cbt-footer");
    if (!f) return;
    el = document.createElement("div");
    el.id = "ac-status";
    el.className = "ac-status";
    f.appendChild(el);
  }
  const total = Math.min(acTotal(), AC.maks);
  const pakaiGps = !!(AC.cfg && AC.cfg.wajib_gps);
  let gps = "";
  let gpsMasalah = false;
  if (pakaiGps) {
    if (AC.kondisi.gps) { gps = AC.gpsMati ? " · GPS ✗ tidak aktif" : " · GPS ⚠ di luar area"; gpsMasalah = true; }
    else if (AC.gpsGagal > 0) { gps = ` · GPS ⚠ tidak terbaca (${AC.gpsGagal}/3), aktifkan GPS`; gpsMasalah = true; }
    else gps = " · GPS ✓";
  }
  el.textContent = `Pemantauan aktif · Pelanggaran ${total}/${AC.maks}${gps}`;
  el.classList.toggle("ac-merah", total > 0 || gpsMasalah);
}

function acRender() {
  const k = AC.kondisi;
  if (typeof CBT !== "undefined" && CBT.submitting) { acHapusOverlay(); return; }
  // Peringatan pelanggaran didahulukan dari "layar penuh diperlukan": siswa harus melihat
// pesan pelanggarannya dulu; tombol di pesan itu sekaligus memulihkan layar penuh.
  const jenis = k.ambil_alih ? "ambil_alih" : k.kumpul ? "kumpul" : k.gps ? "gps"
    : k.peringatan ? "peringatan" : k.layar_penuh ? "layar_penuh" : k.info_iphone ? "info_iphone" : null;
  if (!jenis) { acHapusOverlay(); return; }
  const kunci = jenis + "|" + (jenis === "peringatan" ? k.peringatan + "|" + k.layar_penuh : jenis === "gps" ? String(AC.jarak) + AC.gpsMati + (AC.gpsKode || "") : "");
  if (AC.jenisOverlay === kunci && document.querySelector("#ac-overlay")) return;
  AC.jenisOverlay = kunci;

  let ikon = "⚠️", judul = "", isi = "", tombol = "", tambah = "";
  if (jenis === "ambil_alih") {
    ikon = "📵"; judul = "Ujian dibuka di perangkat lain";
    isi = "Akun Anda sedang dipakai mengerjakan ujian ini di perangkat lain, sehingga sesi di perangkat ini dihentikan. Jawaban yang sudah tersimpan tetap aman.";
    tombol = '<button class="btn btn-primary btn-besar" type="button" data-ac="daftar">Kembali ke Daftar Ujian</button>';
  } else if (jenis === "kumpul") {
    ikon = "⏹️"; judul = "Batas pelanggaran tercapai";
    isi = "Ujian Anda sedang dikumpulkan secara otomatis. Mohon tunggu...";
  } else if (jenis === "gps") {
    const info = AC.gpsMati
      ? acDiagnosaGps(AC.gpsKode || "tidak_tersedia")
      : acDiagnosaGps("di_luar_area", { jarak: AC.jarak, radius: AC.cfg && AC.cfg.gps_radius_m });
    ikon = info.ikon; judul = info.judul;
    isi = info.isi;
    const petaHtml = (!AC.gpsMati && AC.lokTerakhir && acPetaTersedia()) ? acHtmlPeta(AC.lokTerakhir, AC.cfg, { ringkas: true }) : "";
    tambah = petaHtml + acLangkahHtml(info.langkah.map((x) => x.replace(/Coba Lagi/g, "Periksa Lokasi Lagi")))
      + '<p class="ac-catatan">Layar ujian <b>dikunci</b> sampai lokasi sesuai. Jawaban Anda tetap tersimpan dan waktu tetap berjalan. Kejadian ini tercatat dan dapat dilihat pengawas.</p>';
    tombol = '<button class="btn btn-primary btn-besar" type="button" data-ac="cek-gps">Periksa Lokasi Lagi</button>';
  } else if (jenis === "layar_penuh") {
    ikon = "🖥️"; judul = "Layar penuh diperlukan";
    isi = "Ujian ini harus dikerjakan dalam mode layar penuh. Ketuk tombol di bawah untuk melanjutkan.";
    tombol = '<button class="btn btn-primary btn-besar" type="button" data-ac="fs">Masuk Layar Penuh</button>';
  } else if (jenis === "peringatan") {
    ikon = "⚠️"; judul = "Pelanggaran terdeteksi";
    isi = k.peringatan;
    tombol = `<button class="btn btn-primary btn-besar" type="button" data-ac="lanjut">${k.layar_penuh ? "Saya Mengerti, Kembali ke Layar Penuh" : "Saya Mengerti, Kembali ke Ujian"}</button>`;
  } else if (jenis === "info_iphone") {
    ikon = "📱"; judul = "Tips layar penuh di iPhone";
    isi = "Safari di iPhone tidak mendukung layar penuh untuk halaman web. Agar ujian tampil penuh: ketuk tombol <b>Bagikan</b> di Safari &rarr; <b>Tambah ke Layar Utama</b> &rarr; buka ujian dari ikon yang baru muncul. Anda tetap dapat melanjutkan ujian ini sekarang.";
    tombol = '<button class="btn btn-primary btn-besar" type="button" data-ac="info-ok">Lanjutkan Ujian</button>';
  }

  let el = document.querySelector("#ac-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "ac-overlay";
    el.className = "ac-overlay";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="ac-kartu"><div class="ac-ikon" aria-hidden="true">${ikon}</div>
    <h2>${esc(judul)}</h2><p>${isi}</p>${tambah}${tombol ? `<div class="ac-aksi">${tombol}</div>` : ""}</div>`;
  el.onclick = async (e) => {
    const b = e.target.closest("[data-ac]");
    if (!b) return;
    const a = b.dataset.ac;
    if (a === "daftar") { AC.berhenti(); location.hash = "ujian"; }
    else if (a === "fs") { await acMintaFs(); if (acFsAktif()) { AC.kondisi.layar_penuh = false; AC.fsKeluarDicatat = false; } acRender(); }
    else if (a === "lanjut") {
      AC.kondisi.peringatan = "";
      if (AC.perluFs && !acFsAktif()) await acMintaFs(); // harus dipanggil langsung dari klik
      if (AC.perluFs) {
        if (acFsAktif()) { AC.kondisi.layar_penuh = false; AC.fsKeluarDicatat = false; }
        else AC.kondisi.layar_penuh = true; // ditolak browser: tampilkan tombol "Masuk Layar Penuh"
      }
      acRender();
    }
    else if (a === "info-ok") { AC.kondisi.info_iphone = false; try { sessionStorage.setItem("ac_info_iphone", "1"); } catch (_) {} acRender(); }
    else if (a === "cek-gps") {
      b.disabled = true; b.textContent = "Memeriksa...";
      await acKirim({ tinggi: true });
      AC.kondisi.gps = AC.lokLuar || AC.gpsMati;
      acRender();
      const t = document.querySelector('#ac-overlay [data-ac="cek-gps"]');
      if (t) { t.disabled = false; t.textContent = "Periksa Lokasi Lagi"; }
    }
  };
}

function acHapusOverlay() {
  AC.jenisOverlay = null;
  const el = document.querySelector("#ac-overlay");
  if (el) el.remove();
}

// ---------------------------------------------------------------------
//  Pemasangan pendengar kejadian
// ---------------------------------------------------------------------
function acPasang(target, jenis, fn, opsi) {
  target.addEventListener(jenis, fn, opsi);
  AC.pelepas.push(() => target.removeEventListener(jenis, fn, opsi));
}

function acCatatSalin() {
  const kini = Date.now();
  if (kini - AC.lastSalin < 8000) return;
  AC.lastSalin = kini;
  toast("Salin, tempel, dan klik kanan dinonaktifkan selama ujian.", "info");
  AC.antre.push({ j: "salin_tempel", d: null });
  acSimpanAntre();
}

function acPasangSemua() {
  // --- pindah aplikasi / tab / kunci layar ---
  acPasang(document, "visibilitychange", () => {
    if (!AC.aktif) return;
    if (document.visibilityState === "hidden") {
      AC.hiddenAt = Date.now();
      AC.hiddenDihitung = false;
      clearTimeout(AC.tHid);
      AC.tHid = setTimeout(() => {
        if (AC.aktif && document.visibilityState === "hidden" && !AC.hiddenDihitung) {
          AC.hiddenDihitung = true;
          acCatat("pindah_aplikasi");
          acKirim({ tanpaGps: true });
        }
      }, 300);
    } else if (AC.hiddenAt) {
      clearTimeout(AC.tHid);
      const dtk = Math.round((Date.now() - AC.hiddenAt) / 1000);
      AC.hiddenAt = null;
      // Di iPhone, JavaScript berhenti saat aplikasi ditinggalkan: hitung saat kembali.
      if (!AC.hiddenDihitung && dtk >= 1) { AC.hiddenDihitung = true; acCatat("pindah_aplikasi", dtk); }
      else if (AC.hiddenDihitung) { AC.antre.push({ j: "kembali_aktif", d: dtk }); acSimpanAntre(); }
      acPastikanWakeLock();
      acPeriksaSyarat();
      acKirim();
    }
  });

  // --- kehilangan fokus (split-screen, jendela mengambang, popup aplikasi lain) ---
  acPasang(window, "blur", () => {
    if (!AC.aktif || document.visibilityState === "hidden") return;
    clearTimeout(AC.tBlur);
    AC.tBlur = setTimeout(() => {
      if (!AC.aktif || document.visibilityState === "hidden" || document.hasFocus()) return;
      const a = document.activeElement;
      if (a && a.tagName === "SELECT") return; // pilihan dropdown bawaan HP
      if (!AC.blurDicatat) { AC.blurDicatat = true; acCatat("kehilangan_fokus"); }
    }, 800);
  });
  acPasang(window, "focus", () => { clearTimeout(AC.tBlur); AC.blurDicatat = false; });

  // --- ukuran layar berubah mendadak (split-screen) ---
  AC.areaDasar = window.innerWidth * window.innerHeight;
  acPasang(window, "resize", () => {
    clearTimeout(AC.tUkuran);
    AC.tUkuran = setTimeout(() => {
      if (!AC.aktif) return;
      const a = window.innerWidth * window.innerHeight;
      const mengetik = acSedangMengetik(); // keyboard HP mengecilkan layar: abaikan
      if (a > AC.areaDasar && !mengetik) AC.areaDasar = a;
      if (mengetik) return;
      if (a < AC.areaDasar * 0.7) {
        if (!AC.terbagi) { AC.terbagi = true; acCatat("layar_terbagi"); }
      } else if (a > AC.areaDasar * 0.85) {
        AC.terbagi = false;
      }
    }, 1200);
  });

  // --- layar penuh ---
  const fsUbah = () => {
    if (!AC.aktif || !AC.perluFs) return;
    if (!acFsAktif()) {
      AC.kondisi.layar_penuh = true;
      if (!AC.fsKeluarDicatat) {
        AC.fsKeluarDicatat = true;
        // Tunda sebentar: bila penyebabnya pindah tab/aplikasi, itu yang dicatat (pesan lebih tepat)
        clearTimeout(AC.tFs);
        AC.tFs = setTimeout(() => { if (AC.aktif && !acFsAktif()) acCatat("keluar_layar_penuh"); acRender(); }, 500);
      }
      acRender();
    } else {
      clearTimeout(AC.tFs);
      AC.fsKeluarDicatat = false;
      AC.kondisi.layar_penuh = false;
      acRender();
    }
  };
  acPasang(document, "fullscreenchange", fsUbah);
  acPasang(document, "webkitfullscreenchange", fsUbah);

  // --- blok salin / tempel / klik kanan / seret ---
  ["contextmenu", "copy", "cut", "paste", "dragstart"].forEach((j) => {
    acPasang(document, j, (e) => { e.preventDefault(); acCatatSalin(); });
  });
  acPasang(document, "keydown", (e) => {
    if (!AC.aktif) return;
    const k = String(e.key || "").toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "F12" || (ctrl && e.shiftKey && ["i", "j", "c"].includes(k)) || (ctrl && ["u", "s", "p", "c", "x", "v"].includes(k))) {
      e.preventDefault();
      acCatatSalin();
    }
  }, true);
  acPasang(document, "keyup", (e) => {
    if (e.key === "PrintScreen") {
      try { navigator.clipboard.writeText(""); } catch (_) { /* abaikan */ }
      AC.antre.push({ j: "cetak", d: null }); acSimpanAntre();
    }
  });
  acPasang(window, "beforeprint", () => { AC.antre.push({ j: "cetak", d: null }); acSimpanAntre(); });

  // --- cegah tertutup/refresh tidak sengaja dan tombol Back ---
  acPasang(window, "beforeunload", (e) => { e.preventDefault(); e.returnValue = ""; return ""; });
  try { history.pushState({ ac: 1 }, "", location.href); } catch (_) { /* abaikan */ }
  acPasang(window, "popstate", () => {
    if (!AC.aktif || !/^#ujian\//.test(location.hash)) return;
    try { history.pushState({ ac: 1 }, "", location.href); } catch (_) { /* abaikan */ }
    toast("Gunakan tombol Kumpulkan atau Daftar di layar untuk keluar dari ujian.", "info");
  });

  // --- koneksi ---
  acPasang(window, "online", () => { acKirim(); });
}

// Dipanggil setelah kembali aktif: pastikan syarat layar penuh masih terpenuhi.
function acPeriksaSyarat() {
  if (!AC.aktif) return;
  if (AC.perluFs && !acFsAktif()) { AC.kondisi.layar_penuh = true; }
  acRender();
}

// ---------------------------------------------------------------------
//  Mulai & berhenti
// ---------------------------------------------------------------------
// opsi: { kumpul: () => Promise }  -> dipanggil bila batas pelanggaran tercapai
AC.mulai = function (ujianId, kumpul) {
  AC.berhenti();
  const cfg = AC.cfg;
  if (!cfg || !cfg.aktif || !AC.sesi) return;

  AC.aktif = true;
  AC.ujianId = ujianId;
  AC.opsi = { kumpul };
  AC.dev = acDevId();
  AC.pelanggaran = Number(AC.sesi.pelanggaran) || 0;
  AC.terbang = 0;
  AC.maks = Number(AC.sesi.maks) || cfg.maks_pelanggaran || 3;
  AC.aksi = AC.sesi.aksi || cfg.aksi_melebihi || "kumpul";
  AC.intervalMs = (Number(AC.sesi.interval) || cfg.interval_detik || 45) * 1000;
  AC.kunciAntre = `ac_antre_${S.me.id}_${ujianId}`;
  AC.antre = acBacaAntre();
  AC.kondisi = { ambil_alih: false, gps: false, layar_penuh: false, peringatan: "", kumpul: false, info_iphone: false };
  AC.lastHitung = 0;
  AC.gpsGagal = 0;
  AC.gpsMati = false;
  AC.gpsKode = null;
  AC.lokLuar = false;
  AC.jarak = AC.sesi.jarak_m != null ? AC.sesi.jarak_m : null;
  AC.hiddenAt = null;
  AC.blurDicatat = false;
  AC.terbagi = false;
  AC.sedangKumpul = false;
  AC.fsKeluarDicatat = false;
  AC.perluFs = !!cfg.wajib_layar_penuh && acFsDidukung() && !acStandalone();

  acPasangSemua();
  acPastikanWakeLock();
  acPerbaruiStatus();

  // Layar penuh belum aktif saat masuk (mis. halaman dimuat ulang): minta lewat tombol.
  if (AC.perluFs && !acFsAktif()) {
    AC.fsKeluarDicatat = true; // masuk awal bukan pelanggaran
    AC.kondisi.layar_penuh = true;
  }
  // iPhone: info sekali saja, tidak memblokir.
  if (cfg.wajib_layar_penuh && acIphone() && !acStandalone()) {
    let sudah = false;
    try { sudah = !!sessionStorage.getItem("ac_info_iphone"); } catch (_) { /* abaikan */ }
    if (!sudah) AC.kondisi.info_iphone = true;
  }
  acRender();

  // Pengaman: berhenti sendiri bila ruang ujian sudah ditutup; sembunyikan overlay saat proses kumpul.
  AC.tick = setInterval(() => {
    if (!AC.aktif) return;
    if (typeof CBT !== "undefined" && (!CBT.aktif || !CBT.ujian || CBT.ujian.id !== AC.ujianId)) { AC.berhenti(); return; }
    if (typeof CBT !== "undefined" && CBT.submitting) acHapusOverlay();
    else if (!document.querySelector("#ac-overlay")) acRender();
  }, 1000);

  acJadwal(1500 + Math.random() * 4000); // acak: ratusan siswa tidak mengirim serempak
};

// selesai = true -> ujian sudah dikumpulkan (hapus antrean tersimpan)
AC.berhenti = function (selesai = false) {
  const tadi = AC.aktif;
  if (tadi && !selesai) {
    // Keluar ke daftar saat ujian belum dikumpulkan: catat (tidak dihitung).
    AC.antre.push({ j: "ke_daftar", d: null });
    acSimpanAntre();
    acKirim({ tanpaGps: true });
  }
  AC.aktif = false;
  AC.pelepas.forEach((f) => { try { f(); } catch (_) { /* abaikan */ } });
  AC.pelepas = [];
  [AC.tmr, AC.tick, AC.tBlur, AC.tUkuran, AC.tHid, AC.tFs].forEach((t) => { if (t) { clearTimeout(t); clearInterval(t); } });
  AC.tmr = AC.tick = AC.tBlur = AC.tUkuran = AC.tHid = AC.tFs = null;
  if (tadi) {
    acLepasWakeLock();
    acKeluarFs();
    acHapusOverlay();
    const st = document.querySelector("#ac-status");
    if (st) st.remove();
    if (selesai) { try { localStorage.removeItem(AC.kunciAntre); } catch (_) { /* abaikan */ } }
  }
};

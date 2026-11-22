"use strict";
// =====================================================================
//  PORTAL SISWA - Dashboard, UJIAN (CBT Responsif), & Hasil Ujian
//  Menu: Dashboard | UJIAN | Hasil Ujian
// =====================================================================

const $ = (s, r = document) => r.querySelector(s);
const konten = () => $("#konten");

// Kolom tabel ujian yang boleh dibaca siswa (token SENGAJA tidak ada; lihat 15_fix_keamanan.sql)
const UJIAN_KOLOM = "id,judul,jenis_ujian,mapel_id,durasi_menit,waktu_mulai,waktu_selesai,acak_soal,tampil_nilai,aktif,butuh_token";

const S = {
  me: null,
  kelas: null,
  mapel: [],
  ujian: [],
  hasil: [],
};

// State khusus ruang ujian CBT aktif
const CBT = {
  izinKeluar: false, // true hanya sesaat saat siswa keluar lewat tombol Daftar yang sah
  aktif: false,
  ujian: null,
  sesi: null,
  soal: [],
  idx: 0,
  jawaban: {},
  ragu: new Set(),
  urutan: [],
  fontSize: "normal", // kecil | normal | besar
  timerId: null,
  saveTimer: null,
  saving: false,
  submitting: false,
  akhirMs: 0,
  rev: 0,          // naik setiap ada perubahan jawaban (untuk penanda sinkron)
  revSync: 0,      // nilai rev terakhir yang sudah berhasil dikirim ke server
  terakhirSync: 0, // waktu (ms) sinkron server terakhir yang berhasil
  gagalSync: 0,    // jumlah gagal sinkron beruntun (untuk backoff)
  mulaiMs: 0,      // waktu mulai sesi (ms)
  ingat: {},       // pengingat sisa waktu yang sudah ditampilkan {10:true,5:true,1:true}
  retryTimer: null,
  kunciPaksaMs: 0,   // batas buka tombol kumpul menurut server (ms), bila server menolak
  kunciTampil: false,
  kumpulUlangTimer: null, // ulang kumpul otomatis (waktu habis) bila gagal terkirim
};

// Jeda sinkron rutin ke server. Jawaban SELALU langsung masuk localStorage;
// server hanya menerima salinan cadangan tiap jeda ini (bukan tiap klik).
// Jawaban final tetap dikirim utuh saat "Kumpulkan", jadi aman.
const SYNC_JEDA_MS = 30000;

const HURUF_OPSI = "ABCDEF";

// ---------------------------------------------------------------------
//  Alat Bantu Tampilan & Waktu
// ---------------------------------------------------------------------
function kosong(judul, teks, aksiHtml = "") {
  return `<div class="kosong"><h3>${esc(judul)}</h3><p>${esc(teks)}</p>${aksiHtml}</div>`;
}

// Tahun berjalan menurut jam server (WITA), bukan jam HP
const tahunWITA = () => new Date(sekarangMs() + OFFSET_WITA_MS).getUTCFullYear();

const namaMapel = (id) => (S.mapel.find((m) => m.id === id) || {}).nama || "Mata Pelajaran";
const formatTanggalJam = (t) => {
  if (!t) return "-";
  return fmtWITA(t, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " WITA";
};
const formatTanggalSaja = (t) => {
  if (!t) return "-";
  return fmtWITA(t, { day: "numeric", month: "long", year: "numeric" });
};
const teksJK = (jk) => jk === "L" ? "Laki-laki" : jk === "P" ? "Perempuan" : "-";
const br = (s) => teksSoalHtml(s); // termasuk gambar soal

function statusJadwal(u, h) {
  if (h && h.status === "selesai") {
    return { kode: "selesai", label: "Sudah Dikerjakan", badge: "ok" };
  }
  if (u.aktif === false) {
    return { kode: "lewat", label: "Terlewat", badge: "off" };
  }
  const kini = sekarangMs(); // jam server (WITA), bukan jam HP
  const mulai = new Date(u.waktu_mulai).getTime();
  const selesai = new Date(u.waktu_selesai).getTime();
  if (h && h.status === "mengerjakan" && kini <= selesai) {
    return { kode: "mengerjakan", label: "Sedang Dikerjakan", badge: "warn" };
  }
  if (kini < mulai) {
    return { kode: "mendatang", label: "Belum Dimulai", badge: "warn" };
  }
  if (kini > selesai) {
    return { kode: "lewat", label: "Terlewat (Tidak Mengikuti)", badge: "off" };
  }
  return { kode: "berlangsung", label: "Siap Dikerjakan", badge: "info" };
}

function predikatNilai(n) {
  const v = Number(n) || 0;
  if (v >= 90) return { huruf: "A", ket: "Sangat Baik", warna: "ok" };
  if (v >= 80) return { huruf: "B", ket: "Baik", warna: "info" };
  if (v >= 70) return { huruf: "C", ket: "Cukup", warna: "warn" };
  return { huruf: "D", ket: "Perlu Bimbingan", warna: "off" };
}

function hentikanTimerCBT() {
  if (CBT.timerId) {
    clearInterval(CBT.timerId);
    CBT.timerId = null;
  }
  if (CBT.saveTimer) {
    clearTimeout(CBT.saveTimer);
    CBT.saveTimer = null;
  }
  perangkatHenti();
}

// ---------------------------------------------------------------------
//  Indikator baterai & sinyal (hanya tampilan, terpisah dari anti-curang)
//  - Tidak memakai polling: bereaksi pada event baterai/koneksi dari browser.
//  - Baterai: hanya Chrome/Edge Android & desktop. Sinyal rinci: Chrome/Android.
//    Di iPhone/Safari bagian yang tidak didukung otomatis tidak ditampilkan.
// ---------------------------------------------------------------------
const PRKT = { bat: null, pelepas: [], batPeringatan: { 20: false, 10: false } };

function perangkatHenti() {
  PRKT.pelepas.forEach((f) => { try { f(); } catch (_) {} });
  PRKT.pelepas = [];
  PRKT.bat = null;
}

function perangkatSinyal() {
  if (navigator.onLine === false) return { bar: 0, label: "Offline", kelas: "mati" };
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const t = c && c.effectiveType;
  if (t === "4g") return { bar: 4, label: "Kuat", kelas: "" };
  if (t === "3g") return { bar: 3, label: "Sedang", kelas: "" };
  if (t === "2g") return { bar: 2, label: "Lemah", kelas: "lemah" };
  if (t === "slow-2g") return { bar: 1, label: "Sangat lemah", kelas: "lemah" };
  return { bar: null, label: "Online", kelas: "" };
}

function perangkatRender() {
  const el = $("#cbt-perangkat");
  if (!el) return;
  const sg = perangkatSinyal();
  const bars = sg.bar == null
    ? '<i class="pr-titik"></i>'
    : `<span class="pr-bar" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= sg.bar ? "on" : ""}" style="height:${3 + i * 3}px"></i>`).join("")}</span>`;
  let html = `<span class="pr-sinyal ${sg.kelas}" title="Koneksi internet: ${esc(sg.label)}">${bars}<small>${esc(sg.label)}</small></span>`;

  const b = PRKT.bat;
  if (b) {
    const pct = Math.max(0, Math.min(100, Math.round(b.level * 100)));
    const rendah = pct <= 20 && !b.charging;
    html += `<span class="pr-bat ${rendah ? "rendah" : ""}" title="Baterai ${pct}%${b.charging ? " (sedang diisi)" : ""}"><span class="pr-bat-ikon" aria-hidden="true"><i style="width:${pct}%"></i></span><small>${pct}%${b.charging ? " ⚡" : ""}</small></span>`;
  }
  if (typeof AC !== "undefined" && AC.petaTersedia && AC.petaTersedia()) {
    html += '<button type="button" class="pr-peta" data-peta title="Lihat posisi Anda di peta" aria-label="Lihat posisi Anda di peta">📍</button>';
  }
  el.innerHTML = html;
}

function perangkatCekBaterai() {
  const b = PRKT.bat;
  if (!b) return;
  const pct = Math.round(b.level * 100);
  if (b.charging) { PRKT.batPeringatan = { 20: false, 10: false }; return; }
  if (pct <= 10 && !PRKT.batPeringatan[10]) {
    PRKT.batPeringatan = { 20: true, 10: true };
    toast(`Baterai tinggal ${pct}%! Segera colok charger agar ujian tidak terputus.`, "error");
  } else if (pct <= 20 && !PRKT.batPeringatan[20]) {
    PRKT.batPeringatan[20] = true;
    toast(`Baterai ${pct}%. Sebaiknya colok charger.`, "info");
  }
}

async function perangkatMulai() {
  perangkatHenti();
  PRKT.batPeringatan = { 20: false, 10: false };
  const pasang = (target, jenis, fn) => {
    target.addEventListener(jenis, fn);
    PRKT.pelepas.push(() => target.removeEventListener(jenis, fn));
  };

  const el = $("#cbt-perangkat");
  if (el) el.onclick = (e) => { if (e.target.closest("[data-peta]") && AC.tampilPeta) AC.tampilPeta(); };

  pasang(window, "offline", () => {
    perangkatRender();
    toast("Koneksi internet terputus. Jawaban tetap tersimpan di perangkat, lanjutkan mengerjakan.", "error");
  });
  pasang(window, "online", () => {
    perangkatRender();
    toast("Koneksi internet pulih. Jawaban disinkronkan ke server.", "info");
  });
  const kon = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (kon && kon.addEventListener) pasang(kon, "change", perangkatRender);

  perangkatRender();

  if (navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      if (!$("#cbt-perangkat")) return; // ruang ujian sudah ditutup
      PRKT.bat = b;
      const ubah = () => { perangkatRender(); perangkatCekBaterai(); };
      pasang(b, "levelchange", ubah);
      pasang(b, "chargingchange", ubah);
      ubah();
    } catch (_) { /* tidak didukung / diblokir: indikator baterai tidak ditampilkan */ }
  }
}

// Pengingat sisa waktu: toast biasa (tidak memindahkan fokus, tidak memengaruhi anti-curang)
function pengingatWaktu(menit) {
  const kosongN = CBT.soal.filter((x) => !cekSoalTerjawab(x, CBT.jawaban[x.id])).length;
  const teks = kosongN > 0
    ? `Sisa waktu ${menit} menit. Masih ada ${kosongN} soal belum dijawab.`
    : `Sisa waktu ${menit} menit. Semua soal sudah terjawab, periksa lagi lalu kumpulkan.`;
  toast(teks, menit <= 1 ? "error" : "info");
}

function perbaruiLencanaMenuUjian() {
  const hasilMap = new Map(S.hasil.map((h) => [h.ujian_id, h]));
  const aktifCount = S.ujian.filter((u) => {
    const st = statusJadwal(u, hasilMap.get(u.id)).kode;
    return st === "berlangsung" || st === "mengerjakan";
  }).length;
  const el = $("#lencana-ujian");
  if (!el) return;
  el.hidden = aktifCount === 0;
  el.textContent = aktifCount;
}

// ---------------------------------------------------------------------
//  Memuat Data Siswa, Kelas, Jadwal Ujian & Hasil Ujian
// ---------------------------------------------------------------------
async function muatDataSiswa() {
  if (S.me.kelas_id) {
    const { data: kData } = await sb.from("kelas").select("*").eq("id", S.me.kelas_id).maybeSingle();
    S.kelas = kData || null;
  }

  const { data: mData } = await sb.from("mapel").select("*").order("nama");
  S.mapel = mData || [];

  try {
    const { data: uData, error: uErr } = await sb
      .from("ujian")
      .select(UJIAN_KOLOM)
      .order("waktu_mulai", { ascending: true });
    if (uErr) throw uErr;
    S.ujian = uData || [];
  } catch (e) {
    console.error("Gagal memuat ujian:", e);
    if (typeof toast === "function") toast("Gagal memuat ujian: " + (e.message || e), "error");
    S.ujian = [];
  }

  try {
    const { data: hData, error: hErr } = await sb
      .from("hasil_ujian")
      .select("*")
      .eq("siswa_id", S.me.id)
      .order("selesai_pada", { ascending: false });
    if (hErr) throw hErr;
    S.hasil = hData || [];
  } catch (_) {
    S.hasil = [];
  }

  perbaruiLencanaMenuUjian();
}

// ---------------------------------------------------------------------
//  Halaman 1: Dashboard Siswa
// ---------------------------------------------------------------------
async function rDashboard() {
  await muatDataSiswa();

  const hasilMap = new Map(S.hasil.map((h) => [h.ujian_id, h]));
  const totalUjian = S.ujian.length;
  const sudahSelesai = S.hasil.filter((h) => h.status === "selesai").length;
  const siapKerja = S.ujian.filter((u) => {
    const k = statusJadwal(u, hasilMap.get(u.id)).kode;
    return k === "berlangsung" || k === "mengerjakan";
  }).length;

  const nilaiTampil = S.hasil.filter((h) => {
    if (h.status !== "selesai" || h.status_koreksi === "menunggu") return false;
    const u = S.ujian.find((x) => x.id === h.ujian_id);
    return !u || u.tampil_nilai !== false;
  });
  const rataNilai = nilaiTampil.length
    ? (nilaiTampil.reduce((acc, h) => acc + Number(h.nilai || 0), 0) / nilaiTampil.length).toFixed(1)
    : "-";

  const sekarang = fmtWITA(sekarangMs(), {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const namaKelasTeks = S.kelas ? S.kelas.nama : "-";
  // Tahun ajaran & semester aktif dari menu Pengaturan admin (tabel pengaturan_umum)
  const tahunAjaran = tahunAjaranAktif();
  const inisial = (S.me.nama || "S").trim().charAt(0).toUpperCase();

  konten().innerHTML = `
    <section class="hero-mewah">
      <div class="hero-glow"></div>
      <div class="hero-top">
        <div>
          <div class="hero-pill">
            <span class="dot"></span>
            <span>${esc(periodeAktifTeks())}</span>
            <span>&middot;</span>
            <span>${esc(sekarang)}</span>
          </div>
          <h2>Selamat datang, ${esc(S.me.nama)}</h2>
          <p class="hero-desc">Pastikan data identitas peserta sudah sesuai, lalu buka menu <b>UJIAN</b> untuk mulai mengerjakan soal di <b>${esc(CONFIG.NAMA_SEKOLAH)}</b>.</p>
        </div>
        <div class="hero-kesiapan">
          <div class="kesiapan-angka">${sudahSelesai}/${totalUjian}</div>
          <div class="kesiapan-label">Progres Ujian</div>
          <div class="kesiapan-bar"><div style="width:${totalUjian ? Math.round((sudahSelesai / totalUjian) * 100) : 0}%"></div></div>
          <small>${siapKerja ? `${siapKerja} ujian siap dikerjakan sekarang` : "Pantau jadwal ujian aktif Anda"}</small>
        </div>
      </div>
      <div class="hero-aksi">
        <a class="btn btn-amber" href="#ujian">Buka Menu UJIAN ${siapKerja ? `(${siapKerja} Aktif)` : ""}</a>
        <a class="btn btn-glass" href="#hasil">Hasil Ujian (${sudahSelesai})</a>
      </div>
    </section>

    <section class="panel-mewah siswa-profil-panel" style="margin-bottom:1.4rem">
      <div class="panel-kepala">
        <div>
          <h3>Identitas Peserta Didik</h3>
          <p class="ket">Data resmi akun peserta ujian yang terdaftar di sistem sekolah</p>
        </div>
        <span class="badge ok">Akun Terverifikasi &bull; Aktif</span>
      </div>

      <div class="siswa-id-grid">
        <div class="siswa-id-kartu">
          <div class="siswa-id-avatar">${esc(inisial)}</div>
          <div class="siswa-id-utama">
            <span class="siswa-id-peran">PESERTA UJIAN</span>
            <h4>${esc(S.me.nama)}</h4>
            <div class="siswa-id-nisn mono">NISN: ${esc(S.me.username)}</div>
          </div>
        </div>

        <div class="siswa-bio-daftar">
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Nama Lengkap</span>
            <strong class="siswa-bio-nilai">${esc(S.me.nama)}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">NISN / Username Login</span>
            <strong class="siswa-bio-nilai mono">${esc(S.me.username)}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Kelas / Rombongan Belajar</span>
            <strong class="siswa-bio-nilai">${esc(namaKelasTeks)}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Tahun Ajaran</span>
            <strong class="siswa-bio-nilai">${esc(tahunAjaran)}${semesterAktif() ? ` · Semester ${esc(semesterAktif())}` : ""}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Jenis Kelamin</span>
            <strong class="siswa-bio-nilai">${esc(teksJK(S.me.jenis_kelamin))}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Status Peserta</span>
            <strong class="siswa-bio-nilai">${S.me.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge off">Nonaktif</span>'}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Satuan Pendidikan</span>
            <strong class="siswa-bio-nilai">${esc(CONFIG.NAMA_SEKOLAH)}</strong>
          </div>
          <div class="siswa-bio-item">
            <span class="siswa-bio-label">Terdaftar Sejak</span>
            <strong class="siswa-bio-nilai">${esc(formatTanggalSaja(S.me.dibuat))}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="kpi-grid" aria-label="Ringkasan akademik siswa">
      <div class="kpi-kartu kpi-biru">
        <div class="kpi-atas">
          <span class="kpi-ikon">🏫</span>
          <span class="kpi-tag">Rombel</span>
        </div>
        <div class="kpi-nilai">${esc(namaKelasTeks)}</div>
        <div class="kpi-judul">Kelas Anda</div>
        <div class="kpi-sub">TA ${esc(tahunAjaran)}</div>
      </div>

      <a class="kpi-kartu kpi-amber" href="#ujian">
        <div class="kpi-atas">
          <span class="kpi-ikon">📝</span>
          <span class="kpi-tag">Ujian</span>
        </div>
        <div class="kpi-nilai">${siapKerja}</div>
        <div class="kpi-judul">Ujian Siap Dikerjakan</div>
        <div class="kpi-sub">Dari ${totalUjian} jadwal terdaftar</div>
      </a>

      <div class="kpi-kartu kpi-hijau">
        <div class="kpi-atas">
          <span class="kpi-ikon">✅</span>
          <span class="kpi-tag">Selesai</span>
        </div>
        <div class="kpi-nilai">${sudahSelesai}</div>
        <div class="kpi-judul">Ujian Dikerjakan</div>
        <div class="kpi-sub">Tersimpan di sistem</div>
      </div>

      <a class="kpi-kartu kpi-ungu" href="#hasil">
        <div class="kpi-atas">
          <span class="kpi-ikon">🏆</span>
          <span class="kpi-tag">Nilai</span>
        </div>
        <div class="kpi-nilai">${esc(rataNilai)}</div>
        <div class="kpi-judul">Rata-Rata Nilai</div>
        <div class="kpi-sub">Klik untuk lihat rincian</div>
      </a>
    </section>
  `;
}

// ---------------------------------------------------------------------
//  Halaman 2: MENU UJIAN (Daftar Ujian + Ruang Pengerjaan CBT)
// ---------------------------------------------------------------------
async function rUjian() {
  const subId = location.hash.slice(1).split("/")[1] || "";
  if (subId) {
    return bukaRuangUjian(subId);
  }

  CBT.aktif = false;
  hentikanTimerCBT();
  document.body.classList.remove("mode-cbt");
  AC.berhenti();
  acKeluarFs(); // kembali ke daftar ujian: layar normal lagi
  acMuatPengaturan(); // pengaturan anti curang dimuat lebih awal (tanpa menunggu)

  await muatDataSiswa();
  const hasilMap = new Map(S.hasil.map((h) => [h.ujian_id, h]));
  const namaKelasTeks = S.kelas ? S.kelas.nama : "-";

  let filterStatus = "semua";

  const renderDaftar = () => {
    const daftar = S.ujian.filter((u) => {
      const st = statusJadwal(u, hasilMap.get(u.id)).kode;
      if (filterStatus === "aktif") return st === "berlangsung" || st === "mengerjakan";
      if (filterStatus === "mendatang") return st === "mendatang";
      if (filterStatus === "selesai") return st === "selesai" || st === "lewat";
      return true;
    });

    $("#ujian-list-wrap").innerHTML = daftar.length ? `
      <div class="ujian-grid">
        ${daftar.map((u) => {
          const h = hasilMap.get(u.id);
          const st = statusJadwal(u, h);
          const butuhToken = !!u.butuh_token;
          let tombolAksi = "";
          if (st.kode === "selesai") {
            tombolAksi = `<a class="btn btn-kecil" href="#hasil">Lihat Hasil</a>`;
          } else if (st.kode === "mengerjakan") {
            tombolAksi = `<button class="btn btn-kecil btn-amber" type="button" data-mulai-ujian="${u.id}">Lanjutkan Ujian &rarr;</button>`;
          } else if (st.kode === "berlangsung") {
            tombolAksi = `<button class="btn btn-kecil btn-primary" type="button" data-mulai-ujian="${u.id}">Mulai Ujian &rarr;</button>`;
          } else if (st.kode === "mendatang") {
            tombolAksi = `<button class="btn btn-kecil" type="button" disabled>Belum Dimulai</button>`;
          } else {
            tombolAksi = `<button class="btn btn-kecil" type="button" disabled>Tidak Mengikuti</button>`;
          }

          return `
            <article class="ujian-kartu ${st.kode === "berlangsung" || st.kode === "mengerjakan" ? "ujian-kartu-aktif" : ""}">
              <div>
                <div class="ujian-kartu-atas">
                  <span class="chip">${esc(namaMapel(u.mapel_id))}</span>
                  <span class="badge ${st.badge}">${esc(st.label)}</span>
                </div>
                ${u.jenis_ujian ? `<div style="margin-top:.6rem"><span class="badge info" style="text-transform:uppercase;letter-spacing:.02em">${esc(u.jenis_ujian)}</span></div>` : ""}
                <h4 style="margin-top:.5rem">${esc(u.judul)}</h4>
                ${butuhToken && (st.kode === "berlangsung" || st.kode === "mengerjakan")
                  ? `<div class="ujian-token-info">🔑 Memerlukan Token Pengawas</div>`
                  : ""}
              </div>

              <div>
                <dl class="ujian-meta">
                  <div><dt>Mulai</dt><dd>${esc(formatTanggalJam(u.waktu_mulai))}</dd></div>
                  <div><dt>Batas Akhir</dt><dd>${esc(formatTanggalJam(u.waktu_selesai))}</dd></div>
                  <div><dt>Durasi</dt><dd>${u.durasi_menit} Menit</dd></div>
                </dl>
                <div class="ujian-kartu-bawah" style="margin-top:.85rem">
                  ${tombolAksi}
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    ` : kosong("Tidak ada ujian pada kategori ini", "Pilih filter lain atau klik Segarkan untuk memuat jadwal terbaru.");

    $("#ujian-list-wrap").querySelectorAll("[data-mulai-ujian]").forEach((btn) => {
      btn.onclick = () => modalKonfirmasiMulai(btn.dataset.mulaiUjian);
    });
  };

  konten().innerHTML = `
    <div class="alat">
      <div class="ujian-filter-bar" role="tablist" aria-label="Filter status ujian">
        <button class="tab-btn aktif" type="button" data-f-ujian="semua">Semua (${S.ujian.length})</button>
        <button class="tab-btn" type="button" data-f-ujian="aktif">Siap Dikerjakan</button>
        <button class="tab-btn" type="button" data-f-ujian="mendatang">Akan Datang</button>
        <button class="tab-btn" type="button" data-f-ujian="selesai">Selesai &amp; Terlewat</button>
      </div>
      <div class="alat-kanan">
        <button class="btn btn-kecil" type="button" id="btn-segarkan-ujian">&#8635; Segarkan</button>
      </div>
    </div>

    <section class="panel-mewah">
      <div class="panel-kepala">
        <div>
          <h3>Daftar Paket Ujian &mdash; Kelas ${esc(namaKelasTeks)}</h3>
          <p class="ket">Pilih ujian yang berstatus <b>Siap Dikerjakan</b> atau <b>Sedang Dikerjakan</b> untuk masuk ke lembar soal.</p>
        </div>
      </div>
      <div id="ujian-list-wrap"></div>
    </section>
  `;

  konten().querySelectorAll("[data-f-ujian]").forEach((btn) => {
    btn.onclick = () => {
      konten().querySelectorAll("[data-f-ujian]").forEach((b) => b.classList.remove("aktif"));
      btn.classList.add("aktif");
      filterStatus = btn.dataset.fUjian;
      renderDaftar();
    };
  });

  $("#btn-segarkan-ujian").onclick = () => {
    toast("Memperbarui daftar ujian...", "info");
    rUjian();
  };

  renderDaftar();
}

// Modal konfirmasi & input token sebelum masuk ruang ujian
function modalKonfirmasiMulai(ujianId) {
  const u = S.ujian.find((x) => x.id === ujianId);
  if (!u) return;
  const h = S.hasil.find((x) => x.ujian_id === ujianId);
  const lanjut = h && h.status === "mengerjakan";
  const butuhToken = !lanjut && !!u.butuh_token;

  const m = tampilModal(lanjut ? "Lanjutkan Ujian" : "Konfirmasi Mulai Ujian", `
    <div class="hasil-modal-identitas" style="margin-bottom:1rem">
      <div><small>Peserta</small><b>${esc(S.me.nama)}</b></div>
      <div><small>NISN / Kelas</small><b>${esc(S.me.username)} &bull; ${esc(S.kelas ? S.kelas.nama : "-")}</b></div>
      ${u.jenis_ujian ? `<div><small>Jenis Ujian</small><b>${esc(u.jenis_ujian)}</b></div>` : ""}
      <div><small>Mata Pelajaran</small><b>${esc(namaMapel(u.mapel_id))}</b></div>
      <div><small>Paket Ujian</small><b>${esc(u.judul)}</b></div>
      <div><small>Durasi Pengerjaan</small><b>${u.durasi_menit} Menit</b></div>
      <div><small>Batas Jadwal</small><b>${esc(formatTanggalJam(u.waktu_selesai))}</b></div>
    </div>
    <div class="catatan">
      <b>Tata Tertib Ujian:</b>
      <ul style="margin:.35rem 0 0;padding-left:1.2rem">
        <li>Timer berjalan otomatis begitu Anda menekan tombol mulai.</li>
        <li>Setiap jawaban tersimpan otomatis di perangkat dan dicadangkan ke server secara berkala.</li>
        <li>Jika waktu habis, jawaban akan terkumpul secara otomatis.</li>
        ${AC.ringkasTataTertib()}
      </ul>
    </div>
    ${(AC.petaTersedia && AC.petaTersedia()) ? '<div class="peta-awal" id="peta-awal"></div>' : ""}
    ${butuhToken ? `
      <label class="f" style="margin-top:.8rem">Token Ujian (dari Pengawas)
        <input class="input mono" id="input-token-ujian" placeholder="Masukkan token ujian..." autocomplete="off" style="text-transform:uppercase;font-weight:700;letter-spacing:.12em">
      </label>
    ` : ""}
  `, {
    lebar: "sedang",
    aksi: [
      { label: "Batal" },
      {
        label: lanjut ? "Lanjutkan Mengerjakan" : "Mulai Kerjakan Sekarang",
        kelas: "btn-primary",
        onClick: async () => {
          const tokenVal = butuhToken ? (m.body.querySelector("#input-token-ujian").value || "").trim() : null;
          if (butuhToken && !tokenVal) {
            throw new Error("Masukkan token ujian terlebih dahulu.");
          }
          sessionStorage.setItem(`token_ujian_${u.id}`, tokenVal || "");
          AC.mintaLayarPenuh(); // harus dipanggil dari klik tombol (aturan browser)
          location.hash = `ujian/${u.id}`;
        },
      },
    ],
  });

  // Peta mini posisi siswa (dibaca di perangkat, tanpa server)
  const kotakPeta = m.body.querySelector("#peta-awal");
  if (kotakPeta && AC.isiPetaAwal) AC.isiPetaAwal(kotakPeta);
}

// ---------------------------------------------------------------------
//  RUANG UJIAN CBT RESPONSIF (HP, TABLET, LAPTOP)
// ---------------------------------------------------------------------
function acakArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cekSoalTerjawab(soal, jwb) {
  if (jwb === null || jwb === undefined) return false;
  if (soal.jenis === "pg") return typeof jwb === "number";
  if (soal.jenis === "pgk") return Array.isArray(jwb) && jwb.length > 0;
  if (soal.jenis === "bs") return Array.isArray(jwb) && jwb.some((v) => typeof v === "boolean");
  if (soal.jenis === "jodoh") return Array.isArray(jwb) && jwb.some((v) => typeof v === "number");
  if (soal.jenis === "esai") return typeof jwb === "string" && jwb.trim().length > 0;
  return false;
}

// ---------------------------------------------------------------------
//  Cache Lokal Ujian (localStorage)
//  - paket soal  : diunduh 1x, dipakai ulang saat refresh (tanpa kunci jawaban)
//  - jawaban     : disalin ke localStorage setiap berubah (cadangan bila
//                  koneksi putus / browser tertutup), disinkronkan ke server
//  Kunci memuat ID siswa agar tidak tercampur antar akun di komputer lab.
// ---------------------------------------------------------------------
const CACHE_PREFIX = "cbt_v1_";
const kunciPaket = (ujianId) => `${CACHE_PREFIX}${S.me.id}_${ujianId}_paket`;
const kunciJawab = (ujianId) => `${CACHE_PREFIX}${S.me.id}_${ujianId}_jwb`;

function bacaLokal(kunci) {
  try {
    const mentah = localStorage.getItem(kunci);
    return mentah ? JSON.parse(mentah) : null;
  } catch (_) {
    return null;
  }
}

function tulisLokal(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
    return true;
  } catch (_) {
    return false; // penyimpanan penuh / diblokir: abaikan, server tetap jadi sumber utama
  }
}

function hapusCacheUjian(ujianId) {
  try {
    localStorage.removeItem(kunciPaket(ujianId));
    localStorage.removeItem(kunciJawab(ujianId));
  } catch (_) {}
}

// Hapus cache milik akun lain di perangkat ini (komputer lab dipakai bergantian)
function bersihkanCacheAkunLain() {
  try {
    const milikku = `${CACHE_PREFIX}${S.me.id}_`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX) && !k.startsWith(milikku))
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

// Saat logout: hapus paket soal & jawaban yang sudah tersinkron.
// Jawaban yang BELUM tersinkron ke server dipertahankan agar tidak hilang.
function bersihkanSemuaCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => {
        if (k.endsWith("_jwb")) {
          let v = null;
          try { v = JSON.parse(localStorage.getItem(k)); } catch (_) {}
          if (v && v.dirty) return;
        }
        localStorage.removeItem(k);
      });
  } catch (_) {}
}

function simpanLokal(dirty) {
  if (!CBT.aktif || !CBT.ujian || !S.me) return false;
  return tulisLokal(kunciJawab(CBT.ujian.id), {
    jawaban: CBT.jawaban,
    ragu: [...CBT.ragu],
    urutan: CBT.urutan,
    dirty: !!dirty,
    t: Date.now(),
  });
}

// Satu panggilan: validasi sesi + (soal hanya bila versi cache berbeda).
// Cadangan ke fungsi lama bila SQL 14 belum dijalankan.
async function ambilPaketUjian(ujianId, token, versiCache) {
  let { data, error } = await sb.rpc("ambil_paket_ujian_siswa", {
    p_ujian_id: ujianId,
    p_token: token,
    p_versi_cache: versiCache || null,
  });
  if (error && (error.code === "PGRST202" || /could not find the function/i.test(error.message || ""))) {
    ({ data, error } = await sb.rpc("ambil_soal_ujian_siswa", {
      p_ujian_id: ujianId,
      p_token: token,
    }));
  }
  if (error) throw error;
  return data;
}

async function simpanProgresKeServer(segera = false) {
  if (!CBT.aktif || !CBT.ujian) return;

  // 1) Selalu salin dulu ke localStorage (instan, tidak butuh internet)
  CBT.rev++;
  const lokalOk = simpanLokal(true);

  const jalankan = async () => {
    if (CBT.saveTimer) { clearTimeout(CBT.saveTimer); CBT.saveTimer = null; }
    if (!CBT.aktif || !CBT.ujian || CBT.submitting) return;
    if (CBT.saving) return; // sedang mengirim; perubahan baru ikut di putaran berikutnya
    if (CBT.rev === CBT.revSync) return; // tidak ada perubahan sejak sinkron terakhir

    const revKirim = CBT.rev;
    CBT.saving = true;
    perbaruiIndikatorSimpan("Menyinkronkan...");
    try {
      const { error } = await sb.rpc("simpan_progres_ujian_siswa", {
        p_ujian_id: CBT.ujian.id,
        p_jawaban: CBT.jawaban,
        p_ragu: [...CBT.ragu],
        p_urutan: CBT.urutan,
      });
      if (error) throw error;
      CBT.revSync = revKirim;
      CBT.terakhirSync = Date.now();
      CBT.gagalSync = 0;
      // Tandai "sudah tersinkron" hanya jika tidak ada perubahan baru selama pengiriman
      if (revKirim === CBT.rev) {
        simpanLokal(false);
        perbaruiIndikatorSimpan("Tersimpan ✓");
      } else {
        perbaruiIndikatorSimpan("Tersimpan di perangkat ✓");
        jadwalkanSync(); // ada perubahan baru saat mengirim
      }
    } catch (_) {
      CBT.gagalSync++;
      perbaruiIndikatorSimpan("Tersimpan di perangkat ✓ (server belum terjangkau, mencoba lagi...)");
      // Backoff: 10 dtk, 20 dtk, 40 dtk, maks 60 dtk (+ acak agar tidak serempak)
      const tunggu = Math.min(60000, 10000 * 2 ** Math.min(CBT.gagalSync - 1, 3));
      if (CBT.retryTimer) clearTimeout(CBT.retryTimer);
      CBT.retryTimer = setTimeout(() => {
        CBT.retryTimer = null;
        simpanProgresKeServer(true);
      }, tunggu + Math.random() * 3000);
    } finally {
      CBT.saving = false;
    }
  };
  CBT.jalankanSync = jalankan;

  if (segera) {
    await jalankan();
    return;
  }

  // 2) Sinkron rutin: jadwal TETAP (bukan debounce), satu kiriman memuat semua perubahan.
  perbaruiIndikatorSimpan(lokalOk ? "Tersimpan di perangkat ✓" : "Menunggu simpan...");
  // localStorage tidak tersedia (mode privat/penuh): server jadi satu-satunya cadangan, kirim lebih cepat
  jadwalkanSync(lokalOk ? SYNC_JEDA_MS : 1500);
}

// Pasang satu timer sinkron (tidak ditumpuk, tidak diundur tiap klik)
function jadwalkanSync(jedaMs = SYNC_JEDA_MS) {
  if (CBT.saveTimer || CBT.retryTimer || !CBT.aktif) return;
  const sisa = Math.max(0, CBT.terakhirSync + jedaMs - Date.now());
  const acak = Math.random() * 4000; // ratusan siswa tidak mengirim serempak
  CBT.saveTimer = setTimeout(() => {
    CBT.saveTimer = null;
    if (CBT.jalankanSync) CBT.jalankanSync();
  }, sisa + acak);
}

function perbaruiIndikatorSimpan(teks) {
  const el = $("#cbt-status-simpan");
  if (el) el.textContent = teks;
}

async function bukaRuangUjian(ujianId) {
  CBT.izinKeluar = false;
  hentikanTimerCBT();
  konten().innerHTML = `<div class="memuat">Menyiapkan lembar soal ujian...</div>`;

  const tokenSimpan = sessionStorage.getItem(`token_ujian_${ujianId}`) || null;

  try {
    // Pastikan jam server sudah tersinkron sebelum timer dihitung
    try { await WAKTU.siap; } catch (_) {}

    // Anti curang: cek syarat (GPS, dsb.) SEBELUM soal diminta dari server
    await AC.prasyarat(ujianId);

    // Cache paket soal di perangkat ini (jika ada)
    const cache = bacaLokal(kunciPaket(ujianId));
    const cacheValid = cache && cache.versi && Array.isArray(cache.soal) && cache.soal.length > 0;

    const data = await ambilPaketUjian(ujianId, tokenSimpan, cacheValid ? cache.versi : null);

    if (!data.soal && cacheValid) {
      data.soal = cache.soal; // versi sama: pakai soal dari localStorage, tidak diunduh ulang
    } else if (data.soal && data.versi_soal) {
      tulisLokal(kunciPaket(ujianId), { versi: data.versi_soal, soal: data.soal, t: Date.now() });
    }

    if (!data || !data.soal || !data.soal.length) {
      throw new Error("Paket soal pada ujian ini masih kosong. Hubungi pengawas ujian.");
    }

    // Gabungkan jawaban server dengan cadangan lokal yang belum tersinkron
    const lokal = bacaLokal(kunciJawab(ujianId));
    const lokalKotor = !!(lokal && lokal.dirty);
    let jawabanAwal = data.sesi.jawaban || {};
    let raguAwal = Array.isArray(data.sesi.ragu_ragu) ? data.sesi.ragu_ragu : [];
    let urutanAwal = Array.isArray(data.sesi.urutan_soal) ? data.sesi.urutan_soal : [];
    if (lokalKotor) {
      jawabanAwal = { ...jawabanAwal, ...(lokal.jawaban || {}) };
      if (Array.isArray(lokal.ragu)) raguAwal = lokal.ragu;
      if (!urutanAwal.length && Array.isArray(lokal.urutan)) urutanAwal = lokal.urutan;
    }

    CBT.aktif = true;
    CBT.ujian = data.ujian;
    CBT.sesi = data.sesi;
    CBT.jawaban = jawabanAwal;
    CBT.ragu = new Set(raguAwal);
    CBT.idx = 0;
    CBT.rev = 0;
    CBT.revSync = 0;
    CBT.terakhirSync = Date.now();
    CBT.gagalSync = 0;
    CBT.jalankanSync = null;
    CBT.submitting = false;

    // Susun urutan soal (pertahankan urutan tersimpan di sesi jika ada)
    const soalMap = new Map(data.soal.map((s) => [s.id, s]));
    let urutanIds = urutanAwal.length
      ? urutanAwal.filter((id) => soalMap.has(id))
      : [];

    if (!urutanIds.length) {
      const rawIds = data.soal.map((s) => s.id);
      urutanIds = data.ujian.acak_soal ? acakArray(rawIds) : rawIds;
      CBT.urutan = urutanIds;
      simpanProgresKeServer(true);
    } else {
      CBT.urutan = urutanIds;
      // Ada jawaban lokal yang belum sampai ke server -> kirim sekarang
      if (lokalKotor) simpanProgresKeServer(true);
      else simpanLokal(false);
    }

    CBT.soal = urutanIds.map((id) => soalMap.get(id));
    prakunciGambarSoal(CBT.soal); // unduh gambar soal di latar belakang

    // Hitung batas waktu akhir (minimum antara mulai + durasi menit dan waktu_selesai jadwal)
    const mulaiMs = new Date(data.sesi.mulai_pada).getTime();
    const batasDurasiMs = mulaiMs + Number(data.ujian.durasi_menit || 60) * 60 * 1000;
    const batasJadwalMs = new Date(data.ujian.waktu_selesai).getTime();
    CBT.akhirMs = Math.min(batasDurasiMs, batasJadwalMs);
    CBT.mulaiMs = mulaiMs;
    CBT.ingat = {};
    CBT.kunciPaksaMs = 0; // koreksi dari server bila ia menolak kumpul sebelum waktu minimal
    CBT.kunciTampil = false;

    document.body.classList.add("mode-cbt");
    $("#judul-halaman").textContent = data.ujian.judul;
    const ujInfo = S.ujian.find((x) => x.id === data.ujian.id);
    const jenisUj = (ujInfo && ujInfo.jenis_ujian) || data.ujian.jenis_ujian || "";
    $("#subjudul-halaman").textContent = `${jenisUj ? jenisUj + " • " : ""}${namaMapel(data.ujian.mapel_id)} • ${CBT.soal.length} Soal`;

    CBT.keluarHabis = false;
    renderKerangkaCBT();
    mulaiCountdownCBT();
    perangkatMulai();
    AC.mulai(data.ujian.id, () => kumpulkanUjianSekarang("pelanggaran"));
    terapkanBatasKeluarDaftar(data.ujian.id); // jatah kembali ke daftar (dicek ke server)
  } catch (err) {
    CBT.aktif = false;
    AC.berhenti();
    document.body.classList.remove("mode-cbt");
    if (/sudah menyelesaikan/i.test((err && err.message) || "")) hapusCacheUjian(ujianId);
    if (err && err.gpsInfo) {
      // Masalah GPS / lokasi: tampilkan penjelasan + langkah perbaikan + tombol coba lagi
      konten().innerHTML = AC.htmlMasalahLokasi(err.gpsInfo);
      const btnCoba = $("#ac-coba-lagi");
      if (btnCoba) btnCoba.onclick = () => bukaRuangUjian(ujianId);
    } else {
      konten().innerHTML = kosong(
        "Tidak dapat membuka ujian",
        err.message || "Terjadi kesalahan saat memuat soal ujian.",
        `<a class="btn btn-primary" href="#ujian">&larr; Kembali ke Daftar Ujian</a>`
      );
    }
  }
}

// ---------------------------------------------------------------------
//  Waktu minimal mengerjakan (pengaturan global, menu Pengaturan admin)
//  Tampilan di sini hanya membantu siswa; penolakan sebenarnya di server
//  (26_waktu_minimal.sql) memakai jam & mulai_pada milik server.
// ---------------------------------------------------------------------
function waktuMinimalDtk() {
  const m = Number(AC.cfg && AC.cfg.waktu_minimal_menit) || 0;
  if (m <= 0 || !CBT.mulaiMs || !CBT.akhirMs) return 0;
  const rentang = (CBT.akhirMs - CBT.mulaiMs) / 1000;
  return Math.max(0, Math.min(m * 60, rentang - 60)); // sama dengan aturan di server
}

function sisaKunciSelesaiDtk() {
  const min = waktuMinimalDtk();
  const bukaMs = Math.max(min ? CBT.mulaiMs + min * 1000 : 0, CBT.kunciPaksaMs || 0);
  if (!bukaMs) return 0;
  return Math.max(0, Math.ceil((bukaMs - sekarangMs()) / 1000));
}

function perbaruiKunciSelesai() {
  const kunci = sisaKunciSelesaiDtk() > 0;
  if (!kunci && !CBT.kunciTampil) return; // tidak ada yang perlu diubah
  // Tombol tetap berlabel biasa; selama terkunci tampil abu-abu, tidak bisa diklik, dan ada keterangan.
  const menit = Math.ceil(waktuMinimalDtk() / 60);
  const ket = menit > 0
    ? `Ujian baru bisa diselesaikan setelah ${menit} menit pengerjaan. Periksa kembali jawaban Anda.`
    : "Ujian belum bisa diselesaikan karena waktu minimal pengerjaan belum tercapai. Periksa kembali jawaban Anda.";
  [$("#cbt-kumpulkan-btn"), $("#cbt-selesai-utama")].forEach((b) => {
    if (!b) return;
    b.disabled = kunci;
    b.style.filter = kunci ? "grayscale(1)" : "";
  });
  [$("#cbt-kunci-ket-samping"), $("#cbt-kunci-ket-utama")].forEach((el) => {
    if (!el) return;
    el.hidden = !kunci;
    if (kunci) el.textContent = ket;
  });
  CBT.kunciTampil = kunci;
}

// Kembali ke aplikasi saat tombol masih terkunci: selaraskan jam dengan server
// (di sebagian HP jam internal browser berhenti saat layar dikunci).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !CBT.aktif || CBT.submitting) return;
  if (sisaKunciSelesaiDtk() <= 0) return;
  sinkronWaktuServer().then(perbaruiKunciSelesai).catch(() => {});
});

function mulaiCountdownCBT() {
  hentikanTimerCBT();
  const updateJam = () => {
    const sisaMs = CBT.akhirMs - sekarangMs(); // jam server, bukan jam HP
    const elTimer = $("#cbt-timer-teks");
    const boxTimer = $("#cbt-timer-box");
    if (!elTimer) return;

    if (sisaMs <= 0) {
      elTimer.textContent = "00:00:00";
      hentikanTimerCBT();
      if (!CBT.submitting) {
        toast("Waktu ujian telah habis! Jawaban dikumpulkan otomatis...", "error");
        kumpulkanUjianSekarang(true);
      }
      return;
    }

    const totalDetik = Math.floor(sisaMs / 1000);
    const jam = String(Math.floor(totalDetik / 3600)).padStart(2, "0");
    const menit = String(Math.floor((totalDetik % 3600) / 60)).padStart(2, "0");
    const detik = String(totalDetik % 60).padStart(2, "0");
    elTimer.textContent = `${jam}:${menit}:${detik}`;
    perbaruiKunciSelesai();

    // Pengingat 10 / 5 / 1 menit. Hanya tampil saat batas baru saja terlewati (bukan saat dibuka ulang)
    // dan hanya bila durasi ujian cukup panjang (tidak muncul tepat di awal ujian pendek).
    const durasiDtk = (CBT.akhirMs - CBT.mulaiMs) / 1000;
    for (const t of [10, 5, 1]) {
      if (!CBT.ingat[t] && totalDetik <= t * 60) {
        CBT.ingat[t] = true;
        if (totalDetik >= t * 60 - 20 && durasiDtk > t * 60 + 120) pengingatWaktu(t);
      }
    }

    if (boxTimer) {
      boxTimer.classList.toggle("kritis", totalDetik <= 300); // < 5 menit merah berkedip
    }
  };

  updateJam();
  CBT.timerId = setInterval(updateJam, 1000);
}

// Jatah kembali ke daftar ujian habis: tombol abu-abu & tidak bisa diklik.
function matikanTombolDaftar() {
  CBT.keluarHabis = true;
  const b = $("#cbt-btn-keluar");
  if (!b) return;
  b.disabled = true;
  b.innerHTML = "&larr; Daftar (habis)";
  b.title = "Kesempatan kembali ke daftar ujian sudah habis";
}

async function terapkanBatasKeluarDaftar(ujianId) {
  const st = await AC.statusKeluarDaftar(ujianId);
  if (!st || st.sisa > 0) return;
  if (CBT.aktif && CBT.ujian && CBT.ujian.id === ujianId) matikanTombolDaftar();
}

function renderKerangkaCBT() {
  konten().innerHTML = `
    <div class="cbt-shell font-${CBT.fontSize}" id="cbt-shell">
      <!-- TOP BAR UJIAN (Sticky di HP, Tablet, Laptop) -->
      <div class="cbt-topbar">
        <div class="cbt-top-kiri">
          <button class="btn btn-kecil" type="button" id="cbt-btn-keluar" title="Kembali ke daftar ujian">&larr; Daftar</button>
          <div class="cbt-no-badge">
            Soal <strong id="cbt-no-aktif">1</strong> <span class="ket">/ ${CBT.soal.length}</span>
          </div>
          <span class="cbt-simpan-pill" id="cbt-status-simpan">Tersimpan ✓</span>
          <span class="cbt-perangkat" id="cbt-perangkat" aria-label="Status baterai dan sinyal"></span>
        </div>

        <div class="cbt-top-kanan">
          <div class="cbt-font-ctrl" aria-label="Ukuran huruf soal">
            <button type="button" data-font="kecil" title="Huruf Kecil">A-</button>
            <button type="button" data-font="normal" class="aktif" title="Huruf Normal">A</button>
            <button type="button" data-font="besar" title="Huruf Besar">A+</button>
          </div>
          ${typeof ZOOM !== "undefined" ? `<span class="zoom-cbt">${ZOOM.html()}</span>` : ""}
          <div class="cbt-timer" id="cbt-timer-box" aria-live="polite">
            <span class="cbt-timer-label">Sisa Waktu</span>
            <strong class="mono" id="cbt-timer-teks">--:--:--</strong>
          </div>
        </div>
      </div>

      <!-- AREA UTAMA: LEMBAR SOAL (KIRI) + NAVIGASI NOMOR (KANAN/DRAWER) -->
      <div class="cbt-workspace">
        <section class="cbt-soal-card" aria-label="Lembar soal ujian">
          <div id="cbt-soal-isi"></div>

          <!-- BAR NAVIGASI BAWAH (Mudah dijangkau ibu jari di HP & Tablet) -->
          <div class="cbt-nav-bawah">
            <button class="btn" type="button" id="cbt-prev">&larr; Sebelumnya</button>

            <label class="cbt-ragu-check">
              <input type="checkbox" id="cbt-cek-ragu">
              <span>Ragu-ragu</span>
            </label>

            <button class="btn btn-kecil cbt-btn-grid-hp" type="button" id="cbt-buka-grid">
              &#9783; Nomor (<span id="cbt-terjawab-hp">0</span>/${CBT.soal.length})
            </button>

            <button class="btn btn-primary" type="button" id="cbt-next">Berikutnya &rarr;</button>
            <button class="btn btn-amber" type="button" id="cbt-selesai-utama" hidden>Selesai Ujian ✓</button>
          </div>
          <p class="ket" id="cbt-kunci-ket-utama" hidden style="text-align:center;margin:.6rem 0 0"></p>
        </section>

        <!-- PANEL NAVIGASI NOMOR SOAL (Sidebar di Laptop/Tablet, Bottom-Sheet Drawer di HP) -->
        <div class="cbt-drawer-backdrop" id="cbt-drawer-bg"></div>
        <aside class="cbt-nav-panel" id="cbt-nav-panel" aria-label="Navigasi nomor soal">
          <div class="cbt-nav-head">
            <div>
              <strong>Navigasi Soal</strong>
              <small id="cbt-ringkas-jawab">0 dari ${CBT.soal.length} terjawab</small>
            </div>
            <button class="btn btn-kecil cbt-tutup-grid" type="button" id="cbt-tutup-grid">&times;</button>
          </div>

          <div class="cbt-legenda">
            <span><i class="lg-aktif"></i> Aktif</span>
            <span><i class="lg-jawab"></i> Dijawab</span>
            <span><i class="lg-ragu"></i> Ragu</span>
            <span><i class="lg-kosong"></i> Belum</span>
          </div>

          <div class="cbt-nomor-grid" id="cbt-nomor-grid"></div>

          <div class="cbt-nav-foot">
            <button class="btn btn-amber btn-besar" type="button" id="cbt-kumpulkan-btn" style="width:100%">
              Kumpulkan Ujian
            </button>
            <p class="ket" id="cbt-kunci-ket-samping" hidden style="text-align:center;margin:.5rem 0 0"></p>
          </div>
        </aside>
      </div>

      <!-- FOOTER SAAT UJIAN -->
      <footer class="cbt-footer">${esc(CONFIG.NAMA_SEKOLAH)} - ${tahunWITA()}</footer>
    </div>
  `;

  if (typeof ZOOM !== "undefined") ZOOM.terapkan();

  // Event Ukuran Font
  konten().querySelectorAll("[data-font]").forEach((btn) => {
    btn.onclick = () => {
      CBT.fontSize = btn.dataset.font;
      const shell = $("#cbt-shell");
      shell.classList.remove("font-kecil", "font-normal", "font-besar");
      shell.classList.add(`font-${CBT.fontSize}`);
      konten().querySelectorAll("[data-font]").forEach((b) => b.classList.remove("aktif"));
      btn.classList.add("aktif");
    };
  });

  // Event Drawer Nomor Soal (HP)
  const tutupDrawer = () => $("#cbt-nav-panel")?.classList.remove("buka");
  $("#cbt-buka-grid").onclick = () => $("#cbt-nav-panel")?.classList.add("buka");
  $("#cbt-tutup-grid").onclick = tutupDrawer;
  $("#cbt-drawer-bg").onclick = tutupDrawer;

  // Navigasi Prev / Next
  $("#cbt-prev").onclick = () => {
    if (CBT.idx > 0) {
      CBT.idx--;
      renderSoalAktif();
    }
  };
  $("#cbt-next").onclick = () => {
    if (CBT.idx < CBT.soal.length - 1) {
      CBT.idx++;
      renderSoalAktif();
    }
  };

  // Checkbox Ragu-ragu
  $("#cbt-cek-ragu").onchange = (e) => {
    const s = CBT.soal[CBT.idx];
    if (!s) return;
    if (e.target.checked) CBT.ragu.add(s.id);
    else CBT.ragu.delete(s.id);
    renderGridNomor();
    simpanProgresKeServer(false);
  };

  // Tombol Kumpulkan Ujian
  $("#cbt-kumpulkan-btn").onclick = () => konfirmasiKumpulkanUjian();
  $("#cbt-selesai-utama").onclick = () => konfirmasiKumpulkanUjian();

  // Tombol Kembali ke Daftar (jatah dibatasi; server yang menghitung)
  $("#cbt-btn-keluar").onclick = async () => {
    const tombol = $("#cbt-btn-keluar");
    if (!tombol || tombol.disabled) return;
    tombol.disabled = true;
    const boleh = await AC.catatKeluarDaftar(CBT.ujian.id, false);
    if (!boleh) {
      matikanTombolDaftar();
      toast("Kesempatan kembali ke daftar ujian sudah habis. Silakan lanjutkan mengerjakan.", "error");
      return;
    }
    await simpanProgresKeServer(true);
    CBT.izinKeluar = true;
    location.hash = "ujian";
  };
  if (CBT.keluarHabis) matikanTombolDaftar();

  renderSoalAktif();
}

function renderGridNomor() {
  const grid = $("#cbt-nomor-grid");
  if (!grid) return;

  let jmlTerjawab = 0;
  grid.innerHTML = CBT.soal.map((s, i) => {
    const terjawab = cekSoalTerjawab(s, CBT.jawaban[s.id]);
    if (terjawab) jmlTerjawab++;
    const ragu = CBT.ragu.has(s.id);
    const aktif = i === CBT.idx;

    const kelas = ["cbt-no-btn"];
    if (aktif) kelas.push("aktif");
    if (ragu) kelas.push("ragu");
    else if (terjawab) kelas.push("jawab");

    return `<button type="button" class="${kelas.join(" ")}" data-lompat="${i}">${i + 1}</button>`;
  }).join("");

  const r1 = $("#cbt-ringkas-jawab");
  if (r1) r1.textContent = `${jmlTerjawab} dari ${CBT.soal.length} terjawab`;
  const r2 = $("#cbt-terjawab-hp");
  if (r2) r2.textContent = jmlTerjawab;

  grid.querySelectorAll("[data-lompat]").forEach((btn) => {
    btn.onclick = () => {
      CBT.idx = Number(btn.dataset.lompat);
      $("#cbt-nav-panel")?.classList.remove("buka");
      renderSoalAktif();
    };
  });
}

function renderSoalAktif() {
  const s = CBT.soal[CBT.idx];
  if (!s) return;

  $("#cbt-no-aktif").textContent = CBT.idx + 1;
  $("#cbt-cek-ragu").checked = CBT.ragu.has(s.id);

  const isFirst = CBT.idx === 0;
  const isLast = CBT.idx === CBT.soal.length - 1;
  $("#cbt-prev").disabled = isFirst;
  $("#cbt-next").hidden = isLast;
  $("#cbt-selesai-utama").hidden = !isLast;

  const jwb = CBT.jawaban[s.id];
  const labelJenis = {
    pg: "Pilihan Ganda",
    pgk: "Pilihan Ganda Kompleks (Pilih lebih dari satu)",
    bs: "Benar / Salah",
    jodoh: "Menjodohkan",
    esai: "Uraian / Esai",
  }[s.jenis] || "Soal Ujian";

  let areaJawabanHtml = "";

  // 1. Pilihan Ganda (PG)
  if (s.jenis === "pg") {
    const opsi = Array.isArray(s.pilihan) ? s.pilihan : [];
    areaJawabanHtml = `
      <div class="cbt-opsi-list" role="radiogroup" aria-label="Pilihan jawaban">
        ${opsi.map((teks, idx) => {
          const dipilih = jwb === idx;
          return `
            <button type="button" class="cbt-opsi-btn ${dipilih ? "dipilih" : ""}" data-pilih-pg="${idx}">
              <span class="cbt-opsi-huruf">${HURUF_OPSI[idx] || idx + 1}</span>
              <span class="cbt-opsi-teks">${br(teks)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  // 2. Pilihan Ganda Kompleks (PGK)
  else if (s.jenis === "pgk") {
    const opsi = Array.isArray(s.pilihan) ? s.pilihan : [];
    const dipilihSet = new Set(Array.isArray(jwb) ? jwb : []);
    areaJawabanHtml = `
      <p class="ket" style="margin-bottom:.6rem">Centang semua jawaban yang benar:</p>
      <div class="cbt-opsi-list">
        ${opsi.map((teks, idx) => {
          const dipilih = dipilihSet.has(idx);
          return `
            <button type="button" class="cbt-opsi-btn cbt-opsi-multi ${dipilih ? "dipilih" : ""}" data-pilih-pgk="${idx}">
              <span class="cbt-opsi-cek">${dipilih ? "✓" : ""}</span>
              <span class="cbt-opsi-huruf">${HURUF_OPSI[idx] || idx + 1}</span>
              <span class="cbt-opsi-teks">${br(teks)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  // 3. Benar / Salah (BS)
  else if (s.jenis === "bs") {
    const pernyataan = Array.isArray(s.pilihan) ? s.pilihan : [];
    const arrJwb = Array.isArray(jwb) ? jwb : [];
    areaJawabanHtml = `
      <div class="cbt-bs-list">
        ${pernyataan.map((teks, idx) => {
          const val = arrJwb[idx];
          return `
            <div class="cbt-bs-row">
              <div class="cbt-bs-teks">${br(teks)}</div>
              <div class="cbt-bs-aksi">
                <button type="button" class="btn btn-kecil ${val === true ? "btn-primary" : ""}" data-bs-idx="${idx}" data-bs-val="true">Benar</button>
                <button type="button" class="btn btn-kecil ${val === false ? "btn-danger" : ""}" data-bs-idx="${idx}" data-bs-val="false">Salah</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // 4. Menjodohkan (Jodoh)
  else if (s.jenis === "jodoh") {
    const kiri = (s.pilihan && Array.isArray(s.pilihan.kiri)) ? s.pilihan.kiri : [];
    const kanan = (s.pilihan && Array.isArray(s.pilihan.kanan)) ? s.pilihan.kanan : [];
    const arrJwb = Array.isArray(jwb) ? jwb : [];
    const kananAdaGambar = kanan.some(adaGambar);
    const hurufKanan = (i) => HURUF_OPSI[i] || String(i + 1);
    const daftarKananGambar = kananAdaGambar ? `
      <div class="cbt-jodoh-daftar">
        <div class="ket">Pilihan pasangan:</div>
        ${kanan.map((t, i) => `<div class="cbt-jodoh-item"><span class="cbt-opsi-huruf">${hurufKanan(i)}</span><div>${br(t)}</div></div>`).join("")}
      </div>` : "";
    areaJawabanHtml = `
      ${daftarKananGambar}
      <div class="cbt-jodoh-list">
        ${kiri.map((teksKiri, idx) => {
          const terpilihIdx = typeof arrJwb[idx] === "number" ? arrJwb[idx] : "";
          return `
            <div class="cbt-jodoh-row">
              <div class="cbt-jodoh-kiri">${br(teksKiri)}</div>
              <div class="cbt-jodoh-panah">&rarr;</div>
              <select class="pilih cbt-jodoh-pilih" data-jodoh-idx="${idx}">
                <option value="">-- Pilih pasangan --</option>
                ${kanan.map((teksKanan, kIdx) => `
                  <option value="${kIdx}" ${terpilihIdx === kIdx ? "selected" : ""}>${kananAdaGambar ? `${hurufKanan(kIdx)}${teksRingkasGambar(teksKanan).replace(/🖼/g, "").trim() ? " - " + esc(teksRingkasGambar(teksKanan).replace(/🖼/g, "").trim()) : ""}` : esc(teksKanan)}</option>
                `).join("")}
              </select>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // 5. Esai
  else {
    areaJawabanHtml = `
      <label class="f">Jawaban Anda:
        <textarea class="area" id="cbt-esai-input" rows="6" placeholder="Ketik jawaban uraian Anda di sini...">${esc(typeof jwb === "string" ? jwb : "")}</textarea>
      </label>
    `;
  }

  $("#cbt-soal-isi").innerHTML = `
    <div class="cbt-soal-meta">
      <span class="badge info">${esc(labelJenis)}</span>
    </div>
    <div class="cbt-pertanyaan">${br(s.pertanyaan)}</div>
    <div class="cbt-jawaban-wrap">${areaJawabanHtml}</div>
  `;

  // Pasang Event Jawaban sesuai tipe soal
  const box = $("#cbt-soal-isi");

  box.querySelectorAll("[data-pilih-pg]").forEach((btn) => {
    btn.onclick = () => {
      if (!CBT.aktif || CBT.submitting) return;
      CBT.jawaban[s.id] = Number(btn.dataset.pilihPg);
      renderSoalAktif();
      simpanProgresKeServer(false);
    };
  });

  box.querySelectorAll("[data-pilih-pgk]").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.pilihPgk);
      const set = new Set(Array.isArray(CBT.jawaban[s.id]) ? CBT.jawaban[s.id] : []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      CBT.jawaban[s.id] = [...set].sort((a, b) => a - b);
      renderSoalAktif();
      simpanProgresKeServer(false);
    };
  });

  box.querySelectorAll("[data-bs-idx]").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.bsIdx);
      const val = btn.dataset.bsVal === "true";
      const cur = Array.isArray(CBT.jawaban[s.id]) ? [...CBT.jawaban[s.id]] : [];
      cur[idx] = val;
      CBT.jawaban[s.id] = cur;
      renderSoalAktif();
      simpanProgresKeServer(false);
    };
  });

  box.querySelectorAll("[data-jodoh-idx]").forEach((sel) => {
    sel.onchange = () => {
      const idx = Number(sel.dataset.jodohIdx);
      const cur = Array.isArray(CBT.jawaban[s.id]) ? [...CBT.jawaban[s.id]] : [];
      cur[idx] = sel.value === "" ? null : Number(sel.value);
      CBT.jawaban[s.id] = cur;
      renderGridNomor();
      simpanProgresKeServer(false);
    };
  });

  const esaiEl = box.querySelector("#cbt-esai-input");
  if (esaiEl) {
    esaiEl.oninput = () => {
      CBT.jawaban[s.id] = esaiEl.value;
      renderGridNomor();
      simpanProgresKeServer(false);
    };
  }

  renderGridNomor();
}

function konfirmasiKumpulkanUjian() {
  const kunciSisa = sisaKunciSelesaiDtk();
  if (kunciSisa > 0) {
    toast("Ujian belum bisa dikumpulkan. Waktu minimal pengerjaan belum tercapai.", "info");
    perbaruiKunciSelesai();
    return;
  }
  let terjawab = 0;
  CBT.soal.forEach((s) => {
    if (cekSoalTerjawab(s, CBT.jawaban[s.id])) terjawab++;
  });
  const kosongCount = CBT.soal.length - terjawab;
  const raguCount = CBT.ragu.size;

  const modalKirim = tampilModal("Kumpulkan Jawaban Ujian?", `
    <p>Pastikan Anda telah memeriksa seluruh jawaban sebelum mengumpulkan ujian <b>${esc(CBT.ujian.judul)}</b>.</p>
    <div class="hasil-rincian-angka" style="margin:1rem 0">
      <div class="badge ok">Terjawab: ${terjawab}</div>
      <div class="badge warn">Ragu-ragu: ${raguCount}</div>
      <div class="badge off">Belum Dijawab: ${kosongCount}</div>
    </div>
    ${kosongCount > 0 ? `<div class="catatan">Masih ada <b>${kosongCount} soal</b> yang belum dijawab. Apakah Anda tetap yakin ingin mengakhiri ujian?</div>` : ""}
    <label style="display:flex;gap:.6rem;align-items:flex-start;margin-top:1rem;cursor:pointer;font-weight:600">
      <input type="checkbox" id="cbt-cek-selesai" style="width:1.2rem;height:1.2rem;margin-top:.1rem;flex:none">
      <span>Saya telah selesai mengerjakan ujian ini.</span>
    </label>
  `, {
    aksi: [
      { label: "Periksa Kembali" },
      {
        id: "kirim",
        label: "Kirim Ujian",
        kelas: "btn-primary",
        onClick: async () => {
          await kumpulkanUjianSekarang(false);
        },
      },
    ],
  });

  // Tombol "Kirim Ujian" baru aktif setelah siswa mencentang "selesai".
  const cekSelesai = modalKirim.body.querySelector("#cbt-cek-selesai");
  const tombolKirim = modalKirim.tombol.kirim;
  if (cekSelesai && tombolKirim) {
    tombolKirim.disabled = true;
    cekSelesai.onchange = () => { tombolKirim.disabled = !cekSelesai.checked; };
  }
}

async function kumpulkanUjianSekarang(otomatis = false) {
  if (CBT.submitting || !CBT.ujian) return;
  CBT.submitting = true;
  hentikanTimerCBT();
  if (CBT.saveTimer) { clearTimeout(CBT.saveTimer); CBT.saveTimer = null; }
  if (CBT.retryTimer) { clearTimeout(CBT.retryTimer); CBT.retryTimer = null; }

  const modalProses = tampilModal("Mengumpulkan Ujian", `<p class="memuat">Menyimpan dan menghitung hasil ujian Anda...</p>`, { kunci: true });

  try {
    const { data, error } = await sb.rpc("kumpulkan_ujian_siswa", {
      p_ujian_id: CBT.ujian.id,
      p_jawaban: CBT.jawaban,
      p_ragu: [...CBT.ragu],
    });
    if (error) throw error;

    modalProses.tutup();
    CBT.aktif = false;
    AC.berhenti(true);
    document.body.classList.remove("mode-cbt");
    // Layar soal dibuang: tanpa ini soal tetap ada di belakang popup dan masih bisa
    // diklik bila popup tertutup (klik di luar popup / tombol Esc).
    konten().innerHTML = `<div class="kartu" style="text-align:center;padding:2rem 1rem">
      <h2>Ujian Telah Dikumpulkan</h2>
      <p class="ket">Jawaban Anda sudah tercatat dan tidak dapat diubah lagi.</p>
      <p><a class="btn btn-primary" href="#hasil">Lihat Riwayat Hasil</a></p>
    </div>`;
    sessionStorage.removeItem(`token_ujian_${CBT.ujian.id}`);
    hapusCacheUjian(CBT.ujian.id); // paket soal + jawaban lokal dihapus setelah terkirim

    const menungguEsai = data && data.status_koreksi === "menunggu";
    const bolehNilai = data && data.tampil_nilai !== false && !menungguEsai;
    const nilaiAkhir = Number((data && data.nilai) || 0).toFixed(1);
    const pred = predikatNilai(nilaiAkhir);

    const karenaPelanggaran = otomatis === "pelanggaran";
    tampilModal(karenaPelanggaran ? "Ujian Dikumpulkan Otomatis" : otomatis ? "Waktu Habis - Ujian Selesai" : "Ujian Berhasil Dikumpulkan", `
      ${karenaPelanggaran ? `<div class="catatan" style="margin-bottom:.8rem"><b>Batas pelanggaran tercapai.</b> Ujian dikumpulkan otomatis. Jawaban yang sudah Anda isi tetap tersimpan, dan pelanggaran dapat dilihat oleh guru/pengawas.</div>` : ""}
      <p>Terima kasih <b>${esc(S.me.nama)}</b>, jawaban ujian Anda telah tercatat di sistem.</p>
      ${bolehNilai ? `
        <div class="pw-besar">
          ${nilaiAkhir}
          <div style="font-size:.88rem;font-weight:700;letter-spacing:0;margin-top:.25rem">
            Predikat ${pred.huruf} (${esc(pred.ket)})
          </div>
        </div>
        <div class="hasil-rincian-angka">
          <div class="badge ok">Benar: ${data.jumlah_benar}</div>
          <div class="badge off">Salah: ${data.jumlah_salah}</div>
          <div class="badge warn">Kosong: ${data.jumlah_kosong}</div>
        </div>
      ` : menungguEsai
        ? `<div class="catatan"><b>Menunggu penilaian guru.</b> Ujian ini memiliki ${data.jumlah_esai} soal esai yang dinilai langsung oleh guru. Nilai akhir akan muncul di menu Hasil Ujian setelah guru selesai menilai.</div>`
        : `<div class="catatan">Nilai ujian akan diumumkan setelah pemeriksaan oleh guru/admin.</div>`}
    `, {
      aksi: [
        {
          label: "Lihat Riwayat Hasil",
          kelas: "btn-primary",
          onClick: () => { location.hash = "hasil"; },
        },
      ],
      kunci: true,
    });
  } catch (err) {
    modalProses.tutup();
    CBT.submitting = false;
    const ujianId = CBT.ujian && CBT.ujian.id;
    const tahan = /WAKTU_MINIMAL:(\d+)/.exec((err && (err.message || err.details)) || "");

    // Fungsi ini menghentikan timer ujian di awal. Bila pengumpulan gagal, ujian masih
    // berjalan: hidupkan lagi timernya, kecuali waktu memang sudah habis (otomatis === true).
    if (CBT.aktif && otomatis !== true) mulaiCountdownCBT();

    if (tahan) {
      // Ditolak server karena waktu minimal belum tercapai. Pengumpulan otomatis karena
      // pelanggaran tidak menampilkan pesan: hitungan pelanggaran di server belum masuk,
      // dan acKumpul mencoba lagi sendiri beberapa detik kemudian.
      if (!otomatis) {
        CBT.kunciPaksaMs = sekarangMs() + Number(tahan[1]) * 1000;
        CBT.kunciTampil = true;
        perbaruiKunciSelesai();
        toast("Ujian belum bisa dikumpulkan. Waktu minimal pengerjaan belum tercapai.", "error");
      }
      return;
    }

    toast("Gagal mengumpulkan ujian: " + (err.message || err), "error");

    // Waktu habis lalu gagal terkirim (mis. sinyal putus): coba lagi sendiri sampai berhasil.
    // (Kasus pelanggaran sudah diulang oleh acKumpul di anticurang.js.)
    if (otomatis === true) {
      clearTimeout(CBT.kumpulUlangTimer);
      CBT.kumpulUlangTimer = setTimeout(() => {
        if (CBT.aktif && !CBT.submitting && CBT.ujian && CBT.ujian.id === ujianId) kumpulkanUjianSekarang(true);
      }, 8000);
    }
  }
}

// ---------------------------------------------------------------------
//  Halaman 3: Hasil Ujian Siswa
// ---------------------------------------------------------------------
async function rHasil() {
  await muatDataSiswa();

  const hasilSelesai = S.hasil.filter((h) => h.status === "selesai");
  const ujianMap = new Map(S.ujian.map((u) => [u.id, u]));

  const ujianIds = [...new Set(hasilSelesai.map((h) => h.ujian_id).filter((id) => !ujianMap.has(id)))];
  if (ujianIds.length) {
    try {
      const { data: extraUjian } = await sb.from("ujian").select(UJIAN_KOLOM).in("id", ujianIds);
      (extraUjian || []).forEach((u) => ujianMap.set(u.id, u));
    } catch (_) { /* abaikan */ }
  }

  const nilaiTerbuka = hasilSelesai.filter((h) => {
    const u = ujianMap.get(h.ujian_id);
    return (!u || u.tampil_nilai !== false) && h.status_koreksi !== "menunggu";
  });

  const rataRata = nilaiTerbuka.length
    ? (nilaiTerbuka.reduce((s, h) => s + Number(h.nilai || 0), 0) / nilaiTerbuka.length).toFixed(1)
    : "-";
  const nilaiTertinggi = nilaiTerbuka.length
    ? Math.max(...nilaiTerbuka.map((h) => Number(h.nilai || 0))).toFixed(1)
    : "-";

  konten().innerHTML = `
    <div class="alat">
      <div>
        <p class="ket">Rekapitulasi nilai dan riwayat pengerjaan ujian atas nama <b>${esc(S.me.nama)}</b> (<span class="mono">${esc(S.me.username)}</span>)</p>
      </div>
      <div class="alat-kanan">
        <button class="btn btn-kecil" id="btn-muat-hasil">Muat Ulang</button>
      </div>
    </div>

    <section class="kpi-grid" style="margin-bottom:1.3rem">
      <div class="kpi-kartu kpi-hijau">
        <div class="kpi-atas">
          <span class="kpi-ikon">📋</span>
          <span class="kpi-tag">Selesai</span>
        </div>
        <div class="kpi-nilai">${hasilSelesai.length}</div>
        <div class="kpi-judul">Total Ujian Selesai</div>
        <div class="kpi-sub">Tercatat di riwayat</div>
      </div>

      <div class="kpi-kartu kpi-biru">
        <div class="kpi-atas">
          <span class="kpi-ikon">📊</span>
          <span class="kpi-tag">Rata-rata</span>
        </div>
        <div class="kpi-nilai">${esc(rataRata)}</div>
        <div class="kpi-judul">Rata-Rata Nilai</div>
        <div class="kpi-sub">Dari nilai yang dipublikasikan</div>
      </div>

      <div class="kpi-kartu kpi-amber">
        <div class="kpi-atas">
          <span class="kpi-ikon">⭐</span>
          <span class="kpi-tag">Terbaik</span>
        </div>
        <div class="kpi-nilai">${esc(nilaiTertinggi)}</div>
        <div class="kpi-judul">Nilai Tertinggi</div>
        <div class="kpi-sub">Capaian skor maksimal</div>
      </div>
    </section>

    <section class="panel-mewah">
      <div class="panel-kepala">
        <div>
          <h3>Daftar Hasil Ujian</h3>
          <p class="ket">Klik tombol Detail untuk melihat rincian jawaban benar, salah, dan predikat</p>
        </div>
      </div>

      ${hasilSelesai.length ? `
        <div class="tabel-bungkus">
          <table class="resp">
            <thead>
              <tr>
                <th>Mata Pelajaran</th>
                <th>Nama Ujian</th>
                <th>Waktu Selesai</th>
                <th>Benar / Salah</th>
                <th>Nilai</th>
                <th>Predikat</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${hasilSelesai.map((h) => {
                const u = ujianMap.get(h.ujian_id);
                const judulUjian = u ? u.judul : "Paket Ujian";
                const mapelNama = u ? namaMapel(u.mapel_id) : "-";
                const menunggu = h.status_koreksi === "menunggu";
                const bolehLihat = (!u || u.tampil_nilai !== false) && !menunggu;
                const nilaiAngka = Number(h.nilai || 0).toFixed(1);
                const pred = predikatNilai(h.nilai);
                return `
                  <tr>
                    <td data-label="Mata Pelajaran"><b>${esc(mapelNama)}</b></td>
                    <td data-label="Nama Ujian">${esc(judulUjian)}</td>
                    <td data-label="Waktu Selesai">${esc(formatTanggalJam(h.selesai_pada))}</td>
                    <td data-label="Benar / Salah" class="mono">
                      ${(!u || u.tampil_nilai !== false) ? `${h.jumlah_benar} Benar &bull; ${h.jumlah_salah} Salah${h.jumlah_esai > 0 ? ` &bull; ${h.jumlah_esai} Esai` : ""}` : '<span class="ket">Disembunyikan</span>'}
                    </td>
                    <td data-label="Nilai">
                      ${bolehLihat
                        ? `<strong class="hasil-skor">${esc(nilaiAngka)}</strong>`
                        : menunggu ? `<span class="badge warn">Menunggu penilaian guru</span>`
                        : `<span class="badge warn">Menunggu Rilis</span>`}
                    </td>
                    <td data-label="Predikat">
                      ${bolehLihat
                        ? `<span class="badge ${pred.warna}">${pred.huruf} (${esc(pred.ket)})</span>`
                        : `-`}
                    </td>
                    <td class="aksi">
                      <button class="btn btn-kecil" type="button" data-detail-hasil="${h.id}">Detail</button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      ` : kosong("Belum ada hasil ujian", "Anda belum menyelesaikan ujian apa pun. Hasil dan nilai akan otomatis tampil di sini setelah ujian dikumpulkan.")}
    </section>
  `;

  $("#btn-muat-hasil").onclick = () => rHasil();

  konten().querySelectorAll("[data-detail-hasil]").forEach((btn) => {
    btn.onclick = () => {
      const h = hasilSelesai.find((x) => x.id === btn.dataset.detailHasil);
      if (!h) return;
      const u = ujianMap.get(h.ujian_id);
      const judulUjian = u ? u.judul : "Paket Ujian";
      const mapelNama = u ? namaMapel(u.mapel_id) : "-";
      const menunggu = h.status_koreksi === "menunggu";
      const bolehLihat = (!u || u.tampil_nilai !== false) && !menunggu;
      const pred = predikatNilai(h.nilai);

      tampilModal("Rincian Hasil Ujian", `
        <div class="hasil-modal-box">
          <div class="hasil-modal-identitas">
            <div><small>Peserta</small><b>${esc(S.me.nama)} (${esc(S.me.username)})</b></div>
            <div><small>Kelas</small><b>${esc(S.kelas ? S.kelas.nama : "-")}</b></div>
            <div><small>Mata Pelajaran</small><b>${esc(mapelNama)}</b></div>
            <div><small>Ujian</small><b>${esc(judulUjian)}</b></div>
            <div><small>Mulai Mengerjakan</small><b>${esc(formatTanggalJam(h.mulai_pada))}</b></div>
            <div><small>Selesai Mengerjakan</small><b>${esc(formatTanggalJam(h.selesai_pada))}</b></div>
          </div>
          ${bolehLihat ? `
            <div class="pw-besar" style="margin-top:1rem">
              ${Number(h.nilai || 0).toFixed(1)}
              <div style="font-size:.85rem;font-weight:700;letter-spacing:0;margin-top:.2rem">Predikat ${pred.huruf} &mdash; ${esc(pred.ket)}</div>
            </div>
            <div class="hasil-rincian-angka">
              <div class="badge ok">Benar: ${h.jumlah_benar}</div>
              <div class="badge off">Salah: ${h.jumlah_salah}</div>
              <div class="badge warn">Kosong: ${h.jumlah_kosong}</div>
            </div>
          ` : menunggu
            ? `<div class="catatan" style="margin-top:1rem"><b>Menunggu penilaian guru.</b> Soal esai Anda sedang dinilai guru. Nilai akhir akan tampil di sini setelah selesai dinilai.</div>`
            : `<div class="catatan" style="margin-top:1rem">Nilai untuk ujian ini belum ditampilkan oleh guru/admin.</div>`}
          ${h.catatan_guru ? `<div class="catatan" style="margin-top:.8rem"><b>Catatan Guru:</b> ${esc(h.catatan_guru)}</div>` : ""}
        </div>
      `, {
        aksi: [{ label: "Tutup", kelas: "btn-primary" }],
      });
    };
  });
}

// ---------------------------------------------------------------------
//  Router & Inisialisasi Portal Siswa
// ---------------------------------------------------------------------
const MENU_SISWA = [
  { key: "dashboard", judul: "Dashboard", sub: "Identitas peserta & ringkasan akademik", ikon: "🏠", render: rDashboard },
  { key: "ujian", judul: "UJIAN", sub: "Daftar paket ujian & ruang pengerjaan soal", ikon: "📝", render: rUjian, lencanaId: "lencana-ujian" },
  { key: "hasil", judul: "Hasil Ujian", sub: "Rekap nilai & riwayat ujian selesai", ikon: "🏆", render: rHasil },
  { key: "panduan", judul: "Panduan & Tata Tertib", sub: "Cara memakai aplikasi, tata cara & tata tertib ujian", ikon: "📖", render: () => rPanduan() },
];

const HALAMAN_SISWA = {};
MENU_SISWA.forEach((m) => { HALAMAN_SISWA[m.key] = m; });

// Penjaga alamat saat ujian berlangsung: siswa tidak boleh pindah halaman dengan
// mengetik #dashboard / #hasil / #panduan di address bar. Satu-satunya jalan keluar
// adalah tombol Kumpulkan atau Daftar (yang jatahnya dihitung server).
// Memakai replaceState supaya tidak memicu hashchange lagi dan ruang ujian tidak dimuat ulang.
function jagaHashUjian() {
  if (!CBT.aktif || !CBT.ujian) return false;
  if (CBT.izinKeluar) { CBT.izinKeluar = false; return false; }
  const ruang = `ujian/${CBT.ujian.id}`;
  try { history.replaceState(history.state, "", "#" + ruang); } catch (_) { /* abaikan */ }
  if (location.hash.slice(1) !== ruang) return false; // gagal memulihkan alamat: biarkan alur lama
  toast("Ujian sedang berlangsung. Gunakan tombol Kumpulkan atau Daftar di layar untuk keluar.", "error");
  return true;
}

async function tampilHalamanSiswa() {
  if (jagaHashUjian()) return;
  const key = location.hash.slice(1).split("/")[0];
  const info = HALAMAN_SISWA[key] || HALAMAN_SISWA.dashboard;

  if (info.key !== "ujian" && CBT.aktif) {
    CBT.aktif = false;
    AC.berhenti();
    hentikanTimerCBT();
    document.body.classList.remove("mode-cbt");
  }
  if (info.key !== "ujian") acKeluarFs(); // di luar menu ujian layar selalu normal

  $("#judul-halaman").textContent = info.judul;
  $("#subjudul-halaman").textContent = info.sub || "";
  document.title = `${info.judul} - Portal Siswa | EXAM MAPPAGURU`;
  document.querySelectorAll("#menu a").forEach((a) => a.removeAttribute("aria-current"));
  const aktif = $(`#menu a[href="#${info.key}"]`);
  if (aktif) aktif.setAttribute("aria-current", "page");
  $("#app").classList.remove("buka");
  konten().innerHTML = '<p class="memuat">Memuat data...</p>';
  try {
    await info.render();
  } catch (e) {
    konten().innerHTML = `<div class="galat-blok"><b>Gagal memuat halaman.</b><br>${esc(e.message || e)}</div>`;
  }
}

function bangunMenuSiswa() {
  $("#menu").innerHTML = `
    <div class="menu-grup-label">Menu Peserta</div>
    ${MENU_SISWA.map((item) => `
      <a href="#${item.key}">
        <span class="menu-kiri"><span class="menu-ikon" aria-hidden="true">${item.ikon}</span><span>${esc(item.judul)}</span></span>
        ${item.lencanaId ? `<span class="lencana" id="${item.lencanaId}" hidden>0</span>` : ""}
      </a>
    `).join("")}
  `;
}

(async () => {
  if (configBelumDiisi()) {
    $("#layar-memuat").innerHTML = "Pengaturan belum diisi. Buka config.js dan isi SUPABASE_URL serta SUPABASE_ANON_KEY.";
    return;
  }

  let profil = null;
  try { profil = await ambilProfilSaya(); } catch (_) { /* belum login */ }

  if (!profil || profil.peran !== "siswa" || !profil.aktif) {
    bersihkanSemuaCache();
    await keluarAman();
    location.replace("index.html");
    return;
  }

  S.me = profil;
  bersihkanCacheAkunLain();
  await muatPengaturanUmum();
  $("#nama-sekolah").textContent = CONFIG.NAMA_SEKOLAH;
  $("#nama-saya").textContent = profil.nama;

  if (profil.kelas_id) {
    const { data: kData } = await sb.from("kelas").select("nama").eq("id", profil.kelas_id).maybeSingle();
    if (kData) {
      S.kelas = kData;
      $("#kelas-saya").textContent = `Kelas ${kData.nama} · NISN ${profil.username}`;
    } else {
      $("#kelas-saya").textContent = `NISN ${profil.username}`;
    }
  }

  const badgeNisn = $("#badge-nisn");
  if (badgeNisn) {
    badgeNisn.style.display = "inline-block";
    badgeNisn.textContent = `NISN: ${profil.username}`;
  }

  const thnEl = $("#tahun-cipta");
  if (thnEl) thnEl.textContent = tahunWITA();
  const fSekolah = $("#footer-sekolah");
  if (fSekolah) fSekolah.textContent = CONFIG.NAMA_SEKOLAH;
  const av = $("#avatar-saya");
  if (av && profil.nama) av.textContent = profil.nama.trim().charAt(0).toUpperCase();

  bangunMenuSiswa();
  $("#btn-keluar").onclick = async () => {
    const sedangUjian = CBT.aktif && CBT.ujian;
    const pesan = sedangUjian
      ? "Ujian Anda <b>sedang berlangsung</b>. Jika keluar sekarang, ujian belum dikumpulkan dan waktu tetap berjalan. Yakin ingin keluar?"
      : "Apakah Anda yakin ingin keluar dari aplikasi?";
    if (!await konfirmasi(pesan, { judul: "Keluar", ya: "Ya, keluar", bahaya: true })) return;
    AC.berhenti();
    bersihkanSemuaCache();
    await keluarAman();
    location.replace("index.html");
  };
  $("#btn-menu").onclick = () => $("#app").classList.add("buka");
  $("#tirai").onclick = () => $("#app").classList.remove("buka");
  window.addEventListener("hashchange", tampilHalamanSiswa);
  // Koneksi pulih -> langsung sinkronkan jawaban yang tertunda
  window.addEventListener("online", () => {
    if (CBT.aktif && !CBT.submitting) { CBT.gagalSync = 0; simpanProgresKeServer(true); }
  });
  // Pindah tab / layar mati / halaman ditutup -> kirim sisa perubahan sekarang
  // (localStorage sudah menyimpan; ini hanya mempercepat cadangan ke server)
  const kirimSisa = () => {
    if (CBT.aktif && !CBT.submitting && CBT.rev !== CBT.revSync && CBT.jalankanSync) CBT.jalankanSync();
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) kirimSisa(); });
  window.addEventListener("pagehide", kirimSisa);

  $("#layar-memuat").hidden = true;
  $("#app").hidden = false;
  tampilHalamanSiswa();
})();

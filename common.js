"use strict";
// =====================================================================
//  Alat bersama (dipakai halaman login dan halaman admin)
// =====================================================================

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

function configBelumDiisi() {
  return !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("XXXX") ||
         !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.startsWith("ISI_");
}

// Aturan username HARUS sama dengan Edge Function.
const norm = (s) => String(s ?? "").trim().toLowerCase();
const usernameValid = (u) => /^[a-z0-9._-]{3,40}$/.test(u);
const emailDari = (u) => `${u}@${CONFIG.DOMAIN}`;
const urut = (a, b) => String(a).localeCompare(String(b), "id", { numeric: true, sensitivity: "base" });
function normJK(s) {
  const v = String(s ?? "").trim().toLowerCase();
  if (!v) return "";
  if (["l", "lk", "laki-laki", "laki laki", "pria"].includes(v)) return "L";
  if (["p", "pr", "perempuan", "wanita"].includes(v)) return "P";
  return "?";
}

// Wajib dipakai untuk semua teks yang disisipkan ke HTML (mencegah XSS).
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function akar(id) {
  let e = document.getElementById(id);
  if (!e) { e = document.createElement("div"); e.id = id; document.body.appendChild(e); }
  return e;
}

function toast(pesan, jenis = "info") {
  const t = document.createElement("div");
  t.className = "toast " + jenis;
  t.setAttribute("role", jenis === "error" ? "alert" : "status");
  t.textContent = pesan;
  akar("toast-root").appendChild(t);
  setTimeout(() => t.remove(), jenis === "error" ? 7000 : 3500);
}

// ---------- modal ----------
function tampilModal(judul, isiHtml, opsi = {}) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  if (opsi.kunci) bg.dataset.kunci = "1";
  bg.innerHTML = `<div class="modal ${opsi.lebar || ""}" role="dialog" aria-modal="true" aria-label="${esc(judul)}">
    <header><h2>${esc(judul)}</h2>${opsi.kunci ? "" : '<button class="tutup" aria-label="Tutup">&times;</button>'}</header>
    <div class="modal-body">${isiHtml}</div><footer></footer></div>`;
  akar("modal-root").appendChild(bg);
  const foot = bg.querySelector("footer");
  const m = {
    el: bg, body: bg.querySelector(".modal-body"), tombol: {},
    tutup() { if (!bg.isConnected) return; bg.remove(); if (opsi.onTutup) opsi.onTutup(); },
    setAksi(daftar) {
      foot.innerHTML = ""; m.tombol = {};
      daftar.forEach((a) => {
        const b = document.createElement("button");
        b.className = "btn " + (a.kelas || "");
        b.textContent = a.label;
        b.onclick = async () => {
          b.disabled = true; let r;
          try { r = a.onClick ? await a.onClick(m) : undefined; }
          catch (e) { toast(e.message || String(e), "error"); r = false; }
          if (b.isConnected) b.disabled = false;
          if (r !== false && a.tutup !== false) m.tutup();
        };
        if (a.id) m.tombol[a.id] = b;
        foot.appendChild(b);
      });
      foot.hidden = !daftar.length;
    },
  };
  bg._m = m;
  const x = bg.querySelector(".tutup"); if (x) x.onclick = () => m.tutup();
  if (!opsi.kunci) bg.addEventListener("mousedown", (e) => { if (e.target === bg) m.tutup(); });
  m.setAksi(opsi.aksi || []);
  const f = m.body.querySelector("input:not([type=checkbox]),select,textarea"); if (f) f.focus();
  return m;
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const semua = document.querySelectorAll(".modal-bg");
  const akhir = semua[semua.length - 1];
  if (akhir && !akhir.dataset.kunci) akhir._m.tutup();
});

// pesan = HTML (bagian dari pengguna harus sudah di-esc)
function konfirmasi(pesan, { ya = "Ya, lanjutkan", bahaya = false, judul = "Konfirmasi" } = {}) {
  return new Promise((res) => {
    tampilModal(judul, `<p>${pesan}</p>`, {
      onTutup: () => res(false),
      aksi: [
        { label: "Batal", onClick: () => res(false) },
        { label: ya, kelas: bahaya ? "btn-danger" : "btn-primary", onClick: () => res(true) },
      ],
    });
  });
}

// ---------- antrean paralel ----------
async function antre(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) { const k = i++; if (k >= items.length) break; await fn(items[k], k); }
  }));
}

// ---------- panggil Edge Function kelola-akun ----------
async function panggilFungsi(body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Sesi habis. Silakan login ulang");
  let r;
  try {
    r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/kelola-akun`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Tidak bisa terhubung ke server. Periksa koneksi internet");
  }
  let j;
  try { j = await r.json(); }
  catch (e) { throw new Error(`Respons server tidak dikenal (status ${r.status}). Pastikan fungsi kelola-akun sudah di-deploy dan "Verify JWT" dimatikan`); }
  if (!j.ok) { const e = new Error(j.pesan || "Permintaan gagal"); e.data = j; throw e; }
  return j;
}

async function ambilProfilSaya() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from("profil").select("*").eq("id", session.user.id).maybeSingle();
  return data;
}


// =====================================================================
//  WAKTU SERVER (WITA / Asia/Makassar, UTC+8)
//  Aplikasi TIDAK mempercayai jam perangkat (HP/laptop). Semua timer dan
//  status jadwal memakai jam server:
//     sekarangMs() = jam server saat sinkron + selisih performance.now()
//  performance.now() adalah jam monoton: tidak terpengaruh walau pengguna
//  mengubah jam/zona waktu perangkat di tengah ujian.
//  Validasi sesungguhnya tetap di server (now()); ini hanya untuk tampilan.
// =====================================================================
const ZONA_WITA = "Asia/Makassar";
const OFFSET_WITA_MS = 8 * 3600 * 1000;
const WAKTU = { serverMs0: Date.now(), perf0: performance.now(), sinkron: false, siap: null };

async function sinkronWaktuServer() {
  let terbaik = null;
  for (let i = 0; i < 2; i++) {
    try {
      const t0 = performance.now();
      const { data, error } = await sb.rpc("waktu_server");
      const t1 = performance.now();
      if (error || !data || data.epoch_ms == null) continue;
      const rtt = t1 - t0;
      // pakai sampel dengan latensi terkecil (paling akurat)
      if (!terbaik || rtt < terbaik.rtt) terbaik = { rtt, serverMs: Number(data.epoch_ms), t1 };
    } catch (_) { /* abaikan: pakai sinkron sebelumnya */ }
  }
  if (!terbaik) return false;
  WAKTU.serverMs0 = terbaik.serverMs + terbaik.rtt / 2;
  WAKTU.perf0 = terbaik.t1;
  WAKTU.sinkron = true;
  return true;
}

const sekarangMs = () => WAKTU.serverMs0 + (performance.now() - WAKTU.perf0);
const sekarangDate = () => new Date(sekarangMs());

// ---------------------------------------------------------------------
//  Pengaturan umum: Tahun Ajaran & Semester aktif (dibaca semua peran)
//  Sumber: tabel pengaturan_umum (21_pengaturan_umum_jenis_ujian.sql).
//  Bila tabel belum ada / gagal dibaca, dipakai hitungan otomatis dari tanggal.
// ---------------------------------------------------------------------
const UMUM = { tahun_ajaran: "", semester: "", dimuat: false };
function tahunAjaranOtomatis() {
  const d = new Date(sekarangMs() + OFFSET_WITA_MS), y = d.getUTCFullYear();
  return d.getUTCMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}
async function muatPengaturanUmum() {
  try {
    const { data, error } = await sb.from("pengaturan_umum").select("tahun_ajaran,semester").eq("id", 1).maybeSingle();
    if (error) throw error;
    UMUM.tahun_ajaran = (data && data.tahun_ajaran) || "";
    UMUM.semester = (data && data.semester) || "";
    UMUM.dimuat = !!data;
  } catch (_) {
    UMUM.tahun_ajaran = ""; UMUM.semester = ""; UMUM.dimuat = false;
  }
  return UMUM;
}
const tahunAjaranAktif = () => UMUM.tahun_ajaran || tahunAjaranOtomatis();
const semesterAktif = () => UMUM.semester || "";
// Contoh: "Tahun Ajaran 2026/2027 · Semester Ganjil"
const periodeAktifTeks = () => `Tahun Ajaran ${tahunAjaranAktif()}${semesterAktif() ? ` · Semester ${semesterAktif()}` : ""}`;

// Tampilkan waktu SELALU dalam WITA, apa pun zona waktu perangkat
function fmtWITA(t, opsi) {
  if (t === null || t === undefined || t === "") return "-";
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", { timeZone: ZONA_WITA, ...opsi });
}

// Instan -> "YYYY-MM-DDTHH:mm" dalam WITA, untuk <input type="datetime-local">
function witaKeInput(t) {
  const d = t ? new Date(t) : sekarangDate();
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + OFFSET_WITA_MS).toISOString().slice(0, 16);
}

// Teks datetime-local yang diketik admin DIANGGAP WITA (bukan zona perangkat)
function inputWitaKeDate(v) {
  if (!v) return new Date(NaN);
  const s = String(v).length === 16 ? v + ":00" : String(v);
  return new Date(s + "+08:00");
}

// Sinkron saat halaman dimuat, saat tab aktif kembali, dan tiap 5 menit
WAKTU.siap = sinkronWaktuServer();
setInterval(sinkronWaktuServer, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sinkronWaktuServer();
});

// =====================================================================
//  GAMBAR SOAL
//  - Gambar disimpan di Supabase Storage (bucket "gambar-soal"), bukan di
//    dalam teks soal. Teks hanya memuat penanda:  [gambar:<uuid>.webp]
//  - Penanda boleh diletakkan di pertanyaan maupun di pilihan jawaban.
//  - Saat unggah, gambar dikompres otomatis di browser (target <= 100 KB).
// =====================================================================
const GAMBAR_BUCKET = "gambar-soal";
const GAMBAR_TARGET_KB = 100;
const GAMBAR_BATAS_KERAS_KB = 200; // selaras dengan batas bucket di SQL 17
const GAMBAR_TOKEN_RE = /\[gambar:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:webp|jpg))\]/g;

const urlGambar = (nama) =>
  `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${GAMBAR_BUCKET}/${nama}`;

const adaGambar = (teks) => new RegExp(GAMBAR_TOKEN_RE.source).test(String(teks ?? ""));

// Teks soal -> HTML aman: escape, penanda gambar jadi <img>, baris baru jadi <br>
function teksSoalHtml(s) {
  return esc(s)
    .replace(GAMBAR_TOKEN_RE, (_, nama) =>
      `<img class="gbr-soal" src="${urlGambar(nama)}" alt="Gambar soal" decoding="async" draggable="false">`)
    .replace(/\n/g, "<br>");
}

// Untuk tabel/ringkasan: penanda gambar diganti ikon kecil
const teksRingkasGambar = (s) => String(s ?? "").replace(GAMBAR_TOKEN_RE, "🖼");

function muatViaImg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Gambar tidak bisa dibaca. Coba format JPG, PNG, atau WebP.")); };
    img.src = url;
  });
}

function muatGambarKeBitmap(file) {
  if (window.createImageBitmap) {
    // orientasi EXIF (foto dari HP) diperbaiki otomatis
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => muatViaImg(file));
  }
  return muatViaImg(file);
}

const canvasKeBlob = (canvas, tipe, mutu) => new Promise((res) => canvas.toBlob(res, tipe, mutu));

// Kompres: batasi dimensi, ubah ke WebP (cadangan JPEG), turunkan mutu
// bertahap lalu kecilkan dimensi sampai ukuran <= targetKB.
async function kompresGambar(file, { maxSisi = 1280, targetKB = GAMBAR_TARGET_KB } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error("File yang dipilih bukan gambar.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Ukuran file terlalu besar (maksimal 20 MB sebelum dikompres).");

  const src = await muatGambarKeBitmap(file);
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error("Gambar tidak valid.");

  const batas = targetKB * 1024;
  const batasKeras = GAMBAR_BATAS_KERAS_KB * 1024;
  const daftarMutu = [0.88, 0.8, 0.72, 0.64, 0.56];
  let tipe = "image/webp";
  let ext = "webp";
  let skala = Math.min(1, maxSisi / Math.max(w0, h0)); // tidak pernah memperbesar
  let terkecil = null;

  const bungkus = (b, w, h) => ({
    blob: b, tipe, ext, lebar: w, tinggi: h,
    asliKB: Math.max(1, Math.round(file.size / 1024)),
    hasilKB: Math.max(1, Math.round(b.size / 1024)),
  });

  for (let putaran = 0; putaran < 8; putaran++) {
    const w = Math.max(1, Math.round(w0 * skala));
    const h = Math.max(1, Math.round(h0 * skala));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (tipe === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(src, 0, 0, w, h);

    for (const mutu of daftarMutu) {
      let blob = await canvasKeBlob(canvas, tipe, mutu);
      if (!blob) throw new Error("Browser tidak bisa mengompres gambar ini.");
      if (tipe === "image/webp" && blob.type !== "image/webp") {
        // Browser lama tidak bisa menyimpan WebP -> pakai JPEG berlatar putih
        tipe = "image/jpeg"; ext = "jpg";
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        blob = await canvasKeBlob(canvas, tipe, mutu);
        if (!blob) throw new Error("Browser tidak bisa mengompres gambar ini.");
      }
      if (!terkecil || blob.size < terkecil.blob.size) terkecil = bungkus(blob, w, h);
      if (blob.size <= batas) return bungkus(blob, w, h);
    }
    if (Math.max(w, h) <= 400) break;   // jangan terlalu kecil agar tetap terbaca
    skala *= 0.85;
  }

  if (terkecil && terkecil.blob.size <= batasKeras) return terkecil;
  throw new Error("Gambar terlalu kompleks untuk dikompres sampai kecil. Potong (crop) bagian yang diperlukan, lalu coba lagi.");
}

function idAcak() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Kompres + unggah. Mengembalikan penanda yang tinggal disisipkan ke teks.
async function unggahGambarSoal(file, opsi = {}) {
  const k = await kompresGambar(file, opsi);
  const nama = `${idAcak()}.${k.ext}`;
  const { error } = await sb.storage.from(GAMBAR_BUCKET).upload(nama, k.blob, {
    contentType: k.tipe,
    cacheControl: "31536000", // 1 tahun: gambar tidak pernah diubah, jadi aman di-cache
    upsert: false,
  });
  if (error) throw new Error(error.message || "Gagal mengunggah gambar.");
  return { nama, token: `[gambar:${nama}]`, asliKB: k.asliKB, hasilKB: k.hasilKB };
}

// Unduh semua gambar soal di latar belakang (maks 4 sekaligus) agar saat
// siswa pindah nomor, gambar sudah ada di cache browser.
function prakunciGambarSoal(daftarSoal) {
  const nama = new Set();
  try {
    for (const m of JSON.stringify(daftarSoal || []).matchAll(GAMBAR_TOKEN_RE)) nama.add(m[1]);
  } catch (_) { return; }
  const antre = [...nama];
  let aktif = 0;
  const jalan = () => {
    while (aktif < 4 && antre.length) {
      const n = antre.shift();
      aktif++;
      const im = new Image();
      im.onload = im.onerror = () => { aktif--; jalan(); };
      im.src = urlGambar(n);
    }
  };
  jalan();
}

// Ketuk gambar untuk memperbesar (berlaku di soal siswa maupun pratinjau admin)
function bukaLightbox(src) {
  const lb = document.createElement("div");
  lb.className = "gbr-lightbox";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-label", "Gambar diperbesar");
  lb.innerHTML = `<img class="gbr-besar" alt="Gambar diperbesar" src="${src}"><button type="button" class="gbr-tutup" aria-label="Tutup">&times;</button>`;
  const tutup = () => { lb.remove(); document.removeEventListener("keydown", esc2); };
  const esc2 = (e) => { if (e.key === "Escape") tutup(); };
  lb.addEventListener("click", (e) => {
    if (e.target.classList.contains("gbr-besar")) lb.classList.toggle("penuh"); // ketuk gambar: ukuran asli / muat layar
    else tutup();
  });
  document.addEventListener("keydown", esc2);
  document.body.appendChild(lb);
}

// Fase capture: ketukan pada gambar tidak ikut memilih jawaban di bawahnya
document.addEventListener("click", (e) => {
  const img = e.target && e.target.closest ? e.target.closest("img.gbr-soal") : null;
  if (!img) return;
  e.preventDefault();
  e.stopPropagation();
  bukaLightbox(img.src);
}, true);
"use strict";
// =====================================================================
//  PANEL ADMIN - Terpadu & Mewah
//  Menu utama: Beranda, Data (Kelas, Mapel, Guru, Siswa), Bank Soal, Admin
//  Menu khusus: Kartu Login, Aktifitas
// =====================================================================

const $ = (s, r = document) => r.querySelector(s);
const konten = () => $("#konten");

// Halaman ini dipakai bersama oleh admin.html dan guru.html.
// guru.html mengisi window.PANEL_PERAN = "guru" sebelum memuat file ini.
const PANEL = window.PANEL_PERAN === "guru" ? "guru" : "admin";
const LABEL_PERAN_PANEL = { admin: "Administrator", guru: "Guru" };

// Data yang sedang dimuat. Password TIDAK pernah disimpan di server;
// S.kartu hanya ada di memori halaman ini.
const S = {
  me: null,
  kelas: [],
  mapel: [],
  siswa: [],
  guru: [],
  penugasan: [],
  admins: [],
  kartu: [],
  banks: [],
  totalSoal: 0,
};

// ---------------------------------------------------------------------
//  Memuat data dari Supabase
// ---------------------------------------------------------------------
async function semua(tabel, kolom, saring) {
  const out = [];
  for (let dari = 0; ; dari += 1000) {
    let q = sb.from(tabel).select(kolom).order("id").range(dari, dari + 999);
    if (saring) q = saring(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
// Guru hanya melihat mapel dan kelas yang ia ampu (S.penugasan diisi saat awal).
const muatKelas = async () => {
  let d = await semua("kelas", "*");
  if (PANEL === "guru") { const ok = new Set(S.penugasan.map((p) => p.kelas_id)); d = d.filter((k) => ok.has(k.id)); }
  S.kelas = d.sort((a, b) => urut(a.nama, b.nama));
};
const muatMapel = async () => {
  let d = await semua("mapel", "*");
  if (PANEL === "guru") { const ok = new Set(S.penugasan.map((p) => p.mapel_id)); d = d.filter((m) => ok.has(m.id)); }
  S.mapel = d.sort((a, b) => urut(a.nama, b.nama));
};
const muatPenugasanSaya = async () => {
  S.penugasan = await semua("penugasan_guru", "id,guru_id,mapel_id,kelas_id", (q) => q.eq("guru_id", S.me.id));
};
const KOLOM = "id,username,nama,jenis_kelamin,kelas_id,aktif";
const muatSiswa = async () => { S.siswa = (await semua("profil", KOLOM, (q) => q.eq("peran", "siswa"))).sort((a, b) => urut(a.nama, b.nama)); };
const muatAdmin = async () => { S.admins = (await semua("profil", KOLOM, (q) => q.eq("peran", "admin"))).sort((a, b) => urut(a.nama, b.nama)); };
const muatGuru = async () => {
  S.guru = (await semua("profil", KOLOM, (q) => q.eq("peran", "guru"))).sort((a, b) => urut(a.nama, b.nama));
  S.penugasan = await semua("penugasan_guru", "id,guru_id,mapel_id,kelas_id");
};
async function muatRingkasanBank() {
  try {
    const { data, error } = await sb.from("bank").select("id,nama,mapel_id,bank_soal(count)").order("nama").limit(1000);
    if (error) throw error;
    S.banks = (data || []).map((b) => ({
      id: b.id,
      nama: b.nama,
      mapel_id: b.mapel_id,
      jumlah: (b.bank_soal && b.bank_soal[0] && b.bank_soal[0].count) || 0,
    }));
    S.totalSoal = S.banks.reduce((acc, b) => acc + (b.jumlah || 0), 0);
  } catch (_) {
    S.banks = [];
    S.totalSoal = 0;
  }
}

const namaKelas = (id) => (S.kelas.find((k) => k.id === id) || {}).nama || "-";
const namaMapel = (id) => (S.mapel.find((m) => m.id === id) || {}).nama || "-";

// ---------------------------------------------------------------------
//  Alat tampilan
// ---------------------------------------------------------------------
function kosong(judul, teks, aksiHtml = "") {
  return `<div class="kosong"><h3>${esc(judul)}</h3><p>${esc(teks)}</p>${aksiHtml}</div>`;
}
function pager(total, hal, per) {
  const n = Math.max(1, Math.ceil(total / per));
  if (n <= 1) return "";
  return `<div class="pager"><button class="btn btn-kecil" data-hal="${hal - 1}" ${hal <= 1 ? "disabled" : ""}>Sebelumnya</button>
    <span class="angka">Halaman ${hal} dari ${n}</span>
    <button class="btn btn-kecil" data-hal="${hal + 1}" ${hal >= n ? "disabled" : ""}>Berikutnya</button></div>`;
}
const badgeAktif = (a) => a ? '<span class="badge ok">Aktif</span>' : '<span class="badge off">Nonaktif</span>';
// Tahun ajaran aktif diambil dari menu Pengaturan (lihat common.js: muatPengaturanUmum)
const tahunAjaranIni = () => tahunAjaranAktif();
const waktu = (t) => fmtWITA(t, { dateStyle: "medium", timeStyle: "short" });

function kotakPilih(items, nama, dipilih = []) {
  if (!items.length) return '<p class="ket">Belum ada data.</p>';
  return `<div class="kotak-pilih">${items.map((i) =>
    `<label><input type="checkbox" name="${nama}" value="${esc(i.id)}" ${dipilih.includes(i.id) ? "checked" : ""}> ${esc(i.nama)}</label>`).join("")}</div>`;
}
const terpilih = (root, nama) => [...root.querySelectorAll(`input[name="${nama}"]:checked`)].map((x) => x.value);

function unduhExcel(namaFile, baris, namaSheet = "Data") {
  const ws = XLSX.utils.json_to_sheet(baris);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  XLSX.writeFile(wb, namaFile);
}
const stempel = () => new Date().toISOString().slice(0, 10);

async function batch(items, judul, fn) {
  const m = tampilModal(judul, `<div class="prog"><div id="isi"></div></div><p class="ket" id="ket">Menyiapkan...</p>`, { kunci: true });
  let selesai = 0;
  await antre(items, 4, async (x) => {
    await fn(x);
    selesai++;
    m.body.querySelector("#isi").style.width = (selesai / items.length * 100) + "%";
    m.body.querySelector("#ket").textContent = `${selesai} dari ${items.length} selesai`;
  });
  m.tutup();
}

// ---------------------------------------------------------------------
//  Kartu login (tersimpan permanen di tabel Supabase `kartu_login`)
// ---------------------------------------------------------------------
async function muatKartu() {
  try {
    const { data, error } = await sb
      .from("kartu_login")
      .select("user_id,username,nama,peran,kelas,password,diperbarui")
      .order("diperbarui", { ascending: false })
      .limit(2000);
    if (error) throw error;
    S.kartu = (data || []).map((k) => ({
      user_id: k.user_id,
      username: k.username,
      nama: k.nama,
      peran: k.peran,
      kelas: k.kelas || "-",
      password: k.password,
    }));
  } catch (_) {
    S.kartu = [];
  }
  perbaruiLencana();
}
function perbaruiLencana() {
  const l = $("#lencana-kartu");
  if (!l) return;
  l.hidden = !S.kartu.length;
  l.textContent = S.kartu.length;
}
function tambahKartu(e) {
  const i = S.kartu.findIndex((k) => k.username === e.username);
  if (i >= 0) S.kartu[i] = e; else S.kartu.unshift(e);
  perbaruiLencana();
}
function entriKartu(p, peran, password) {
  return {
    user_id: p.id,
    username: p.username, nama: p.nama, peran, password,
    kelas: peran === "siswa" ? namaKelas(p.kelas_id) : peran === "guru" ? "Guru" : "Admin",
  };
}
// Pilihan terakhir untuk cetak kartu (diingat selama halaman ini terbuka)
const KARTU_OPSI = { judul: "KARTU LOGIN UJIAN ONLINE", ket: "", kop: true, perHal: 8 };

async function kartuDaftarJenisUjian() {
  try {
    const { data } = await sb.from("bank").select("jenis_ujian");
    return [...new Set((data || []).map((x) => String(x.jenis_ujian || "").trim()).filter(Boolean))].sort(urut);
  } catch (_) { return []; }
}

// Satu kartu. pg = data kop (boleh null), logo = [urlKiri, urlKanan]
function kartuHtml(k, O, pg, logo, alamat, periode) {
  const baris = (kls, t) => (String(t || "").trim() ? `<div class="${kls}">${esc(t)}</div>` : "");
  const sisiLogo = (u) => `<div class="k-logo">${u ? `<img src="${esc(u)}" alt="">` : ""}</div>`;
  const adaLogo = !!(logo[0] || logo[1]);
  const kepala = O.kop && pg
    ? `<div class="k-kop">${adaLogo ? sisiLogo(logo[0]) : ""}
        <div class="k-kop-teks">${baris("k-1", pg.pemerintah)}${baris("k-2", pg.instansi)}${baris("k-3", pg.nama_sekolah)}${baris("k-4", pg.alamat_1)}</div>
        ${adaLogo ? sisiLogo(logo[1]) : ""}</div>`
    : `<div class="k-sekolah">${esc((pg && pg.nama_sekolah) || CONFIG.NAMA_SEKOLAH)}</div>`;
  const ket = [O.ket, periode].filter(Boolean).join(" · ");
  return `<div class="kartu">
    ${kepala}
    <div class="k-judul">${esc(O.judul)}</div>
    <div class="k-ket">${esc(ket)}</div>
    <dl>
      <dt>Nama</dt><dd>${esc(k.nama)}</dd>
      <dt>${k.peran === "siswa" ? "Kelas" : "Peran"}</dt><dd>${esc(k.kelas)}</dd>
      <dt>Username</dt><dd class="kode">${esc(k.username)}</dd>
      <dt>Password</dt><dd class="kode">${esc(k.password)}</dd>
    </dl>
    <div class="k-kaki">Alamat: ${esc(alamat)}<br>Jaga kerahasiaan password. Jangan dibagikan ke siapa pun.</div>
  </div>`;
}

function cetakKartu(daftar) {
  if (!daftar.length) return toast("Tidak ada kartu untuk dicetak", "error");
  const O = KARTU_OPSI;
  const m = tampilModal("Cetak kartu login", `
    <p class="ket">${daftar.length} kartu akan dicetak pada kertas A4, lalu dipotong sesuai garis putus-putus.</p>
    <label class="f">Judul kartu
      <input class="input" id="kt-judul" maxlength="60" autocomplete="off" value="${esc(O.judul)}"></label>
    <label class="f">Keterangan ujian (opsional)
      <input class="input" id="kt-ket" maxlength="80" autocomplete="off" list="kt-daftar" placeholder="Contoh: UJIAN SEKOLAH" value="${esc(O.ket)}">
      <datalist id="kt-daftar"></datalist>
      <small>Tampil di bawah judul bersama tahun ajaran dan semester (${esc(periodeAktifTeks())}).</small></label>
    <div class="baris2">
      <label class="f">Kartu per kertas
        <select class="pilih" id="kt-per">
          <option value="8" ${O.perHal === 8 ? "selected" : ""}>8 kartu (2 kolom × 4 baris)</option>
          <option value="6" ${O.perHal === 6 ? "selected" : ""}>6 kartu (2 kolom × 3 baris)</option>
        </select></label>
      <label class="f" style="display:flex;align-items:center;gap:.5rem;margin-top:1.7rem">
        <input type="checkbox" id="kt-kop" ${O.kop ? "checked" : ""}> Pakai kop &amp; logo sekolah</label>
    </div>
    <p class="ket">Kop dan logo diatur di menu Pengaturan.</p>`, {
    aksi: [
      { label: "Batal" },
      { label: "Cetak", kelas: "btn-primary", onClick: async () => {
        O.judul = m.body.querySelector("#kt-judul").value.trim() || "KARTU LOGIN UJIAN ONLINE";
        O.ket = m.body.querySelector("#kt-ket").value.trim();
        O.perHal = Number(m.body.querySelector("#kt-per").value) === 6 ? 6 : 8;
        O.kop = m.body.querySelector("#kt-kop").checked;

        let pg = null, logo = ["", ""];
        if (typeof pgMuat === "function") {
          try { pg = await pgMuat(); logo = [pgUrlLogo(pg.logo_kiri), pgUrlLogo(pg.logo_kanan)]; }
          catch (_) { pg = null; toast("Kop sekolah belum bisa dimuat, kartu dicetak tanpa kop.", "error"); }
        }
        if (pg && !pg.nama_sekolah) pg.nama_sekolah = CONFIG.NAMA_SEKOLAH;

        const alamat = new URL("./", location.href).href;
        const periode = `TA ${tahunAjaranAktif()}${semesterAktif() ? ` · Semester ${semesterAktif()}` : ""}`;
        const urutan = [...daftar].sort((a, b) => urut(a.kelas, b.kelas) || urut(a.nama, b.nama));
        const halaman = [];
        for (let i = 0; i < urutan.length; i += O.perHal) {
          const isi = urutan.slice(i, i + O.perHal).map((k) => kartuHtml(k, O, pg, logo, alamat, periode)).join("");
          halaman.push(`<div class="halaman-cetak per${O.perHal}">${isi}</div>`);
        }
        const area = akar("area-cetak");
        area.innerHTML = halaman.join("");

        // Tunggu logo selesai dimuat supaya tidak kosong di hasil cetak
        const gambar = [...area.querySelectorAll("img")];
        await Promise.race([
          Promise.all(gambar.map((g) => (g.complete ? null : new Promise((r) => { g.onload = g.onerror = r; })))),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
        m.tutup();
        setTimeout(() => window.print(), 100);
        return false;
      } },
    ],
  });
  // Isi saran keterangan ujian dari jenis ujian yang pernah dibuat admin
  kartuDaftarJenisUjian().then((l) => {
    const dl = m.body.querySelector("#kt-daftar");
    if (dl) dl.innerHTML = l.map((x) => `<option value="${esc(x)}"></option>`).join("");
  });
}
function tampilPassword(e) {
  tampilModal("Password baru", `
    <p>Untuk <b>${esc(e.nama)}</b> (username <span class="mono">${esc(e.username)}</span>)</p>
    <div class="pw-besar">${esc(e.password)}</div>
    <p class="ket">Password ini tersimpan di database Supabase pada menu Kartu Login sehingga tetap aman meskipun halaman ditutup atau dimuat ulang.</p>`, {
    aksi: [
      { label: "Salin password", tutup: false, onClick: async () => {
        try { await navigator.clipboard.writeText(e.password); toast("Password disalin", "ok"); }
        catch { toast("Tidak bisa menyalin otomatis. Catat manual", "error"); }
      } },
      { label: "Cetak kartu", tutup: false, onClick: () => cetakKartu([e]) },
      { label: "Selesai", kelas: "btn-primary" },
    ],
  });
}

// ---------------------------------------------------------------------
//  Halaman: Beranda (Mewah & Lengkap)
// ---------------------------------------------------------------------
async function rBeranda() {
  await Promise.all([muatKelas(), muatMapel(), muatSiswa(), muatGuru(), muatRingkasanBank(), muatKartu()]);

  let logTerbaru = [];
  try {
    const { data } = await sb.from("log_aktivitas").select("*").order("waktu", { ascending: false }).limit(6);
    logTerbaru = data || [];
  } catch (_) {
    logTerbaru = [];
  }

  const siswaAktif = S.siswa.filter((s) => s.aktif).length;
  const siswaL = S.siswa.filter((s) => s.jenis_kelamin === "L").length;
  const siswaP = S.siswa.filter((s) => s.jenis_kelamin === "P").length;
  const guruAktif = S.guru.filter((g) => g.aktif).length;
  const guruBertugas = new Set(S.penugasan.map((p) => p.guru_id)).size;

  const langkah = [
    { h: "data/kelas", j: "Buat Kelas", ok: S.kelas.length > 0, k: S.kelas.length ? `${S.kelas.length} kelas aktif` : "Mulai dengan membuat rombongan kelas.", s: S.kelas.length ? "Selesai" : "Belum" },
    { h: "data/mapel", j: "Buat Mata Pelajaran", ok: S.mapel.length > 0, k: S.mapel.length ? `${S.mapel.length} mapel terdaftar` : "Daftar mapel untuk penugasan guru & bank soal.", s: S.mapel.length ? "Selesai" : "Belum" },
    { h: "data/guru", j: "Data & Penugasan Guru", ok: S.guru.length > 0 && guruBertugas > 0, k: S.guru.length ? `${S.guru.length} guru (${guruBertugas} tertugaskan)` : "Impor atau tambah akun guru.", s: S.guru.length && guruBertugas > 0 ? "Selesai" : "Perlu dilengkapi" },
    { h: "data/siswa", j: "Data Siswa", ok: S.siswa.length > 0, k: S.siswa.length ? `${S.siswa.length} siswa (${siswaAktif} aktif)` : "Impor akun siswa lewat Excel.", s: S.siswa.length ? "Selesai" : "Belum" },
    { h: "soal", j: "Susun Bank Soal", ok: S.totalSoal > 0, k: S.banks.length ? `${S.banks.length} bank soal · ${S.totalSoal} butir soal` : "Buat bank soal & impor dari Word.", s: S.totalSoal > 0 ? "Siap" : "Belum" },
    { h: "kartu", j: "Kartu Login Peserta", ok: S.kartu.length > 0, k: S.kartu.length ? `${S.kartu.length} kartu siap cetak / unduh` : "Muncul otomatis saat impor atau reset password.", s: S.kartu.length ? "Siap" : "Menunggu" },
  ];
  const selesaiCount = langkah.filter((l) => l.ok).length;
  const persenSiap = Math.round((selesaiCount / langkah.length) * 100);

  // Distribusi siswa per kelas
  const distKelas = S.kelas.map((k) => {
    const anggota = S.siswa.filter((s) => s.kelas_id === k.id);
    const l = anggota.filter((s) => s.jenis_kelamin === "L").length;
    const p = anggota.filter((s) => s.jenis_kelamin === "P").length;
    return { id: k.id, nama: k.nama, total: anggota.length, l, p };
  });
  const maksSiswaKelas = Math.max(1, ...distKelas.map((d) => d.total));

  // Ringkasan bank soal per mapel
  const bankPerMapel = new Map();
  S.banks.forEach((b) => {
    const prev = bankPerMapel.get(b.mapel_id) || { mapel: namaMapel(b.mapel_id), bank: 0, soal: 0 };
    prev.bank += 1;
    prev.soal += b.jumlah || 0;
    bankPerMapel.set(b.mapel_id, prev);
  });

  const sekarang = fmtWITA(sekarangMs(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

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
          <h2>Selamat datang kembali, ${esc(S.me.nama)}</h2>
          <p class="hero-desc">Pusat kendali administrasi ujian <b>${esc(CONFIG.NAMA_SEKOLAH)}</b>. Pantau kesiapan data akademik, bank soal, dan pencetakan kartu login peserta dalam satu layar.</p>
        </div>
        <div class="hero-kesiapan">
          <div class="kesiapan-angka">${persenSiap}%</div>
          <div class="kesiapan-label">Kesiapan Sistem</div>
          <div class="kesiapan-bar"><div style="width:${persenSiap}%"></div></div>
          <small>${selesaiCount} dari ${langkah.length} tahap terpenuhi</small>
        </div>
      </div>
      <div class="hero-aksi">
        <a class="btn btn-amber" href="#soal">+ Kelola Bank Soal</a>
        <button class="btn btn-glass" type="button" id="q-impor-siswa">Impor Siswa (Excel)</button>
        <button class="btn btn-glass" type="button" id="q-impor-guru">Impor Guru (Excel)</button>
        <a class="btn btn-glass" href="#kartu">Kartu Login${S.kartu.length ? ` (${S.kartu.length})` : ""}</a>
      </div>
    </section>

    <section class="kpi-grid" aria-label="Ringkasan utama">
      <a class="kpi-kartu kpi-biru" href="#data/kelas">
        <div class="kpi-atas">
          <span class="kpi-ikon">🏫</span>
          <span class="kpi-tag">Rombel</span>
        </div>
        <div class="kpi-nilai">${S.kelas.length}</div>
        <div class="kpi-judul">Total Kelas</div>
        <div class="kpi-sub">Kelompok belajar aktif</div>
      </a>

      <a class="kpi-kartu kpi-ungu" href="#data/mapel">
        <div class="kpi-atas">
          <span class="kpi-ikon">📚</span>
          <span class="kpi-tag">Kurikulum</span>
        </div>
        <div class="kpi-nilai">${S.mapel.length}</div>
        <div class="kpi-judul">Mata Pelajaran</div>
        <div class="kpi-sub">${S.penugasan.length} penugasan guru-kelas</div>
      </a>

      <a class="kpi-kartu kpi-teal" href="#data/guru">
        <div class="kpi-atas">
          <span class="kpi-ikon">👨‍🏫</span>
          <span class="kpi-tag">${guruAktif} Aktif</span>
        </div>
        <div class="kpi-nilai">${S.guru.length}</div>
        <div class="kpi-judul">Total Guru</div>
        <div class="kpi-sub">${guruBertugas} guru sudah punya mapel</div>
      </a>

      <a class="kpi-kartu kpi-hijau" href="#data/siswa">
        <div class="kpi-atas">
          <span class="kpi-ikon">🎓</span>
          <span class="kpi-tag">${siswaAktif} Aktif</span>
        </div>
        <div class="kpi-nilai">${S.siswa.length}</div>
        <div class="kpi-judul">Total Siswa</div>
        <div class="kpi-sub">${siswaL} Laki-laki · ${siswaP} Perempuan</div>
      </a>

      <a class="kpi-kartu kpi-amber" href="#soal">
        <div class="kpi-atas">
          <span class="kpi-ikon">📝</span>
          <span class="kpi-tag">${S.banks.length} Bank</span>
        </div>
        <div class="kpi-nilai">${S.totalSoal}</div>
        <div class="kpi-judul">Butir Bank Soal</div>
        <div class="kpi-sub">Siap dirakit menjadi paket ujian</div>
      </a>

      <a class="kpi-kartu kpi-navy" href="#kartu">
        <div class="kpi-atas">
          <span class="kpi-ikon">🪪</span>
          <span class="kpi-tag">Sesi Ini</span>
        </div>
        <div class="kpi-nilai">${S.kartu.length}</div>
        <div class="kpi-judul">Kartu Login</div>
        <div class="kpi-sub">${S.kartu.length ? "Siap dicetak / diunduh" : "Belum ada kartu di sesi ini"}</div>
      </a>
    </section>

    <section class="panel-grid-2">
      <div class="panel-mewah">
        <div class="panel-kepala">
          <div>
            <h3>Distribusi Siswa per Kelas</h3>
            <p class="ket">Sebaran peserta didik laki-laki (L) dan perempuan (P)</p>
          </div>
          <a class="btn btn-kecil" href="#data/siswa">Kelola Siswa</a>
        </div>
        ${distKelas.length ? `
        <div class="bar-list">
          ${distKelas.map((d) => {
            const pct = Math.round((d.total / maksSiswaKelas) * 100);
            return `<div class="bar-item">
              <div class="bar-label">
                <b>Kelas ${esc(d.nama)}</b>
                <span class="mono">${d.total} siswa <small>(L:${d.l} · P:${d.p})</small></span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${pct}%"></div>
              </div>
            </div>`;
          }).join("")}
        </div>` : kosong("Belum ada kelas", "Tambahkan kelas di menu Data untuk melihat distribusi siswa.")}
      </div>

      <div class="panel-mewah">
        <div class="panel-kepala">
          <div>
            <h3>Ringkasan Bank Soal</h3>
            <p class="ket">Ketersediaan soal per mata pelajaran</p>
          </div>
          <a class="btn btn-kecil btn-primary" href="#soal">Buka Bank Soal</a>
        </div>
        ${bankPerMapel.size ? `
        <div class="ringkas-list">
          ${[...bankPerMapel.values()].sort((a, b) => urut(a.mapel, b.mapel)).map((item) => `
            <div class="ringkas-row">
              <div>
                <b>${esc(item.mapel)}</b>
                <small>${item.bank} bank soal</small>
              </div>
              <span class="badge info">${item.soal} soal</span>
            </div>
          `).join("")}
        </div>` : kosong("Belum ada bank soal", "Buat bank soal terlebih dahulu untuk mulai menyusun soal ujian.")}
      </div>
    </section>

    <section class="panel-grid-2">
      <div class="panel-mewah">
        <div class="panel-kepala">
          <div>
            <h3>Panduan Persiapan Ujian</h3>
            <p class="ket">Checklist tahapan konfigurasi awal</p>
          </div>
        </div>
        <ol class="langkah langkah-ringkas">${langkah.map((l) => `
          <li class="${l.ok ? "selesai" : ""}"><a href="#${l.h}"><strong>${esc(l.j)}</strong><span class="k">${esc(l.k)}</span><em>${l.s}</em></a></li>`).join("")}
        </ol>
      </div>

      <div class="panel-mewah">
        <div class="panel-kepala">
          <div>
            <h3>Aktifitas Terbaru</h3>
            <p class="ket">Jejeak perubahan data dan akun terakhir</p>
          </div>
          <a class="btn btn-kecil" href="#log">Lihat Semua</a>
        </div>
        ${logTerbaru.length ? `
        <div class="log-feed">
          ${logTerbaru.map((l) => `
            <div class="log-item">
              <span class="log-titik"></span>
              <div class="log-isi">
                <b>${esc(AKSI_LOG[l.aksi] || l.aksi)}</b>
                <span class="mono">${esc(l.target || "-")}</span>
                <small>${esc(waktu(l.waktu))}</small>
              </div>
            </div>
          `).join("")}
        </div>` : kosong("Belum ada aktifitas", "Perubahan data dan reset password akan muncul di sini.")}
      </div>
    </section>

    <section class="panel-mewah">
      <div class="panel-kepala">
        <div>
          <h3>Cadangan & Ekspor Data</h3>
          <p class="ket">Supabase paket gratis tidak membuat cadangan otomatis. Unduh data secara berkala.</p>
        </div>
      </div>
      <div class="alat-kiri">
        <button class="btn" id="eks-siswa">Unduh Daftar Siswa (.xlsx)</button>
        <button class="btn" id="eks-guru">Unduh Daftar Guru (.xlsx)</button>
        <button class="btn btn-primary" id="eks-semua">Unduh Paket Cadangan Lengkap</button>
      </div>
    </section>`;

  $("#eks-siswa").onclick = ekspSiswa;
  $("#eks-guru").onclick = ekspGuru;
  $("#eks-semua").onclick = ekspSemua;
  $("#q-impor-siswa").onclick = async () => {
    location.hash = "data/siswa";
    setTimeout(() => bukaImpor("siswa"), 120);
  };
  $("#q-impor-guru").onclick = async () => {
    location.hash = "data/guru";
    setTimeout(() => bukaImpor("guru"), 120);
  };
}

function ekspSiswa() {
  unduhExcel(`daftar_siswa_${stempel()}.xlsx`, S.siswa.map((s) => ({
    NISN: s.username, Nama: s.nama, "Jenis kelamin": s.jenis_kelamin || "", Kelas: namaKelas(s.kelas_id), Status: s.aktif ? "Aktif" : "Nonaktif",
  })), "Siswa");
}
function ekspGuru() {
  const baris = [];
  S.guru.forEach((g) => {
    const p = S.penugasan.filter((x) => x.guru_id === g.id);
    if (!p.length) baris.push({ NIP: g.username, Nama: g.nama, Mapel: "", Kelas: "", Status: g.aktif ? "Aktif" : "Nonaktif" });
    p.forEach((x) => baris.push({ NIP: g.username, Nama: g.nama, Mapel: namaMapel(x.mapel_id), Kelas: namaKelas(x.kelas_id), Status: g.aktif ? "Aktif" : "Nonaktif" }));
  });
  unduhExcel(`daftar_guru_${stempel()}.xlsx`, baris, "Guru");
}
function ekspSemua() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.kelas.map((k) => ({ Kelas: k.nama, "Tahun ajaran": k.tahun_ajaran || "" }))), "Kelas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.mapel.map((m) => ({ Mapel: m.nama, Kode: m.kode || "" }))), "Mapel");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.siswa.map((s) => ({
    NISN: s.username, Nama: s.nama, "Jenis kelamin": s.jenis_kelamin || "", Kelas: namaKelas(s.kelas_id), Status: s.aktif ? "Aktif" : "Nonaktif",
  }))), "Siswa");
  const barisGuru = [];
  S.guru.forEach((g) => {
    const p = S.penugasan.filter((x) => x.guru_id === g.id);
    if (!p.length) barisGuru.push({ NIP: g.username, Nama: g.nama, Mapel: "", Kelas: "", Status: g.aktif ? "Aktif" : "Nonaktif" });
    p.forEach((x) => barisGuru.push({ NIP: g.username, Nama: g.nama, Mapel: namaMapel(x.mapel_id), Kelas: namaKelas(x.kelas_id), Status: g.aktif ? "Aktif" : "Nonaktif" }));
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisGuru), "Guru");
  XLSX.writeFile(wb, `cadangan_sekolah_${stempel()}.xlsx`);
  toast("File cadangan lengkap berhasil diunduh", "ok");
}

// ---------------------------------------------------------------------
//  Halaman Terpadu: DATA (Kelas, Mata Pelajaran, Guru, Siswa)
// ---------------------------------------------------------------------
const TAB_DATA = [
  {
    id: "kelas",
    label: "Kelas",
    sub: "Rombel & Tahun Ajaran",
    tema: "tema-biru",
    ikon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg>`,
  },
  {
    id: "mapel",
    label: "Mata Pelajaran",
    sub: "Kurikulum & Kode Mapel",
    tema: "tema-ungu",
    ikon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  },
  {
    id: "guru",
    label: "Guru",
    sub: "Akun & Penugasan Mengajar",
    tema: "tema-teal",
    ikon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  {
    id: "siswa",
    label: "Siswa",
    sub: "Peserta Didik & NISN",
    tema: "tema-amber",
    ikon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  },
];
let tabDataAktif = "kelas";

async function rData() {
  const sub = location.hash.slice(1).split("/")[1];
  if (sub && TAB_DATA.some((t) => t.id === sub)) {
    tabDataAktif = sub;
  }
  await Promise.all([muatKelas(), muatMapel(), muatSiswa(), muatGuru()]);

  const metaData = {
    kelas: { jml: S.kelas.length, satuan: "Rombel" },
    mapel: { jml: S.mapel.length, satuan: "Mapel" },
    guru: { jml: S.guru.length, satuan: "Pengajar" },
    siswa: { jml: S.siswa.length, satuan: "Peserta" },
  };

  konten().innerHTML = `
    <div class="tab-hub">
      <div class="data-deck" role="tablist" aria-label="Pilih Kategori Data">
        ${TAB_DATA.map((t) => {
          const info = metaData[t.id];
          const aktif = t.id === tabDataAktif;
          return `<button class="data-card ${t.tema} ${aktif ? "aktif" : ""}" type="button" role="tab" aria-selected="${aktif}" data-tab="${t.id}">
            <div class="data-card-glow"></div>
            <div class="data-card-top">
              <span class="data-card-icon">${t.ikon}</span>
              <span class="data-card-badge">${aktif ? "Aktif" : esc(info.satuan)}</span>
            </div>
            <div class="data-card-body">
              <div class="data-card-count">${info.jml}</div>
              <div class="data-card-title">${esc(t.label)}</div>
              <div class="data-card-sub">${esc(t.sub)}</div>
            </div>
            <div class="data-card-foot">
              <span>${aktif ? "Sedang ditampilkan" : "Klik untuk kelola"}</span>
              <span class="data-card-arrow">&rarr;</span>
            </div>
          </button>`;
        }).join("")}
      </div>
      <div class="data-stage" id="data-subkonten"></div>
    </div>`;

  konten().querySelectorAll(".data-card").forEach((btn) => {
    btn.onclick = () => {
      tabDataAktif = btn.dataset.tab;
      history.replaceState(null, "", `#data/${tabDataAktif}`);
      rData();
    };
  });

  const subWadah = $("#data-subkonten");
  if (tabDataAktif === "kelas") await renderSubKelas(subWadah);
  else if (tabDataAktif === "mapel") await renderSubMapel(subWadah);
  else if (tabDataAktif === "guru") await renderSubGuru(subWadah);
  else await renderSubSiswa(subWadah);
}

// ---------------------------------------------------------------------
//  Sub-modul: Kelas
// ---------------------------------------------------------------------
async function renderSubKelas(wadah) {
  const target = wadah || konten();
  await Promise.all([muatKelas(), muatSiswa()]);
  const hitung = {};
  S.siswa.forEach((s) => { hitung[s.kelas_id] = (hitung[s.kelas_id] || 0) + 1; });
  target.innerHTML = `
    <div class="alat"><p class="ket">${S.kelas.length} kelas terdaftar</p>
      <div class="alat-kanan"><button class="btn btn-primary" data-aksi="tambah">Tambah kelas</button></div></div>
    ${S.kelas.length ? `<div class="tabel-bungkus"><table class="resp"><thead><tr><th>Kelas</th><th>Tahun ajaran</th><th>Jumlah siswa</th><th></th></tr></thead><tbody>
      ${S.kelas.map((k) => `<tr>
        <td data-label="Kelas"><b>${esc(k.nama)}</b></td>
        <td data-label="Tahun ajaran">${esc(k.tahun_ajaran || "-")}</td>
        <td data-label="Jumlah siswa" class="angka">${hitung[k.id] || 0}</td>
        <td class="aksi"><button class="btn btn-kecil" data-aksi="ubah" data-id="${k.id}">Ubah</button>
          <button class="btn btn-kecil" data-aksi="hapus" data-id="${k.id}">Hapus</button></td></tr>`).join("")}
    </tbody></table></div>` : kosong("Belum ada kelas", "Tambahkan kelas terlebih dulu, karena siswa dan guru dikelompokkan menurut kelas.", '<button class="btn btn-primary" data-aksi="tambah">Tambah kelas</button>')}`;
  target.onclick = async (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const k = S.kelas.find((x) => x.id === b.dataset.id);
    if (b.dataset.aksi === "tambah") modalTambahKelas();
    if (b.dataset.aksi === "ubah") modalUbahKelas(k);
    if (b.dataset.aksi === "hapus") hapusKelas(k, hitung[k.id] || 0);
  };
}
function modalTambahKelas() {
  tampilModal("Tambah kelas", `
    <label class="f">Nama kelas (satu per baris)
      <textarea class="area" id="nm" placeholder="7A&#10;7B&#10;7C"></textarea>
      <small>Boleh banyak sekaligus. Nama yang sudah ada dilewati.</small></label>
    <label class="f">Tahun ajaran<input class="input" id="ta" value="${esc(tahunAjaranIni())}"></label>`, {
    aksi: [{ label: "Batal" }, { label: "Simpan", kelas: "btn-primary", onClick: async (m) => {
      const ada = new Set(S.kelas.map((k) => norm(k.nama)));
      const peta = new Map();
      m.body.querySelector("#nm").value.split("\n").map((s) => s.trim()).filter(Boolean).forEach((n) => { if (!ada.has(norm(n)) && !peta.has(norm(n))) peta.set(norm(n), n); });
      if (!peta.size) { toast("Tidak ada kelas baru untuk disimpan", "error"); return false; }
      const ta = m.body.querySelector("#ta").value.trim() || null;
      const { error } = await sb.from("kelas").insert([...peta.values()].map((nama) => ({ nama, tahun_ajaran: ta })));
      if (error) { toast("Gagal menyimpan: " + error.message, "error"); return false; }
      toast(`${peta.size} kelas disimpan`, "ok"); muatUlang();
    } }],
  });
}
function modalUbahKelas(k) {
  tampilModal("Ubah kelas", `
    <label class="f">Nama kelas<input class="input" id="nm" value="${esc(k.nama)}"></label>
    <label class="f">Tahun ajaran<input class="input" id="ta" value="${esc(k.tahun_ajaran || "")}"></label>`, {
    aksi: [{ label: "Batal" }, { label: "Simpan perubahan", kelas: "btn-primary", onClick: async (m) => {
      const nama = m.body.querySelector("#nm").value.trim();
      if (!nama) { toast("Nama kelas tidak boleh kosong", "error"); return false; }
      const { error } = await sb.from("kelas").update({ nama, tahun_ajaran: m.body.querySelector("#ta").value.trim() || null }).eq("id", k.id);
      if (error) { toast(error.code === "23505" ? "Nama kelas sudah dipakai" : "Gagal menyimpan: " + error.message, "error"); return false; }
      toast("Perubahan disimpan", "ok"); muatUlang();
    } }],
  });
}
async function hapusKelas(k, jumlah) {
  if (jumlah > 0) return toast(`Kelas ${k.nama} masih punya ${jumlah} siswa. Pindahkan atau hapus siswanya dulu.`, "error");
  if (!await konfirmasi(`Hapus kelas <b>${esc(k.nama)}</b>? Penugasan guru di kelas ini juga ikut terhapus.`, { ya: "Hapus kelas", bahaya: true })) return;
  const { error } = await sb.from("kelas").delete().eq("id", k.id);
  if (error) return toast("Gagal menghapus: " + error.message, "error");
  toast("Kelas dihapus", "ok"); muatUlang();
}

// ---------------------------------------------------------------------
//  Sub-modul: Mapel
// ---------------------------------------------------------------------
async function renderSubMapel(wadah) {
  const target = wadah || konten();
  await Promise.all([muatMapel(), muatGuru()]);
  const hitung = {};
  S.penugasan.forEach((p) => { (hitung[p.mapel_id] = hitung[p.mapel_id] || new Set()).add(p.guru_id); });
  target.innerHTML = `
    <div class="alat"><p class="ket">${S.mapel.length} mata pelajaran</p>
      <div class="alat-kanan"><button class="btn btn-primary" data-aksi="tambah">Tambah mapel</button></div></div>
    ${S.mapel.length ? `<div class="tabel-bungkus"><table class="resp"><thead><tr><th>Mata pelajaran</th><th>Kode</th><th>Jumlah guru</th><th></th></tr></thead><tbody>
      ${S.mapel.map((m) => `<tr>
        <td data-label="Mapel"><b>${esc(m.nama)}</b></td>
        <td data-label="Kode">${esc(m.kode || "-")}</td>
        <td data-label="Jumlah guru" class="angka">${hitung[m.id] ? hitung[m.id].size : 0}</td>
        <td class="aksi"><button class="btn btn-kecil" data-aksi="ubah" data-id="${m.id}">Ubah</button>
          <button class="btn btn-kecil" data-aksi="hapus" data-id="${m.id}">Hapus</button></td></tr>`).join("")}
    </tbody></table></div>` : kosong("Belum ada mata pelajaran", "Tambahkan mapel yang diajarkan di sekolah.", '<button class="btn btn-primary" data-aksi="tambah">Tambah mapel</button>')}`;
  target.onclick = (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const m = S.mapel.find((x) => x.id === b.dataset.id);
    if (b.dataset.aksi === "tambah") modalTambahMapel();
    if (b.dataset.aksi === "ubah") modalUbahMapel(m);
    if (b.dataset.aksi === "hapus") hapusMapel(m, hitung[m.id] ? hitung[m.id].size : 0);
  };
}
function modalTambahMapel() {
  tampilModal("Tambah mata pelajaran", `
    <label class="f">Nama mapel (satu per baris)
      <textarea class="area" id="nm" placeholder="Matematika&#10;Bahasa Indonesia&#10;IPA"></textarea>
      <small>Nama yang sudah ada dilewati. Kode bisa diisi nanti lewat tombol Ubah.</small></label>`, {
    aksi: [{ label: "Batal" }, { label: "Simpan", kelas: "btn-primary", onClick: async (m) => {
      const ada = new Set(S.mapel.map((x) => norm(x.nama)));
      const peta = new Map();
      m.body.querySelector("#nm").value.split("\n").map((s) => s.trim()).filter(Boolean).forEach((n) => { if (!ada.has(norm(n)) && !peta.has(norm(n))) peta.set(norm(n), n); });
      if (!peta.size) { toast("Tidak ada mapel baru untuk disimpan", "error"); return false; }
      const { error } = await sb.from("mapel").insert([...peta.values()].map((nama) => ({ nama })));
      if (error) { toast("Gagal menyimpan: " + error.message, "error"); return false; }
      toast(`${peta.size} mapel disimpan`, "ok"); muatUlang();
    } }],
  });
}
function modalUbahMapel(mp) {
  tampilModal("Ubah mata pelajaran", `
    <label class="f">Nama mapel<input class="input" id="nm" value="${esc(mp.nama)}"></label>
    <label class="f">Kode (opsional)<input class="input" id="kd" value="${esc(mp.kode || "")}"></label>`, {
    aksi: [{ label: "Batal" }, { label: "Simpan perubahan", kelas: "btn-primary", onClick: async (m) => {
      const nama = m.body.querySelector("#nm").value.trim();
      if (!nama) { toast("Nama mapel tidak boleh kosong", "error"); return false; }
      const { error } = await sb.from("mapel").update({ nama, kode: m.body.querySelector("#kd").value.trim() || null }).eq("id", mp.id);
      if (error) { toast(error.code === "23505" ? "Nama mapel sudah dipakai" : "Gagal menyimpan: " + error.message, "error"); return false; }
      toast("Perubahan disimpan", "ok"); muatUlang();
    } }],
  });
}
async function hapusMapel(mp, jumlahGuru) {
  const peringatan = jumlahGuru ? ` ${jumlahGuru} guru yang mengampu mapel ini akan kehilangan penugasannya.` : "";
  if (!await konfirmasi(`Hapus mapel <b>${esc(mp.nama)}</b>?${peringatan}`, { ya: "Hapus mapel", bahaya: true })) return;
  const { error } = await sb.from("mapel").delete().eq("id", mp.id);
  if (error) return toast("Gagal menghapus: " + error.message, "error");
  toast("Mapel dihapus", "ok"); muatUlang();
}

// ---------------------------------------------------------------------
//  Aksi pengguna bersama (siswa, guru, admin)
// ---------------------------------------------------------------------
const LABEL_ID = { siswa: "NISN", guru: "NIP", admin: "Username" };
const opsiJK = (v) => `<option value="">-</option><option value="L" ${v === "L" ? "selected" : ""}>Laki-laki</option><option value="P" ${v === "P" ? "selected" : ""}>Perempuan</option>`;
const opsiKelas = (v) => S.kelas.map((k) => `<option value="${k.id}" ${k.id === v ? "selected" : ""}>${esc(k.nama)}</option>`).join("");

async function resetSatu(p, peran) {
  if (!await konfirmasi(`Buat password baru untuk <b>${esc(p.nama)}</b>? Password lama langsung tidak berlaku.`, { ya: "Buat password baru" })) return;
  try {
    const j = await panggilFungsi({ aksi: "reset_password", user_id: p.id });
    const e = entriKartu(p, peran, j.password);
    tambahKartu(e);
    tampilPassword(e);
  } catch (err) { toast(err.message, "error"); }
}

async function resetMassal(ids, sumber, peran) {
  if (!await konfirmasi(`Buat password baru untuk <b>${ids.length}</b> ${peran}? Password lama mereka langsung tidak berlaku.`, { ya: "Buat password baru" })) return;
  let gagal = 0;
  await batch(ids, "Membuat password baru", async (id) => {
    const p = sumber.find((x) => x.id === id);
    try { const j = await panggilFungsi({ aksi: "reset_password", user_id: id }); tambahKartu(entriKartu(p, peran, j.password)); }
    catch (e) { gagal++; }
  });
  tampilModal("Selesai", `<p><b>${ids.length - gagal}</b> password baru dibuat${gagal ? `, <b>${gagal}</b> gagal` : ""}.</p>
    <p class="ket">Cetak kartu atau unduh daftar password di menu Kartu Login sebelum halaman ini ditutup.</p>`, {
    aksi: [{ label: "Tutup" }, { label: "Buka kartu login", kelas: "btn-primary", onClick: () => { location.hash = "kartu"; } }],
  });
}

async function hapusUserMassal(ids, peran, selesai) {
  const validIds = ids.filter((id) => id !== S.me.id);
  if (!validIds.length) return toast("Tidak ada akun yang bisa dihapus", "error");
  const pesan = `Hapus permanen <b>${validIds.length}</b> akun ${peran} terpilih? Data profil, kartu login, dan riwayat terkait akan ikut terhapus dan tidak bisa dibatalkan.`;
  if (!await konfirmasi(pesan, { ya: `Hapus ${validIds.length} ${peran}`, bahaya: true, judul: `Hapus massal ${peran}` })) return;
  const m = tampilModal(`Menghapus ${validIds.length} ${peran}`, `<p class="ket">Sedang memproses penghapusan massal di server...</p>`, { kunci: true });
  try {
    const j = await panggilFungsi({ aksi: "hapus_massal", user_ids: validIds });
    m.tutup();
    toast(`${j.berhasil} ${peran} berhasil dihapus${j.gagal ? `, ${j.gagal} gagal` : ""}`, j.gagal ? "info" : "ok");
    if (selesai) await selesai();
  } catch (e) {
    m.tutup();
    toast(e.message || "Gagal menghapus massal", "error");
  }
}

function modalUbah(p, peran, selesai) {
  const diri = p.id === S.me.id;
  const aksi = [];
  if (!diri) aksi.push({ label: "Hapus akun", kelas: "btn-danger kiri", tutup: false, onClick: async (m) => {
    if (!await konfirmasi(`Hapus akun <b>${esc(p.nama)}</b> secara permanen? Sebaiknya nonaktifkan saja bila akun ini sudah pernah dipakai ujian, karena menghapus juga menghilangkan nilainya.`, { ya: "Hapus permanen", bahaya: true })) return;
    try { await panggilFungsi({ aksi: "hapus_user", user_id: p.id }); toast("Akun dihapus", "ok"); m.tutup(); selesai(); }
    catch (e) { toast(e.message, "error"); }
  } });
  aksi.push({ label: "Batal" });
  aksi.push({ label: "Simpan perubahan", kelas: "btn-primary", onClick: async (m) => {
    const q = (s) => m.body.querySelector(s);
    const v = { u: norm(q("#u").value), n: q("#n").value.trim(), jk: q("#jk") ? q("#jk").value : "", kl: q("#kl") ? q("#kl").value : null, ak: q("#ak").checked };
    if (!usernameValid(v.u)) { toast(`${LABEL_ID[peran]} tidak valid (3-40 huruf atau angka)`, "error"); return false; }
    if (!v.n) { toast("Nama tidak boleh kosong", "error"); return false; }
    try {
      const ubah = {};
      if (v.n !== p.nama) ubah.nama = v.n;
      if (peran !== "admin" && (v.jk || null) !== (p.jenis_kelamin || null)) ubah.jenis_kelamin = v.jk || null;
      if (peran === "siswa" && v.kl && v.kl !== p.kelas_id) ubah.kelas_id = v.kl;
      if (Object.keys(ubah).length) {
        const { error } = await sb.from("profil").update(ubah).eq("id", p.id);
        if (error) throw error;
      }
      if (v.u !== p.username) await panggilFungsi({ aksi: "ubah_username", user_id: p.id, username_baru: v.u });
      if (v.ak !== p.aktif) await panggilFungsi({ aksi: "set_aktif", user_id: p.id, aktif: v.ak });
    } catch (e) { toast(e.message || "Gagal menyimpan", "error"); return false; }
    toast("Perubahan disimpan", "ok"); selesai();
  } });
  tampilModal(`Ubah data ${peran}`, `
    <label class="f">${LABEL_ID[peran]}<input class="input mono" id="u" value="${esc(p.username)}" autocapitalize="off" spellcheck="false">
      <small>Mengubah ini juga mengubah username untuk login.</small></label>
    <label class="f">Nama<input class="input" id="n" value="${esc(p.nama)}"></label>
    ${peran !== "admin" ? `<div class="baris2">
      <label class="f">Jenis kelamin<select class="pilih" id="jk">${opsiJK(p.jenis_kelamin)}</select></label>
      ${peran === "siswa" ? `<label class="f">Kelas<select class="pilih" id="kl">${opsiKelas(p.kelas_id)}</select></label>` : ""}</div>` : ""}
    <label class="f" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="ak" ${p.aktif ? "checked" : ""} ${diri ? "disabled" : ""}> Akun aktif
      ${diri ? '<small style="margin:0">(akun Anda sendiri)</small>' : ""}</label>`, { aksi });
}

function modalTambah(peran, selesai) {
  if (!S.kelas.length) return toast("Buat kelas dulu sebelum menambah " + peran, "error");
  if (peran === "guru" && !S.mapel.length) return toast("Buat mapel dulu sebelum menambah guru", "error");
  const khusus = peran === "siswa"
    ? `<label class="f">Kelas<select class="pilih" id="kl">${opsiKelas("")}</select></label>`
    : `<div class="f">Mapel yang diampu${kotakPilih(S.mapel, "mp")}</div><div class="f">Kelas yang diampu${kotakPilih(S.kelas, "kl")}</div>`;
  tampilModal(`Tambah ${peran}`, `
    <label class="f">${LABEL_ID[peran]}<input class="input mono" id="u" autocapitalize="off" spellcheck="false"></label>
    <label class="f">Nama<input class="input" id="n"></label>
    <div class="baris2"><label class="f">Jenis kelamin<select class="pilih" id="jk">${opsiJK("")}</select></label>
      ${peran === "siswa" ? khusus : ""}</div>
    ${peran === "guru" ? khusus : ""}
    <label class="f">Password (opsional)<input class="input mono" id="pw" autocomplete="off"><small>Kosongkan agar dibuat acak. Minimal 8 karakter.</small></label>`, {
    lebar: peran === "guru" ? "sedang" : "",
    aksi: [{ label: "Batal" }, { label: `Buat akun ${peran}`, kelas: "btn-primary", onClick: async (m) => {
      const q = (s) => m.body.querySelector(s);
      const row = { nama: q("#n").value.trim(), jenis_kelamin: q("#jk").value, password: q("#pw").value.trim() };
      if (peran === "siswa") { row.nisn = q("#u").value; row.kelas = namaKelas(q("#kl").value); }
      else {
        row.nip = q("#u").value;
        row.mapel = terpilih(m.body, "mp").map(namaMapel).join(";");
        row.kelas = terpilih(m.body, "kl").map(namaKelas).join(";");
      }
      const j = await panggilFungsi({ aksi: peran === "siswa" ? "impor_siswa" : "impor_guru", rows: [row] });
      const h = j.hasil[0];
      if (h.status !== "ok") { toast(h.pesan, "error"); return false; }
      const e = entriDariHasil(h, peran);
      tambahKartu(e); selesai(); tampilPassword(e);
    } }],
  });
}
function entriDariHasil(h, peran) {
  return { username: h.username, nama: h.nama, peran, password: h.password, kelas: peran === "siswa" ? h.kelas : "Guru" };
}

// ---------------------------------------------------------------------
//  Sub-modul: Siswa
// ---------------------------------------------------------------------
const FS = { cari: "", kelas: "", status: "", hal: 1, pilih: new Set() };
const PER = 50;
function siswaTersaring() {
  const q = norm(FS.cari);
  return S.siswa.filter((s) => (!FS.kelas || s.kelas_id === FS.kelas) && (!FS.status || (FS.status === "aktif") === s.aktif) &&
    (!q || norm(s.nama).includes(q) || s.username.includes(q)));
}
async function renderSubSiswa(wadah) {
  const target = wadah || konten();
  await Promise.all([muatKelas(), muatSiswa()]);
  FS.hal = 1; FS.pilih = new Set();
  target.innerHTML = `
    <div class="alat">
      <div class="alat-kiri">
        <input class="input" id="cari" type="search" placeholder="Cari nama atau NISN" value="${esc(FS.cari)}">
        <select class="pilih" id="f-kelas"><option value="">Semua kelas</option>${opsiKelas(FS.kelas)}</select>
        <select class="pilih" id="f-status"><option value="">Semua status</option><option value="aktif" ${FS.status === "aktif" ? "selected" : ""}>Aktif</option><option value="nonaktif" ${FS.status === "nonaktif" ? "selected" : ""}>Nonaktif</option></select>
      </div>
      <div class="alat-kanan">
        <button class="btn" id="eks">Unduh Excel</button>
        <button class="btn" id="impor">Impor Excel</button>
        <button class="btn btn-primary" id="tambah">Tambah siswa</button>
      </div>
    </div>
    <div id="tbl"></div>`;
  $("#cari").oninput = (e) => { FS.cari = e.target.value; FS.hal = 1; gambarSiswa(); };
  $("#f-kelas").onchange = (e) => { FS.kelas = e.target.value; FS.hal = 1; gambarSiswa(); };
  $("#f-status").onchange = (e) => { FS.status = e.target.value; FS.hal = 1; gambarSiswa(); };
  $("#eks").onclick = ekspSiswa;
  $("#impor").onclick = () => bukaImpor("siswa");
  $("#tambah").onclick = () => modalTambah("siswa", muatUlang);
  $("#tbl").onclick = (e) => {
    const b = e.target.closest("[data-aksi],[data-hal]"); if (!b) return;
    if (b.dataset.hal) { FS.hal = +b.dataset.hal; gambarSiswa(); return; }
    const p = S.siswa.find((x) => x.id === b.dataset.id);
    if (b.dataset.aksi === "ubah") modalUbah(p, "siswa", muatUlang);
    if (b.dataset.aksi === "reset") resetSatu(p, "siswa");
    if (b.dataset.aksi === "reset-massal") resetMassal([...FS.pilih], S.siswa, "siswa").then(() => { FS.pilih = new Set(); gambarSiswa(); });
    if (b.dataset.aksi === "hapus-massal") hapusUserMassal([...FS.pilih], "siswa", async () => { FS.pilih = new Set(); await muatUlang(); });
    if (b.dataset.aksi === "batal") { FS.pilih = new Set(); gambarSiswa(); }
  };
  $("#tbl").onchange = (e) => {
    const c = e.target;
    if (c.dataset.pilih) { c.checked ? FS.pilih.add(c.dataset.pilih) : FS.pilih.delete(c.dataset.pilih); gambarSiswa(); }
    if (c.dataset.semua) { const d = siswaTersaring(); d.forEach((s) => c.checked ? FS.pilih.add(s.id) : FS.pilih.delete(s.id)); gambarSiswa(); }
  };
  gambarSiswa();
}
function gambarSiswa() {
  const daftar = siswaTersaring();
  const maks = Math.max(1, Math.ceil(daftar.length / PER));
  FS.hal = Math.min(FS.hal, maks);
  const potong = daftar.slice((FS.hal - 1) * PER, FS.hal * PER);
  const semuaPilih = daftar.length > 0 && daftar.every((s) => FS.pilih.has(s.id));
  let isi = "";
  if (FS.pilih.size) isi += `<div class="pilihan"><span>${FS.pilih.size} siswa dipilih</span>
    <button class="btn btn-kecil btn-primary" data-aksi="reset-massal">Reset password terpilih</button>
    <button class="btn btn-kecil btn-danger" data-aksi="hapus-massal">Hapus terpilih</button>
    <button class="btn btn-kecil" data-aksi="batal">Batal pilih</button></div>`;
  isi += `<p class="ket">${daftar.length} dari ${S.siswa.length} siswa</p>`;
  if (!S.siswa.length) isi += kosong("Belum ada siswa", "Impor dari Excel untuk membuat banyak akun sekaligus.", '<button class="btn btn-primary" onclick="bukaImpor(\'siswa\')">Impor siswa dari Excel</button>');
  else if (!potong.length) isi += kosong("Tidak ada hasil", "Ubah kata pencarian atau filter.");
  else isi += `<div class="tabel-bungkus"><table class="resp"><thead><tr>
    <th class="cek"><input type="checkbox" data-semua="1" ${semuaPilih ? "checked" : ""} aria-label="Pilih semua hasil"></th>
    <th>NISN</th><th>Nama</th><th>L/P</th><th>Kelas</th><th>Status</th><th></th></tr></thead><tbody>
    ${potong.map((s) => `<tr>
      <td class="cek"><input type="checkbox" data-pilih="${s.id}" ${FS.pilih.has(s.id) ? "checked" : ""} aria-label="Pilih ${esc(s.nama)}"></td>
      <td data-label="NISN" class="mono">${esc(s.username)}</td>
      <td data-label="Nama">${esc(s.nama)}</td>
      <td data-label="L/P">${esc(s.jenis_kelamin || "-")}</td>
      <td data-label="Kelas">${esc(namaKelas(s.kelas_id))}</td>
      <td data-label="Status">${badgeAktif(s.aktif)}</td>
      <td class="aksi"><button class="btn btn-kecil" data-aksi="ubah" data-id="${s.id}">Ubah</button>
        <button class="btn btn-kecil" data-aksi="reset" data-id="${s.id}">Reset password</button></td></tr>`).join("")}
    </tbody></table></div>`;
  isi += pager(daftar.length, FS.hal, PER);
  $("#tbl").innerHTML = isi;
}

// ---------------------------------------------------------------------
//  Sub-modul: Guru
// ---------------------------------------------------------------------
const FG = { cari: "", status: "", hal: 1, pilih: new Set() };
function guruTersaring() {
  const q = norm(FG.cari);
  return S.guru.filter((g) => (!FG.status || (FG.status === "aktif") === g.aktif) && (!q || norm(g.nama).includes(q) || g.username.includes(q)));
}
function ringkasGuru(g) {
  const per = new Map();
  S.penugasan.filter((x) => x.guru_id === g.id).forEach((x) => {
    const mn = namaMapel(x.mapel_id);
    if (!per.has(mn)) per.set(mn, []);
    per.get(mn).push(namaKelas(x.kelas_id));
  });
  if (!per.size) return '<span class="badge warn">Belum ada penugasan</span>';
  return `<div class="ringkas">${[...per].map(([m, ks]) => `<div><b>${esc(m)}</b>: ${esc(ks.sort(urut).join(", "))}</div>`).join("")}</div>`;
}
async function renderSubGuru(wadah) {
  const target = wadah || konten();
  await Promise.all([muatKelas(), muatMapel(), muatGuru()]);
  FG.hal = 1; FG.pilih = new Set();
  target.innerHTML = `
    <div class="alat">
      <div class="alat-kiri">
        <input class="input" id="cari" type="search" placeholder="Cari nama atau NIP" value="${esc(FG.cari)}">
        <select class="pilih" id="f-status"><option value="">Semua status</option><option value="aktif" ${FG.status === "aktif" ? "selected" : ""}>Aktif</option><option value="nonaktif" ${FG.status === "nonaktif" ? "selected" : ""}>Nonaktif</option></select>
      </div>
      <div class="alat-kanan">
        <button class="btn" id="eks">Unduh Excel</button>
        <button class="btn" id="impor">Impor Excel</button>
        <button class="btn btn-primary" id="tambah">Tambah guru</button>
      </div>
    </div>
    <div id="tbl"></div>`;
  $("#cari").oninput = (e) => { FG.cari = e.target.value; FG.hal = 1; gambarGuru(); };
  $("#f-status").onchange = (e) => { FG.status = e.target.value; FG.hal = 1; gambarGuru(); };
  $("#eks").onclick = ekspGuru;
  $("#impor").onclick = () => bukaImpor("guru");
  $("#tambah").onclick = () => modalTambah("guru", muatUlang);
  $("#tbl").onclick = (e) => {
    const b = e.target.closest("[data-aksi],[data-hal]"); if (!b) return;
    if (b.dataset.hal) { FG.hal = +b.dataset.hal; gambarGuru(); return; }
    const p = S.guru.find((x) => x.id === b.dataset.id);
    if (b.dataset.aksi === "ubah") modalUbah(p, "guru", muatUlang);
    if (b.dataset.aksi === "reset") resetSatu(p, "guru");
    if (b.dataset.aksi === "tugas") modalPenugasan(p);
    if (b.dataset.aksi === "reset-massal") resetMassal([...FG.pilih], S.guru, "guru").then(() => { FG.pilih = new Set(); gambarGuru(); });
    if (b.dataset.aksi === "hapus-massal") hapusUserMassal([...FG.pilih], "guru", async () => { FG.pilih = new Set(); await muatUlang(); });
    if (b.dataset.aksi === "batal") { FG.pilih = new Set(); gambarGuru(); }
  };
  $("#tbl").onchange = (e) => {
    const c = e.target;
    if (c.dataset.pilih) { c.checked ? FG.pilih.add(c.dataset.pilih) : FG.pilih.delete(c.dataset.pilih); gambarGuru(); }
    if (c.dataset.semua) { const d = guruTersaring(); d.forEach((g) => c.checked ? FG.pilih.add(g.id) : FG.pilih.delete(g.id)); gambarGuru(); }
  };
  gambarGuru();
}
function gambarGuru() {
  const daftar = guruTersaring();
  const maks = Math.max(1, Math.ceil(daftar.length / PER));
  FG.hal = Math.min(FG.hal, maks);
  const potong = daftar.slice((FG.hal - 1) * PER, FG.hal * PER);
  const semuaPilih = daftar.length > 0 && daftar.every((g) => FG.pilih.has(g.id));
  let isi = "";
  if (FG.pilih.size) isi += `<div class="pilihan"><span>${FG.pilih.size} guru dipilih</span>
    <button class="btn btn-kecil btn-primary" data-aksi="reset-massal">Reset password terpilih</button>
    <button class="btn btn-kecil btn-danger" data-aksi="hapus-massal">Hapus terpilih</button>
    <button class="btn btn-kecil" data-aksi="batal">Batal pilih</button></div>`;
  isi += `<p class="ket">${daftar.length} dari ${S.guru.length} guru</p>`;
  if (!S.guru.length) isi += kosong("Belum ada guru", "Impor dari Excel, atau tambah satu per satu.", '<button class="btn btn-primary" onclick="bukaImpor(\'guru\')">Impor guru dari Excel</button>');
  else if (!potong.length) isi += kosong("Tidak ada hasil", "Ubah kata pencarian atau filter.");
  else isi += `<div class="tabel-bungkus"><table class="resp"><thead><tr>
    <th class="cek"><input type="checkbox" data-semua="1" ${semuaPilih ? "checked" : ""} aria-label="Pilih semua hasil"></th>
    <th>NIP</th><th>Nama</th><th>Mengampu</th><th>Status</th><th></th></tr></thead><tbody>
    ${potong.map((g) => `<tr>
      <td class="cek"><input type="checkbox" data-pilih="${g.id}" ${FG.pilih.has(g.id) ? "checked" : ""} aria-label="Pilih ${esc(g.nama)}"></td>
      <td data-label="NIP" class="mono">${esc(g.username)}</td>
      <td data-label="Nama">${esc(g.nama)}</td>
      <td data-label="Mengampu">${ringkasGuru(g)}</td>
      <td data-label="Status">${badgeAktif(g.aktif)}</td>
      <td class="aksi"><button class="btn btn-kecil" data-aksi="tugas" data-id="${g.id}">Mapel dan kelas</button>
        <button class="btn btn-kecil" data-aksi="ubah" data-id="${g.id}">Ubah</button>
        <button class="btn btn-kecil" data-aksi="reset" data-id="${g.id}">Reset password</button></td></tr>`).join("")}
    </tbody></table></div>`;
  isi += pager(daftar.length, FG.hal, PER);
  $("#tbl").innerHTML = isi;
}

function modalPenugasan(g) {
  const m = tampilModal(`Mapel dan kelas: ${g.nama}`, "", {
    lebar: "sedang", onTutup: () => { if ((halamanSekarang === "data" && tabDataAktif === "guru")) gambarGuru(); },
    aksi: [{ label: "Selesai", kelas: "btn-primary" }],
  });
  const gambar = () => {
    const milik = S.penugasan.filter((x) => x.guru_id === g.id)
      .sort((a, b) => urut(namaMapel(a.mapel_id), namaMapel(b.mapel_id)) || urut(namaKelas(a.kelas_id), namaKelas(b.kelas_id)));
    m.body.innerHTML = `
      <p class="ket">Guru hanya bisa membuat soal untuk mapel yang diampu, dan hanya melihat nilai kelas yang diampu.</p>
      ${milik.length ? `<div class="gulung" style="margin-bottom:1rem"><table><thead><tr><th>Mapel</th><th>Kelas</th><th></th></tr></thead><tbody>
        ${milik.map((x) => `<tr><td>${esc(namaMapel(x.mapel_id))}</td><td>${esc(namaKelas(x.kelas_id))}</td>
          <td class="aksi"><button class="btn btn-kecil" data-hapus="${x.id}">Hapus</button></td></tr>`).join("")}
        </tbody></table></div>` : '<div class="catatan">Guru ini belum punya penugasan.</div>'}
      <h3 style="font-size:1.05rem;margin-bottom:.6rem">Tambah penugasan</h3>
      <label class="f">Mapel<select class="pilih" id="mp"><option value="">Pilih mapel</option>${S.mapel.map((x) => `<option value="${x.id}">${esc(x.nama)}</option>`).join("")}</select></label>
      <div class="f">Kelas ${kotakPilih(S.kelas, "kl")}</div>
      <button class="btn btn-primary" id="tmb">Tambahkan</button>`;
    m.body.querySelectorAll("[data-hapus]").forEach((b) => b.onclick = async () => {
      const { error } = await sb.from("penugasan_guru").delete().eq("id", b.dataset.hapus);
      if (error) return toast("Gagal menghapus: " + error.message, "error");
      await muatGuru(); gambar();
    });
    m.body.querySelector("#tmb").onclick = async () => {
      const mp = m.body.querySelector("#mp").value, kl = terpilih(m.body, "kl");
      if (!mp) return toast("Pilih mapel dulu", "error");
      if (!kl.length) return toast("Pilih minimal satu kelas", "error");
      const { error } = await sb.from("penugasan_guru").upsert(kl.map((k) => ({ guru_id: g.id, mapel_id: mp, kelas_id: k })),
        { onConflict: "guru_id,mapel_id,kelas_id", ignoreDuplicates: true });
      if (error) return toast("Gagal menyimpan: " + error.message, "error");
      toast("Penugasan ditambahkan", "ok");
      await muatGuru(); gambar();
    };
  };
  gambar();
}

// ---------------------------------------------------------------------
//  Halaman: Admin
// ---------------------------------------------------------------------
async function rAdmin() {
  await muatAdmin();
  konten().innerHTML = `
    <div class="alat"><p class="ket">${S.admins.length} administrator terdaftar</p>
      <div class="alat-kanan"><button class="btn btn-primary" id="tambah">Tambah admin</button></div></div>
    <div class="tabel-bungkus"><table class="resp"><thead><tr><th>Username</th><th>Nama</th><th>Status</th><th></th></tr></thead><tbody>
    ${S.admins.map((a) => `<tr>
      <td data-label="Username" class="mono">${esc(a.username)}</td>
      <td data-label="Nama">${esc(a.nama)}${a.id === S.me.id ? ' <span class="badge warn">Anda</span>' : ""}</td>
      <td data-label="Status">${badgeAktif(a.aktif)}</td>
      <td class="aksi"><button class="btn btn-kecil" data-aksi="ubah" data-id="${a.id}">Ubah</button>
        <button class="btn btn-kecil" data-aksi="reset" data-id="${a.id}">Reset password</button></td></tr>`).join("")}
    </tbody></table></div>`;
  $("#tambah").onclick = () => tampilModal("Tambah admin", `
    <label class="f">Username<input class="input mono" id="u" autocapitalize="off" spellcheck="false"></label>
    <label class="f">Nama<input class="input" id="n"></label>
    <label class="f">Password (opsional)<input class="input mono" id="pw" autocomplete="off"><small>Kosongkan agar dibuat acak. Minimal 8 karakter.</small></label>`, {
    aksi: [{ label: "Batal" }, { label: "Buat akun admin", kelas: "btn-primary", onClick: async (m) => {
      const j = await panggilFungsi({ aksi: "buat_admin", username: m.body.querySelector("#u").value, nama: m.body.querySelector("#n").value, password: m.body.querySelector("#pw").value.trim() || undefined });
      const e = { username: j.username, nama: m.body.querySelector("#n").value.trim(), peran: "admin", kelas: "Admin", password: j.password };
      tambahKartu(e); muatUlang(); tampilPassword(e);
    } }],
  });
  konten().onclick = (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const p = S.admins.find((x) => x.id === b.dataset.id);
    if (b.dataset.aksi === "ubah") modalUbah(p, "admin", muatUlang);
    if (b.dataset.aksi === "reset") resetSatu(p, "admin");
  };
}

// ---------------------------------------------------------------------
//  Impor dari Excel (siswa dan guru)
// ---------------------------------------------------------------------
const ALIAS = {
  nisn: ["nisn", "nis", "username"], nip: ["nip", "username"],
  nama: ["nama", "nama siswa", "nama guru", "nama lengkap"],
  jenis_kelamin: ["jenis_kelamin", "jenis kelamin", "jk", "kelamin", "l/p"],
  kelas: ["kelas", "kelas diampu"], mapel: ["mapel", "mata pelajaran", "mapel diampu"],
  password: ["password", "kata sandi", "sandi"],
};
const SPEK = {
  siswa: { semua: ["nisn", "nama", "jenis_kelamin", "kelas", "password"], wajib: ["nisn", "nama", "kelas"] },
  guru: { semua: ["nip", "nama", "mapel", "kelas", "password"], wajib: ["nip", "nama", "mapel", "kelas"] },
};
const daftarNama = (s) => String(s || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);

function unduhTemplate(peran) {
  const kolom = SPEK[peran].semua, MAKS = 700;
  const ws = XLSX.utils.aoa_to_sheet([kolom]);
  for (let r = 1; r <= MAKS; r++) for (let c = 0; c < kolom.length; c++)
    ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: "", z: "@" };
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: MAKS, c: kolom.length - 1 } });
  ws["!cols"] = kolom.map((k) => ({ wch: k === "nama" ? 32 : k === "mapel" || k === "kelas" ? 24 : 16 }));
  const petunjuk = peran === "siswa" ? [
    ["PETUNJUK IMPOR SISWA"], [""],
    ["nisn", "Wajib. Sebaiknya 10 digit. Kolom sudah berformat Teks, jadi angka 0 di depan aman."],
    ["nama", "Wajib."],
    ["jenis_kelamin", "Opsional. Isi L atau P."],
    ["kelas", "Wajib. Harus sama persis dengan kelas yang sudah dibuat di menu Data > Kelas, contoh 7A."],
    ["password", "Opsional. Kosongkan agar dibuat acak (disarankan). Jika diisi, minimal 8 karakter."],
    [""], ["Jangan mengubah nama kolom di baris pertama sheet Data. Maksimal 700 baris per file."],
  ] : [
    ["PETUNJUK IMPOR GURU"], [""],
    ["nip", "Wajib. Kolom sudah berformat Teks, jadi angka 0 di depan dan NIP panjang aman."],
    ["nama", "Wajib."],
    ["mapel", "Wajib. Harus sama dengan mapel yang sudah dibuat. Lebih dari satu dipisah titik koma, contoh: Matematika;IPA"],
    ["kelas", "Wajib. Harus sama dengan kelas yang sudah dibuat. Lebih dari satu dipisah titik koma, contoh: 7A;7B;8C"],
    ["password", "Opsional. Kosongkan agar dibuat acak (disarankan)."],
    [""], ["Penting: semua mapel yang ditulis akan dipasangkan ke semua kelas yang ditulis."],
    ["Jika guru mengajar Matematika di 7A tetapi IPA di 7B, impor dulu salah satunya, lalu tambahkan sisanya lewat tombol Mapel dan kelas."],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const wp = XLSX.utils.aoa_to_sheet(petunjuk);
  wp["!cols"] = [{ wch: 16 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");
  XLSX.writeFile(wb, `template_impor_${peran}.xlsx`);
}

function bacaLembar(aoa, peran) {
  const spek = SPEK[peran], idx = {};
  const header = (aoa[0] || []).map((h) => String(h).trim().toLowerCase().replace(/\s+/g, " "));
  spek.semua.forEach((f) => { const i = header.findIndex((h) => ALIAS[f].includes(h)); if (i >= 0) idx[f] = i; });
  const hilang = spek.wajib.filter((f) => !(f in idx));
  if (hilang.length) throw new Error(`Kolom wajib tidak ditemukan: ${hilang.join(", ")}. Gunakan template dari tombol Unduh template.`);
  const baris = [];
  for (let r = 1; r < aoa.length; r++) {
    const d = {}; let ada = false;
    spek.semua.forEach((f) => { d[f] = f in idx ? String(aoa[r][idx[f]] ?? "").trim() : ""; if (d[f]) ada = true; });
    if (ada) baris.push({ no: r + 1, d });
  }
  if (!baris.length) throw new Error("File tidak berisi data.");
  return baris;
}

function periksa(peran, baris) {
  const kelasAda = new Set(S.kelas.map((k) => norm(k.nama)));
  const mapelAda = new Set(S.mapel.map((m) => norm(m.nama)));
  const terdaftar = new Set([...S.siswa, ...S.guru, ...S.admins].map((p) => p.username));
  const lihat = new Set();
  const label = peran === "siswa" ? "NISN" : "NIP";
  return baris.map((b) => {
    const d = b.d, kunci = norm(peran === "siswa" ? d.nisn : d.nip);
    let galat = "", peringatan = "";
    if (/e\+/.test(kunci)) galat = `${label} berubah menjadi notasi ilmiah. Ubah kolom ke format Teks di Excel`;
    else if (!usernameValid(kunci)) galat = `${label} kosong atau tidak valid (3-40 huruf atau angka)`;
    else if (!d.nama) galat = "Nama kosong";
    else if (lihat.has(kunci)) galat = `${label} ganda di dalam file`;
    else if (terdaftar.has(kunci)) galat = "Sudah terdaftar";
    else if (normJK(d.jenis_kelamin) === "?") galat = "Jenis kelamin harus L atau P";
    else if (d.password && d.password.length < 8) galat = "Password minimal 8 karakter";
    else if (peran === "siswa") { if (!kelasAda.has(norm(d.kelas))) galat = `Kelas "${d.kelas}" belum ada`; }
    else {
      const lm = daftarNama(d.mapel), lk = daftarNama(d.kelas);
      if (!lm.length) galat = "Mapel kosong";
      else if (!lk.length) galat = "Kelas kosong";
      else {
        const m = lm.find((x) => !mapelAda.has(norm(x))), k = lk.find((x) => !kelasAda.has(norm(x)));
        if (m) galat = `Mapel "${m}" belum ada`; else if (k) galat = `Kelas "${k}" belum ada`;
      }
    }
    if (!galat) {
      lihat.add(kunci);
      if (peran === "siswa" && /^\d+$/.test(d.nisn) && d.nisn.length < 10) peringatan = `NISN hanya ${d.nisn.length} digit, angka 0 di depan mungkin hilang`;
    }
    const kirim = peran === "siswa"
      ? { nisn: d.nisn, nama: d.nama, jenis_kelamin: d.jenis_kelamin, kelas: d.kelas, password: d.password }
      : { nip: d.nip, nama: d.nama, mapel: d.mapel, kelas: d.kelas, password: d.password };
    return { ...b, galat, peringatan, kirim };
  });
}

async function bukaImpor(peran) {
  try { await Promise.all([muatKelas(), muatMapel(), muatSiswa(), muatGuru(), muatAdmin()]); }
  catch (e) { return toast("Gagal memuat data: " + e.message, "error"); }
  if (!S.kelas.length) return toast("Buat kelas dulu di menu Data > Kelas sebelum impor", "error");
  if (peran === "guru" && !S.mapel.length) return toast("Buat mapel dulu di menu Data > Mata Pelajaran sebelum impor guru", "error");

  let siap = [];
  const m = tampilModal(`Impor ${peran} dari Excel`, `
    <p><b>1.</b> Unduh template, isi datanya.</p>
    <p><button class="btn" id="tpl">Unduh template Excel</button></p>
    <p><b>2.</b> Pilih file yang sudah diisi (.xlsx, .xls, atau .csv).</p>
    <p><input type="file" id="berkas" accept=".xlsx,.xls,.csv"></p>
    <div id="pratinjau"></div>`, {
    lebar: "lebar", onTutup: () => muatUlang(),
    aksi: [{ label: "Batal" }, { id: "impor", label: "Impor", kelas: "btn-primary", onClick: async (mm) => { await jalankanImpor(mm, peran, siap); return false; } }],
  });
  m.tombol.impor.disabled = true;
  m.body.querySelector("#tpl").onclick = () => unduhTemplate(peran);
  m.body.querySelector("#berkas").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const pr = m.body.querySelector("#pratinjau");
    siap = []; m.tombol.impor.disabled = true; m.tombol.impor.textContent = "Impor";
    pr.innerHTML = '<p class="memuat">Membaca file...</p>';
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: true });
      const nm = wb.SheetNames.includes("Data") ? "Data" : wb.SheetNames[0];
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: false, defval: "" });
      const hasil = periksa(peran, bacaLembar(aoa, peran));
      siap = hasil.filter((x) => !x.galat);
      const bermasalah = hasil.length - siap.length;
      const kolomKhusus = peran === "siswa" ? ["NISN", "Nama", "L/P", "Kelas"] : ["NIP", "Nama", "Mapel", "Kelas"];
      pr.innerHTML = `<p><b>${hasil.length}</b> baris terbaca: <b>${siap.length}</b> siap diimpor${bermasalah ? `, <b>${bermasalah}</b> bermasalah dan akan dilewati` : ""}.</p>
        <div class="gulung"><table><thead><tr><th>Baris</th>${kolomKhusus.map((k) => `<th>${k}</th>`).join("")}<th>Pemeriksaan</th></tr></thead><tbody>
        ${hasil.slice(0, 1000).map((x) => `<tr class="${x.galat || x.peringatan ? "sorot-baris" : ""}"><td class="angka">${x.no}</td>
          <td class="mono">${esc(peran === "siswa" ? x.d.nisn : x.d.nip)}</td><td>${esc(x.d.nama)}</td>
          <td>${esc(peran === "siswa" ? x.d.jenis_kelamin : x.d.mapel)}</td><td>${esc(x.d.kelas)}</td>
          <td>${x.galat ? `<span class="badge off">${esc(x.galat)}</span>` : x.peringatan ? `<span class="badge warn">${esc(x.peringatan)}</span>` : '<span class="badge ok">Siap</span>'}</td></tr>`).join("")}
        </tbody></table></div>`;
      m.tombol.impor.disabled = siap.length === 0;
      m.tombol.impor.textContent = `Impor ${siap.length} ${peran}`;
    } catch (e) {
      pr.innerHTML = `<div class="galat-blok">${esc(e.message || e)}</div>`;
    }
  };
}
window.bukaImpor = bukaImpor;

async function jalankanImpor(m, peran, siap) {
  m.setAksi([]);
  m.body.innerHTML = `<p id="ket">Mengimpor...</p><div class="prog"><div id="isi"></div></div>
    <p class="ket">Jangan tutup halaman ini sampai selesai. Impor dikirim per 100 baris.</p>`;
  const hasil = [];
  for (let i = 0; i < siap.length; i += 100) {
    const potong = siap.slice(i, i + 100);
    m.body.querySelector("#ket").textContent = `Mengimpor ${i + 1} sampai ${Math.min(i + 100, siap.length)} dari ${siap.length}...`;
    m.body.querySelector("#isi").style.width = (i / siap.length * 100) + "%";
    try {
      const j = await panggilFungsi({ aksi: peran === "siswa" ? "impor_siswa" : "impor_guru", rows: potong.map((x) => x.kirim) });
      j.hasil.forEach((h) => hasil.push({ ...h, no: potong[h.idx].no }));
    } catch (e) {
      potong.forEach((x) => hasil.push({ no: x.no, username: norm(peran === "siswa" ? x.d.nisn : x.d.nip), nama: x.d.nama, status: "gagal", pesan: e.message }));
    }
  }
  const ok = hasil.filter((h) => h.status === "ok"), gagal = hasil.filter((h) => h.status !== "ok");
  const entri = ok.map((h) => entriDariHasil(h, peran));
  entri.forEach(tambahKartu);
  m.body.innerHTML = `<p><b>${ok.length}</b> ${peran} berhasil dibuat${gagal.length ? `, <b>${gagal.length}</b> gagal` : ""}.</p>
    ${gagal.length ? `<div class="gulung" style="margin-bottom:1rem"><table><thead><tr><th>Baris</th><th>${LABEL_ID[peran]}</th><th>Nama</th><th>Alasan</th></tr></thead><tbody>
      ${gagal.map((h) => `<tr><td class="angka">${h.no}</td><td class="mono">${esc(h.username)}</td><td>${esc(h.nama)}</td><td>${esc(h.pesan)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="catatan">Password tidak disimpan di server dan hanya bisa dilihat sekarang. Unduh hasilnya atau cetak kartu login sebelum menutup halaman ini.</div>`;
  m.setAksi([
    { label: "Unduh hasil (Excel)", tutup: false, onClick: () => unduhExcel(`hasil_impor_${peran}_${stempel()}.xlsx`, hasil.map((h) => ({
      Baris: h.no, [LABEL_ID[peran]]: h.username, Nama: h.nama, [peran === "siswa" ? "Kelas" : "Mapel"]: peran === "siswa" ? (h.kelas || "") : (h.mapel || ""),
      ...(peran === "guru" ? { Kelas: h.kelas || "" } : {}), Password: h.password || "", Status: h.status === "ok" ? "Berhasil" : "Gagal", Keterangan: h.status === "ok" ? "" : h.pesan,
    })), "Hasil impor") },
    { label: "Cetak kartu login", tutup: false, onClick: () => cetakKartu(entri) },
    { label: "Selesai", kelas: "btn-primary" },
  ]);
  if (!ok.length) m.setAksi([{ label: "Tutup", kelas: "btn-primary" }]);
}

// ---------------------------------------------------------------------
//  Halaman Khusus: Kartu login (Database Supabase)
// ---------------------------------------------------------------------
const FK = { kelas: "", lihat: false };
async function rKartu() {
  await muatKartu();
  const kelasAda = [...new Set(S.kartu.map((k) => k.kelas))].sort(urut);
  if (FK.kelas && !kelasAda.includes(FK.kelas)) FK.kelas = "";
  const daftar = S.kartu.filter((k) => !FK.kelas || k.kelas === FK.kelas).sort((a, b) => urut(a.kelas, b.kelas) || urut(a.nama, b.nama));
  konten().innerHTML = `
    <div class="catatan"><b>Menu Khusus — Tersimpan di Database Supabase.</b> Data kartu login dan password terakhir tidak hilang saat halaman ditutup atau dimuat ulang. Anda dapat mengosongkan riwayat kartu di database setelah semua kartu selesai dibagikan.</div>
    ${S.kartu.length ? `
    <div class="alat">
      <div class="alat-kiri">
        <select class="pilih" id="f-kelas"><option value="">Semua kelas</option>${kelasAda.map((k) => `<option ${k === FK.kelas ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
        <label style="display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="lihat" ${FK.lihat ? "checked" : ""}> Tampilkan password</label>
      </div>
      <div class="alat-kanan">
        <button class="btn btn-primary" id="cetak">Cetak ${daftar.length} kartu</button>
        <button class="btn" id="unduh">Unduh Excel</button>
        <button class="btn" id="hapus">Kosongkan riwayat DB</button>
      </div>
    </div>
    <div class="tabel-bungkus"><table class="resp"><thead><tr><th>Nama</th><th>Kelas</th><th>Username</th><th>Password</th></tr></thead><tbody>
    ${daftar.map((k) => `<tr><td data-label="Nama">${esc(k.nama)}</td><td data-label="Kelas">${esc(k.kelas)}</td>
      <td data-label="Username" class="mono">${esc(k.username)}</td>
      <td data-label="Password" class="mono">${FK.lihat ? esc(k.password) : "••••••••"}</td></tr>`).join("")}
    </tbody></table></div>` : kosong("Belum ada kartu", "Kartu muncul di sini setelah Anda mengimpor siswa atau guru, atau mereset password.")}`;
  if (!S.kartu.length) return;
  $("#f-kelas").onchange = (e) => { FK.kelas = e.target.value; rKartu(); };
  $("#lihat").onchange = (e) => { FK.lihat = e.target.checked; rKartu(); };
  $("#cetak").onclick = () => cetakKartu(daftar);
  $("#unduh").onclick = () => unduhExcel(`kartu_login_${stempel()}.xlsx`, daftar.map((k) => ({ Nama: k.nama, Kelas: k.kelas, Username: k.username, Password: k.password })), "Kartu login");
  $("#hapus").onclick = async () => {
    if (!await konfirmasi("Hapus semua riwayat kartu login dari database Supabase? Akun pengguna tetap aman, hanya catatan password di tabel kartu_login yang dihapus.", { ya: "Hapus riwayat", bahaya: true })) return;
    const { error } = await sb.from("kartu_login").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
    if (error) return toast("Gagal menghapus riwayat: " + error.message, "error");
    S.kartu = []; perbaruiLencana(); toast("Riwayat kartu di database dikosongkan", "ok"); rKartu();
  };
}

// ---------------------------------------------------------------------
//  Halaman Khusus: Aktifitas
// ---------------------------------------------------------------------
const AKSI_LOG = {
  impor_siswa: "Impor siswa", impor_guru: "Impor guru", impor_soal: "Impor soal", buat_admin: "Tambah admin", reset_password: "Reset password",
  ubah_username: "Ubah username", aktifkan_akun: "Aktifkan akun", nonaktifkan_akun: "Nonaktifkan akun", hapus_user: "Hapus akun",
  hapus_massal_user: "Hapus massal akun",
};
const FL = { baris: [], pilih: new Set(), nama: new Map() };
async function rLog() {
  await muatAdmin();
  const { data, error } = await sb.from("log_aktivitas").select("*").order("waktu", { ascending: false }).limit(200);
  if (error) throw error;
  FL.baris = data || [];
  FL.pilih = new Set();
  FL.nama = new Map(S.admins.map((a) => [a.id, a.nama]));
  gambarLog();
}
function gambarLog() {
  const semuaPilih = FL.baris.length > 0 && FL.baris.every((l) => FL.pilih.has(String(l.id)));
  let isi = `
    <div class="alat">
      <p class="ket">Menu Khusus — ${FL.baris.length} kejadian aktifitas terbaru</p>
      ${FL.baris.length ? `<div class="alat-kanan">
        <button class="btn btn-kecil btn-danger" id="log-kosongkan">Kosongkan semua aktifitas</button>
      </div>` : ""}
    </div>`;
  if (FL.pilih.size) {
    isi += `<div class="pilihan"><span>${FL.pilih.size} aktifitas dipilih</span>
      <button class="btn btn-kecil btn-danger" data-aksi="hapus-massal-log">Hapus terpilih</button>
      <button class="btn btn-kecil" data-aksi="batal-log">Batal pilih</button></div>`;
  }
  isi += FL.baris.length ? `<div class="tabel-bungkus"><table class="resp"><thead><tr>
    <th class="cek"><input type="checkbox" id="log-semua" ${semuaPilih ? "checked" : ""} aria-label="Pilih semua aktifitas"></th>
    <th>Waktu</th><th>Admin</th><th>Aksi</th><th>Sasaran</th><th>Keterangan</th></tr></thead><tbody>
    ${FL.baris.map((l) => {
      const idStr = String(l.id);
      return `<tr ${FL.pilih.has(idStr) ? 'class="sorot-baris"' : ""}>
        <td class="cek"><input type="checkbox" data-log-id="${idStr}" ${FL.pilih.has(idStr) ? "checked" : ""} aria-label="Pilih aktifitas"></td>
        <td data-label="Waktu">${esc(waktu(l.waktu))}</td>
        <td data-label="Admin">${esc(FL.nama.get(l.pelaku) || "-")}</td>
        <td data-label="Aksi"><span class="badge info">${esc(AKSI_LOG[l.aksi] || l.aksi)}</span></td>
        <td data-label="Sasaran" class="mono">${esc(l.target || "-")}</td>
        <td data-label="Keterangan">${esc(l.detail ? JSON.stringify(l.detail) : "")}</td></tr>`;
    }).join("")}
    </tbody></table></div>` : kosong("Belum ada catatan", "Impor, reset password, dan perubahan akun akan tercatat di sini.");

  konten().innerHTML = isi;

  const btnKosong = $("#log-kosongkan");
  if (btnKosong) {
    btnKosong.onclick = async () => {
      if (!await konfirmasi("Hapus semua riwayat aktifitas dari database?", { ya: "Kosongkan aktifitas", bahaya: true })) return;
      const { error } = await sb.from("log_aktivitas").delete().gt("id", 0);
      if (error) return toast("Gagal mengosongkan aktifitas: " + error.message, "error");
      toast("Semua riwayat aktifitas berhasil dihapus", "ok");
      rLog();
    };
  }

  konten().onchange = (e) => {
    const c = e.target;
    if (c.id === "log-semua") {
      FL.baris.forEach((l) => c.checked ? FL.pilih.add(String(l.id)) : FL.pilih.delete(String(l.id)));
      gambarLog();
    } else if (c.dataset.logId) {
      c.checked ? FL.pilih.add(c.dataset.logId) : FL.pilih.delete(c.dataset.logId);
      gambarLog();
    }
  };

  konten().onclick = async (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    if (b.dataset.aksi === "batal-log") { FL.pilih.clear(); gambarLog(); }
    if (b.dataset.aksi === "hapus-massal-log") {
      const ids = [...FL.pilih].map(Number);
      if (!ids.length) return;
      if (!await konfirmasi(`Hapus <b>${ids.length}</b> catatan aktifitas terpilih?`, { ya: "Hapus terpilih", bahaya: true })) return;
      const { error } = await sb.from("log_aktivitas").delete().in("id", ids);
      if (error) return toast("Gagal menghapus aktifitas: " + error.message, "error");
      toast(`${ids.length} aktifitas berhasil dihapus`, "ok");
      rLog();
    }
  };
}

// ---------------------------------------------------------------------
//  Beranda GURU
// ---------------------------------------------------------------------
async function rBerandaGuru() {
  await Promise.all([muatKelas(), muatMapel()]);
  const hitung = async (tabel, saring) => {
    try {
      let q = sb.from(tabel).select("id", { count: "exact", head: true });
      if (saring) q = saring(q);
      const { count } = await q;
      return count || 0;
    } catch (_) { return 0; }
  };
  const [jmlBank, jmlUjianAktif, jmlMengerjakan, jmlMenunggu] = await Promise.all([
    hitung("bank"),
    hitung("ujian", (q) => q.eq("aktif", true)),
    hitung("hasil_ujian", (q) => q.eq("status", "mengerjakan")),
    hitung("hasil_ujian", (q) => q.eq("status", "selesai").eq("status_koreksi", "menunggu")),
  ]);

  const perMapel = new Map();
  S.penugasan.forEach((p) => {
    if (!perMapel.has(p.mapel_id)) perMapel.set(p.mapel_id, []);
    perMapel.get(p.mapel_id).push(p.kelas_id);
  });
  const sekarang = fmtWITA(sekarangMs(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  konten().innerHTML = `
    <section class="hero-mewah">
      <div class="hero-glow"></div>
      <div class="hero-top">
        <div>
          <div class="hero-pill"><span class="dot"></span><span>${esc(periodeAktifTeks())}</span><span>&middot;</span><span>${esc(sekarang)}</span></div>
          <h2>Selamat datang, ${esc(S.me.nama)}</h2>
          <p class="hero-desc">Susun soal, pantau jalannya ujian, dan nilai jawaban esai siswa Anda di <b>${esc(CONFIG.NAMA_SEKOLAH)}</b>.</p>
        </div>
      </div>
      <div class="hero-aksi">
        <a class="btn btn-amber" href="#soal">+ Kelola Bank Soal</a>
        <a class="btn btn-glass" href="#hasil">Hasil &amp; Penilaian${jmlMenunggu ? ` (${jmlMenunggu})` : ""}</a>
      </div>
    </section>

    <section class="kpi-grid" aria-label="Ringkasan">
      <a class="kpi-kartu kpi-biru" href="#soal">
        <div class="kpi-atas"><span class="kpi-ikon">📝</span><span class="kpi-tag">Bank soal</span></div>
        <div class="kpi-nilai">${jmlBank}</div><div class="kpi-judul">Bank Soal Saya</div>
        <div class="kpi-sub">${S.mapel.length} mapel · ${S.kelas.length} kelas diampu</div>
      </a>
      <a class="kpi-kartu kpi-hijau" href="#hasil">
        <div class="kpi-atas"><span class="kpi-ikon">🚀</span><span class="kpi-tag">Berjalan</span></div>
        <div class="kpi-nilai">${jmlUjianAktif}</div><div class="kpi-judul">Ujian Aktif</div>
        <div class="kpi-sub">${jmlMengerjakan} siswa sedang mengerjakan</div>
      </a>
      <a class="kpi-kartu kpi-amber" href="#hasil">
        <div class="kpi-atas"><span class="kpi-ikon">✍️</span><span class="kpi-tag">${jmlMenunggu ? "Perlu tindakan" : "Beres"}</span></div>
        <div class="kpi-nilai">${jmlMenunggu}</div><div class="kpi-judul">Menunggu Penilaian Esai</div>
        <div class="kpi-sub">Lembar jawaban siswa yang belum Anda nilai</div>
      </a>
    </section>

    <h3 class="bank-grup" style="margin-top:1.5rem">Mapel &amp; kelas yang saya ampu</h3>
    ${perMapel.size ? `<div class="tabel-bungkus"><table class="resp"><thead><tr><th>Mata pelajaran</th><th>Kelas</th></tr></thead><tbody>
      ${[...perMapel].sort((a, b) => urut(namaMapel(a[0]), namaMapel(b[0]))).map(([mid, ks]) => `<tr>
        <td data-label="Mata pelajaran"><b>${esc(namaMapel(mid))}</b></td>
        <td data-label="Kelas">${ks.map(namaKelas).sort(urut).map((n) => `<span class="badge info">${esc(n)}</span>`).join(" ")}</td></tr>`).join("")}
      </tbody></table></div>`
      : kosong("Belum ada penugasan", "Admin belum menugaskan Anda ke mata pelajaran dan kelas mana pun. Hubungi admin sekolah.")}`;
}

// ---------------------------------------------------------------------
//  Router dan awal aplikasi
// ---------------------------------------------------------------------
const MENU_GURU = [
  { key: "beranda", judul: "Beranda", sub: "Ringkasan tugas mengajar Anda", ikon: "🏠", render: rBerandaGuru },
  { key: "soal", judul: "Bank Soal", sub: "Isi & kelola soal ujian", ikon: "📝", render: () => rSoal() },
  { key: "hasil", judul: "Hasil Ujian", sub: "Progres ujian, hasil & penilaian esai", ikon: "📊", render: () => rHasil() },
];
const MENU_UTAMA = [
  { key: "beranda", judul: "Beranda", sub: "Ringkasan & kendali utama", ikon: "🏠", render: rBeranda },
  { key: "data", judul: "Data", sub: "Kelas, mata pelajaran, guru & siswa", ikon: "🗂️", render: rData },
  { key: "soal", judul: "Bank Soal", sub: "Kelola bank & butir soal ujian", ikon: "📝", render: () => rSoal() },
  { key: "hasil", judul: "Hasil Ujian", sub: "Rekap nilai & status pengerjaan siswa", ikon: "📊", render: () => rHasil() },
  { key: "admin", judul: "Admin", sub: "Manajemen akun administrator", ikon: "🛡️", render: rAdmin },
];
const MENU_KHUSUS = [
  { key: "kartu", judul: "Kartu Login", sub: "Cetak & unduh kartu peserta", ikon: "🪪", render: rKartu },
  { key: "pengaturan", judul: "Pengaturan", sub: "Kop surat & data sekolah untuk cetakan", ikon: "⚙️", render: () => rPengaturan() },
  { key: "log", judul: "Aktifitas", sub: "Riwayat aktifitas & audit sistem", ikon: "⚡", render: rLog },
];

const HALAMAN = {};
(PANEL === "guru" ? MENU_GURU : [...MENU_UTAMA, ...MENU_KHUSUS]).forEach((m) => {
  HALAMAN[m.key] = m;
});

const ALIAS_HASH = {
  kelas: "data/kelas",
  mapel: "data/mapel",
  guru: "data/guru",
  siswa: "data/siswa",
};

let halamanSekarang = "beranda";
const muatUlang = () => tampilHalaman();

async function tampilHalaman() {
  const rawHash = location.hash.slice(1);
  if (ALIAS_HASH[rawHash]) {
    location.replace("#" + ALIAS_HASH[rawHash]);
    return;
  }
  const h = rawHash.split("/")[0];
  const nama = HALAMAN[h] ? h : "beranda";
  halamanSekarang = nama;
  const info = HALAMAN[nama];
  $("#judul-halaman").textContent = info.judul;
  $("#subjudul-halaman").textContent = info.sub || "";
  document.title = info.judul + (PANEL === "guru" ? " - Panel Guru" : " - Panel Admin");
  document.querySelectorAll("#menu a").forEach((a) => a.removeAttribute("aria-current"));
  const aktif = $(`#menu a[href="#${nama}"]`); if (aktif) aktif.setAttribute("aria-current", "page");
  $("#app").classList.remove("buka");
  konten().onclick = null;
  konten().innerHTML = '<p class="memuat">Memuat...</p>';
  try { await info.render(); }
  catch (e) { konten().innerHTML = `<div class="galat-blok"><b>Gagal memuat data.</b><br>${esc(e.message || e)}</div>`; }
}

function bangunMenu() {
  const renderLink = (item) =>
    `<a href="#${item.key}">
      <span class="menu-kiri"><span class="menu-ikon" aria-hidden="true">${item.ikon}</span><span>${esc(item.judul)}</span></span>
      ${item.key === "kartu" ? '<span class="lencana" id="lencana-kartu" hidden>0</span>' : ""}
    </a>`;
  if (PANEL === "guru") {
    $("#menu").innerHTML = `
    <div class="menu-grup-label">Menu Guru</div>
    ${MENU_GURU.map(renderLink).join("")}`;
    return;
  }
  $("#menu").innerHTML = `
    <div class="menu-grup-label">Menu Utama</div>
    ${MENU_UTAMA.map(renderLink).join("")}
    <div class="menu-pemisah"></div>
    <div class="menu-grup-label khusus">Khusus</div>
    ${MENU_KHUSUS.map(renderLink).join("")}`;
}

(async () => {
  if (configBelumDiisi()) {
    $("#layar-memuat").innerHTML = "Pengaturan belum diisi. Buka config.js dan isi SUPABASE_URL serta SUPABASE_ANON_KEY.";
    return;
  }
  let profil = null;
  try { profil = await ambilProfilSaya(); } catch (e) { /* dianggap belum login */ }
  if (!profil || profil.peran !== PANEL || !profil.aktif) {
    await sb.auth.signOut();
    location.replace("index.html");
    return;
  }
  S.me = profil;
  if (PANEL === "guru") {
    try { await muatPenugasanSaya(); } catch (e) { S.penugasan = []; }
  }
  $("#nama-sekolah").textContent = CONFIG.NAMA_SEKOLAH;
  $("#nama-saya").textContent = profil.nama;
  const thnEl = $("#tahun-cipta");
  if (thnEl) thnEl.textContent = new Date().getFullYear();
  const fSekolah = $("#footer-sekolah");
  if (fSekolah) fSekolah.textContent = CONFIG.NAMA_SEKOLAH;
  const av = $("#avatar-saya");
  if (av && profil.nama) av.textContent = profil.nama.trim().charAt(0).toUpperCase();
  bangunMenu();
  $("#btn-keluar").onclick = async () => {
    S.kartu = []; await sb.auth.signOut(); location.replace("index.html");
  };
  $("#btn-menu").onclick = () => $("#app").classList.add("buka");
  $("#tirai").onclick = () => $("#app").classList.remove("buka");
  window.addEventListener("hashchange", tampilHalaman);
  $("#layar-memuat").hidden = true;
  $("#app").hidden = false;
  await muatPengaturanUmum();
  if (PANEL === "admin") await muatKartu();
  tampilHalaman();
})();
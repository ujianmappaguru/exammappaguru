"use strict";
// =====================================================================
//  PENGATURAN KOP SURAT (admin)  +  CETAK HASIL UJIAN (admin & guru)
//
//  1. rPengaturan()   : menu "Pengaturan" (khusus admin): Pemerintah, Instansi,
//                       Nama Sekolah, Alamat 1 & 2, Logo kiri/kanan, Tempat TTD.
//  2. cetakDialog()   : dipanggil tombol "Cetak PDF" di menu Hasil Ujian.
//                       Pilih jenis cetakan -> tampil PRATINJAU dulu ->
//                       baru tombol Cetak / Simpan sebagai PDF.
//
//  Jenis cetakan:
//    - Per kelas  : satu mapel (ujian), satu kelas, SEMUA siswa kelas tampil
//    - Per mapel  : satu mapel (ujian), semua kelas pesertanya (1 halaman/kelas)
//    - Per siswa  : satu siswa, semua mapel yang ia ikuti, dalam satu lembar
//
//  Siswa yang tidak ikut ujian tetap tampil, diberi warna + tulisan.
//  Butuh: 20_pengaturan_sekolah_logo.sql dan 21_pengaturan_umum_jenis_ujian.sql sudah dijalankan.
// =====================================================================

// ---------------------------------------------------------------------
//  Data pengaturan sekolah
// ---------------------------------------------------------------------
const PG_BUCKET = "logo-sekolah";
const PG_KOLOM = "pemerintah,instansi,nama_sekolah,alamat_1,alamat_2,logo_kiri,logo_kanan,tempat_ttd";
const PG_KOSONG = { pemerintah: "", instansi: "", nama_sekolah: "", alamat_1: "", alamat_2: "", logo_kiri: null, logo_kanan: null, tempat_ttd: "" };

const pgUrlLogo = (nama) => (nama ? sb.storage.from(PG_BUCKET).getPublicUrl(nama).data.publicUrl : "");

async function pgMuat() {
  const { data, error } = await sb.from("pengaturan_sekolah").select(PG_KOLOM).eq("id", 1).maybeSingle();
  if (error) throw new Error(`${error.message}. Pastikan 20_pengaturan_sekolah_logo.sql sudah dijalankan di Supabase.`);
  return { ...PG_KOSONG, ...(data || {}) };
}

// ---------------------------------------------------------------------
//  Kop surat (dipakai di pratinjau pengaturan dan di cetakan)
// ---------------------------------------------------------------------
function kopHtml(pg, urlKiri, urlKanan) {
  const baris = (kls, t) => (String(t || "").trim() ? `<div class="${kls}">${esc(t)}</div>` : "");
  const logo = (u) => `<div class="kop-logo">${u ? `<img src="${esc(u)}" alt="">` : ""}</div>`;
  return `<div class="kop">${logo(urlKiri)}
    <div class="kop-teks">
      ${baris("kop-1", pg.pemerintah)}${baris("kop-2", pg.instansi)}${baris("kop-3", pg.nama_sekolah)}
      ${baris("kop-4", pg.alamat_1)}${baris("kop-4", pg.alamat_2)}
    </div>${logo(urlKanan)}</div>`;
}

// ---------------------------------------------------------------------
//  Gaya (pratinjau layar + cetak). Dipasang sekali saat file dimuat.
// ---------------------------------------------------------------------
(function pasangGayaCetak() {
  if (document.getElementById("gaya-cetak")) return;
  const st = document.createElement("style");
  st.id = "gaya-cetak";
  st.textContent = `
.kop{display:flex;align-items:center;gap:4mm;border-bottom:3px double #000;padding-bottom:3mm;margin-bottom:5mm;color:#000}
.kop-logo{flex:none;width:24mm;height:24mm;display:flex;align-items:center;justify-content:center}
.kop-logo img{max-width:100%;max-height:100%;object-fit:contain}
.kop-teks{flex:1;text-align:center;line-height:1.25}
.kop-1{font-size:12pt;font-weight:600;text-transform:uppercase}
.kop-2{font-size:13pt;font-weight:700;text-transform:uppercase}
.kop-3{font-size:15pt;font-weight:800;text-transform:uppercase}
.kop-4{font-size:9.5pt}

#cetak-layar{position:fixed;inset:0;z-index:200;background:#cbd5e1;overflow:auto;padding-bottom:2rem}
.cetak-bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;justify-content:space-between;
  background:#fff;border-bottom:1px solid #cbd5e1;padding:.7rem 1rem;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.cetak-bar-judul small{display:block;color:#64748b}
.cetak-bar .aksi{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.cetak-bar label{display:flex;align-items:center;gap:.5rem;font-size:.9rem;font-weight:600}
.cetak-bar .input{min-height:40px;width:auto}
.cetak-petunjuk{max-width:210mm;margin:.8rem auto 0;padding:0 .5rem;font-size:.88rem;color:#334155}
.cetak-kertas{width:210mm;max-width:100%;margin:.8rem auto 0;display:flex;flex-direction:column;gap:1rem}
.cetak-hal{background:#fff;color:#000;padding:14mm 15mm;box-shadow:0 4px 18px rgba(0,0,0,.18);min-height:297mm;
  font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.35}
.cetak-judul{font-family:"Times New Roman",Times,serif;text-align:center;font-size:13pt;font-weight:700;text-decoration:underline;margin:0 0 4mm;letter-spacing:0}
.cetak-sub{text-align:center;font-weight:700;font-size:11.5pt;margin:-2.5mm 0 4mm}
.cetak-bio{border-collapse:collapse;margin-bottom:4mm;font-size:11pt}
.cetak-bio td{padding:.4mm 0;vertical-align:top}
.cetak-bio td:first-child{width:38mm}
.cetak-bio td:nth-child(2){width:5mm}
.cetak-tabel{width:100%;border-collapse:collapse;font-size:10.5pt}
.cetak-tabel th,.cetak-tabel td{border:1px solid #000;padding:1.3mm 2mm;vertical-align:middle}
.cetak-tabel th{background:#e5e7eb;text-align:center;font-weight:700}
.cetak-tabel thead{display:table-header-group}
.cetak-tabel tr{break-inside:avoid}
.cetak-tabel td.c{text-align:center}
.cetak-tabel .nisn{font-size:9pt;color:#444}
.cetak-ringkas{margin-top:3mm;font-size:10pt}
.cetak-legenda{display:flex;flex-wrap:wrap;gap:1mm 5mm;margin-top:2mm;font-size:9.5pt;align-items:center}
.cetak-legenda i{display:inline-block;width:4mm;height:3mm;border:1px solid #000;margin-right:1.5mm;vertical-align:middle}
.cetak-legenda i.st-tidak{background:#fecaca}.cetak-legenda i.st-kumpul{background:#bfdbfe}.cetak-legenda i.st-esai{background:#fde68a}
.cetak-ttd{margin-top:8mm;break-inside:avoid;display:flex;justify-content:flex-end}
.cetak-ttd-grid{margin-top:8mm;break-inside:avoid}
.cetak-ttd-grid .ttd-tgl{text-align:right;margin-bottom:2mm}
.cetak-ttd-baris{display:flex;flex-wrap:wrap;gap:6mm;justify-content:flex-end}
.ttd-blok{width:64mm;text-align:center}
.ttd-ruang{height:20mm}
.ttd-nama{font-weight:700;text-decoration:underline}
.ttd-blok .no-print{margin-top:2mm}
/* tabel bawaan aplikasi tidak boleh bocor ke dokumen cetak */
.cetak-hal table{width:auto;font-family:inherit;color:#000;background:none;box-shadow:none;border-radius:0}
.cetak-hal .cetak-tabel{width:100%}
.cetak-hal th,.cetak-hal td{text-transform:none!important;letter-spacing:0!important;color:#000!important;font-size:inherit!important;line-height:1.3!important;background-clip:border-box}
.cetak-hal .cetak-bio td{border:0!important;padding:.4mm 0!important;background:none!important}
.cetak-hal .cetak-tabel th{border:1px solid #000!important;padding:1.4mm 2mm!important;background:#e5e7eb!important;font-weight:700!important;text-align:center!important}
.cetak-hal .cetak-tabel td{border:1px solid #000!important;padding:1mm 2mm!important}
.cetak-hal .cetak-tabel td.c{text-align:center!important}
.cetak-hal .cetak-tabel .nisn{font-size:9pt!important;color:#444!important}
.cetak-hal .cetak-tabel tr.st-tidak td{background:#fecaca!important}
.cetak-hal .cetak-tabel tr.st-kumpul td{background:#bfdbfe!important}
.cetak-hal .cetak-tabel tr.st-esai td{background:#fde68a!important}
.cetak-hal .cetak-tabel tbody tr:hover td{background-color:inherit}`;
  document.head.appendChild(st);
})();


// Aturan cetak hanya dipasang selama pratinjau terbuka, supaya tidak mengganggu
// cetak kartu login (style.css punya aturan @media print sendiri untuk kartu).
const CT_CSS_CETAK = `
@media print{
  @page{size:A4 portrait;margin:14mm 15mm}
  html,body{overflow:visible!important;height:auto!important;background:#fff!important;padding:0!important}
  body>*:not(#cetak-layar){display:none!important}
  html body > #cetak-layar{display:block!important;position:static!important;overflow:visible!important;background:#fff!important;padding:0!important}
  .no-print,.cetak-bar,.cetak-petunjuk{display:none!important}
  .cetak-kertas{width:auto!important;margin:0!important;gap:0!important;display:block!important}
  .cetak-hal{box-shadow:none!important;padding:0!important;min-height:0!important;break-after:page;page-break-after:always}
  .cetak-hal:last-child{break-after:auto;page-break-after:auto}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}`;

// ---------------------------------------------------------------------
//  MENU PENGATURAN (khusus admin)
// ---------------------------------------------------------------------
async function logoKompres(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Logo harus berformat PNG, JPG, atau WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Ukuran file terlalu besar (maksimal 15 MB).");
  const src = await muatGambarKeBitmap(file);
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error("Gambar tidak valid.");
  const tipe = file.type === "image/jpeg" ? "image/jpeg" : "image/png"; // PNG menjaga latar transparan
  let skala = Math.min(1, 500 / Math.max(w0, h0));
  for (let i = 0; i < 6; i++) {
    const w = Math.max(1, Math.round(w0 * skala)), h = Math.max(1, Math.round(h0 * skala));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    const blob = await canvasKeBlob(c, tipe, 0.92);
    if (!blob) throw new Error("Browser tidak bisa memproses gambar ini.");
    if (blob.size <= 480 * 1024) return { blob, tipe, ext: tipe === "image/png" ? "png" : "jpg" };
    skala *= 0.75;
  }
  throw new Error("Logo terlalu besar/kompleks. Gunakan gambar yang lebih sederhana.");
}

async function rPengaturan() {
  if (PANEL !== "admin") {
    konten().innerHTML = kosong("Khusus admin", "Menu pengaturan hanya bisa dibuka oleh admin.");
    return;
  }
  let pg;
  try { pg = await pgMuat(); }
  catch (e) { konten().innerHTML = `<div class="galat-blok"><b>Gagal memuat pengaturan.</b><br>${esc(e.message)}</div>`; return; }
  if (!pg.nama_sekolah) pg.nama_sekolah = CONFIG.NAMA_SEKOLAH || "";

  const L = {
    kiri: { blob: null, url: pgUrlLogo(pg.logo_kiri), lama: pg.logo_kiri, hapus: false },
    kanan: { blob: null, url: pgUrlLogo(pg.logo_kanan), lama: pg.logo_kanan, hapus: false },
  };
  const F = [
    ["pemerintah", "Pemerintah", "Contoh: PEMERINTAH KOTA MAKASSAR"],
    ["instansi", "Instansi", "Contoh: DINAS PENDIDIKAN"],
    ["nama_sekolah", "Nama sekolah", ""],
    ["alamat_1", "Alamat 1", "Contoh: Jl. Contoh No. 1, Kec. Contoh"],
    ["alamat_2", "Alamat 2", "Contoh: Telp. (0411) 000000 | email: sekolah@contoh.sch.id"],
    ["tempat_ttd", "Tempat tanda tangan", "Contoh: Makassar"],
  ];
  const fld = (k) => { const x = F.find((f) => f[0] === k); return `<label class="f">${x[1]}
    <input class="input" data-f="${k}" maxlength="150" autocomplete="off" placeholder="${esc(x[2])}" value="${esc(pg[k])}"></label>`; };
  const kotakLogo = (sisi, judul) => `<div class="f"><div class="sl-judul">${judul}</div>
    <div id="lg-${sisi}" style="height:110px;border:1.5px dashed var(--garis-2);border-radius:12px;display:flex;align-items:center;justify-content:center;background:#fff;margin:.35rem 0 .5rem;overflow:hidden"></div>
    <input type="file" id="lg-file-${sisi}" accept="image/png,image/jpeg,image/webp" hidden>
    <div style="display:flex;gap:.45rem;flex-wrap:wrap">
      <button class="btn btn-kecil" type="button" data-pilih="${sisi}">Pilih logo</button>
      <button class="btn btn-kecil" type="button" data-hapus="${sisi}">Hapus</button>
    </div></div>`;

  await muatPengaturanUmum();
  konten().innerHTML = `
    <div class="panel-mewah" style="max-width:880px;margin-bottom:1.2rem">
      <div class="panel-kepala"><h3>Tahun ajaran &amp; semester</h3></div>
      <p class="ket">Dibaca oleh seluruh aplikasi (admin, guru, dan siswa): beranda, kartu login, dan cetak hasil ujian.</p>
      <div class="baris2">
        <label class="f">Tahun ajaran aktif
          <input class="input" id="um-ta" maxlength="9" autocomplete="off" placeholder="2026/2027" value="${esc(tahunAjaranAktif())}"></label>
        <label class="f">Semester aktif
          <select class="pilih" id="um-sem">
            <option value="Ganjil" ${semesterAktif() === "Ganjil" ? "selected" : ""}>Ganjil</option>
            <option value="Genap" ${semesterAktif() === "Genap" ? "selected" : ""}>Genap</option>
            <option value="" ${semesterAktif() === "" ? "selected" : ""}>Tidak ditampilkan</option>
          </select></label>
      </div>
      <label class="f" style="display:flex;align-items:center;gap:.5rem;margin:.2rem 0 0">
        <input type="checkbox" id="um-kelas"> Terapkan juga tahun ajaran ini ke semua kelas</label>
      <p class="ket">Centang bila semua kelas sudah masuk tahun ajaran baru. Biarkan kosong bila ada kelas yang masih memakai tahun ajaran lama.</p>
      <div style="margin-top:.8rem"><button class="btn btn-primary" id="um-simpan" type="button">Simpan tahun ajaran</button></div>
    </div>

    <div id="ac-pengaturan" style="max-width:880px;margin-bottom:1.2rem"></div>

    <div class="panel-mewah" style="max-width:880px">
      <div class="panel-kepala"><h3>Kop surat &amp; data sekolah</h3></div>
      <p class="ket">Data ini dipakai sebagai kop dan tempat tanda tangan pada cetak PDF hasil ujian.</p>
      <div class="sl-judul" style="margin:.8rem 0 .4rem">Pratinjau kop</div>
      <div id="pg-kop" style="background:#fff;border:1px solid var(--garis);border-radius:12px;padding:12px 16px;margin-bottom:1.2rem;overflow:auto;font-family:'Times New Roman',Times,serif"></div>
      <div class="baris2">${fld("pemerintah")}${fld("instansi")}</div>
      ${fld("nama_sekolah")}
      <div class="baris2">${fld("alamat_1")}${fld("alamat_2")}</div>
      ${fld("tempat_ttd")}
      <div class="baris2">${kotakLogo("kiri", "Logo kiri")}${kotakLogo("kanan", "Logo kanan")}</div>
      <p class="ket">Logo PNG/JPG/WebP. Ukurannya otomatis diperkecil. Bila logo ada di Google Drive, unduh dulu ke perangkat lalu pilih di sini.</p>
      <div style="margin-top:1rem"><button class="btn btn-primary" id="pg-simpan" type="button">Simpan pengaturan</button></div>
    </div>`;

  if (typeof rPengaturanAntiCurang === "function") rPengaturanAntiCurang($("#ac-pengaturan"));

  $("#um-simpan").onclick = async () => {
    const tombol = $("#um-simpan"); tombol.disabled = true;
    try {
      const ta = $("#um-ta").value.trim().replace(/\s+/g, "");
      const mt = /^(\d{4})\/(\d{4})$/.exec(ta);
      if (!mt || Number(mt[2]) !== Number(mt[1]) + 1) throw new Error("Format tahun ajaran harus seperti 2026/2027.");
      const sem = $("#um-sem").value;
      const { error } = await sb.from("pengaturan_umum").upsert({ id: 1, tahun_ajaran: ta, semester: sem, diubah: new Date().toISOString() });
      if (error) throw new Error(error.message + ". Pastikan 21_pengaturan_umum_jenis_ujian.sql sudah dijalankan di Supabase.");
      if ($("#um-kelas").checked) {
        const { error: e2 } = await sb.from("kelas").update({ tahun_ajaran: ta }).not("id", "is", null);
        if (e2) throw new Error("Tahun ajaran tersimpan, tetapi gagal diterapkan ke kelas: " + e2.message);
      }
      try { await sb.from("log_aktivitas").insert({ pelaku: S.me.id, aksi: "ubah_tahun_ajaran", target: `${ta} ${sem}`.trim() }); } catch (_) {}
      await muatPengaturanUmum();
      toast("Tahun ajaran disimpan.", "ok");
      rPengaturan();
    } catch (err) {
      toast(err.message || String(err), "error");
      tombol.disabled = false;
    }
  };

  const nilaiForm = () => {
    const o = { ...pg };
    konten().querySelectorAll("[data-f]").forEach((i) => { o[i.dataset.f] = i.value.trim(); });
    return o;
  };
  const gambarKop = () => {
    const o = nilaiForm();
    // Pratinjau kop memakai skala layar, bukan milimeter.
    $("#pg-kop").innerHTML = `<div style="--u:1">${kopHtml(o, L.kiri.hapus ? "" : L.kiri.url, L.kanan.hapus ? "" : L.kanan.url)}</div>`;
    ["kiri", "kanan"].forEach((s) => {
      const u = L[s].hapus ? "" : L[s].url;
      $(`#lg-${s}`).innerHTML = u ? `<img src="${esc(u)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain">` : '<span class="ket">Belum ada logo</span>';
    });
  };
  gambarKop();
  konten().oninput = (e) => { if ($("#pg-kop") && e.target.dataset && e.target.dataset.f) gambarKop(); };

  konten().onclick = async (e) => {
    const p = e.target.closest("[data-pilih]"), h = e.target.closest("[data-hapus]");
    if (p) $(`#lg-file-${p.dataset.pilih}`).click();
    if (h) { const s = h.dataset.hapus; L[s].blob = null; L[s].hapus = true; gambarKop(); }
  };
  ["kiri", "kanan"].forEach((s) => {
    $(`#lg-file-${s}`).onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      try {
        const k = await logoKompres(f);
        L[s].blob = k; L[s].url = URL.createObjectURL(k.blob); L[s].hapus = false;
        gambarKop();
      } catch (err) { toast(err.message, "error"); }
    };
  });

  $("#pg-simpan").onclick = async () => {
    const tombol = $("#pg-simpan"); tombol.disabled = true;
    const baru = [];            // file yang baru diunggah (dibatalkan bila simpan gagal)
    const buang = [];           // file lama yang dibuang setelah simpan berhasil
    try {
      const o = nilaiForm();
      if (!o.nama_sekolah) throw new Error("Nama sekolah wajib diisi.");
      const isi = { id: 1, diubah: new Date().toISOString() };
      F.forEach(([k]) => { isi[k] = o[k]; });
      for (const s of ["kiri", "kanan"]) {
        let nama = L[s].lama;
        if (L[s].blob) {
          nama = `${s}-${idAcak()}.${L[s].blob.ext}`;
          const { error } = await sb.storage.from(PG_BUCKET).upload(nama, L[s].blob.blob, { contentType: L[s].blob.tipe, cacheControl: "31536000", upsert: false });
          if (error) throw new Error("Gagal mengunggah logo: " + error.message);
          baru.push(nama);
          if (L[s].lama) buang.push(L[s].lama);
        } else if (L[s].hapus) {
          nama = null;
          if (L[s].lama) buang.push(L[s].lama);
        }
        isi["logo_" + s] = nama;
      }
      const { error } = await sb.from("pengaturan_sekolah").upsert(isi);
      if (error) throw new Error(error.message);
      if (buang.length) { try { await sb.storage.from(PG_BUCKET).remove(buang); } catch (_) {} }
      try { await sb.from("log_aktivitas").insert({ pelaku: S.me.id, aksi: "ubah_pengaturan_sekolah", target: o.nama_sekolah }); } catch (_) {}
      toast("Pengaturan disimpan.", "ok");
      rPengaturan();
    } catch (err) {
      if (baru.length) { try { await sb.storage.from(PG_BUCKET).remove(baru); } catch (_) {} }
      toast(err.message || String(err), "error");
      tombol.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------
//  CETAK HASIL UJIAN
// ---------------------------------------------------------------------
const CT = { P: null, onKey: null };

const ctTgl = (t) => fmtWITA(t, { day: "numeric", month: "long", year: "numeric" });
const ctTglUjian = (u) => { const a = ctTgl(u.waktu_mulai), b = ctTgl(u.waktu_selesai); return a === b ? a : `${a} s.d. ${b}`; };
const ctNilai = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const ctUjianBerakhir = (u) => new Date(u.waktu_selesai).getTime() <= sekarangMs();
const ctNip = (g) => (g && /^\d{8,}$/.test(g.username || "") ? g.username : "-");
const ctNamaMapel = (id) => namaMapel(id);

// Status baris. tidak = tidak ada hasil sama sekali.
function ctStatus(h) {
  if (!h || h.status === "belum") return "tidak";
  if (h.status === "mengerjakan") return "kumpul";
  if (h.status_koreksi === "menunggu") return "esai";
  return "ok";
}
function ctKet(st, h, u) {
  if (st === "tidak") return u && !ctUjianBerakhir(u) ? "Belum mengerjakan" : "Tidak ikut ujian";
  if (st === "kumpul") return "Belum mengumpulkan";
  if (st === "esai") return "Menunggu koreksi esai";
  return (h && h.catatan_guru) || "";
}
const ctNilaiTeks = (st, h) => (st === "ok" ? ctNilai(h.nilai) : "-");

async function ctMuatGuru() {
  if (PANEL === "guru") return { profil: new Map([[S.me.id, S.me]]), penugasan: S.penugasan || [] };
  const [gr, pn] = await Promise.all([
    semua("profil", "id,username,nama", (q) => q.eq("peran", "guru")),
    semua("penugasan_guru", "guru_id,mapel_id,kelas_id"),
  ]);
  return { profil: new Map(gr.map((g) => [g.id, g])), penugasan: pn };
}
// Guru penandatangan untuk mapel (dan kelas) tertentu.
function ctCalonGuru(G, mapelId, kelasId) {
  let a = G.penugasan.filter((p) => p.mapel_id === mapelId && p.kelas_id === kelasId);
  if (!a.length) a = G.penugasan.filter((p) => p.mapel_id === mapelId);
  const ids = [...new Set(a.map((p) => p.guru_id))];
  return ids.map((id) => G.profil.get(id)).filter(Boolean).sort((x, y) => urut(x.nama, y.nama));
}

async function ctPengaturan() {
  try { return await pgMuat(); }
  catch (e) {
    toast("Kop surat belum bisa dimuat (" + e.message + "). Cetakan memakai nama sekolah dari config.js.", "error");
    return { ...PG_KOSONG, nama_sekolah: CONFIG.NAMA_SEKOLAH || "" };
  }
}

// ---------- dialog pilihan ----------
async function cetakDialog(awal = {}) {
  let daftarUjian;
  try {
    await Promise.all([muatKelas(), muatMapel(), muatSiswa()]);
    daftarUjian = await semua("ujian", "id,judul,jenis_ujian,mapel_id,waktu_mulai,waktu_selesai,ujian_kelas(kelas_id)");
  } catch (e) { return toast("Gagal memuat data: " + (e.message || e), "error"); }
  daftarUjian.sort((a, b) => new Date(b.waktu_mulai) - new Date(a.waktu_mulai));
  if (!daftarUjian.length) return toast("Belum ada ujian yang bisa dicetak.", "error");

  const kelasOk = new Set(S.kelas.map((k) => k.id));
  const kelasUjian = (u) => (u.ujian_kelas || []).map((x) => x.kelas_id).filter((id) => kelasOk.has(id))
    .sort((a, b) => urut(namaKelas(a), namaKelas(b)));
  const ujianAwal = daftarUjian.some((u) => u.id === awal.ujianId) ? awal.ujianId : daftarUjian[0].id;

  const html = `
    <div class="f"><div class="sl-judul">Jenis cetakan</div>
      <label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><input type="radio" name="ct-mode" value="kelas" checked> Per kelas <small class="ket">(satu mapel, satu kelas)</small></label>
      <label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><input type="radio" name="ct-mode" value="mapel"> Per mapel <small class="ket">(satu mapel, semua kelas pesertanya)</small></label>
      <label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><input type="radio" name="ct-mode" value="siswa"> Per siswa <small class="ket">(semua mapel yang ia ikuti)</small></label>
    </div>
    <label class="f" id="ct-b-ujian">Pilih satu mata pelajaran / ujian
      <select class="pilih" id="ct-ujian">${daftarUjian.map((u) => `<option value="${u.id}" ${u.id === ujianAwal ? "selected" : ""}>${u.jenis_ujian ? esc(u.jenis_ujian) + " · " : ""}${esc(ctNamaMapel(u.mapel_id))} · ${esc(u.judul)} · ${esc(ctTgl(u.waktu_mulai))}</option>`).join("")}</select></label>
    <label class="f" id="ct-b-kelas">Kelas<select class="pilih" id="ct-kelas"></select></label>
    <p class="ket" id="ct-info-mapel" hidden></p>
    <label class="f" id="ct-b-siswa" hidden>Siswa<select class="pilih" id="ct-siswa"></select></label>`;

  const m = tampilModal("Cetak hasil ujian (PDF)", html, {
    lebar: "sedang",
    aksi: [{ label: "Batal" }, {
      label: "Tampilkan pratinjau", kelas: "btn-primary",
      onClick: async () => {
        const mode = m.body.querySelector('input[name="ct-mode"]:checked').value;
        const o = { mode, ujianId: q("#ct-ujian").value, kelasId: q("#ct-kelas").value, siswaId: q("#ct-siswa").value };
        if (mode === "kelas" && !o.kelasId) throw new Error("Pilih kelas dulu.");
        if (mode === "siswa" && !o.siswaId) throw new Error("Pilih siswa dulu.");
        const P = await ctSusun(o, daftarUjian);
        ctPratinjau(P);
      },
    }],
  });
  const q = (s) => m.body.querySelector(s);
  const mode = () => m.body.querySelector('input[name="ct-mode"]:checked').value;

  const isiKelas = () => {
    const md = mode(), sel = q("#ct-kelas");
    const ids = md === "siswa" ? S.kelas.map((k) => k.id).sort((a, b) => urut(namaKelas(a), namaKelas(b)))
      : kelasUjian(daftarUjian.find((u) => u.id === q("#ct-ujian").value) || { ujian_kelas: [] });
    const pilih = sel.value || awal.kelasId;
    sel.innerHTML = ids.length ? ids.map((id) => `<option value="${id}" ${id === pilih ? "selected" : ""}>${esc(namaKelas(id))}</option>`).join("")
      : '<option value="">(tidak ada kelas)</option>';
    const info = q("#ct-info-mapel");
    if (md === "mapel") info.textContent = ids.length ? "Kelas yang dicetak: " + ids.map(namaKelas).join(", ") : "Ujian ini belum ditujukan ke kelas yang bisa Anda lihat.";
  };
  const isiSiswa = () => {
    const kid = q("#ct-kelas").value;
    const daftar = S.siswa.filter((s) => s.kelas_id === kid).sort((a, b) => urut(a.nama, b.nama));
    q("#ct-siswa").innerHTML = daftar.length ? daftar.map((s) => `<option value="${s.id}">${esc(s.nama)} (${esc(s.username)})</option>`).join("")
      : '<option value="">(tidak ada siswa)</option>';
  };
  const atur = () => {
    const md = mode();
    q("#ct-b-ujian").hidden = md === "siswa";
    q("#ct-b-kelas").hidden = md === "mapel";
    q("#ct-info-mapel").hidden = md !== "mapel";
    q("#ct-b-siswa").hidden = md !== "siswa";
    isiKelas();
    if (md === "siswa") isiSiswa();
  };
  m.body.addEventListener("change", (e) => {
    if (e.target.name === "ct-mode" || e.target.id === "ct-ujian") atur();
    else if (e.target.id === "ct-kelas" && mode() === "siswa") isiSiswa();
  });
  atur();
}

// ---------- menyusun data cetakan ----------
async function ctSusun(o, daftarUjian) {
  const [pg, G] = await Promise.all([ctPengaturan(), ctMuatGuru()]);
  const P = {
    mode: o.mode, pg, G,
    urlKiri: pgUrlLogo(pg.logo_kiri), urlKanan: pgUrlLogo(pg.logo_kanan),
    tgl: witaKeInput(null).slice(0, 10), sections: [],
  };

  if (o.mode === "siswa") {
    const s = S.siswa.find((x) => x.id === o.siswaId);
    if (!s) throw new Error("Siswa tidak ditemukan.");
    const hasil = await semua("hasil_ujian", "ujian_id,status,status_koreksi,nilai,catatan_guru", (qq) => qq.eq("siswa_id", s.id));
    const petaU = new Map(daftarUjian.map((u) => [u.id, u]));
    const rows = hasil.filter((h) => h.status !== "belum" && petaU.has(h.ujian_id))
      .map((h) => { const u = petaU.get(h.ujian_id); return { u, h, st: ctStatus(h) }; })
      .sort((a, b) => urut(ctNamaMapel(a.u.mapel_id), ctNamaMapel(b.u.mapel_id)) || new Date(a.u.waktu_mulai) - new Date(b.u.waktu_mulai));
    if (!rows.length) throw new Error("Siswa ini belum mengikuti ujian apa pun.");
    const kls = S.kelas.find((k) => k.id === s.kelas_id) || {};
    const mapelIds = [...new Set(rows.map((r) => r.u.mapel_id))];
    P.siswa = s; P.kelasNama = kls.nama || "-"; P.tahun = kls.tahun_ajaran || tahunAjaranAktif();
    P.rows = rows;
    P.ttd = mapelIds.map((mid) => ({ mapelId: mid, calon: ctCalonGuru(G, mid, s.kelas_id), pil: 0 }));
    P.ringkas = `${s.nama} · ${P.kelasNama} · ${rows.length} mapel`;
    return P;
  }

  const u = daftarUjian.find((x) => x.id === o.ujianId);
  if (!u) throw new Error("Ujian tidak ditemukan.");
  const kelasOk = new Set(S.kelas.map((k) => k.id));
  let kelasIds = (u.ujian_kelas || []).map((x) => x.kelas_id).filter((id) => kelasOk.has(id));
  if (o.mode === "kelas") kelasIds = kelasIds.filter((id) => id === o.kelasId);
  kelasIds.sort((a, b) => urut(namaKelas(a), namaKelas(b)));
  if (!kelasIds.length) throw new Error("Tidak ada kelas yang bisa dicetak untuk ujian ini.");

  const hasil = await semua("hasil_ujian", "siswa_id,status,status_koreksi,nilai,catatan_guru", (qq) => qq.eq("ujian_id", u.id));
  const peta = new Map(hasil.map((h) => [h.siswa_id, h]));
  P.u = u; P.mapelNama = ctNamaMapel(u.mapel_id);
  P.sections = kelasIds.map((kid) => {
    const kls = S.kelas.find((k) => k.id === kid) || {};
    const rows = S.siswa.filter((s) => s.kelas_id === kid && (s.aktif !== false || peta.has(s.id)))
      .sort((a, b) => urut(a.nama, b.nama))
      .map((s) => { const h = peta.get(s.id) || null; return { s, h, st: ctStatus(h) }; });
    return { kelasId: kid, kelasNama: kls.nama || "-", tahun: kls.tahun_ajaran || tahunAjaranAktif(), rows, calon: ctCalonGuru(G, u.mapel_id, kid), pil: 0 };
  });
  const total = P.sections.reduce((n, sc) => n + sc.rows.length, 0);
  P.ringkas = `${P.mapelNama} · ${P.sections.map((sc) => sc.kelasNama).join(", ")} · ${total} siswa`;
  return P;
}

// ---------- potongan HTML ----------
const ctTempatTgl = (P) => {
  const d = new Date(P.tgl + "T12:00:00+08:00");
  const tgl = Number.isNaN(d.getTime()) ? "" : ctTgl(d);
  const t = String(P.pg.tempat_ttd || "").trim();
  return esc(t ? `${t}, ${tgl}` : tgl);
};
// Baris di bawah judul cetakan: jenis ujian (+ semester aktif bila tahun ajarannya sama)
function ctSub(jenis, tahun) {
  const t = tahun || tahunAjaranAktif();
  const sem = t === tahunAjaranAktif() && semesterAktif() ? `SEMESTER ${semesterAktif().toUpperCase()}` : "";
  const bagian = [String(jenis || "").trim().toUpperCase(), sem].filter(Boolean);
  return bagian.length ? `<div class="cetak-sub">${esc(bagian.join(" · "))}</div>` : "";
}
const ctNamaTtd = (c) => (c ? esc(c.nama) : "(.....................................)");

function ctLegenda(rows, u) {
  const ada = new Set(rows.map((r) => r.st));
  const item = [];
  if (ada.has("tidak")) item.push(`<span><i class="st-tidak"></i>${esc(ctKet("tidak", null, u))}</span>`);
  if (ada.has("kumpul")) item.push('<span><i class="st-kumpul"></i>Belum mengumpulkan</span>');
  if (ada.has("esai")) item.push('<span><i class="st-esai"></i>Menunggu koreksi esai</span>');
  return item.length ? `<div class="cetak-legenda"><b>Keterangan warna:</b> ${item.join("")}</div>` : "";
}

function ctHalamanKelas(P, sc, idx) {
  const u = P.u;
  const hit = (st) => sc.rows.filter((r) => r.st === st).length;
  const ringkas = [`Jumlah siswa: <b>${sc.rows.length}</b>`, `Sudah dinilai: <b>${hit("ok")}</b>`];
  if (hit("esai")) ringkas.push(`Menunggu koreksi esai: <b>${hit("esai")}</b>`);
  if (hit("kumpul")) ringkas.push(`Belum mengumpulkan: <b>${hit("kumpul")}</b>`);
  ringkas.push(`${esc(ctKet("tidak", null, u))}: <b>${hit("tidak")}</b>`);
  const c = sc.calon[sc.pil];
  const pilih = sc.calon.length > 1
    ? `<div class="no-print"><select class="pilih" data-ttd="${idx}">${sc.calon.map((g, i) => `<option value="${i}" ${i === sc.pil ? "selected" : ""}>${esc(g.nama)}</option>`).join("")}</select></div>` : "";
  return `<section class="cetak-hal">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">DAFTAR NILAI HASIL UJIAN</h2>
    ${ctSub(u.jenis_ujian, sc.tahun)}
    <table class="cetak-bio">
      <tr><td>Mata Pelajaran</td><td>:</td><td><b>${esc(P.mapelNama)}</b></td></tr>
      ${u.judul && norm(u.judul) !== norm(P.mapelNama) ? `<tr><td>Ujian</td><td>:</td><td>${esc(u.judul)}</td></tr>` : ""}
      <tr><td>Kelas</td><td>:</td><td><b>${esc(sc.kelasNama)}</b></td></tr>
      ${sc.tahun ? `<tr><td>Tahun Ajaran</td><td>:</td><td>${esc(sc.tahun)}</td></tr>` : ""}
      <tr><td>Tanggal Ujian</td><td>:</td><td>${esc(ctTglUjian(u))}</td></tr>
    </table>
    <table class="cetak-tabel">
      <thead><tr><th style="width:9%">No.</th><th>Nama Siswa</th><th style="width:12%">Kelas</th><th style="width:13%">Nilai Ujian</th><th style="width:26%">Keterangan</th></tr></thead>
      <tbody>${sc.rows.length ? sc.rows.map((r, i) => `<tr class="st-${r.st}">
        <td class="c">${i + 1}</td>
        <td><div>${esc(r.s.nama)}</div><div class="nisn">NISN: ${esc(r.s.username)}</div></td>
        <td class="c">${esc(sc.kelasNama)}</td>
        <td class="c"><b>${esc(ctNilaiTeks(r.st, r.h))}</b></td>
        <td>${esc(ctKet(r.st, r.h, u))}</td></tr>`).join("")
        : '<tr><td colspan="5" class="c">Tidak ada siswa pada kelas ini.</td></tr>'}</tbody>
    </table>
    <div class="cetak-ringkas">${ringkas.join(" &nbsp;|&nbsp; ")}</div>
    ${ctLegenda(sc.rows, u)}
    <div class="cetak-ttd"><div class="ttd-blok">
      <div>${ctTempatTgl(P)}</div>
      <div>Guru ${esc(P.mapelNama)},</div>
      <div class="ttd-ruang"></div>
      <div class="ttd-nama">${ctNamaTtd(c)}</div>
      <div>NIP. ${esc(ctNip(c))}</div>
      ${pilih}
    </div></div>
  </section>`;
}

function ctHalamanSiswa(P) {
  const s = P.siswa;
  const rowsSemua = P.rows.map((r) => ({ st: r.st }));
  const blok = P.ttd.map((t, i) => {
    const c = t.calon[t.pil];
    const pilih = t.calon.length > 1
      ? `<div class="no-print"><select class="pilih" data-ttd="${i}">${t.calon.map((g, k) => `<option value="${k}" ${k === t.pil ? "selected" : ""}>${esc(g.nama)}</option>`).join("")}</select></div>` : "";
    return `<div class="ttd-blok">
      <div>${ctTempatTgl(P)}</div>
      <div>Guru ${esc(ctNamaMapel(t.mapelId))},</div>
      <div class="ttd-ruang"></div>
      <div class="ttd-nama">${ctNamaTtd(c)}</div>
      <div>NIP. ${esc(ctNip(c))}</div>${pilih}</div>`;
  }).join("");
  const u0 = P.rows[0].u;
  return `<section class="cetak-hal">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">LAPORAN HASIL UJIAN SISWA</h2>
    ${ctSub("", P.tahun)}
    <table class="cetak-bio">
      <tr><td>Nama Siswa</td><td>:</td><td><b>${esc(s.nama)}</b></td></tr>
      <tr><td>NISN</td><td>:</td><td>${esc(s.username)}</td></tr>
      <tr><td>Kelas</td><td>:</td><td><b>${esc(P.kelasNama)}</b></td></tr>
      ${P.tahun ? `<tr><td>Tahun Ajaran</td><td>:</td><td>${esc(P.tahun)}</td></tr>` : ""}
    </table>
    <table class="cetak-tabel">
      <thead><tr><th style="width:8%">No.</th><th>Mata Pelajaran</th><th style="width:22%">Tanggal Ujian</th><th style="width:12%">Nilai Ujian</th><th style="width:24%">Keterangan</th></tr></thead>
      <tbody>${P.rows.map((r, i) => `<tr class="st-${r.st}">
        <td class="c">${i + 1}</td>
        <td><div>${esc(ctNamaMapel(r.u.mapel_id))}</div>${(() => { const k = [r.u.jenis_ujian, r.u.judul && norm(r.u.judul) !== norm(ctNamaMapel(r.u.mapel_id)) ? r.u.judul : ""].filter(Boolean); return k.length ? `<div class="nisn">${esc(k.join(" · "))}</div>` : ""; })()}</td>
        <td class="c">${esc(ctTglUjian(r.u))}</td>
        <td class="c"><b>${esc(ctNilaiTeks(r.st, r.h))}</b></td>
        <td>${esc(ctKet(r.st, r.h, r.u))}</td></tr>`).join("")}</tbody>
    </table>
    ${ctLegenda(rowsSemua, u0)}
    <div class="cetak-ttd-grid">
      <div class="cetak-ttd-baris">${blok}</div>
    </div>
  </section>`;
}

// ---------- pratinjau & cetak ----------
function ctTutup() {
  const el = document.getElementById("cetak-layar");
  if (el) el.remove();
  const gp = document.getElementById("gaya-cetak-print");
  if (gp) gp.remove();
  document.body.style.overflow = "";
  if (CT.onKey) { document.removeEventListener("keydown", CT.onKey); CT.onKey = null; }
  CT.P = null;
}

function ctPratinjau(P) {
  ctTutup();
  CT.P = P;
  const gp = document.createElement("style");
  gp.id = "gaya-cetak-print";
  gp.textContent = CT_CSS_CETAK;
  document.head.appendChild(gp);
  const el = document.createElement("div");
  el.id = "cetak-layar";
  el.innerHTML = `
    <div class="cetak-bar no-print">
      <div class="cetak-bar-judul"><b>Pratinjau cetak</b><small>${esc(P.ringkas)}</small></div>
      <div class="aksi">
        <label>Tanggal tanda tangan <input type="date" class="input" id="ct-tgl" value="${esc(P.tgl)}"></label>
        <button class="btn btn-primary" id="ct-cetak" type="button">🖨️ Cetak / Simpan PDF</button>
        <button class="btn" id="ct-tutup" type="button">Tutup</button>
      </div>
    </div>
    <p class="cetak-petunjuk no-print">Untuk menyimpan PDF: klik <b>Cetak / Simpan PDF</b>, lalu pada pilihan Printer/Tujuan pilih <b>Simpan sebagai PDF</b>. Pilih kertas A4 dan matikan opsi “Header dan footer” bila ada.</p>
    <div class="cetak-kertas" id="ct-isi"></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  const gambar = () => {
    $("#ct-isi").innerHTML = P.mode === "siswa" ? ctHalamanSiswa(P) : P.sections.map((sc, i) => ctHalamanKelas(P, sc, i)).join("");
  };
  gambar();

  $("#ct-tgl").onchange = (e) => { if (e.target.value) { P.tgl = e.target.value; gambar(); } };
  $("#ct-isi").addEventListener("change", (e) => {
    const i = e.target.dataset && e.target.dataset.ttd;
    if (i === undefined) return;
    (P.mode === "siswa" ? P.ttd : P.sections)[+i].pil = +e.target.value;
    gambar();
  });
  $("#ct-tutup").onclick = ctTutup;
  $("#ct-cetak").onclick = () => window.print();
  CT.onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-bg")) ctTutup(); };
  document.addEventListener("keydown", CT.onKey);
}
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
.cetak-hal .cetak-tabel tbody tr:hover td{background-color:inherit}

/* ---- Laporan pelanggaran (dibuka dari menu Monitor): isi 10 pt, kop tetap sama ---- */
.cetak-hal.lp{font-size:10pt}
.lp .cetak-bio{font-size:10pt}
.lp .cetak-tabel{font-size:10pt}
.lp .cetak-tabel td{vertical-align:top}
.lp .lp-kej{display:flex;justify-content:center;line-height:1.3}
.lp .lp-jam{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums;margin-right:2.2mm}
.lp .lp-reset{font-style:italic}
.lp .lp-catatan{font-size:8.5pt;font-style:italic;margin-top:.8mm}
.lp .lp-rekap-bungkus{overflow-x:auto}
.lp .lp-kartu-wrap{display:none}
.lp .lp-kartu{border:1px solid #000;border-radius:2mm;padding:2.5mm 3mm;margin-bottom:2.5mm;break-inside:avoid;font-size:11pt}
.lp .lp-k-atas{display:flex;align-items:flex-start}
.lp .lp-k-no{flex:none;min-width:6mm;margin-right:2.5mm;text-align:right;font-weight:700}
.lp .lp-k-nama{flex:1;min-width:0;margin-right:2.5mm;overflow-wrap:anywhere}
.lp .lp-k-nama .nisn{font-size:9.5pt;color:#444}
.lp .lp-k-jml{flex:none;text-align:center;border:1px solid #000;border-radius:1.5mm;padding:.6mm 2.2mm;font-weight:700;line-height:1.15}
.lp .lp-k-jml small{display:block;font-weight:400;font-size:7.5pt}
.lp .lp-k-status{margin:1.5mm 0 0 8.5mm;font-size:10pt}
.lp .lp-k-kej{margin:1.8mm 0 0 8.5mm;padding-top:1.8mm;border-top:1px dashed #666;font-size:10.5pt}
@media screen and (max-width:700px){
  .cetak-hal.lp{padding:5mm 3.5mm;min-height:0}
  .lp .kop{gap:2mm;padding-bottom:2mm;margin-bottom:3mm}
  .lp .kop-logo{width:13mm;height:13mm}
  .lp .kop-1{font-size:8pt}.lp .kop-2{font-size:9pt}.lp .kop-3{font-size:10.5pt}.lp .kop-4{font-size:7pt}
  .lp .cetak-judul{font-size:12pt}
  .lp .cetak-bio{font-size:10.5pt}
  .lp .cetak-bio td:first-child{width:31mm}
  .lp .lp-rekap-bungkus .cetak-tabel{font-size:8.5pt}
  .lp .lp-rekap-bungkus .cetak-tabel th,.lp .lp-rekap-bungkus .cetak-tabel td{padding:1mm 1.2mm!important}
  .lp .lp-tabel-wrap{display:none}
  .lp .lp-kartu-wrap{display:block}
  .lp .cetak-ttd,.lp .cetak-ttd-baris{justify-content:center}
}`;
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
  .lp .lp-tabel-wrap{display:block!important}
  .lp .lp-kartu-wrap{display:none!important}
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
        <td class="c">${esc(ctKet(r.st, r.h, u))}</td></tr>`).join("")
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
        <td class="c">${esc(ctKet(r.st, r.h, r.u))}</td></tr>`).join("")}</tbody>
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
    $("#ct-isi").innerHTML = P.render ? P.render(P) : (P.mode === "siswa" ? ctHalamanSiswa(P) : P.sections.map((sc, i) => ctHalamanKelas(P, sc, i)).join(""));
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

// =====================================================================
//  MENU "CETAK HADIR & BA"  (admin & guru)
//  Tidak bergantung pada ujian / bank soal. Siswa diambil dari data kelas.
//  Isian umum (mapel, jenis ujian, tanggal, jam, ruang) dipakai oleh
//  daftar hadir DAN berita acara; yang dikosongkan dicetak titik-titik.
// =====================================================================
(function () {
  const st = document.createElement("style");
  st.textContent = `
.cetak-hal .titik{display:inline-block;border-bottom:1px dotted #000;min-width:28mm;height:1em;vertical-align:baseline}
.cetak-hal .titik.l{min-width:50mm}.cetak-hal .titik.s{min-width:14mm}
.cetak-hal .baris-titik{border-bottom:1px dotted #000;height:7.5mm}
.cetak-hal .cetak-tabel.hadir{table-layout:fixed;font-size:10.5pt}
.cetak-hal .cetak-tabel.hadir th{height:8mm;font-size:10.5pt!important}
.cetak-hal .cetak-tabel.hadir td{height:10mm;padding:.8mm 2mm!important;vertical-align:middle;font-size:10.5pt!important;overflow-wrap:anywhere}
.cetak-hal .cetak-tabel.hadir td.tt{text-align:left!important}
.cetak-hal .cetak-tabel.hadir td.nm div{line-height:1.25!important}
.cetak-hal .cetak-tabel.hadir .nisn{font-size:10.5pt!important;color:#000!important}
.cetak-hal .cetak-tabel.hadir.ba td{height:8mm}
.cetak-hal .cetak-tabel.hadir thead{display:table-header-group}
.cetak-hal .cetak-tabel.hadir tr{break-inside:avoid}
.cetak-hal .ba-teks{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.9;text-align:justify}
.cetak-hal .ba-no{display:grid;grid-template-columns:8mm 1fr;line-height:1.9;font-family:"Times New Roman",Times,serif;font-size:12pt}
.cetak-hal .ttd-2{margin-top:8mm;display:flex;justify-content:space-between;break-inside:avoid;font-family:"Times New Roman",Times,serif;font-size:12pt}
.cetak-hal .ttd-2 .ttd-blok{width:68mm}
.cetak-hal .tk-kartu{box-sizing:border-box;height:128mm;border:.35mm solid #000;border-radius:2mm;padding:3mm 5mm;overflow:hidden;font-size:9pt;line-height:1.28;break-inside:avoid}
.cetak-hal .tk-kartu .kop{gap:2mm;padding-bottom:1.5mm;margin-bottom:2mm}
.cetak-hal .tk-kartu .kop-logo{width:13mm;height:13mm}
.cetak-hal .tk-kartu .kop-1{font-size:8pt}.cetak-hal .tk-kartu .kop-2{font-size:9pt}.cetak-hal .tk-kartu .kop-3{font-size:10.5pt}.cetak-hal .tk-kartu .kop-4{font-size:7pt}
.cetak-hal .tk-kartu.s2{font-size:8.3pt}.cetak-hal .tk-kartu.s3{font-size:7.6pt}.cetak-hal .tk-kartu.s4{font-size:7pt}
.cetak-hal .tk-judul{font-size:12pt;margin:0 0 2mm}
.cetak-hal .tk-atas{display:grid;grid-template-columns:1fr 62mm;gap:4mm;align-items:center;margin-bottom:2mm}
.cetak-hal .tk-r{display:grid;grid-template-columns:27mm 3mm 1fr}
.cetak-hal .tk-token{border:1.1mm double #000;border-radius:2mm;text-align:center;padding:1.5mm 2mm}
.cetak-hal .tk-token small{display:block;font-size:8pt;font-weight:700;letter-spacing:.2em}
.cetak-hal .tk-kode{font-family:Consolas,"Courier New",monospace;font-weight:800;font-size:26pt;letter-spacing:1.2mm;line-height:1.25;overflow-wrap:anywhere}
.cetak-hal .tk-sub{font-weight:700;margin:1.5mm 0 .6mm;font-size:9.5pt;border-bottom:.2mm solid #000}
.cetak-hal .tk-ol{margin:0;padding-left:4.5mm}
.cetak-hal .tk-ol li{margin:0 0 .5mm}
.cetak-hal .tk-dua{column-count:2;column-gap:6mm}
.cetak-hal .tk-dua li{break-inside:avoid}
.cetak-hal .tk-foot{margin-top:1.5mm;font-size:8pt;font-style:italic;text-align:center}
.cetak-hal .tk-potong{height:7mm;display:flex;align-items:flex-end;justify-content:center;border-bottom:.3mm dashed #000;font-size:7.5pt;color:#444}
.cetak-hal .tk-potong span{background:#fff;padding:0 2mm;transform:translateY(50%)}
`;
  document.head.appendChild(st);
})();

const ctTitik = (k = "") => `<span class="titik ${k}"></span>`;
const ctIsi = (v, k = "") => (String(v || "").trim() ? esc(v) : ctTitik(k));
const ctJamTeks = (j) => (j ? j.replace(":", ".") : "");
const ctBagian = (d, o) => (d ? fmtWITA(d, o) : "");
const ctTtdPengawas = () => `<div class="ttd-2">${[1, 2].map((n) => `<div class="ttd-blok">
  <div>Pengawas ${n},</div><div class="ttd-ruang"></div><div>(.....................................)</div><div>NIP. ..............................</div></div>`).join("")}</div>`;

async function rCetakUjian() {
  await Promise.all([muatKelas(), muatMapel(), muatSiswa()]);
  const kelas = [...S.kelas].sort((a, b) => urut(a.nama, b.nama));
  if (!kelas.length) { konten().innerHTML = kosong("Belum ada kelas", "Daftar hadir mengambil siswa dari data kelas. Tambahkan kelas dan siswa di menu Data."); return; }
  const pilih = new Set(); // id siswa terpilih (tetap tersimpan saat ganti kelas)
  const siswaKelas = (kid) => S.siswa.filter((s) => s.kelas_id === kid && s.aktif !== false).sort((a, b) => urut(a.nama, b.nama));
  const opsiKelas = (semua) => (semua ? '<option value="*">Semua kelas</option>' : "") + kelas.map((k) => `<option value="${k.id}">${esc(k.nama)}</option>`).join("");

  konten().innerHTML = `
    <div class="catatan"><b>Bisa dicetak kapan saja</b> — tidak perlu menunggu ujian atau bank soal aktif. Isian yang dikosongkan dicetak sebagai titik-titik untuk ditulis tangan.</div>

    <div class="panel-mewah" style="max-width:880px;margin-bottom:1.2rem">
      <div class="panel-kepala"><h3>Isian umum <small class="ket">(dipakai daftar hadir, berita acara &amp; token ujian, semuanya boleh kosong)</small></h3></div>
      <div class="baris2">
        <label class="f">Mata pelajaran<input class="input" id="cu-mapel" list="cu-mapel-l" maxlength="100" autocomplete="off"><datalist id="cu-mapel-l">${S.mapel.map((m) => `<option value="${esc(m.nama)}"></option>`).join("")}</datalist></label>
        <label class="f">Jenis ujian<input class="input" id="cu-jenis" maxlength="60" autocomplete="off" placeholder="mis. PAS Ganjil"></label>
      </div>
      <div class="baris2">
        <label class="f">Hari / tanggal<input class="input" type="date" id="cu-tgl"></label>
        <label class="f">Ruang<input class="input" id="cu-ruang" maxlength="40" autocomplete="off"></label>
      </div>
      <div class="baris2">
        <label class="f">Jam mulai<input class="input" type="time" id="cu-mulai"></label>
        <label class="f">Jam selesai<input class="input" type="time" id="cu-selesai"></label>
      </div>
    </div>

    <div class="panel-mewah" style="max-width:880px;margin-bottom:1.2rem">
      <div class="panel-kepala"><h3>Daftar hadir peserta ujian</h3></div>
      <div class="f"><div class="sl-judul">Siapa yang dicetak</div>
        <label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><input type="radio" name="dh-mode" value="kelas" checked> Per kelas <small class="ket">(satu kelas, atau semua kelas — satu halaman per kelas)</small></label>
        <label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><input type="radio" name="dh-mode" value="siswa"> Siswa tertentu <small class="ket">(boleh lebih dari satu, boleh beda kelas)</small></label>
      </div>
      <label class="f" style="max-width:360px">Kelas<select class="pilih" id="dh-kelas">${opsiKelas(true)}</select></label>
      <div id="dh-b-siswa" hidden>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.2rem 0 .5rem">
          <button class="btn btn-kecil" type="button" id="dh-semua">Pilih semua di kelas ini</button>
          <button class="btn btn-kecil" type="button" id="dh-kosong">Kosongkan pilihan</button>
          <b id="dh-jml" style="margin-left:.4rem"></b>
        </div>
        <div id="dh-daftar" style="max-height:260px;overflow:auto;border:1px solid var(--garis);border-radius:10px;padding:.4rem .7rem;margin-bottom:.8rem"></div>
      </div>
      <button class="btn btn-primary" id="dh-cetak" type="button">Pratinjau &amp; cetak daftar hadir</button>
    </div>

    <div class="panel-mewah" style="max-width:880px">
      <div class="panel-kepala"><h3>Berita acara ujian</h3></div>
      <p class="ket">Mata pelajaran, jenis ujian, tanggal, jam, dan ruang diambil dari Isian umum di atas. Kelas, jumlah siswa, nama yang tidak hadir, dan catatan diisi tangan.</p>
      <div class="baris2">
        <label class="f">Kelas <small class="ket">(boleh kosong)</small><input class="input" id="ba-kelas" maxlength="30" autocomplete="off"></label>
        <label class="f">Jumlah lembar<input class="input" type="number" id="ba-lembar" min="1" max="60" value="1"></label>
      </div>
      <button class="btn btn-primary" id="ba-cetak" type="button">Pratinjau &amp; cetak berita acara</button>
    </div>

    <div class="panel-mewah" style="max-width:880px;margin-top:1.2rem">
      <div class="panel-kepala"><h3>Token ujian</h3></div>
      <p class="ket">Satu lembar A4 berisi <b>2 lembar token</b> (atas dan bawah, sama persis) yang tinggal digunting. Token berlaku <b>universal</b>: Anda mengetik sendiri tokennya di sini. Mata pelajaran, jenis ujian, tanggal, jam, dan ruang diambil dari Isian umum di atas.</p>
      <div class="baris2">
        <label class="f">Token ujian <small class="ket">(boleh kosong, dicetak titik-titik)</small><input class="input mono" id="tk-kode" maxlength="30" autocomplete="off" spellcheck="false" style="text-transform:uppercase;font-weight:700;letter-spacing:.12em"></label>
        <label class="f">Jumlah lembar A4<input class="input" type="number" id="tk-lembar" min="1" max="60" value="1"></label>
      </div>
      <p class="ket" style="margin-top:-.3rem">Saran: hindari huruf dan angka yang mirip (O dengan 0, I dengan 1) agar mudah diketik siswa.</p>
      <label class="f">Tata tertib ujian <small class="ket">(satu aturan per baris, maksimal 10 baris; disimpan di perangkat ini)</small>
        <textarea class="input" id="tk-aturan" rows="9" style="line-height:1.4"></textarea></label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-primary" id="tk-cetak" type="button">Pratinjau &amp; cetak token</button>
        <button class="btn" id="tk-reset" type="button">Kembalikan tata tertib standar</button>
      </div>
    </div>`;

  const q = (s) => konten().querySelector(s);
  const mode = () => konten().querySelector('input[name="dh-mode"]:checked').value;
  const hitung = () => { q("#dh-jml").textContent = `${pilih.size} siswa dipilih`; };
  const gambarSiswa = () => {
    const d = siswaKelas(q("#dh-kelas").value);
    q("#dh-daftar").innerHTML = d.length ? d.map((s) => `<label style="display:flex;gap:.5rem;align-items:center;padding:.25rem 0">
      <input type="checkbox" data-sid="${s.id}" ${pilih.has(s.id) ? "checked" : ""}> <span>${esc(s.nama)} <small class="ket">(${esc(s.username)})</small></span></label>`).join("")
      : '<p class="ket">Tidak ada siswa di kelas ini.</p>';
    hitung();
  };
  const atur = () => {
    const sis = mode() === "siswa", sel = q("#dh-kelas"), lama = sel.value;
    sel.innerHTML = opsiKelas(!sis);
    if ([...sel.options].some((o) => o.value === lama)) sel.value = lama;
    q("#dh-b-siswa").hidden = !sis;
    if (sis) gambarSiswa();
  };
  konten().querySelectorAll('input[name="dh-mode"]').forEach((r) => (r.onchange = atur));
  q("#dh-kelas").onchange = () => { if (mode() === "siswa") gambarSiswa(); };
  q("#dh-daftar").addEventListener("change", (e) => {
    const id = e.target.dataset && e.target.dataset.sid;
    if (!id) return;
    if (e.target.checked) pilih.add(id); else pilih.delete(id);
    hitung();
  });
  q("#dh-semua").onclick = () => { siswaKelas(q("#dh-kelas").value).forEach((s) => pilih.add(s.id)); gambarSiswa(); };
  q("#dh-kosong").onclick = () => { pilih.clear(); gambarSiswa(); };

  const infoUmum = () => ({
    mapel: q("#cu-mapel").value.trim(), jenis: q("#cu-jenis").value.trim(), ruang: q("#cu-ruang").value.trim(),
    tgl: q("#cu-tgl").value ? new Date(q("#cu-tgl").value + "T12:00:00+08:00") : null,
    mulai: q("#cu-mulai").value, selesai: q("#cu-selesai").value,
  });
  const siapkan = async (bangun) => { try { ctPratinjau(await bangun()); } catch (e) { toast(e.message || String(e), "error"); } };
  const dasar = async (info) => { const pg = await ctPengaturan(); return { pg, info, urlKiri: pgUrlLogo(pg.logo_kiri), urlKanan: pgUrlLogo(pg.logo_kanan), tgl: witaKeInput(null).slice(0, 10) }; };

  q("#dh-cetak").onclick = () => siapkan(async () => {
    const info = infoUmum();
    let ids;
    if (mode() === "siswa") {
      ids = S.siswa.filter((s) => pilih.has(s.id));
      if (!ids.length) throw new Error("Centang minimal satu siswa dulu.");
    } else {
      const kid = q("#dh-kelas").value;
      ids = S.siswa.filter((s) => s.aktif !== false && (kid === "*" || s.kelas_id === kid));
    }
    const sections = kelas.map((k) => ({ kelasNama: k.nama, rows: ids.filter((s) => s.kelas_id === k.id).sort((a, b) => urut(a.nama, b.nama)) })).filter((sc) => sc.rows.length);
    if (!sections.length) throw new Error("Tidak ada siswa pada pilihan ini.");
    return { ...(await dasar(info)), mode: "hadir", sections, render: ctRenderHadir,
      ringkas: `Daftar hadir · ${sections.map((sc) => sc.kelasNama).join(", ")} · ${sections.reduce((n, sc) => n + sc.rows.length, 0)} siswa` };
  });
  q("#ba-cetak").onclick = () => siapkan(async () => {
    const lembar = Math.max(1, Math.min(60, +q("#ba-lembar").value || 1));
    return { ...(await dasar(infoUmum())), mode: "ba", lembar, kelasTeks: q("#ba-kelas").value.trim(), render: ctRenderBA,
      ringkas: `Berita acara ujian · ${lembar} lembar` };
  });

  // ---- Token ujian (satu A4 = 2 lembar token) ----
  const simpanAturan = (t) => { try { localStorage.setItem(CT_KUNCI_ATURAN_TOKEN, t); } catch (_) { /* penyimpanan tidak tersedia */ } };
  let aturanAwal = CT_ATURAN_TOKEN_STANDAR.join("\n");
  try { aturanAwal = localStorage.getItem(CT_KUNCI_ATURAN_TOKEN) || aturanAwal; } catch (_) { /* abaikan */ }
  q("#tk-aturan").value = aturanAwal;
  q("#tk-reset").onclick = () => { q("#tk-aturan").value = CT_ATURAN_TOKEN_STANDAR.join("\n"); simpanAturan(""); };
  q("#tk-cetak").onclick = () => siapkan(async () => {
    const lembar = Math.max(1, Math.min(60, +q("#tk-lembar").value || 1));
    const teksAturan = q("#tk-aturan").value;
    const aturan = teksAturan.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10);
    if (!aturan.length) throw new Error("Isi minimal satu tata tertib.");
    simpanAturan(teksAturan);
    const token = q("#tk-kode").value.trim().toUpperCase();
    const P = { ...(await dasar(infoUmum())), mode: "token", token, lembar, aturan, render: ctRenderToken,
      ringkas: `Token ujian · ${lembar} lembar A4 (${lembar * 2} token)` };
    P.ukuran = ctTokenUkuran(P);
    if (P.ukuran === null) throw new Error("Tata tertib terlalu panjang sehingga tidak muat di setengah halaman A4. Ringkas beberapa aturan atau kurangi jumlahnya.");
    return P;
  });
}

const CT_KUNCI_ATURAN_TOKEN = "ct_token_aturan";
const CT_TOKEN_UKURAN = ["", "s2", "s3", "s4"];   // 9pt -> 8.3pt -> 7.6pt -> 7pt (dipilih otomatis agar muat)
const CT_ATURAN_TOKEN_STANDAR = [
  "Kerjakan ujian dengan jujur dan mandiri. Dilarang bekerja sama, menyontek, atau membuka sumber lain.",
  "Gunakan akun sendiri. Jangan meminjamkan atau meminjam kartu login dan password teman.",
  "Hadir dan mulai tepat waktu sesuai jadwal ujian.",
  "Ikuti arahan pengawas selama ujian berlangsung.",
  "Dilarang menyebarkan soal, jawaban, atau token ujian dalam bentuk apa pun.",
  "Dilarang berpindah aplikasi/tab, membuka layar terbagi, serta menyalin dan menempel soal. Pelanggaran dicatat otomatis oleh sistem.",
  "Bila perangkat atau koneksi bermasalah, segera lapor ke pengawas dan jangan menutup halaman ujian.",
  "Periksa jawaban, lalu tekan Kumpulkan Ujian. Jawaban tidak dapat diubah setelah dikumpulkan.",
];

// Mengukur langsung (di perangkat ini) ukuran huruf terbesar yang membuat satu token muat di setengah A4.
function ctTokenUkuran(P) {
  const w = document.createElement("div");
  w.className = "cetak-hal";
  w.style.cssText = "position:fixed;left:-9999px;top:0;width:180mm;padding:0;min-height:0;box-shadow:none;visibility:hidden";
  document.body.appendChild(w);
  try {
    for (const u of CT_TOKEN_UKURAN) {
      w.innerHTML = ctRenderToken({ ...P, lembar: 1, ukuran: u }).replace(/<section[^>]*>|<\/section>/g, "");
      const k = w.querySelector(".tk-kartu");
      if (k && k.scrollHeight <= k.clientHeight + 1) return u;
    }
  } finally { w.remove(); }
  return null;
}

function ctRenderToken(P) {
  const i = P.info;
  const tgl = i.tgl ? esc(fmtWITA(i.tgl, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : ctTitik("l");
  const waktu = i.mulai || i.selesai ? esc(`${ctJamTeks(i.mulai) || "......"} - ${ctJamTeks(i.selesai) || "......"} WITA`) : `${ctTitik("s")} - ${ctTitik("s")} WITA`;
  const baris = (k, v) => `<div class="tk-r"><span>${k}</span><span>:</span><b>${v}</b></div>`;
  const kartu = () => `<div class="tk-kartu ${P.ukuran || ""}">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul tk-judul">TOKEN UJIAN</h2>
    <div class="tk-atas">
      <div class="tk-info">
        ${baris("Mata Pelajaran", i.mapel ? esc(i.mapel) : ctTitik("l"))}
        ${baris("Jenis Ujian", i.jenis ? esc(i.jenis) : ctTitik("l"))}
        ${baris("Hari / Tanggal", tgl)}
        ${baris("Waktu", waktu)}
        ${baris("Ruang", i.ruang ? esc(i.ruang) : ctTitik("l"))}
      </div>
      <div class="tk-token"><small>TOKEN</small><div class="tk-kode">${P.token ? esc(P.token) : ctTitik("l")}</div></div>
    </div>
    <div class="tk-sub">Cara memakai token</div>
    <ol class="tk-ol">
      <li>Masuk ke aplikasi ujian dengan akun sendiri, buka menu Ujian, lalu pilih ujian yang sedang berlangsung.</li>
      <li>Pada kotak <b>Token Ujian</b>, ketik token di atas persis seperti tertulis, lalu tekan <b>Mulai Kerjakan Sekarang</b>. Waktu ujian langsung berjalan.</li>
    </ol>
    <div class="tk-sub">Tata tertib ujian</div>
    <ol class="tk-ol tk-dua">${P.aturan.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>
    <div class="tk-foot">Token bersifat rahasia dan dibagikan oleh pengawas ruang. Sanksi pelanggaran mengikuti ketentuan sekolah.</div>
  </div>`;
  const halaman = () => `<section class="cetak-hal tk-hal">${kartu()}<div class="tk-potong"><span>&#9986; potong di sini</span></div>${kartu()}</section>`;
  return Array.from({ length: P.lembar || 1 }, halaman).join("");
}

function ctRenderHadir(P) {
  const i = P.info;
  const waktu = i.mulai || i.selesai ? `${ctJamTeks(i.mulai) || "......"} - ${ctJamTeks(i.selesai) || "......"} WITA` : "";
  return P.sections.map((sc) => `<section class="cetak-hal">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">DAFTAR HADIR PESERTA UJIAN</h2>
    <table class="cetak-bio">
      <tr><td>Jenis Ujian</td><td>:</td><td>${i.jenis ? `<b>${esc(i.jenis)}</b>` : ctTitik("l")}</td></tr>
      <tr><td>Mata Pelajaran</td><td>:</td><td>${i.mapel ? `<b>${esc(i.mapel)}</b>` : ctTitik("l")}</td></tr>
      <tr><td>Hari / Tanggal</td><td>:</td><td>${i.tgl ? esc(fmtWITA(i.tgl, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : ctTitik("l")}</td></tr>
      <tr><td>Waktu</td><td>:</td><td>${waktu ? esc(waktu) : ctTitik("s") + " - " + ctTitik("s") + " WITA"}</td></tr>
      <tr><td>Kelas</td><td>:</td><td><b>${esc(sc.kelasNama)}</b></td></tr>
      <tr><td>Ruang</td><td>:</td><td>${ctIsi(i.ruang, "l")}</td></tr>
    </table>
    <table class="cetak-tabel hadir">
      <colgroup><col style="width:6%"><col style="width:27%"><col style="width:14%"><col style="width:9%"><col style="width:26%"><col style="width:18%"></colgroup>
      <thead><tr><th>No.</th><th>Nama Siswa</th><th>NISN</th><th>Kelas</th><th>Tanda Tangan</th><th>Keterangan</th></tr></thead>
      <tbody>${sc.rows.map((s, n) => `<tr>
        <td class="c">${n + 1}</td>
        <td class="nm"><div>${esc(s.nama)}</div></td>
        <td class="c">${esc(s.username)}</td>
        <td class="c">${esc(sc.kelasNama)}</td>
        <td class="tt"></td><td></td></tr>`).join("")}</tbody>
    </table>
    <div class="cetak-ringkas">Jumlah siswa: <b>${sc.rows.length}</b> &nbsp;|&nbsp; Hadir: ........ &nbsp;|&nbsp; Tidak hadir: ........</div>
    ${ctTtdPengawas()}
  </section>`).join("");
}

function ctRenderBA(P) {
  const i = P.info, t = ctTitik;
  const hari = ctBagian(i.tgl, { weekday: "long" }), tg = ctBagian(i.tgl, { day: "numeric" }),
    bln = ctBagian(i.tgl, { month: "long" }), thn = ctBagian(i.tgl, { year: "numeric" });
  const v = (x, k) => (x ? `<b>${esc(x)}</b>` : t(k));
  const lembar = () => `<section class="cetak-hal">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">BERITA ACARA PELAKSANAAN UJIAN</h2>
    <p class="ba-teks">Pada hari ini ${v(hari)} tanggal ${v(tg, "s")} bulan ${v(bln)} tahun ${v(thn, "s")}, telah dilaksanakan ujian ${v(i.jenis)} mata pelajaran ${v(i.mapel, "l")} mulai pukul ${v(ctJamTeks(i.mulai), "s")} sampai dengan pukul ${v(ctJamTeks(i.selesai), "s")} WITA, bertempat di ruang ${v(i.ruang)} untuk kelas ${v(P.kelasTeks, "s")}, dengan keterangan sebagai berikut:</p>
    <div class="ba-no"><div>1.</div><div>Jumlah peserta seharusnya : ${t("s")} siswa</div>
      <div>2.</div><div>Jumlah peserta hadir : ${t("s")} siswa</div>
      <div>3.</div><div>Jumlah peserta tidak hadir : ${t("s")} siswa</div></div>
    <p class="ba-teks" style="margin:2mm 0 1mm">Nama peserta yang tidak hadir:</p>
    <table class="cetak-tabel hadir ba"><colgroup><col style="width:8%"><col><col style="width:16%"><col style="width:26%"></colgroup>
      <thead><tr><th>No.</th><th>Nama Siswa</th><th>Kelas</th><th>Alasan (S / I / A)</th></tr></thead>
      <tbody>${[1, 2, 3, 4, 5].map((n) => `<tr><td class="c">${n}</td><td></td><td></td><td></td></tr>`).join("")}</tbody></table>
    <p class="ba-teks" style="margin:3mm 0 0">Catatan selama pelaksanaan ujian:</p>
    <div class="baris-titik"></div><div class="baris-titik"></div><div class="baris-titik"></div><div class="baris-titik"></div>
    <p class="ba-teks" style="margin-top:3mm">Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
    ${ctTtdPengawas()}
  </section>`;
  return Array.from({ length: P.lembar || 1 }, lembar).join("");
}
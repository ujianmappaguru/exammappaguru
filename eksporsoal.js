"use strict";
// =====================================================================
//  EKSPOR BANK SOAL KE PDF / WORD  (admin & guru)
//
//  Dipanggil tombol "Ekspor Soal" di halaman isi bank soal (soal.js -> slEkspor).
//  - Format : PDF  (pratinjau + Cetak / Simpan sebagai PDF, memakai pratinjau cetak.js)
//             Word (.docx asli, bisa diedit; gambar soal ikut tertanam)
//  - Isi    : "Soal saja"  atau  "Soal + kunci jawaban + pembahasan"
//  - Kop    : kop sekolah dari menu Pengaturan (bisa dimatikan)
//  - Hak    : guru hanya bisa membuka bank mapel & kelasnya (aturan RLS yang sudah ada),
//             jadi ekspor otomatis mengikuti batas itu.
//  Butuh cetak.js (kop & pratinjau). Pustaka "docx" dimuat hanya saat ekspor Word dipilih.
// =====================================================================

const ES_DOCX_URL = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js";
const ES_HURUF = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ES = { pustaka: null, gbr: new Map() };

// ---------------------------------------------------------------------
//  Ambil soal
// ---------------------------------------------------------------------
async function esMuatSoal(bankId, idTerpilih) {
  const hasil = [];
  for (let dari = 0; ; dari += 500) {
    const { data, error } = await sb.from("bank_soal")
      .select("id,jenis,pertanyaan,pilihan,kunci,pembahasan,bobot,no")
      .eq("bank_id", bankId).order("no", { ascending: true }).range(dari, dari + 499);
    if (error) throw new Error(error.message);
    hasil.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return idTerpilih && idTerpilih.size ? hasil.filter((s) => idTerpilih.has(s.id)) : hasil;
}

// Urutan acak yang tetap untuk satu soal (supaya kolom kanan soal menjodohkan
// tidak sejajar dengan kunci, tetapi PDF, Word, dan kunci selalu sama).
function esAcak(n, benih) {
  let h = 2166136261;
  for (const c of String(benih)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// Satu bentuk data netral untuk PDF dan Word.
function esModel(s, no) {
  const m = { no, jenis: s.jenis, stem: s.pertanyaan || "", bobot: Number(s.bobot), pembahasan: s.pembahasan || "", intro: "", kunci: "" };
  const p = s.pilihan;
  if (s.jenis === "pg" || s.jenis === "pgk") {
    const kk = s.jenis === "pg" ? [s.kunci] : (Array.isArray(s.kunci) ? s.kunci : []);
    m.tipe = "opsi";
    m.opsi = (Array.isArray(p) ? p : []).map((t, i) => ({ k: ES_HURUF[i], t, benar: kk.includes(i) }));
    m.kunci = m.opsi.filter((o) => o.benar).map((o) => o.k).join(", ");
    if (s.jenis === "pgk") m.intro = "(Pilih semua jawaban yang benar.)";
  } else if (s.jenis === "bs") {
    m.tipe = "bs";
    const kk = Array.isArray(s.kunci) ? s.kunci : [];
    m.pern = (Array.isArray(p) ? p : []).map((t, i) => ({ n: i + 1, t, benar: kk[i] === true }));
    m.kunci = m.pern.map((x) => `${x.n} = ${x.benar ? "Benar" : "Salah"}`).join("; ");
  } else if (s.jenis === "jodoh") {
    m.tipe = "jodoh";
    const kiri = (p && p.kiri) || [], kanan = (p && p.kanan) || [];
    const urut = esAcak(kanan.length, s.id || no);
    m.kiri = kiri.map((t, i) => ({ k: String(i + 1), t }));
    m.kanan = urut.map((asli, pos) => ({ k: ES_HURUF[pos], t: kanan[asli] }));
    const kk = Array.isArray(s.kunci) ? s.kunci : [];
    m.kunci = kiri.map((_, i) => `${i + 1}-${ES_HURUF[urut.indexOf(kk[i])] || "?"}`).join("; ");
  } else {
    m.tipe = "esai";
    m.kunci = s.kunci ? String(s.kunci) : "";
  }
  m.labelKunci = m.tipe === "esai" ? "Pedoman jawaban" : "Kunci";
  return m;
}

// ---------------------------------------------------------------------
//  PDF (pratinjau HTML + cetak)
// ---------------------------------------------------------------------
(function pasangGayaEkspor() {
  if (document.getElementById("gaya-eksporsoal")) return;
  const st = document.createElement("style");
  st.id = "gaya-eksporsoal";
  st.textContent = `
.es-hal{font-size:11.5pt}
.es-hal .gbr-soal{display:block;max-width:100%;max-height:70mm;width:auto;height:auto;margin:1.5mm 0;border:0;border-radius:0;cursor:default;object-fit:contain}
.es-hal .es-opsi .gbr-soal,.es-hal .es-tabel .gbr-soal{max-height:38mm}
.es-soal{display:flex;gap:2.5mm;margin:0 0 4.5mm;break-inside:avoid;page-break-inside:avoid}
.es-no{flex:none;width:8mm;text-align:right}
.es-isi{flex:1;min-width:0;overflow-wrap:anywhere}
.es-intro{font-style:italic;margin-top:.8mm}
.es-opsi{display:flex;gap:2mm;margin-top:.9mm}
.es-k{flex:none;width:6mm}
.es-t{flex:1;min-width:0}
.es-benar{font-weight:700}
.es-hal .es-tabel{margin-top:1.5mm;width:auto;min-width:70%}
.es-hal .es-tabel td.es-kiri,.es-hal .es-tabel td.es-kanan{text-align:left!important}
.es-kunci{margin-top:2mm;padding:1.4mm 2.5mm;border:1px solid #000;background:#eaf1ff;font-size:10.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.es-kunci p{margin:0}
.es-kunci p+p{margin-top:.8mm}
.es-info{margin:-1mm 0 4mm;font-size:10pt;text-align:center;color:#000}
`;
  document.head.appendChild(st);
})();

function esHtmlSoal(m, kunci) {
  const T = (t) => teksSoalHtml(t);
  let isi = `<div class="es-stem">${T(m.stem)}</div>`;
  if (m.intro) isi += `<div class="es-intro">${esc(m.intro)}</div>`;
  if (m.tipe === "opsi") {
    isi += m.opsi.map((o) => `<div class="es-opsi"><span class="es-k">${o.k}.</span><div class="es-t ${kunci && o.benar ? "es-benar" : ""}">${T(o.t)}</div></div>`).join("");
  } else if (m.tipe === "bs") {
    isi += `<table class="cetak-tabel es-tabel"><thead><tr><th>No</th><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr></thead><tbody>${
      m.pern.map((x) => `<tr><td class="c">${x.n}</td><td class="es-kiri">${T(x.t)}</td>
        <td class="c">${kunci && x.benar ? "&#8730;" : ""}</td><td class="c">${kunci && !x.benar ? "&#8730;" : ""}</td></tr>`).join("")}</tbody></table>`;
  } else if (m.tipe === "jodoh") {
    const n = Math.max(m.kiri.length, m.kanan.length);
    let baris = "";
    for (let i = 0; i < n; i++) {
      const a = m.kiri[i], b = m.kanan[i];
      baris += `<tr><td class="es-kiri">${a ? `${a.k}. ${T(a.t)}` : ""}</td><td class="es-kanan">${b ? `${b.k}. ${T(b.t)}` : ""}</td></tr>`;
    }
    isi += `<table class="cetak-tabel es-tabel"><thead><tr><th>Pernyataan</th><th>Pasangan</th></tr></thead><tbody>${baris}</tbody></table>`;
  }
  if (kunci) {
    isi += `<div class="es-kunci"><p><b>${m.labelKunci}:</b> ${m.kunci ? T(m.kunci) : "-"} &nbsp;&middot;&nbsp; <b>Bobot:</b> ${esc(String(m.bobot))}</p>${
      m.pembahasan ? `<p><b>Pembahasan:</b> ${T(m.pembahasan)}</p>` : ""}</div>`;
  }
  return `<div class="es-soal"><div class="es-no">${m.no}.</div><div class="es-isi">${isi}</div></div>`;
}

function esBioBaris(bank, jumlah) {
  const baris = [["Mata Pelajaran", namaMapel(bank.mapel_id)]];
  const kelas = (bank.kelas || []).map(namaKelas).sort(urut).join(", ");
  if (kelas) baris.push(["Kelas", kelas]);
  if (bank.jenis_ujian) baris.push(["Jenis Ujian", bank.jenis_ujian]);
  if (bank.durasi_menit) baris.push(["Waktu", `${bank.durasi_menit} menit`]);
  baris.push(["Jumlah Soal", `${jumlah} butir`]);
  return baris;
}

const esJudul = (kunci) => (kunci ? "NASKAH SOAL DAN KUNCI JAWABAN" : "NASKAH SOAL");

async function esPdf(bank, soal, o) {
  const pg = o.kop ? await ctPengaturan() : null;
  const kop = pg ? kopHtml(pg, pgUrlLogo(pg.logo_kiri), pgUrlLogo(pg.logo_kanan)) : "";
  const html = `<section class="cetak-hal es-hal">
    ${kop}
    <h1 class="cetak-judul">${esJudul(o.kunci)}</h1>
    <p class="cetak-sub">${esc(bank.nama)}</p>
    <table class="cetak-bio">${esBioBaris(bank, soal.length).map(([a, b]) => `<tr><td>${esc(a)}</td><td>:</td><td>${esc(b)}</td></tr>`).join("")}</table>
    ${soal.map((s, i) => esHtmlSoal(esModel(s, i + 1), o.kunci)).join("")}
  </section>`;
  ctPratinjau({
    ringkas: `${bank.nama} · ${soal.length} soal · ${o.kunci ? "dengan kunci & pembahasan" : "soal saja"}`,
    tgl: "", render: () => html,
  });
  const tgl = document.getElementById("ct-tgl");   // tanggal tanda tangan tidak dipakai di sini
  if (tgl && tgl.closest("label")) tgl.closest("label").remove();
}

// ---------------------------------------------------------------------
//  Word (.docx)
// ---------------------------------------------------------------------
function esMuatPustaka() {
  if (window.docx) return Promise.resolve(window.docx);
  if (ES.pustaka) return ES.pustaka;
  ES.pustaka = new Promise((ok, gagal) => {
    const s = document.createElement("script");
    s.src = ES_DOCX_URL;
    s.onload = () => (window.docx ? ok(window.docx) : (ES.pustaka = null, gagal(new Error("Pustaka Word tidak bisa dipakai."))));
    s.onerror = () => { ES.pustaka = null; s.remove(); gagal(new Error("Pustaka Word gagal dimuat. Periksa koneksi internet lalu coba lagi.")); };
    document.head.appendChild(s);
  });
  return ES.pustaka;
}

// Gambar (webp/jpg/png) -> PNG, karena Word tidak membaca WebP. Hasil disimpan sementara.
async function esGambar(url) {
  if (!url) return null;
  if (ES.gbr.has(url)) return ES.gbr.get(url);
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const sk = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * sk)), h = Math.max(1, Math.round(bmp.height * sk));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      return blob ? { data: new Uint8Array(await blob.arrayBuffer()), w, h } : null;
    } catch (_) { return null; }
  })();
  ES.gbr.set(url, p);
  return p;
}

const esUkuran = (g, maxW, maxH) => {
  const sk = Math.min(1, maxW / g.w, maxH / g.h);
  return { width: Math.round(g.w * sk), height: Math.round(g.h * sk) };
};

async function esDocx(bank, soal, o) {
  const D = await esMuatPustaka();
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
    BorderStyle, ShadingType, Footer, PageNumber, TabStopType, VerticalAlign } = D;
  const FONT = "Times New Roman";
  const garis = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const tanpa = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const tanpaSemua = { top: tanpa, bottom: tanpa, left: tanpa, right: tanpa };
  const LEBAR = 9638;           // lebar teks A4, margin 2 cm
  const IND = 454;              // 0,8 cm

  // teks bertanda [gambar:...] -> deretan TextRun / ImageRun
  async function runs(teks, { bold = false, size, maxW = 420, maxH = 300 } = {}) {
    const out = [];
    const t = String(teks ?? "");
    const re = new RegExp(GAMBAR_TOKEN_RE.source, "g");
    let akhir = 0, m, ada = false;
    const teksRun = (s) => s.split("\n").forEach((baris, i) => {
      if (!baris && i === 0 && !s.includes("\n")) return;
      out.push(new TextRun({ text: baris, bold, size, font: FONT, break: i > 0 ? 1 : 0 }));
    });
    while ((m = re.exec(t))) {
      teksRun(t.slice(akhir, m.index));
      const g = await esGambar(urlGambar(m[1]));
      if (g) {
        if (out.length && maxH > 160) out.push(new TextRun({ text: "", break: 1 }));
        out.push(new ImageRun({ data: g.data, type: "png", transformation: esUkuran(g, maxW, maxH) }));
        if (maxH > 160) out.push(new TextRun({ text: "", break: 1 }));
      } else out.push(new TextRun({ text: "[gambar tidak dapat dimuat]", italics: true, size, font: FONT }));
      ada = true; akhir = m.index + m[0].length;
    }
    teksRun(t.slice(akhir));
    if (!out.length) out.push(new TextRun({ text: "", font: FONT }));
    return out;
  }

  const para = (children, opsi = {}) => new Paragraph({ children, ...opsi });
  const sel = async (teks, lebar, { tengah = false, bold = false, fill, maxW = 220, maxH = 120 } = {}) => new TableCell({
    width: { size: lebar, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: [para(await runs(teks, { bold, maxW, maxH }), { alignment: tengah ? AlignmentType.CENTER : AlignmentType.LEFT })],
  });

  const children = [];

  // ----- kop -----
  if (o.kop) {
    const pg = await ctPengaturan();
    const logo = async (nama) => {
      const g = nama ? await esGambar(pgUrlLogo(nama)) : null;
      return g ? [new ImageRun({ data: g.data, type: "png", transformation: esUkuran(g, 80, 80) })] : [new TextRun({ text: "" })];
    };
    const baris = (t, size, bold, caps) => String(t || "").trim()
      ? [para([new TextRun({ text: String(t).trim(), size, bold, allCaps: caps, font: FONT })], { alignment: AlignmentType.CENTER })] : [];
    const teksKop = [...baris(pg.pemerintah, 24, true, true), ...baris(pg.instansi, 26, true, true), ...baris(pg.nama_sekolah, 30, true, true),
      ...baris(pg.alamat_1, 19, false, false), ...baris(pg.alamat_2, 19, false, false)];
    const bKop = { top: tanpa, left: tanpa, right: tanpa, bottom: { style: BorderStyle.DOUBLE, size: 6, color: "000000" } };
    const sKop = (isi, w, tengah) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: bKop, verticalAlign: VerticalAlign.CENTER,
      children: Array.isArray(isi) && isi[0] instanceof Paragraph ? isi : [para(isi, { alignment: tengah ? AlignmentType.CENTER : AlignmentType.LEFT })] });
    children.push(new Table({
      width: { size: LEBAR, type: WidthType.DXA }, columnWidths: [1500, 6638, 1500],
      borders: { top: tanpa, left: tanpa, right: tanpa, bottom: tanpa, insideHorizontal: tanpa, insideVertical: tanpa },
      rows: [new TableRow({ children: [sKop(await logo(pg.logo_kiri), 1500, true), sKop(teksKop.length ? teksKop : [para([new TextRun("")])], 6638), sKop(await logo(pg.logo_kanan), 1500, true)] })],
    }));
    children.push(para([new TextRun({ text: "" })], { spacing: { after: 120 } }));
  }

  // ----- judul & identitas -----
  children.push(para([new TextRun({ text: esJudul(o.kunci), bold: true, underline: {}, size: 26, font: FONT })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
  children.push(para([new TextRun({ text: bank.nama, bold: true, size: 24, font: FONT })], { alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
  const bio = esBioBaris(bank, soal.length);
  children.push(new Table({
    width: { size: LEBAR, type: WidthType.DXA }, columnWidths: [2200, 300, 7138],
    borders: { ...tanpaSemua, insideHorizontal: tanpa, insideVertical: tanpa },
    rows: bio.map(([a, b]) => new TableRow({ children: [a, ":", b].map((t, i) => new TableCell({
      width: { size: [2200, 300, 7138][i], type: WidthType.DXA }, borders: tanpaSemua,
      children: [para([new TextRun({ text: t, size: 24, font: FONT })])],
    })) })),
  }));
  children.push(para([new TextRun({ text: "" })], { spacing: { after: 120 } }));

  // ----- soal -----
  const kotakKunci = { type: ShadingType.CLEAR, color: "auto", fill: "EAF1FF" };
  for (let i = 0; i < soal.length; i++) {
    const m = esModel(soal[i], i + 1);
    children.push(para([new TextRun({ text: `${m.no}.\t`, size: 24, font: FONT }), ...(await runs(m.stem, { size: 24 }))], {
      indent: { left: IND, hanging: IND }, tabStops: [{ type: TabStopType.LEFT, position: IND }],
      spacing: { before: 200, after: 40 }, keepNext: true, keepLines: true,
    }));
    if (m.intro) children.push(para([new TextRun({ text: m.intro, italics: true, size: 24, font: FONT })], { indent: { left: IND }, keepNext: true }));

    if (m.tipe === "opsi") {
      for (let k = 0; k < m.opsi.length; k++) {
        const op = m.opsi[k], bold = o.kunci && op.benar;
        children.push(para([new TextRun({ text: `${op.k}.\t`, bold, size: 24, font: FONT }), ...(await runs(op.t, { bold, size: 24, maxW: 260, maxH: 150 }))], {
          indent: { left: IND * 2, hanging: IND }, tabStops: [{ type: TabStopType.LEFT, position: IND * 2 }],
          keepLines: true, keepNext: k < m.opsi.length - 1 || o.kunci,
        }));
      }
    } else if (m.tipe === "bs") {
      const cek = "√";
      const W = [600, 5700, 1100, 1100];
      const kepala = new TableRow({ tableHeader: true, cantSplit: true, children: await Promise.all(["No", "Pernyataan", "Benar", "Salah"].map((t, c) => sel(t, W[c], { tengah: true, bold: true, fill: "E5E7EB" }))) });
      const isiBaris = [];
      for (const x of m.pern) isiBaris.push(new TableRow({ cantSplit: true, children: [
        await sel(String(x.n), W[0], { tengah: true }), await sel(x.t, W[1]),
        await sel(o.kunci && x.benar ? cek : "", W[2], { tengah: true }), await sel(o.kunci && !x.benar ? cek : "", W[3], { tengah: true })] }));
      children.push(new Table({ width: { size: W.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: W, indent: { size: IND, type: WidthType.DXA }, rows: [kepala, ...isiBaris] }));
    } else if (m.tipe === "jodoh") {
      const W = [4300, 4300];
      const kepala = new TableRow({ tableHeader: true, cantSplit: true, children: await Promise.all(["Pernyataan", "Pasangan"].map((t, c) => sel(t, W[c], { tengah: true, bold: true, fill: "E5E7EB" }))) });
      const n = Math.max(m.kiri.length, m.kanan.length), isiBaris = [];
      for (let r = 0; r < n; r++) isiBaris.push(new TableRow({ cantSplit: true, children: [
        await sel(m.kiri[r] ? `${m.kiri[r].k}. ${m.kiri[r].t}` : "", W[0]), await sel(m.kanan[r] ? `${m.kanan[r].k}. ${m.kanan[r].t}` : "", W[1])] }));
      children.push(new Table({ width: { size: 8600, type: WidthType.DXA }, columnWidths: W, indent: { size: IND, type: WidthType.DXA }, rows: [kepala, ...isiBaris] }));
    }

    if (o.kunci) {
      const gaya = { indent: { left: IND }, shading: kotakKunci, spacing: { before: 120, after: 0 }, keepLines: true,
        border: { top: garis, bottom: garis, left: garis, right: garis } };
      children.push(para([
        new TextRun({ text: `${m.labelKunci}: `, bold: true, size: 22, font: FONT }),
        ...(await runs(m.kunci || "-", { size: 22, maxW: 300, maxH: 150 })),
        new TextRun({ text: `     Bobot: ${m.bobot}`, bold: true, size: 22, font: FONT }),
      ], gaya));
      if (m.pembahasan) children.push(para([
        new TextRun({ text: "Pembahasan: ", bold: true, size: 22, font: FONT }),
        ...(await runs(m.pembahasan, { size: 22, maxW: 300, maxH: 150 })),
      ], { ...gaya, spacing: { before: 0, after: 0 } }));
    }
  }

  const dok = new Document({
    creator: CONFIG.NAMA_SEKOLAH || "Ujian",
    title: `${esJudul(o.kunci)} - ${bank.nama}`,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [para([new TextRun({ children: ["Halaman ", PageNumber.CURRENT, " dari ", PageNumber.TOTAL_PAGES], size: 18, font: FONT })], { alignment: AlignmentType.CENTER })] }) },
      children,
    }],
  });
  const blob = await Packer.toBlob(dok);
  const nama = String(bank.nama).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "bank_soal";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${o.kunci ? "Soal_dan_Kunci" : "Soal"}_${nama}.docx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// ---------------------------------------------------------------------
//  Dialog pilihan (pintu masuk)
// ---------------------------------------------------------------------
function slEkspor(bank) {
  if (!bank) return;
  const nPilih = SL.pilih ? SL.pilih.size : 0;
  tampilModal("Ekspor soal", `
    <p class="ket">${esc(bank.nama)}</p>
    <label class="f">Format
      <select class="pilih" id="es-fmt">
        <option value="pdf">PDF (pratinjau, lalu Cetak / Simpan PDF)</option>
        <option value="docx">Word (.docx, bisa diedit)</option>
      </select></label>
    <label class="f">Isi
      <select class="pilih" id="es-ver">
        <option value="soal">Soal saja</option>
        <option value="kunci">Soal + kunci jawaban + pembahasan</option>
      </select></label>
    <label class="f" style="display:flex;align-items:center;gap:.5rem;margin:.4rem 0 0">
      <input type="checkbox" id="es-kop" checked> Pakai kop sekolah</label>
    ${nPilih ? `<label class="f" style="display:flex;align-items:center;gap:.5rem;margin:.4rem 0 0">
      <input type="checkbox" id="es-pilih" checked> Hanya ${nPilih} soal yang dicentang</label>` : ""}
    <p class="ket" style="margin-top:.8rem">Gambar pada soal ikut tercetak. Kop sekolah diatur di menu Pengaturan.</p>`, {
    aksi: [
      { label: "Batal" },
      { label: "Ekspor", kelas: "btn-primary", onClick: async (m) => {
        const o = {
          fmt: m.body.querySelector("#es-fmt").value,
          kunci: m.body.querySelector("#es-ver").value === "kunci",
          kop: m.body.querySelector("#es-kop").checked,
        };
        const cekPilih = m.body.querySelector("#es-pilih");
        const ids = cekPilih && cekPilih.checked ? new Set(SL.pilih) : null;
        toast("Menyiapkan soal...", "info");
        const soal = await esMuatSoal(bank.id, ids);
        if (!soal.length) throw new Error("Tidak ada soal untuk diekspor.");
        if (o.fmt === "docx") { await esDocx(bank, soal, o); toast("File Word berhasil dibuat", "ok"); }
        else await esPdf(bank, soal, o);
      } },
    ],
  });
}

"use strict";
// =====================================================================
//  MENU "SISWA TIDAK IKUT UJIAN"  (#tidakikut)  -  admin & guru
//
//  File ini BERDIRI SENDIRI. Tidak mengubah fungsi/variabel file lain,
//  hanya memakai alat bersama yang sudah ada (sb, S, semua, esc, toast,
//  kop surat, dst). Semua nama di sini berawalan TI / ti supaya tidak bentrok.
//
//  Aturan "tidak ikut":
//   - Hanya ujian yang waktu_mulai-nya ada di rentang tanggal dan
//     waktu_selesai-nya SUDAH LEWAT (hasil akhir, bukan yang sedang berjalan).
//   - Ujian yang sudah dinonaktifkan admin SETELAH berlangsung tetap dihitung
//     (asal pernah ada siswa yang mengerjakan). Ujian nonaktif yang tidak
//     pernah dikerjakan siapa pun dianggap batal dan tidak dihitung.
//   - Peserta = siswa aktif pada kelas peserta ujian (ujian_kelas).
//   - Tidak ikut = tidak punya baris hasil_ujian, atau statusnya 'belum'.
//     (Yang sempat mulai/selesai TIDAK dihitung tidak ikut.)
//   - Guru hanya melihat pasangan mapel + kelas yang ia ampu.
//
//  Tampilan : Daftar per kelas | Rekap per siswa | Matriks siswa x mapel
//  Cetak    : Matriks (semua mapel) -> A4 Landscape, lainnya -> A4 Portrait
//             (otomatis, bisa diganti manual di pratinjau).
// =====================================================================

const TI = {
  dari: "", sampai: "", kelas: "", mapel: "", cari: "", tampil: "",
  ujian: [],          // ujian yang sudah berakhir pada rentang (sudah disaring hak akses)
  rec: [],            // { s: siswa, u: ujian } = satu kejadian tidak ikut
  belumBerakhir: 0,   // jumlah ujian di rentang yang belum berakhir (tidak dihitung)
  tok: 0,
};

const TI_KUNCI_KETUA = "ti_ketua_panitia";

(function pasangGayaTI() {
  if (document.getElementById("gaya-ti")) return;
  const st = document.createElement("style");
  st.id = "gaya-ti";
  st.textContent = `
.ti-cepat{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.ti-rentang{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.ti-rentang label{display:flex;align-items:center;gap:.4rem;font-size:.88rem;font-weight:600}
.ti-info{margin:.2rem 0 .9rem;font-size:.88rem;color:#475569}
.ti-kel-judul{margin:1.1rem 0 .4rem;font-weight:700;font-size:1rem}
.ti-mx-wrap{overflow-x:auto;margin-bottom:1rem;border:1px solid var(--garis,#cbd5e1);border-radius:10px;background:#fff}
.ti-mx{border-collapse:collapse;font-size:.85rem;width:auto}
.ti-mx th,.ti-mx td{border:1px solid var(--garis,#cbd5e1);padding:.35rem .5rem;text-align:center;white-space:nowrap}
.ti-mx td.nm{text-align:left;min-width:13rem;white-space:normal}
.ti-mx td.nm small{display:block;color:#64748b}
.ti-mx th.v{vertical-align:bottom;padding:.4rem .25rem}
.ti-mx th.v span{writing-mode:vertical-rl;transform:rotate(180deg);display:inline-block;max-height:9.5rem;line-height:1.15;white-space:normal;text-align:left}
.ti-mx td.x{background:#fecaca;font-weight:700;color:#7f1d1d}
.ti-daftar small{display:block;color:#64748b}

/* ---- pratinjau cetak (memakai kop & gaya tabel dari cetak.js) ---- */
#ti-layar{position:fixed;inset:0;z-index:200;background:#cbd5e1;overflow:auto;padding-bottom:2rem}
.ti-kertas{width:210mm;max-width:none;margin:.8rem auto 0;display:flex;flex-direction:column;gap:1rem}
.ti-kertas.land{width:297mm}
.cetak-hal.ti-hal{overflow:visible;padding:12mm 14mm;min-height:297mm}
.ti-kertas.land .cetak-hal.ti-hal{min-height:210mm}
.cetak-hal .cetak-tabel.ti-t{table-layout:fixed}
.cetak-hal .cetak-tabel.ti-t td{height:9mm;padding:.8mm 1.6mm!important;vertical-align:middle}
.cetak-hal .cetak-tabel.ti-t td.nm div{line-height:1.25!important}
.cetak-hal .cetak-tabel.ti-t td.kr{text-align:left!important;line-height:1.3!important}
.cetak-hal .cetak-tabel.ti-t th{padding:1mm 1mm!important}
.cetak-hal .cetak-tabel.ti-t th.v{height:40mm;vertical-align:bottom;font-size:8.5pt!important}
.cetak-hal .cetak-tabel.ti-t th.v span{writing-mode:vertical-rl;transform:rotate(180deg);display:inline-block;max-height:38mm;line-height:1.15;text-align:left;font-weight:700}
.cetak-hal .cetak-tabel.ti-t td.mx{text-align:center!important;padding:.4mm!important;height:8mm}
.cetak-hal .cetak-tabel.ti-t td.x{background:#fecaca!important;font-weight:700}
.cetak-hal .ti-legenda{margin-top:2mm;font-size:9.5pt}
`;
  document.head.appendChild(st);
})();

// ---------------------------------------------------------------------
//  Alat kecil
// ---------------------------------------------------------------------
const tiHariIni = () => witaKeInput(null).slice(0, 10);               // YYYY-MM-DD (WITA)
const tiGeser = (ymd, hari) => {
  const d = new Date(ymd + "T12:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + hari);
  return new Date(d.getTime() + OFFSET_WITA_MS).toISOString().slice(0, 10);
};
const tiTglPanjang = (ymd) => fmtWITA(new Date(ymd + "T12:00:00+08:00"), { day: "numeric", month: "long", year: "numeric" });
const tiTglUjian = (u) => fmtWITA(u.waktu_mulai, { day: "numeric", month: "short", year: "numeric" });
const tiTglPendek = (u) => fmtWITA(u.waktu_mulai, { day: "2-digit", month: "2-digit" });
const tiPeriodeTeks = () => TI.dari === TI.sampai
  ? fmtWITA(new Date(TI.dari + "T12:00:00+08:00"), { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  : `${tiTglPanjang(TI.dari)} s.d. ${tiTglPanjang(TI.sampai)}`;
const tiMode = () => TI.tampil || (TI.mapel ? "kelas" : "matriks");
const tiWaktuUjian = (a, b) => new Date(a.waktu_mulai) - new Date(b.waktu_mulai);
const tiKartu = (ikon, angka, label, warna = "") =>
  `<div class="hp-kartu ${warna}"><span class="hp-ikon">${proIkon(ikon)}</span><div><div class="hp-angka">${angka}</div><div class="hp-label">${label}</div></div></div>`;

function tiKetuaBaca() {
  try { const v = JSON.parse(localStorage.getItem(TI_KUNCI_KETUA) || "{}"); return { nama: v.nama || "", nip: v.nip || "" }; }
  catch (_) { return { nama: "", nip: "" }; }
}
function tiKetuaSimpan(k) {
  try { localStorage.setItem(TI_KUNCI_KETUA, JSON.stringify(k)); } catch (_) { /* penyimpanan tidak tersedia */ }
}

async function tiPengaturan() {
  try { return await pgMuat(); }
  catch (e) {
    toast("Kop surat belum bisa dimuat (" + e.message + "). Cetakan memakai nama sekolah dari config.js.", "error");
    return { ...PG_KOSONG, nama_sekolah: CONFIG.NAMA_SEKOLAH || "" };
  }
}

// ---------------------------------------------------------------------
//  Memuat data
// ---------------------------------------------------------------------
async function tiMuat() {
  const tok = ++TI.tok;
  const isi = $("#ti-isi");
  if (isi) isi.innerHTML = '<p class="memuat">Memuat...</p>';

  const dari = new Date(TI.dari + "T00:00:00+08:00");
  const sampai = new Date(TI.sampai + "T23:59:59.999+08:00");
  const { data, error } = await sb.from("ujian")
    .select("id,judul,jenis_ujian,mapel_id,waktu_mulai,waktu_selesai,aktif,ujian_kelas(kelas_id)")
    .gte("waktu_mulai", dari.toISOString())
    .lte("waktu_mulai", sampai.toISOString())
    .order("waktu_mulai", { ascending: true })
    .limit(1000);
  if (error) throw error;

  // Hak akses: guru hanya pasangan mapel + kelas yang diampu
  const pasangan = new Set(S.penugasan.map((p) => `${p.mapel_id}|${p.kelas_id}`));
  const kelasAda = new Set(S.kelas.map((k) => k.id));
  const sekarang = sekarangDate();
  let belum = 0;
  const berakhir = [];
  (data || []).forEach((u) => {
    let kelasIds = (u.ujian_kelas || []).map((x) => x.kelas_id).filter((id) => kelasAda.has(id));
    if (PANEL === "guru") kelasIds = kelasIds.filter((id) => pasangan.has(`${u.mapel_id}|${id}`));
    if (!kelasIds.length) return;
    if (new Date(u.waktu_selesai) > sekarang) { belum++; return; }   // belum berakhir: belum final
    berakhir.push({ ...u, kelasIds });
  });

  // Siapa yang ikut (status bukan 'belum')
  const ids = berakhir.map((u) => u.id);
  const ikut = new Set();
  for (let i = 0; i < ids.length; i += 25) {
    const potong = ids.slice(i, i + 25);
    const h = await semua("hasil_ujian", "id,ujian_id,siswa_id,status", (q) => q.in("ujian_id", potong));
    h.forEach((x) => { if (x.status !== "belum") ikut.add(`${x.ujian_id}|${x.siswa_id}`); });
  }
  if (tok !== TI.tok) return false;   // ada muatan yang lebih baru

  // Ujian nonaktif hanya dihitung bila pernah dikerjakan (berarti benar-benar berlangsung)
  const pernahDikerjakan = new Set([...ikut].map((k) => k.split("|")[0]));
  for (let i = berakhir.length - 1; i >= 0; i--) {
    if (!berakhir[i].aktif && !pernahDikerjakan.has(berakhir[i].id)) berakhir.splice(i, 1);
  }

  const siswaKelas = new Map();
  S.siswa.forEach((s) => {
    if (s.aktif === false) return;
    if (!siswaKelas.has(s.kelas_id)) siswaKelas.set(s.kelas_id, []);
    siswaKelas.get(s.kelas_id).push(s);
  });
  const rec = [];
  berakhir.forEach((u) => u.kelasIds.forEach((kid) => (siswaKelas.get(kid) || []).forEach((s) => {
    if (!ikut.has(`${u.id}|${s.id}`)) rec.push({ s, u });
  })));

  TI.ujian = berakhir;
  TI.rec = rec;
  TI.belumBerakhir = belum;
  return true;
}

// ---------------------------------------------------------------------
//  Penyaringan & pengelompokan
// ---------------------------------------------------------------------
function tiSaring() {
  const c = norm(TI.cari);
  return TI.rec.filter(({ s, u }) =>
    (!TI.kelas || s.kelas_id === TI.kelas) &&
    (!TI.mapel || u.mapel_id === TI.mapel) &&
    (!c || norm(s.nama).includes(c) || norm(s.username).includes(c)));
}

function tiBagian(F, mode) {
  const per = new Map();
  F.forEach((r) => {
    if (!per.has(r.s.kelas_id)) per.set(r.s.kelas_id, []);
    per.get(r.s.kelas_id).push(r);
  });
  return [...per.keys()].sort((a, b) => urut(namaKelas(a), namaKelas(b))).map((kid) => {
    const rows = per.get(kid).sort((a, b) => urut(a.s.nama, b.s.nama) || tiWaktuUjian(a.u, b.u));
    const peta = new Map();
    rows.forEach((r) => {
      if (!peta.has(r.s.id)) peta.set(r.s.id, { s: r.s, list: [] });
      peta.get(r.s.id).list.push(r.u);
    });
    const sec = { kelasId: kid, kelasNama: namaKelas(kid), rows, siswa: [...peta.values()] };
    if (mode === "matriks") {
      sec.cols = TI.ujian
        .filter((u) => u.kelasIds.includes(kid) && (!TI.mapel || u.mapel_id === TI.mapel))
        .sort((a, b) => tiWaktuUjian(a, b) || urut(namaMapel(a.mapel_id), namaMapel(b.mapel_id)));
      sec.abs = new Set(rows.map((r) => `${r.s.id}|${r.u.id}`));
    }
    return sec;
  });
}

const tiKolomLabel = (u) => `${namaMapel(u.mapel_id)} · ${tiTglPendek(u)}`;

// ---------------------------------------------------------------------
//  Halaman menu
// ---------------------------------------------------------------------
async function rTidakIkut() {
  await Promise.all([muatKelas(), muatMapel(), muatSiswa()]);
  if (!TI.dari) { TI.dari = tiHariIni(); TI.sampai = TI.dari; }

  konten().innerHTML = `
    <div class="alat pro-alat">
      <div class="alat-kiri">
        <div class="ti-rentang">
          <label>Dari <input class="input" type="date" id="ti-dari" value="${esc(TI.dari)}"></label>
          <label>Sampai <input class="input" type="date" id="ti-sampai" value="${esc(TI.sampai)}"></label>
        </div>
        <div class="ti-cepat">
          <button class="btn btn-kecil" type="button" data-cepat="hari">Hari ini</button>
          <button class="btn btn-kecil" type="button" data-cepat="kemarin">Kemarin</button>
          <button class="btn btn-kecil" type="button" data-cepat="minggu">7 hari terakhir</button>
        </div>
      </div>
      <div class="alat-kanan">
        <button class="btn" id="ti-segar" type="button">Segarkan</button>
        <button class="btn btn-primary" id="ti-cetak" type="button">Cetak PDF</button>
      </div>
    </div>
    <div class="alat pro-alat">
      <div class="alat-kiri">
        <select class="pilih" id="ti-kelas" aria-label="Filter kelas"></select>
        <select class="pilih" id="ti-mapel" aria-label="Filter mata pelajaran"></select>
        <select class="pilih" id="ti-tampil" aria-label="Bentuk tampilan">
          <option value="">Tampilan otomatis</option>
          <option value="kelas">Daftar per kelas</option>
          <option value="siswa">Rekap per siswa</option>
          <option value="matriks">Matriks siswa × mapel</option>
        </select>
        <input class="input" id="ti-cari" type="search" placeholder="Cari nama / NISN" aria-label="Cari siswa">
      </div>
    </div>
    <div id="ti-isi"><p class="memuat">Memuat...</p></div>`;

  $("#ti-tampil").value = TI.tampil;
  $("#ti-cari").value = TI.cari;

  const ubahTanggal = async (d, s) => {
    TI.dari = d; TI.sampai = s;
    $("#ti-dari").value = d; $("#ti-sampai").value = s;
    await tiMuatDanGambar();
  };
  $("#ti-dari").onchange = (e) => {
    if (!e.target.value) return;
    const s = TI.sampai < e.target.value ? e.target.value : TI.sampai;
    ubahTanggal(e.target.value, s);
  };
  $("#ti-sampai").onchange = (e) => {
    if (!e.target.value) return;
    const d = TI.dari > e.target.value ? e.target.value : TI.dari;
    ubahTanggal(d, e.target.value);
  };
  document.querySelectorAll("[data-cepat]").forEach((b) => {
    b.onclick = () => {
      const h = tiHariIni();
      const k = b.dataset.cepat;
      if (k === "hari") ubahTanggal(h, h);
      else if (k === "kemarin") ubahTanggal(tiGeser(h, -1), tiGeser(h, -1));
      else ubahTanggal(tiGeser(h, -6), h);
    };
  });
  $("#ti-kelas").onchange = (e) => { TI.kelas = e.target.value; tiGambar(); };
  $("#ti-mapel").onchange = (e) => { TI.mapel = e.target.value; tiGambar(); };
  $("#ti-tampil").onchange = (e) => { TI.tampil = e.target.value; tiGambar(); };
  $("#ti-cari").oninput = (e) => { TI.cari = e.target.value; tiGambar(); };
  $("#ti-segar").onclick = () => tiMuatDanGambar();
  $("#ti-cetak").onclick = () => tiCetak();

  await tiMuatDanGambar();
}

async function tiMuatDanGambar() {
  try {
    const ok = await tiMuat();
    if (ok === false) return;
  } catch (e) {
    const isi = $("#ti-isi");
    if (isi) isi.innerHTML = `<div class="galat-blok"><b>Gagal memuat data.</b><br>${esc(e.message || e)}</div>`;
    return;
  }
  tiIsiPilihan();
  tiGambar();
}

function tiIsiPilihan() {
  const kelasIds = [...new Set(TI.ujian.flatMap((u) => u.kelasIds))].sort((a, b) => urut(namaKelas(a), namaKelas(b)));
  const mapelIds = [...new Set(TI.ujian.map((u) => u.mapel_id))].sort((a, b) => urut(namaMapel(a), namaMapel(b)));
  if (TI.kelas && !kelasIds.includes(TI.kelas)) TI.kelas = "";
  if (TI.mapel && !mapelIds.includes(TI.mapel)) TI.mapel = "";
  $("#ti-kelas").innerHTML = `<option value="">Semua kelas</option>` +
    kelasIds.map((id) => `<option value="${id}" ${TI.kelas === id ? "selected" : ""}>${esc(namaKelas(id))}</option>`).join("");
  $("#ti-mapel").innerHTML = `<option value="">Semua mata pelajaran</option>` +
    mapelIds.map((id) => `<option value="${id}" ${TI.mapel === id ? "selected" : ""}>${esc(namaMapel(id))}</option>`).join("");
}

function tiGambar() {
  const isi = $("#ti-isi");
  if (!isi) return;
  const catatan = TI.belumBerakhir
    ? `<p class="ti-info">${TI.belumBerakhir} ujian pada rentang ini belum berakhir, jadi belum dihitung.</p>` : "";

  if (!TI.ujian.length) {
    isi.innerHTML = catatan + kosong("Belum ada ujian yang sudah berakhir",
      "Pada rentang tanggal ini tidak ada ujian yang waktunya sudah lewat. Ubah rentang tanggal, atau tunggu ujian selesai.");
    return;
  }
  const F = tiSaring();
  const mode = tiMode();
  const jmlSiswa = new Set(F.map((r) => r.s.id)).size;
  const kartu = `<div class="hp-stat">
      ${tiKartu("belum", jmlSiswa, "Siswa tidak ikut", jmlSiswa ? "warn" : "ok")}
      ${tiKartu("peserta", F.length, "Total ketidakikutan", "abu")}
      ${tiKartu("cek", TI.ujian.length, "Ujian dihitung")}
    </div>
    <p class="ti-info">Periode: <b>${esc(tiPeriodeTeks())}</b>. Tidak ikut = hasil akhirnya belum mengerjakan sama sekali setelah waktu ujian berakhir.</p>${catatan}`;

  if (!F.length) {
    isi.innerHTML = kartu + kosong("Tidak ada siswa yang tidak ikut ujian",
      "Semua peserta pada pilihan ini sudah mengikuti ujian, atau tidak ada yang cocok dengan filter.");
    return;
  }
  const bagian = tiBagian(F, mode);
  let isiTabel = "";

  if (mode === "kelas") {
    let n = 0;
    isiTabel = `<div class="tabel-bungkus"><table class="resp"><thead><tr>
      <th>No</th><th>Siswa</th><th>Kelas</th><th>Mata Pelajaran</th><th>Tanggal Ujian</th></tr></thead><tbody>
      ${bagian.flatMap((sc) => sc.rows).map((r) => `<tr>
        <td data-label="No" class="angka">${++n}</td>
        <td data-label="Siswa"><b>${esc(r.s.nama)}</b><small class="mono">${esc(r.s.username)}</small></td>
        <td data-label="Kelas">${esc(namaKelas(r.s.kelas_id))}</td>
        <td data-label="Mapel">${esc(namaMapel(r.u.mapel_id))}</td>
        <td data-label="Tanggal">${esc(tiTglUjian(r.u))}</td></tr>`).join("")}
      </tbody></table></div>`;
  } else if (mode === "siswa") {
    let n = 0;
    isiTabel = `<div class="tabel-bungkus"><table class="resp"><thead><tr>
      <th>No</th><th>Siswa</th><th>Kelas</th><th>Jumlah</th><th>Ujian yang tidak diikuti</th></tr></thead><tbody>
      ${bagian.flatMap((sc) => sc.siswa).map((x) => `<tr>
        <td data-label="No" class="angka">${++n}</td>
        <td data-label="Siswa"><b>${esc(x.s.nama)}</b><small class="mono">${esc(x.s.username)}</small></td>
        <td data-label="Kelas">${esc(namaKelas(x.s.kelas_id))}</td>
        <td data-label="Jumlah" class="angka"><b>${x.list.length}</b></td>
        <td data-label="Ujian" class="ti-daftar">${x.list.map((u) => `${esc(namaMapel(u.mapel_id))} <small style="display:inline">(${esc(tiTglUjian(u))})</small>`).join("<br>")}</td></tr>`).join("")}
      </tbody></table></div>`;
  } else {
    isiTabel = bagian.map((sc) => {
      const jml = (sid) => sc.cols.filter((u) => sc.abs.has(`${sid}|${u.id}`)).length;
      return `<div class="ti-kel-judul">Kelas ${esc(sc.kelasNama)} · ${sc.siswa.length} siswa</div>
      <div class="ti-mx-wrap"><table class="ti-mx"><thead><tr>
        <th>No</th><th>Siswa</th>${sc.cols.map((u) => `<th class="v" title="${esc(tiKolomLabel(u))}"><span>${esc(tiKolomLabel(u))}</span></th>`).join("")}<th>Jumlah</th></tr></thead><tbody>
        ${sc.siswa.map((x, i) => `<tr><td>${i + 1}</td>
          <td class="nm"><b>${esc(x.s.nama)}</b><small>${esc(x.s.username)}</small></td>
          ${sc.cols.map((u) => sc.abs.has(`${x.s.id}|${u.id}`) ? '<td class="x">X</td>' : "<td>-</td>").join("")}
          <td><b>${jml(x.s.id)}</b></td></tr>`).join("")}
      </tbody></table></div>`;
    }).join("");
  }
  isi.innerHTML = kartu + isiTabel;
}

// ---------------------------------------------------------------------
//  Cetak: susun halaman, pratinjau, orientasi otomatis
// ---------------------------------------------------------------------
const tiOrient = (P) => (P.orient === "auto" ? (P.mode === "matriks" ? "landscape" : "portrait") : P.orient);

const tiCssCetak = (orient) => `
@media print{
  @page{size:A4 ${orient};margin:12mm 14mm}
  html,body{overflow:visible!important;height:auto!important;background:#fff!important;padding:0!important}
  body>*:not(#ti-layar){display:none!important}
  html body > #ti-layar{display:block!important;position:static!important;overflow:visible!important;background:#fff!important;padding:0!important}
  .no-print,.cetak-bar,.cetak-petunjuk{display:none!important}
  .ti-kertas{width:auto!important;margin:0!important;gap:0!important;display:block!important;zoom:1!important}
  .cetak-hal.ti-hal{box-shadow:none!important;padding:0!important;min-height:0!important;overflow:visible!important;break-after:page;page-break-after:always}
  .cetak-hal.ti-hal:last-child{break-after:auto;page-break-after:auto}
  .cetak-hal .cetak-tabel.ti-t th.v{height:40mm}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}`;

function tiTtd(P) {
  const d = new Date(P.tgl + "T12:00:00+08:00");
  const tgl = Number.isNaN(d.getTime()) ? "" : fmtWITA(d, { day: "numeric", month: "long", year: "numeric" });
  const tempat = String(P.pg.tempat_ttd || "").trim();
  const nama = String(P.ketua.nama || "").trim();
  const nip = String(P.ketua.nip || "").trim();
  return `<div class="cetak-ttd"><div class="ttd-blok">
    <div>${esc(tempat ? `${tempat}, ${tgl}` : tgl)}</div>
    <div>Mengetahui,</div>
    <div>Ketua Panitia,</div>
    <div class="ttd-ruang"></div>
    <div class="${nama ? "ttd-nama" : ""}">${nama ? esc(nama) : "(.....................................)"}</div>
    <div>NIP. ${nip ? esc(nip) : ".............................."}</div>
  </div></div>`;
}

function tiHalaman(P, sc, akhir) {
  const nm = (s) => `<div>${esc(s.nama)}</div><div class="nisn">${esc(s.username)}</div>`;
  let tabel = "";

  if (P.mode === "matriks") {
    const jml = (sid) => sc.cols.filter((u) => sc.abs.has(`${sid}|${u.id}`)).length;
    tabel = `<table class="cetak-tabel ti-t">
      <colgroup><col style="width:8mm"><col style="width:56mm">${sc.cols.map(() => "<col>").join("")}<col style="width:13mm"><col style="width:36mm"></colgroup>
      <thead><tr><th>No.</th><th>Nama / NISN</th>${sc.cols.map((u) => `<th class="v"><span>${esc(tiKolomLabel(u))}</span></th>`).join("")}<th>Jml</th><th>Keterangan</th></tr></thead>
      <tbody>${sc.siswa.map((x, i) => `<tr>
        <td class="c">${i + 1}</td><td class="nm">${nm(x.s)}</td>
        ${sc.cols.map((u) => sc.abs.has(`${x.s.id}|${u.id}`) ? '<td class="mx x">X</td>' : '<td class="mx">-</td>').join("")}
        <td class="c"><b>${jml(x.s.id)}</b></td><td></td></tr>`).join("")}</tbody></table>
      <div class="ti-legenda"><b>Keterangan:</b> X = tidak mengikuti ujian; &nbsp;- = mengikuti ujian.</div>`;
  } else if (P.mode === "siswa") {
    tabel = `<table class="cetak-tabel ti-t">
      <colgroup><col style="width:6%"><col style="width:30%"><col style="width:5%"><col style="width:8%"><col style="width:33%"><col style="width:18%"></colgroup>
      <thead><tr><th>No.</th><th>Nama / NISN</th><th>L/P</th><th>Jumlah</th><th>Ujian yang tidak diikuti</th><th>Keterangan</th></tr></thead>
      <tbody>${sc.siswa.map((x, i) => `<tr>
        <td class="c">${i + 1}</td><td class="nm">${nm(x.s)}</td><td class="c">${esc(x.s.jenis_kelamin || "-")}</td>
        <td class="c"><b>${x.list.length}</b></td>
        <td class="kr">${x.list.map((u) => `${esc(namaMapel(u.mapel_id))} (${esc(tiTglUjian(u))})`).join("<br>")}</td><td></td></tr>`).join("")}</tbody></table>`;
  } else {
    tabel = `<table class="cetak-tabel ti-t">
      <colgroup><col style="width:6%"><col style="width:32%"><col style="width:5%"><col style="width:22%"><col style="width:16%"><col style="width:19%"></colgroup>
      <thead><tr><th>No.</th><th>Nama / NISN</th><th>L/P</th><th>Mata Pelajaran</th><th>Tanggal Ujian</th><th>Keterangan</th></tr></thead>
      <tbody>${sc.rows.map((r, i) => `<tr>
        <td class="c">${i + 1}</td><td class="nm">${nm(r.s)}</td><td class="c">${esc(r.s.jenis_kelamin || "-")}</td>
        <td>${esc(namaMapel(r.u.mapel_id))}</td><td class="c">${esc(tiTglUjian(r.u))}</td><td></td></tr>`).join("")}</tbody></table>`;
  }

  return `<section class="cetak-hal ti-hal">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">DAFTAR SISWA TIDAK MENGIKUTI UJIAN</h2>
    <div class="cetak-sub">${esc(periodeAktifTeks().toUpperCase())}</div>
    <table class="cetak-bio">
      <tr><td>Hari / Tanggal</td><td>:</td><td><b>${esc(P.periode)}</b></td></tr>
      <tr><td>Mata Pelajaran</td><td>:</td><td><b>${esc(P.mapelNama)}</b></td></tr>
      <tr><td>Kelas</td><td>:</td><td><b>${esc(sc.kelasNama)}</b></td></tr>
    </table>
    ${tabel}
    <div class="cetak-ringkas">Jumlah siswa tidak ikut: <b>${sc.siswa.length}</b> &nbsp;|&nbsp; Jumlah ketidakikutan ujian: <b>${sc.rows.length}</b></div>
    ${akhir ? tiTtd(P) : ""}
  </section>`;
}

async function tiCetak() {
  const F = tiSaring();
  if (!F.length) return toast("Tidak ada data siswa tidak ikut ujian untuk dicetak.", "error");
  const tombol = $("#ti-cetak");
  if (tombol) tombol.disabled = true;
  try {
    const pg = await tiPengaturan();
    const mode = tiMode();
    const P = {
      mode, orient: "auto", pg,
      urlKiri: pgUrlLogo(pg.logo_kiri), urlKanan: pgUrlLogo(pg.logo_kanan),
      tgl: tiHariIni(), ketua: tiKetuaBaca(),
      periode: tiPeriodeTeks(),
      mapelNama: TI.mapel ? namaMapel(TI.mapel) : "Semua mata pelajaran",
      sections: tiBagian(F, mode),
    };
    P.ringkas = `${P.mapelNama} · ${P.periode} · ${new Set(F.map((r) => r.s.id)).size} siswa`;
    tiPratinjau(P);
  } catch (e) {
    toast("Gagal menyiapkan cetakan: " + (e.message || e), "error");
  } finally {
    if (tombol) tombol.disabled = false;
  }
}

function tiTutup() {
  const el = document.getElementById("ti-layar");
  if (el) el.remove();
  const gp = document.getElementById("gaya-ti-print");
  if (gp) gp.remove();
  document.body.style.overflow = "";
  if (TI.onKey) { document.removeEventListener("keydown", TI.onKey); TI.onKey = null; }
  if (TI.onResize) { window.removeEventListener("resize", TI.onResize); TI.onResize = null; }
}

function tiPratinjau(P) {
  tiTutup();
  const gp = document.createElement("style");
  gp.id = "gaya-ti-print";
  document.head.appendChild(gp);

  const el = document.createElement("div");
  el.id = "ti-layar";
  el.innerHTML = `
    <div class="cetak-bar no-print">
      <div class="cetak-bar-judul"><b>Pratinjau cetak</b><small>${esc(P.ringkas)}</small></div>
      <div class="aksi">
        <label>Kertas <select class="pilih" id="ti-orient">
          <option value="auto">Otomatis</option>
          <option value="portrait">A4 Portrait</option>
          <option value="landscape">A4 Landscape</option>
        </select></label>
        <label>Tanggal TTD <input type="date" class="input" id="ti-tgl" value="${esc(P.tgl)}"></label>
        <label>Ketua Panitia <input type="text" class="input" id="ti-ketua" placeholder="Nama (boleh kosong)" value="${esc(P.ketua.nama)}"></label>
        <label>NIP <input type="text" class="input" id="ti-nip" placeholder="NIP (boleh kosong)" value="${esc(P.ketua.nip)}"></label>
        <button class="btn btn-primary" id="ti-print" type="button">🖨️ Cetak / Simpan PDF</button>
        <button class="btn" id="ti-tutup" type="button">Tutup</button>
      </div>
    </div>
    <p class="cetak-petunjuk no-print" id="ti-petunjuk"></p>
    <div class="ti-kertas" id="ti-kertas"></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  const gambar = () => {
    const o = tiOrient(P);
    gp.textContent = tiCssCetak(o);
    const k = $("#ti-kertas");
    k.classList.toggle("land", o === "landscape");
    // Di layar sempit (HP) kertas ditampilkan utuh lalu diperkecil agar muat selebar layar
    // (bisa dicubit untuk memperbesar). Hasil cetak/PDF tetap ukuran A4 asli.
    const lebarKertas = (o === "landscape" ? 297 : 210) * 96 / 25.4;
    k.style.zoom = String(Math.min(1, Math.max(0.2, ($("#ti-layar").clientWidth - 16) / lebarKertas)));
    k.innerHTML = P.sections.map((sc, i) => tiHalaman(P, sc, i === P.sections.length - 1)).join("");
    $("#ti-petunjuk").innerHTML = `Kertas saat ini: <b>A4 ${o === "landscape" ? "Landscape" : "Portrait"}</b>${P.orient === "auto" ? " (dipilih otomatis sesuai bentuk tabel)" : ""}. ` +
      `Klik <b>Cetak / Simpan PDF</b>, pilih printer atau <b>Simpan sebagai PDF</b>, dan matikan opsi “Header dan footer” bila ada. Ukuran dan arah kertas mengikuti pratinjau ini.`;
  };
  gambar();

  $("#ti-orient").onchange = (e) => { P.orient = e.target.value; gambar(); };
  $("#ti-tgl").onchange = (e) => { if (e.target.value) { P.tgl = e.target.value; gambar(); } };
  const simpanKetua = () => {
    P.ketua = { nama: $("#ti-ketua").value, nip: $("#ti-nip").value };
    tiKetuaSimpan(P.ketua);
    gambar();
  };
  $("#ti-ketua").oninput = simpanKetua;
  $("#ti-nip").oninput = simpanKetua;
  $("#ti-tutup").onclick = tiTutup;
  $("#ti-print").onclick = () => window.print();
  TI.onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-bg")) tiTutup(); };
  document.addEventListener("keydown", TI.onKey);
  TI.onResize = () => { if (document.getElementById("ti-layar")) gambar(); };
  window.addEventListener("resize", TI.onResize);
}
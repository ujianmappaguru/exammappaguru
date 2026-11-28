"use strict";
// =====================================================================
//  MENU "PETA PELANGGARAN"  (#peta)  -  KHUSUS ADMIN  (bagian Khusus)
//
//  File ini BERDIRI SENDIRI (semua nama berawalan PT / pt). Hanya dimuat di
//  admin.html. Butuh 28_peta_pelanggaran.sql (fungsi peta_pelanggaran).
//
//  Ringan untuk server: data hanya diambil saat tombol "Tampilkan" ditekan,
//  satu panggilan per rentang tanggal (maks 31 hari), hanya ujian yang sudah
//  berakhir dan hanya siswa yang punya catatan. Semua filter lain
//  (kelas, mapel, jenis, minimal, cari) dikerjakan di browser.
//
//  Aturan hitung:
//   - Pelanggaran = 7 jenis "dihitung" oleh sistem anti-curang.
//   - Dihitung dari RIWAYAT kejadian, jadi pelanggaran yang sudah direset
//     pengawas tetap terhitung (ditandai "direset").
//   - Jenis lain (salin/tempel, cetak, ganti perangkat, dst.) hanya catatan.
//   - Risiko (indikasi, perlu dikonfirmasi):
//       Tinggi : lokasi melompat, dikumpulkan otomatis karena batas, melanggar
//                di >= 3 ujian, atau total >= 6 kejadian
//       Sedang : total >= 3 kejadian, atau melanggar di >= 2 ujian
//       Rendah : selebihnya
// =====================================================================

const PT_HITUNG = ["pindah_aplikasi", "kehilangan_fokus", "keluar_layar_penuh", "layar_terbagi", "keluar_area", "lompat_lokasi", "gps_mati"];
const PT_LABEL = {
  pindah_aplikasi: "Pindah aplikasi / tab", kehilangan_fokus: "Jendela kehilangan fokus", keluar_layar_penuh: "Keluar layar penuh",
  layar_terbagi: "Layar terbagi", keluar_area: "Keluar area ujian", lompat_lokasi: "Lokasi melompat (curiga fake GPS)", gps_mati: "GPS tidak terbaca",
};
const PT_SINGKAT = {
  pindah_aplikasi: "Pindah app", kehilangan_fokus: "Hilang fokus", keluar_layar_penuh: "Keluar layar penuh",
  layar_terbagi: "Layar terbagi", keluar_area: "Keluar area", lompat_lokasi: "Fake GPS?", gps_mati: "GPS mati",
};
const PT_CATATAN = {
  salin_tempel: "Salin / tempel", cetak: "Cetak / screenshot", ganti_perangkat: "Ganti perangkat",
  lokasi_ditolak: "Lokasi ditolak", offline: "Koneksi putus", ke_daftar: "Keluar ke daftar",
};
const PT_RISIKO = { tinggi: "Tinggi", sedang: "Sedang", rendah: "Rendah" };
const PT_KUNCI_KETUA = "ti_ketua_panitia";   // dipakai bersama menu lain agar nama & NIP cukup diisi sekali

const PT = {
  dari: "", sampai: "", kelas: "", mapel: "", jenis: "", min: 1, cari: "", tab: "kelas", semuaSiswa: false,
  D: null, uj: new Map(), rows: [], tok: 0, memuat: false, galat: "",
};

(function pasangGayaPT() {
  if (document.getElementById("gaya-pt")) return;
  const st = document.createElement("style");
  st.id = "gaya-pt";
  st.textContent = `
.pt-filter{display:grid;gap:.7rem;grid-template-columns:repeat(2,minmax(0,1fr))}
.pt-f{display:flex;flex-direction:column;gap:.25rem;min-width:0;font-size:.82rem;font-weight:700;color:var(--tinta-2)}
.pt-f.penuh{grid-column:1/-1}
.pt-f .input,.pt-f .pilih{width:100%;min-height:44px}
.pt-cepat{display:flex;gap:.4rem;overflow-x:auto;padding-bottom:.15rem}
.pt-cepat .btn{flex:none;min-height:38px}
.pt-aksi{display:flex;gap:.6rem;flex-wrap:wrap}
.pt-aksi .btn{flex:1 1 140px;min-height:46px}
@media(min-width:900px){.pt-filter{grid-template-columns:repeat(6,minmax(0,1fr))}.pt-aksi .btn{flex:0 0 auto}}

.pt-info{margin:.4rem 0 .9rem;font-size:.85rem;color:var(--tinta-2);line-height:1.45}
.pt-tabs{display:flex;gap:.45rem;overflow-x:auto;padding:.1rem 0 .4rem;margin:0 0 .8rem;scrollbar-width:thin}
.pt-tab{flex:none;min-height:42px;padding:.5rem 1.05rem;border-radius:999px;border:1px solid var(--garis);background:#fff;font-weight:700;font-size:.9rem;color:var(--tinta);cursor:pointer}
.pt-tab.aktif{background:var(--biru);border-color:var(--biru);color:#fff;box-shadow:0 2px 8px rgba(21,83,214,.25)}

.pt-grid{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}
.pt-judul{margin:1.1rem 0 .5rem;font-size:1rem;font-weight:800}
.pt-judul small{font-weight:600;color:var(--tinta-2)}
.pt-card{background:#fff;border:1px solid var(--garis);border-radius:14px;padding:.9rem 1rem;box-shadow:var(--bayang-s);text-align:left;width:100%;font:inherit;color:inherit}
button.pt-card{cursor:pointer}
button.pt-card:hover{border-color:var(--biru-garis)}
.pt-card-atas{display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem}
.pt-card b{font-size:.98rem;overflow-wrap:anywhere}
.pt-sub{font-size:.8rem;color:var(--tinta-2);margin-top:.1rem}
.pt-angka{display:flex;gap:1rem;margin:.6rem 0 .4rem;font-size:.82rem;color:var(--tinta-2)}
.pt-angka b{display:block;font-size:1.25rem;line-height:1.1;color:var(--navy)}
.pt-chips{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.4rem}
.pt-chip{font-size:.72rem;font-weight:700;padding:.12rem .55rem;border-radius:999px;background:var(--kertas);border:1px solid var(--garis);color:var(--tinta)}
.pt-risk{flex:none;font-size:.72rem;font-weight:800;padding:.15rem .6rem;border-radius:999px}
.pt-risk.tinggi{background:#fee2e2;color:#991b1b}.pt-risk.sedang{background:#fef3c7;color:#92400e}.pt-risk.rendah{background:#e2e8f0;color:#334155}
.pt-bar{height:9px;border-radius:99px;background:#e4e9f2;overflow:hidden;margin:.45rem 0 .15rem}
.pt-bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#dc2626)}
.pt-tanda{font-size:.72rem;color:#92400e;font-weight:700}

.pt-heat-wrap{overflow-x:auto;border:1px solid var(--garis);border-radius:12px;background:#fff;-webkit-overflow-scrolling:touch}
.pt-heat{border-collapse:separate;border-spacing:0;font-size:.82rem;min-width:620px;width:100%}
.pt-heat th,.pt-heat td{padding:.5rem .55rem;text-align:center;border-bottom:1px solid var(--garis);white-space:nowrap}
.pt-heat th{font-size:.72rem;background:var(--kertas);white-space:normal;line-height:1.2;vertical-align:bottom}
.pt-heat th:first-child,.pt-heat td:first-child{position:sticky;left:0;z-index:1;text-align:left;font-weight:700;background:#fff;box-shadow:1px 0 0 var(--garis)}
.pt-heat th:first-child{background:var(--kertas)}
.pt-heat td.nol{color:#94a3b8}

.pt-tren{display:flex;gap:.4rem;align-items:flex-end;height:180px;overflow-x:auto;padding-bottom:.1rem}
.pt-tren-k{flex:1 0 34px;display:flex;flex-direction:column;align-items:center;gap:.25rem;height:100%}
.pt-tren-v{font-size:.72rem;font-weight:800;height:1.1em}
.pt-tren-b{flex:1;width:100%;max-width:44px;display:flex;align-items:flex-end;background:var(--kertas);border-radius:8px 8px 3px 3px;overflow:hidden}
.pt-tren-b i{display:block;width:100%;background:linear-gradient(180deg,#f59e0b,#dc2626)}
.pt-tren-h{font-size:.68rem;color:var(--tinta-2);text-align:center;line-height:1.15}
.pt-hb{display:grid;grid-template-columns:minmax(90px,36%) 1fr auto;gap:.5rem;align-items:center;margin:.35rem 0;font-size:.82rem}
.pt-hb .tr{height:12px;background:#e4e9f2;border-radius:99px;overflow:hidden}
.pt-hb .tr i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#dc2626)}

.pt-det-u{border:1px solid var(--garis);border-radius:12px;padding:.7rem .85rem;margin-bottom:.6rem}
.pt-kej{display:flex;gap:.6rem;font-size:.85rem;padding:.15rem 0}
.pt-kej .j{flex:none;font-variant-numeric:tabular-nums;color:var(--tinta-2);min-width:3.2rem}

/* ---- pratinjau cetak ---- */
#pt-layar{position:fixed;inset:0;z-index:200;background:#cbd5e1;overflow:auto;padding-bottom:2rem}
#pt-layar .cetak-bar .aksi{width:100%}
#pt-layar .cetak-bar label{flex:1 1 150px;display:flex;flex-direction:column;gap:.2rem;font-size:.78rem;font-weight:700}
#pt-layar .cetak-bar .input,#pt-layar .cetak-bar .pilih{width:100%}
.pt-kertas{width:210mm;max-width:none;margin:.8rem auto 0;display:flex;flex-direction:column;gap:1rem}
.pt-kertas.land{width:297mm}
.cetak-hal.pt-hal{overflow:visible;padding:12mm 14mm;min-height:297mm;font-size:10.5pt}
.pt-kertas.land .cetak-hal.pt-hal{min-height:210mm}
.cetak-hal .pt-ring{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin:2mm 0 3mm}
.cetak-hal .pt-ring div{border:1px solid #000;padding:1.5mm 2mm;text-align:center}
.cetak-hal .pt-ring b{display:block;font-size:14pt}
.cetak-hal .pt-ring span{font-size:8.5pt}
.cetak-hal .pt-sub2{font-weight:700;margin:3mm 0 1mm;font-size:11pt;border-bottom:.3mm solid #000}
.cetak-hal .cetak-tabel.pt-t td{padding:.8mm 1.4mm!important;font-size:9.5pt!important}
.cetak-hal .cetak-tabel.pt-t th{font-size:8.5pt!important;padding:1mm!important}
.cetak-hal .cetak-tabel.pt-t td.k{text-align:left!important}
.cetak-hal .cetak-tabel.pt-t td.h0{color:#777!important}
.cetak-hal .pt-catatan{font-size:8.5pt;margin-top:2mm;line-height:1.35}
.cetak-hal .pt-kejp{display:grid;grid-template-columns:13mm 1fr;gap:0 2mm;font-size:9.5pt}
.cetak-hal .baris-titik{border-bottom:1px dotted #000;height:7.5mm}
`;
  document.head.appendChild(st);
})();

// ---------------------------------------------------------------------
//  Alat kecil
// ---------------------------------------------------------------------
const ptHariIni = () => witaKeInput(null).slice(0, 10);
const ptYmd = (t) => new Date(new Date(t).getTime() + OFFSET_WITA_MS).toISOString().slice(0, 10);
const ptGeser = (ymd, n) => { const d = new Date(ymd + "T12:00:00+08:00"); d.setUTCDate(d.getUTCDate() + n); return ptYmd(d); };
const ptTglPanjang = (ymd) => fmtWITA(new Date(ymd + "T12:00:00+08:00"), { day: "numeric", month: "long", year: "numeric" });
const ptTglPendek = (t) => fmtWITA(t, { day: "numeric", month: "short", year: "numeric" });
const ptJam = (epoch) => fmtWITA(new Date(Number(epoch) * 1000), { hour: "2-digit", minute: "2-digit" });
const ptPeriode = () => (PT.dari === PT.sampai ? fmtWITA(new Date(PT.dari + "T12:00:00+08:00"), { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${ptTglPanjang(PT.dari)} s.d. ${ptTglPanjang(PT.sampai)}`);
const ptPersen = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const ptPct = (p) => (p === null ? "-" : p.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%");
const ptNamaKelas = (id, cadangan) => { try { return namaKelas(id) || cadangan || "-"; } catch (_) { return cadangan || "-"; } };
const ptTop = (jc, n = 3) => Object.entries(jc).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
const ptChips = (jc, n = 3) => ptTop(jc, n).map(([j, v]) => `<span class="pt-chip">${esc(PT_SINGKAT[j] || j)} ×${v}</span>`).join("");
const ptKartu = (ikon, angka, label, cls = "") =>
  `<div class="hp-kartu ${cls}"><span class="hp-ikon">${proIkon(ikon)}</span><div><div class="hp-angka">${angka}</div><div class="hp-label">${label}</div></div></div>`;
const ptHeat = (v, maks) => (v > 0 ? `background:rgba(220,38,38,${(0.1 + 0.6 * (v / Math.max(1, maks))).toFixed(2)})` : "");
const ptEkstra = (e) => (e.d == null ? "" : e.j === "pindah_aplikasi" ? ` (${e.d} dtk)` : e.j === "keluar_area" || e.j === "lompat_lokasi" ? ` (${e.d} m)` : "");

function ptKetuaBaca() {
  try { const v = JSON.parse(localStorage.getItem(PT_KUNCI_KETUA) || "{}"); return { nama: v.nama || "", nip: v.nip || "" }; } catch (_) { return { nama: "", nip: "" }; }
}
function ptKetuaSimpan(k) { try { localStorage.setItem(PT_KUNCI_KETUA, JSON.stringify(k)); } catch (_) { /* abaikan */ } }
async function ptPengaturan() {
  try { return await pgMuat(); } catch (e) {
    toast("Kop surat belum bisa dimuat (" + e.message + "). Cetakan memakai nama sekolah dari config.js.", "error");
    return { ...PG_KOSONG, nama_sekolah: CONFIG.NAMA_SEKOLAH || "" };
  }
}

// ---------------------------------------------------------------------
//  Memuat & menyiapkan data
// ---------------------------------------------------------------------
async function ptMuat() {
  const tok = ++PT.tok;
  PT.memuat = true; PT.galat = "";
  ptGambar();
  try {
    const { data, error } = await sb.rpc("peta_pelanggaran", { p_dari: PT.dari, p_sampai: PT.sampai });
    if (tok !== PT.tok) return;
    if (error) throw error;
    ptSiapkan(data);
  } catch (e) {
    if (tok !== PT.tok) return;
    PT.D = null; PT.rows = [];
    PT.galat = e && (e.code === "PGRST202" || /could not find the function/i.test(e.message || ""))
      ? "Fungsi peta belum terpasang. Jalankan 28_peta_pelanggaran.sql di Supabase."
      : (e && e.message) || String(e);
  } finally {
    if (tok === PT.tok) { PT.memuat = false; ptGambar(); }
  }
}

function ptSiapkan(D) {
  PT.D = D;
  PT.uj = new Map((D.ujian || []).map((u) => [u.id, u]));
  const ac = D.anticurang || {};
  PT.rows = (D.baris || []).map((b) => {
    const u = PT.uj.get(b.ujian_id);
    if (!u) return null;
    const log = Array.isArray(b.log) ? b.log : [];
    const ev = log.filter((e) => e && PT_HITUNG.includes(e.j));
    const jc = {}; ev.forEach((e) => { jc[e.j] = (jc[e.j] || 0) + 1; });
    const cat = {}; log.forEach((e) => { if (e && PT_CATATAN[e.j]) cat[e.j] = (cat[e.j] || 0) + 1; });
    const reset = log.some((e) => e && e.j === "reset");
    const n = ev.length;
    return {
      b, u, ev, jc, cat, reset, n, log, potong: log.length >= 40,
      siswa_id: b.siswa_id, kelas_id: b.kelas_id, mapel_id: u.mapel_id, hari: ptYmd(u.waktu_mulai),
      batas: !!(ac.aktif && ac.maks > 0 && ac.aksi === "kumpul" && b.status === "selesai" && n >= ac.maks && !reset),
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------
//  Pengolahan sesuai filter (di browser, tanpa menghubungi server)
// ---------------------------------------------------------------------
function ptRisiko(s) {
  if ((s.jc.lompat_lokasi || 0) > 0 || s.batas || s.rows.length >= 3 || s.total >= 6) return "tinggi";
  if (s.total >= 3 || s.rows.length >= 2) return "sedang";
  return "rendah";
}

function ptOlah() {
  const D = PT.D;
  const c = norm(PT.cari), jenis = PT.jenis;
  const nRow = (r) => (jenis ? (r.jc[jenis] || 0) : r.n);
  let R = PT.rows.filter((r) => nRow(r) > 0 && (!PT.kelas || r.kelas_id === PT.kelas) && (!PT.mapel || r.mapel_id === PT.mapel)
    && (!c || norm(r.b.nama).includes(c) || norm(r.b.nisn).includes(c)));

  const sm = new Map();
  R.forEach((r) => {
    let s = sm.get(r.siswa_id);
    if (!s) { s = { id: r.siswa_id, nama: r.b.nama, nisn: r.b.nisn, kelas_id: r.kelas_id, kelas: ptNamaKelas(r.kelas_id, r.b.kelas), total: 0, jc: {}, cat: {}, rows: [], reset: false, batas: false }; sm.set(r.siswa_id, s); }
    s.total += nRow(r); s.rows.push(r); s.reset = s.reset || r.reset; s.batas = s.batas || r.batas;
    if (jenis) s.jc[jenis] = (s.jc[jenis] || 0) + nRow(r); else Object.entries(r.jc).forEach(([j, v]) => { s.jc[j] = (s.jc[j] || 0) + v; });
    Object.entries(r.cat).forEach(([j, v]) => { s.cat[j] = (s.cat[j] || 0) + v; });
  });
  const siswa = [...sm.values()].filter((s) => s.total >= PT.min);
  const ids = new Set(siswa.map((s) => s.id));
  R = R.filter((r) => ids.has(r.siswa_id));
  siswa.forEach((s) => { s.risiko = ptRisiko(s); });
  const urutRisiko = { tinggi: 0, sedang: 1, rendah: 2 };
  siswa.sort((a, b) => urutRisiko[a.risiko] - urutRisiko[b.risiko] || b.total - a.total || urut(a.nama, b.nama));

  // Pembagi: siswa yang mengerjakan (per ujian per kelas), mengikuti filter mapel & kelas
  const ujF = (D.ujian || []).filter((u) => !PT.mapel || u.mapel_id === PT.mapel);
  const ujIds = new Set(ujF.map((u) => u.id));
  const slotK = {}, slotM = {}, slotMK = {};
  (D.peserta || []).forEach((p) => {
    if (!ujIds.has(p.ujian_id) || (PT.kelas && p.kelas_id !== PT.kelas)) return;
    const mid = PT.uj.get(p.ujian_id).mapel_id;
    slotK[p.kelas_id] = (slotK[p.kelas_id] || 0) + p.jumlah;
    slotM[mid] = (slotM[mid] || 0) + p.jumlah;
    slotMK[mid + "|" + p.kelas_id] = (slotMK[mid + "|" + p.kelas_id] || 0) + p.jumlah;
  });

  const jsum = (rs) => { const o = {}; rs.forEach((r) => { if (jenis) { if (r.jc[jenis]) o[jenis] = (o[jenis] || 0) + r.jc[jenis]; } else Object.entries(r.jc).forEach(([j, v]) => { o[j] = (o[j] || 0) + v; }); }); return o; };
  const total = (jc) => Object.values(jc).reduce((n, v) => n + v, 0);

  const kelasIds = [...new Set([...Object.keys(slotK), ...R.map((r) => r.kelas_id)])];
  const kelas = kelasIds.map((id) => {
    const rs = R.filter((r) => r.kelas_id === id); const jc = jsum(rs);
    const slot = slotK[id] || 0;
    return { id, nama: ptNamaKelas(id, (rs[0] && rs[0].b.kelas) || ""), slot, rows: rs.length, siswa: new Set(rs.map((r) => r.siswa_id)).size, ev: total(jc), jc, pct: ptPersen(rs.length, slot) };
  }).filter((k) => k.slot > 0 || k.rows > 0).sort((a, b) => urut(a.nama, b.nama));

  const mapelIds = [...new Set([...ujF.map((u) => u.mapel_id), ...R.map((r) => r.mapel_id)])];
  const mapel = mapelIds.map((id) => {
    const rs = R.filter((r) => r.mapel_id === id); const jc = jsum(rs);
    const slot = slotM[id] || 0;
    const perKelas = {}; rs.forEach((r) => { const k = perKelas[r.kelas_id] || (perKelas[r.kelas_id] = { rows: 0, ev: 0 }); k.rows++; k.ev += jenis ? (r.jc[jenis] || 0) : r.n; });
    return { id, nama: namaMapel(id), slot, rows: rs.length, siswa: new Set(rs.map((r) => r.siswa_id)).size, ev: total(jc), jc, pct: ptPersen(rs.length, slot), perKelas };
  }).filter((m) => m.slot > 0 || m.rows > 0).sort((a, b) => urut(a.nama, b.nama));

  // Tren harian & fase ujian (awal / tengah / akhir menurut waktu kejadian terhadap waktu mulai siswa)
  const hari = []; for (let d = PT.dari; d <= PT.sampai; d = ptGeser(d, 1)) hari.push(d);
  const tren = hari.map((d) => { const rs = R.filter((r) => r.hari === d); return { d, rows: rs.length, ev: rs.reduce((n, r) => n + nRow(r), 0) }; });
  const fase = { awal: 0, tengah: 0, akhir: 0 };
  R.forEach((r) => {
    const mulai = r.b.mulai_pada ? new Date(r.b.mulai_pada).getTime() / 1000 : 0, dur = (r.u.durasi_menit || 0) * 60;
    if (!mulai || !dur) return;
    r.ev.forEach((e) => {
      if (jenis && e.j !== jenis) return;
      const rel = (Number(e.t) - mulai) / dur;
      if (rel < 0 || rel > 1.2) return;
      fase[rel < 1 / 3 ? "awal" : rel < 2 / 3 ? "tengah" : "akhir"]++;
    });
  });

  const jcAll = jsum(R);
  const slotTotal = Object.values(slotK).reduce((n, v) => n + v, 0);
  return {
    R, siswa, kelas, mapel, tren, fase, jcAll,
    ringkas: {
      siswa: siswa.length, ev: total(jcAll), rows: R.length, slot: slotTotal, pct: ptPersen(R.length, slotTotal),
      ujianKena: new Set(R.map((r) => r.u.id)).size, ujianSemua: ujF.length,
      batas: R.filter((r) => r.batas).length, tinggi: siswa.filter((s) => s.risiko === "tinggi").length, top: ptTop(jcAll, 1)[0] || null,
    },
  };
}

// ---------------------------------------------------------------------
//  Halaman
// ---------------------------------------------------------------------
async function rPeta() {
  if (typeof PANEL !== "undefined" && PANEL !== "admin") { konten().innerHTML = kosong("Menu khusus admin", "Menu Peta Pelanggaran hanya tersedia untuk admin."); return; }
  await Promise.all([muatKelas(), muatMapel()]);
  if (!PT.dari) { PT.sampai = ptHariIni(); PT.dari = ptGeser(PT.sampai, -6); }
  const kelas = [...S.kelas].sort((a, b) => urut(a.nama, b.nama));
  const mapel = [...S.mapel].sort((a, b) => urut(a.nama, b.nama));

  konten().innerHTML = `
    <div class="panel-mewah" style="margin-bottom:1rem">
      <div class="pt-filter">
        <label class="pt-f">Dari tanggal<input class="input" type="date" id="pt-dari" value="${esc(PT.dari)}"></label>
        <label class="pt-f">Sampai tanggal<input class="input" type="date" id="pt-sampai" value="${esc(PT.sampai)}"></label>
        <div class="pt-f penuh"><div class="pt-cepat" role="group" aria-label="Pilihan cepat tanggal">
          <button class="btn btn-kecil" type="button" data-cepat="hari">Hari ini</button>
          <button class="btn btn-kecil" type="button" data-cepat="kemarin">Kemarin</button>
          <button class="btn btn-kecil" type="button" data-cepat="7">7 hari</button>
          <button class="btn btn-kecil" type="button" data-cepat="30">30 hari</button>
        </div></div>
        <label class="pt-f">Kelas<select class="pilih" id="pt-kelas"><option value="">Semua kelas</option>${kelas.map((k) => `<option value="${k.id}">${esc(k.nama)}</option>`).join("")}</select></label>
        <label class="pt-f">Mata pelajaran<select class="pilih" id="pt-mapel"><option value="">Semua mapel</option>${mapel.map((m) => `<option value="${m.id}">${esc(m.nama)}</option>`).join("")}</select></label>
        <label class="pt-f">Jenis pelanggaran<select class="pilih" id="pt-jenis"><option value="">Semua jenis</option>${PT_HITUNG.map((j) => `<option value="${j}">${esc(PT_LABEL[j])}</option>`).join("")}</select></label>
        <label class="pt-f">Minimal kejadian<select class="pilih" id="pt-min">${[1, 2, 3, 5].map((n) => `<option value="${n}">${n === 1 ? "Semua" : "≥ " + n + " kali"}</option>`).join("")}</select></label>
        <label class="pt-f penuh">Cari siswa<input class="input" id="pt-cari" type="search" placeholder="Nama atau NISN" autocomplete="off"></label>
        <div class="pt-f penuh"><div class="pt-aksi">
          <button class="btn btn-primary" id="pt-tampil" type="button">Tampilkan</button>
          <button class="btn" id="pt-cetak" type="button">🖨️ Cetak analisis</button>
        </div></div>
      </div>
    </div>
    <div id="pt-isi"></div>`;

  $("#pt-kelas").value = PT.kelas; $("#pt-mapel").value = PT.mapel; $("#pt-jenis").value = PT.jenis; $("#pt-min").value = String(PT.min); $("#pt-cari").value = PT.cari;

  const setTgl = (d, s) => { PT.dari = d; PT.sampai = s; $("#pt-dari").value = d; $("#pt-sampai").value = s; };
  $("#pt-dari").onchange = (e) => { if (!e.target.value) return; PT.dari = e.target.value; if (PT.sampai < PT.dari) PT.sampai = PT.dari; setTgl(PT.dari, PT.sampai); };
  $("#pt-sampai").onchange = (e) => { if (!e.target.value) return; PT.sampai = e.target.value; if (PT.dari > PT.sampai) PT.dari = PT.sampai; setTgl(PT.dari, PT.sampai); };
  document.querySelectorAll("[data-cepat]").forEach((b) => {
    b.onclick = () => {
      const h = ptHariIni(), k = b.dataset.cepat;
      if (k === "hari") setTgl(h, h); else if (k === "kemarin") setTgl(ptGeser(h, -1), ptGeser(h, -1)); else setTgl(ptGeser(h, -(Number(k) - 1)), h);
      ptMuat();
    };
  });
  const lokal = () => { if (PT.D) ptGambar(); };
  $("#pt-kelas").onchange = (e) => { PT.kelas = e.target.value; lokal(); };
  $("#pt-mapel").onchange = (e) => { PT.mapel = e.target.value; lokal(); };
  $("#pt-jenis").onchange = (e) => { PT.jenis = e.target.value; lokal(); };
  $("#pt-min").onchange = (e) => { PT.min = Number(e.target.value) || 1; lokal(); };
  $("#pt-cari").oninput = (e) => { PT.cari = e.target.value; lokal(); };
  $("#pt-tampil").onclick = () => {
    if ((new Date(PT.sampai) - new Date(PT.dari)) / 86400000 > 30) return toast("Rentang tanggal maksimal 31 hari.", "error");
    ptMuat();
  };
  $("#pt-cetak").onclick = () => ptDialogCetak();
  ptGambar();
}

function ptGambar() {
  const isi = $("#pt-isi");
  if (!isi) return;
  if (PT.memuat) { isi.innerHTML = '<p class="memuat">Memuat...</p>'; return; }
  if (PT.galat) { isi.innerHTML = `<div class="galat-blok"><b>Data belum bisa dimuat.</b><br>${esc(PT.galat)}</div>`; return; }
  if (!PT.D) {
    isi.innerHTML = kosong("Pilih rentang tanggal lalu tekan Tampilkan",
      "Data diambil hanya saat Anda menekan tombol Tampilkan, dan hanya dari ujian yang sudah berakhir, jadi ringan untuk server.");
    return;
  }
  const D = PT.D;
  if (!(D.ujian || []).length) {
    isi.innerHTML = kosong("Belum ada ujian yang sudah berakhir", `Tidak ada ujian berakhir pada ${esc(ptPeriode())}. Ubah rentang tanggal.`);
    return;
  }
  const A = ptOlah();
  const r = A.ringkas;
  const catatan = [
    D.anticurang && D.anticurang.aktif === false ? "Anti curang sedang nonaktif, jadi pelanggaran baru tidak tercatat." : "",
    D.terpotong ? "Data sangat banyak sehingga dipotong 15.000 baris. Persempit rentang tanggal." : "",
  ].filter(Boolean).map((t) => `<div class="catatan">${esc(t)}</div>`).join("");

  const kartu = `${catatan}<div class="hp-stat">
      ${ptKartu("belum", r.siswa, "Siswa melanggar", r.siswa ? "warn" : "ok")}
      ${ptKartu("peserta", ptPct(r.pct), "Pengerjaan bermasalah", "abu")}
      ${ptKartu("rata", r.ev, "Total kejadian", "abu")}
      ${ptKartu("cek", `${r.ujianKena}/${r.ujianSemua}`, "Ujian terdampak")}
    </div>
    <p class="pt-info">Periode <b>${esc(ptPeriode())}</b>. ${r.top ? `Jenis terbanyak: <b>${esc(PT_LABEL[r.top[0]])}</b> (${r.top[1]}×). ` : ""}${r.tinggi ? `<b>${r.tinggi}</b> siswa berisiko tinggi. ` : ""}${r.batas ? `<b>${r.batas}</b> pengerjaan dikumpulkan otomatis karena melewati batas. ` : ""}Risiko adalah indikasi dan perlu dikonfirmasi, karena notifikasi atau gangguan perangkat juga bisa memicu pelanggaran.</p>`;

  const tabs = [["kelas", "Kelas"], ["siswa", "Siswa"], ["mapel", "Mapel"], ["tren", "Tren"]];
  const bar = `<div class="pt-tabs" role="tablist">${tabs.map(([k, t]) => `<button class="pt-tab ${PT.tab === k ? "aktif" : ""}" role="tab" type="button" data-tab="${k}">${t}</button>`).join("")}</div>`;
  let isiTab = "";
  if (!r.siswa) isiTab = kosong("Tidak ada pelanggaran pada pilihan ini", "Tidak ada siswa yang melanggar menurut filter yang dipilih, atau semua pengerjaan bersih.");
  else isiTab = PT.tab === "siswa" ? ptTabSiswa(A) : PT.tab === "mapel" ? ptTabMapel(A) : PT.tab === "tren" ? ptTabTren(A) : ptTabKelas(A);
  isi.innerHTML = kartu + bar + isiTab;

  isi.querySelectorAll("[data-tab]").forEach((b) => { b.onclick = () => { PT.tab = b.dataset.tab; ptGambar(); }; });
  isi.querySelectorAll("[data-sid]").forEach((b) => { b.onclick = () => ptDetailSiswa(b.dataset.sid); });
  const sem = isi.querySelector("#pt-semua");
  if (sem) sem.onclick = () => { PT.semuaSiswa = true; ptGambar(); };
}

function ptTabKelas(A) {
  const kelas = A.kelas;
  const maksHeat = Math.max(1, ...kelas.flatMap((k) => PT_HITUNG.map((j) => k.jc[j] || 0)));
  const heat = `<div class="pt-judul">Peta warna kelas × jenis pelanggaran <small>(jumlah kejadian)</small></div>
    <div class="pt-heat-wrap"><table class="pt-heat"><thead><tr><th>Kelas</th><th>Pengerjaan</th><th>Bermasalah</th><th>%</th>${PT_HITUNG.map((j) => `<th>${esc(PT_SINGKAT[j])}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${kelas.map((k) => `<tr><td>${esc(k.nama)}</td><td>${k.slot}</td><td>${k.rows}</td><td>${ptPct(k.pct)}</td>
        ${PT_HITUNG.map((j) => { const v = k.jc[j] || 0; return `<td class="${v ? "" : "nol"}" style="${ptHeat(v, maksHeat)}">${v || "·"}</td>`; }).join("")}<td><b>${k.ev}</b></td></tr>`).join("")}
    </tbody></table></div>`;
  const kartu = [...kelas].sort((a, b) => (b.pct || 0) - (a.pct || 0) || b.ev - a.ev).map((k) => `
    <div class="pt-card"><div class="pt-card-atas"><div><b>Kelas ${esc(k.nama)}</b><div class="pt-sub">${k.slot} pengerjaan · ${k.siswa} siswa melanggar</div></div><b>${ptPct(k.pct)}</b></div>
      <div class="pt-bar"><i style="width:${Math.min(100, k.pct || 0)}%"></i></div>
      <div class="pt-angka"><span><b>${k.ev}</b>kejadian</span><span><b>${k.rows}</b>pengerjaan bermasalah</span></div>
      <div class="pt-chips">${ptChips(k.jc) || '<span class="pt-chip">Bersih</span>'}</div></div>`).join("");
  return heat + `<div class="pt-judul">Peringkat kelas <small>(persen pengerjaan bermasalah)</small></div><div class="pt-grid">${kartu}</div>`;
}

function ptTabSiswa(A) {
  const semua = A.siswa, tampil = PT.semuaSiswa ? semua : semua.slice(0, 40);
  return `<div class="pt-judul">Siswa berpelanggaran <small>(${semua.length} siswa, diurut dari risiko tertinggi; ketuk untuk riwayat)</small></div>
    <div class="pt-grid">${tampil.map((s) => `
      <button class="pt-card" type="button" data-sid="${s.id}">
        <div class="pt-card-atas"><div><b>${esc(s.nama)}</b><div class="pt-sub">${esc(s.kelas)} · ${esc(s.nisn)}</div></div><span class="pt-risk ${s.risiko}">${PT_RISIKO[s.risiko]}</span></div>
        <div class="pt-angka"><span><b>${s.total}</b>kejadian</span><span><b>${s.rows.length}</b>ujian</span></div>
        <div class="pt-chips">${ptChips(s.jc)}</div>
        ${s.reset || s.batas ? `<div class="pt-tanda" style="margin-top:.35rem">${[s.batas ? "Dikumpulkan otomatis" : "", s.reset ? "Pernah direset pengawas" : ""].filter(Boolean).join(" · ")}</div>` : ""}
      </button>`).join("")}</div>
    ${!PT.semuaSiswa && semua.length > 40 ? `<p style="text-align:center;margin-top:.8rem"><button class="btn" id="pt-semua" type="button">Tampilkan semua (${semua.length})</button></p>` : ""}`;
}

function ptTabMapel(A) {
  const mapel = [...A.mapel].sort((a, b) => (b.pct || 0) - (a.pct || 0) || b.ev - a.ev);
  return `<div class="pt-judul">Mapel <small>(diurut dari persen pengerjaan bermasalah tertinggi)</small></div>
    <div class="pt-grid">${mapel.map((m) => `
      <div class="pt-card"><div class="pt-card-atas"><div><b>${esc(m.nama)}</b><div class="pt-sub">${m.slot} pengerjaan · ${m.siswa} siswa melanggar</div></div><b>${ptPct(m.pct)}</b></div>
        <div class="pt-bar"><i style="width:${Math.min(100, m.pct || 0)}%"></i></div>
        <div class="pt-angka"><span><b>${m.ev}</b>kejadian</span><span><b>${m.rows}</b>pengerjaan bermasalah</span></div>
        <div class="pt-chips">${ptChips(m.jc) || '<span class="pt-chip">Bersih</span>'}</div>
        ${Object.keys(m.perKelas).length ? `<div class="pt-sub" style="margin-top:.45rem">Per kelas: ${Object.entries(m.perKelas).sort((a, b) => b[1].ev - a[1].ev).map(([kid, v]) => `${esc(ptNamaKelas(kid))} (${v.ev})`).join(", ")}</div>` : ""}</div>`).join("")}</div>`;
}

function ptTabTren(A) {
  const maks = Math.max(1, ...A.tren.map((t) => t.ev));
  const ft = A.fase.awal + A.fase.tengah + A.fase.akhir;
  const hb = (label, v, tot) => `<div class="pt-hb"><span>${esc(label)}</span><span class="tr"><i style="width:${tot ? (v / tot) * 100 : 0}%"></i></span><b>${v}</b></div>`;
  const jt = Object.entries(A.jcAll).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return `<div class="pt-judul">Kejadian per hari <small>(menurut tanggal ujian)</small></div>
    <div class="panel-mewah"><div class="pt-tren">${A.tren.map((t) => `<div class="pt-tren-k" title="${esc(ptTglPanjang(t.d))}: ${t.ev} kejadian, ${t.rows} pengerjaan bermasalah">
      <div class="pt-tren-v">${t.ev || ""}</div><div class="pt-tren-b"><i style="height:${(t.ev / maks) * 100}%"></i></div>
      <div class="pt-tren-h">${esc(fmtWITA(new Date(t.d + "T12:00:00+08:00"), { day: "numeric", month: "short" }))}</div></div>`).join("")}</div></div>
    <div class="pt-judul">Kapan terjadi dalam ujian <small>(awal, tengah, akhir waktu mengerjakan)</small></div>
    <div class="panel-mewah">${ft ? hb("Sepertiga awal", A.fase.awal, ft) + hb("Sepertiga tengah", A.fase.tengah, ft) + hb("Sepertiga akhir", A.fase.akhir, ft) : '<p class="ket">Belum ada kejadian yang bisa dipetakan waktunya.</p>'}</div>
    <div class="pt-judul">Jenis pelanggaran</div>
    <div class="panel-mewah">${jt.map(([j, v]) => hb(PT_LABEL[j], v, jt[0][1])).join("")}</div>`;
}

// ---------------------------------------------------------------------
//  Riwayat satu siswa (layar) -> bisa dicetak
// ---------------------------------------------------------------------
function ptRiwayatHtml(s) {
  return s.rows.slice().sort((a, b) => new Date(a.u.waktu_mulai) - new Date(b.u.waktu_mulai)).map((r) => {
    const kej = r.log.filter((e) => e && (PT_HITUNG.includes(e.j) || e.j === "reset") && Number(e.t) > 0);
    return `<div class="pt-det-u"><div class="pt-card-atas"><b>${esc(namaMapel(r.u.mapel_id))}</b><span class="pt-sub">${esc(ptTglPendek(r.u.waktu_mulai))}</span></div>
      <div class="pt-sub">${r.n} kejadian${r.batas ? " · dikumpulkan otomatis" : ""}${r.reset ? " · pernah direset pengawas" : ""}${r.potong ? " · riwayat dibatasi 40 kejadian" : ""}</div>
      <div style="margin-top:.35rem">${kej.map((e) => `<div class="pt-kej"><span class="j">${esc(ptJam(e.t))}</span><span>${e.j === "reset" ? "↺ Pelanggaran direset pengawas" : esc(PT_LABEL[e.j] + ptEkstra(e))}</span></div>`).join("")}</div></div>`;
  }).join("");
}

function ptDetailSiswa(id) {
  const A = ptOlah();
  const s = A.siswa.find((x) => x.id === id);
  if (!s) return;
  const cat = Object.entries(s.cat).map(([j, v]) => `${PT_CATATAN[j]} ×${v}`).join(", ");
  const m = tampilModal(s.nama, `
    <div class="pt-card-atas" style="margin-bottom:.5rem"><div class="pt-sub">${esc(s.kelas)} · NISN ${esc(s.nisn)}</div><span class="pt-risk ${s.risiko}">Risiko ${PT_RISIKO[s.risiko]}</span></div>
    <div class="pt-angka"><span><b>${s.total}</b>kejadian</span><span><b>${s.rows.length}</b>ujian bermasalah</span></div>
    <div class="pt-chips" style="margin-bottom:.7rem">${ptChips(s.jc, 7)}</div>
    ${cat ? `<p class="pt-sub" style="margin-bottom:.6rem">Catatan lain (tidak dihitung): ${esc(cat)}</p>` : ""}
    ${ptRiwayatHtml(s)}
    <p class="pt-sub">Risiko adalah indikasi dan perlu dikonfirmasi dengan siswa dan pengawas.</p>`,
    { lebar: "sedang", aksi: [{ label: "Tutup" }, { label: "🖨️ Cetak riwayat siswa", kelas: "btn-primary", onClick: async () => { m.tutup(); await ptCetak("satu", id); }, tutup: false }] });
}

// ---------------------------------------------------------------------
//  Cetak
// ---------------------------------------------------------------------
function ptDialogCetak() {
  if (!PT.D) return toast("Tekan Tampilkan dulu agar ada data untuk dicetak.", "error");
  const A = ptOlah();
  if (!A.ringkas.siswa) return toast("Tidak ada pelanggaran pada pilihan ini untuk dicetak.", "error");
  const opsi = [
    ["ringkasan", "Ringkasan analisis", "Angka utama, peta warna kelas, mapel, 10 siswa teratas, tren. A4 Portrait."],
    ["kelas", "Per kelas", `Daftar siswa melanggar, satu halaman per kelas (${A.kelas.filter((k) => k.rows).length} kelas). A4 Portrait.`],
    ["siswa", "Per siswa", `Riwayat lengkap, satu halaman per siswa (${A.siswa.length} siswa). A4 Portrait.`],
    ["mapel", "Per mapel", "Perbandingan antarmapel dan mapel × kelas. A4 Landscape."],
  ];
  const m = tampilModal("Cetak analisis pelanggaran", `
    <p class="ket" style="margin-bottom:.6rem">Mengikuti filter yang sedang dipilih (tanggal, kelas, mapel, jenis, minimal, cari).</p>
    ${opsi.map(([v, j, k], i) => `<label style="display:flex;gap:.6rem;align-items:flex-start;padding:.55rem 0;border-bottom:1px solid var(--garis)"><input type="radio" name="pt-jenis-cetak" value="${v}" ${i === 0 ? "checked" : ""} style="margin-top:.25rem"><span><b>${j}</b><br><small class="ket">${k}</small></span></label>`).join("")}`,
    { lebar: "sedang", aksi: [{ label: "Batal" }, { label: "Pratinjau", kelas: "btn-primary", onClick: async () => { await ptCetak(m.body.querySelector('input[name="pt-jenis-cetak"]:checked').value); } }] });
}

async function ptCetak(jenis, siswaId) {
  try {
    const A = ptOlah();
    const pg = await ptPengaturan();
    const P = {
      jenis, A, pg, urlKiri: pgUrlLogo(pg.logo_kiri), urlKanan: pgUrlLogo(pg.logo_kanan), orient: "auto", tgl: ptHariIni(), ketua: ptKetuaBaca(),
      periode: ptPeriode(), mapelNama: PT.mapel ? namaMapel(PT.mapel) : "Semua mata pelajaran", kelasNama: PT.kelas ? ptNamaKelas(PT.kelas) : "Semua kelas",
      jenisNama: PT.jenis ? PT_LABEL[PT.jenis] : "Semua jenis", siswaId: siswaId || null,
    };
    P.ringkas = `${{ ringkasan: "Ringkasan analisis", kelas: "Per kelas", siswa: "Per siswa", satu: "Riwayat siswa", mapel: "Per mapel" }[jenis]} · ${P.periode}`;
    ptPratinjau(P);
  } catch (e) { toast("Gagal menyiapkan cetakan: " + (e.message || e), "error"); }
}

const ptOrient = (P) => (P.orient === "auto" ? (P.jenis === "mapel" ? "landscape" : "portrait") : P.orient);
const ptCssCetak = (o) => `
@media print{
  @page{size:A4 ${o};margin:12mm 14mm}
  html,body{overflow:visible!important;height:auto!important;background:#fff!important;padding:0!important}
  body>*:not(#pt-layar){display:none!important}
  html body > #pt-layar{display:block!important;position:static!important;overflow:visible!important;background:#fff!important;padding:0!important}
  .no-print,.cetak-bar,.cetak-petunjuk{display:none!important}
  .pt-kertas{width:auto!important;margin:0!important;gap:0!important;display:block!important;zoom:1!important}
  .cetak-hal.pt-hal{box-shadow:none!important;padding:0!important;min-height:0!important;overflow:visible!important;break-after:page;page-break-after:always}
  .cetak-hal.pt-hal:last-child{break-after:auto;page-break-after:auto}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}`;

function ptTtd(P) {
  const d = new Date(P.tgl + "T12:00:00+08:00");
  const tgl = Number.isNaN(d.getTime()) ? "" : fmtWITA(d, { day: "numeric", month: "long", year: "numeric" });
  const tempat = String(P.pg.tempat_ttd || "").trim(), nama = String(P.ketua.nama || "").trim(), nip = String(P.ketua.nip || "").trim();
  return `<div class="cetak-ttd"><div class="ttd-blok">
    <div>${esc(tempat ? `${tempat}, ${tgl}` : tgl)}</div><div>Mengetahui,</div><div>Ketua Panitia,</div><div class="ttd-ruang"></div>
    <div class="${nama ? "ttd-nama" : ""}">${nama ? esc(nama) : "(.....................................)"}</div><div>NIP. ${nip ? esc(nip) : ".............................."}</div></div></div>`;
}

const ptCara = () => `<div class="pt-catatan"><b>Cara membaca.</b> Pelanggaran = jenis yang dihitung sistem anti-curang (pindah aplikasi/tab, kehilangan fokus, keluar layar penuh, layar terbagi, keluar area, lokasi melompat, GPS tidak terbaca), dihitung dari riwayat kejadian sehingga yang sudah direset pengawas tetap terhitung. <b>Persen</b> = pengerjaan bermasalah dibagi seluruh pengerjaan. <b>Risiko</b> (indikasi, perlu dikonfirmasi): Tinggi bila lokasi melompat, dikumpulkan otomatis, melanggar di 3 ujian atau lebih, atau 6 kejadian atau lebih; Sedang bila 3 kejadian atau lebih atau melanggar di 2 ujian; selebihnya Rendah.</div>`;

function ptKepala(P, judul, bio) {
  return `${kopHtml(P.pg, P.urlKiri, P.urlKanan)}<h2 class="cetak-judul">${judul}</h2><div class="cetak-sub">${esc(periodeAktifTeks().toUpperCase())}</div>
    <table class="cetak-bio">${bio.map(([k, v]) => `<tr><td>${esc(k)}</td><td>:</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>`;
}
const ptBioUmum = (P) => [["Periode ujian", P.periode], ["Kelas", P.kelasNama], ["Mata pelajaran", P.mapelNama], ["Jenis pelanggaran", P.jenisNama]];

function ptTabelKelasJenis(A) {
  const maks = Math.max(1, ...A.kelas.flatMap((k) => PT_HITUNG.map((j) => k.jc[j] || 0)));
  return `<table class="cetak-tabel pt-t"><thead><tr><th>Kelas</th><th>Peng.</th><th>Bermasalah</th><th>%</th>${PT_HITUNG.map((j) => `<th>${esc(PT_SINGKAT[j])}</th>`).join("")}<th>Total</th></tr></thead><tbody>
    ${A.kelas.map((k) => `<tr><td class="k"><b>${esc(k.nama)}</b></td><td class="c">${k.slot}</td><td class="c">${k.rows}</td><td class="c">${ptPct(k.pct)}</td>
      ${PT_HITUNG.map((j) => { const v = k.jc[j] || 0; return `<td class="c ${v ? "" : "h0"}" style="${ptHeat(v, maks)}">${v || "-"}</td>`; }).join("")}<td class="c"><b>${k.ev}</b></td></tr>`).join("")}</tbody></table>`;
}

function ptHalRingkasan(P) {
  const A = P.A, r = A.ringkas, mapel = [...A.mapel].sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 10), top = A.siswa.slice(0, 10);
  const maksT = Math.max(1, ...A.tren.map((t) => t.ev));
  return `<section class="cetak-hal pt-hal">${ptKepala(P, "LAPORAN ANALISIS PELANGGARAN UJIAN (ANTI CURANG)", ptBioUmum(P))}
    <div class="pt-ring"><div><b>${r.siswa}</b><span>Siswa melanggar</span></div><div><b>${ptPct(r.pct)}</b><span>Pengerjaan bermasalah</span></div><div><b>${r.ev}</b><span>Total kejadian</span></div><div><b>${r.ujianKena}/${r.ujianSemua}</b><span>Ujian terdampak</span></div></div>
    <div class="pt-sub2">1. Peta kelas × jenis pelanggaran</div>${ptTabelKelasJenis(A)}
    <div class="pt-sub2">2. Mata pelajaran (10 tertinggi menurut persen)</div>
    <table class="cetak-tabel pt-t"><thead><tr><th style="width:6%">No.</th><th>Mata pelajaran</th><th>Pengerjaan</th><th>Bermasalah</th><th>%</th><th>Kejadian</th><th>Jenis terbanyak</th></tr></thead><tbody>
      ${mapel.map((m, i) => `<tr><td class="c">${i + 1}</td><td class="k">${esc(m.nama)}</td><td class="c">${m.slot}</td><td class="c">${m.rows}</td><td class="c">${ptPct(m.pct)}</td><td class="c">${m.ev}</td><td class="k">${esc(ptTop(m.jc, 2).map(([j, v]) => `${PT_SINGKAT[j]} ×${v}`).join(", ") || "-")}</td></tr>`).join("")}</tbody></table>
    <div class="pt-sub2">3. Siswa dengan kejadian terbanyak (10 teratas)</div>
    <table class="cetak-tabel pt-t"><thead><tr><th style="width:6%">No.</th><th>Nama / NISN</th><th>Kelas</th><th>Ujian</th><th>Kejadian</th><th>Risiko</th><th>Jenis terbanyak</th></tr></thead><tbody>
      ${top.map((s, i) => `<tr><td class="c">${i + 1}</td><td class="k">${esc(s.nama)}<br><small>${esc(s.nisn)}</small></td><td class="c">${esc(s.kelas)}</td><td class="c">${s.rows.length}</td><td class="c"><b>${s.total}</b></td><td class="c">${PT_RISIKO[s.risiko]}</td><td class="k">${esc(ptTop(s.jc, 2).map(([j, v]) => `${PT_SINGKAT[j]} ×${v}`).join(", "))}</td></tr>`).join("")}</tbody></table>
    <div class="pt-sub2">4. Kejadian per hari</div>
    <table class="cetak-tabel pt-t"><thead><tr><th style="width:24%">Tanggal</th><th style="width:12%">Kejadian</th><th style="width:14%">Pengerjaan bermasalah</th><th>Grafik</th></tr></thead><tbody>
      ${A.tren.map((t) => `<tr><td class="k">${esc(ptTglPanjang(t.d))}</td><td class="c">${t.ev}</td><td class="c">${t.rows}</td><td class="k"><div style="height:3.2mm;background:#000;width:${(t.ev / maksT) * 100}%;min-width:${t.ev ? "1mm" : "0"}"></div></td></tr>`).join("")}</tbody></table>
    ${ptCara()}${ptTtd(P)}</section>`;
}

function ptHalKelas(P) {
  const A = P.A, ks = A.kelas.filter((k) => k.rows);
  return ks.map((k, idx) => {
    const sis = A.siswa.filter((s) => s.kelas_id === k.id).sort((a, b) => urut(a.nama, b.nama));
    return `<section class="cetak-hal pt-hal">${ptKepala(P, "DAFTAR SISWA BERPELANGGARAN UJIAN", [["Periode ujian", P.periode], ["Kelas", k.nama], ["Mata pelajaran", P.mapelNama], ["Jenis pelanggaran", P.jenisNama]])}
      <table class="cetak-tabel pt-t"><colgroup><col style="width:6%"><col style="width:27%"><col style="width:8%"><col style="width:9%"><col style="width:9%"><col style="width:23%"><col style="width:18%"></colgroup>
        <thead><tr><th>No.</th><th>Nama / NISN</th><th>Ujian</th><th>Kejadian</th><th>Risiko</th><th>Jenis terbanyak</th><th>Keterangan</th></tr></thead><tbody>
        ${sis.map((s, i) => `<tr><td class="c">${i + 1}</td><td class="k">${esc(s.nama)}<br><small>${esc(s.nisn)}</small></td><td class="c">${s.rows.length}</td><td class="c"><b>${s.total}</b></td><td class="c">${PT_RISIKO[s.risiko]}</td><td class="k">${esc(ptTop(s.jc, 3).map(([j, v]) => `${PT_SINGKAT[j]} ×${v}`).join(", "))}</td><td></td></tr>`).join("")}</tbody></table>
      <div class="cetak-ringkas">Siswa melanggar: <b>${sis.length}</b> &nbsp;|&nbsp; Pengerjaan bermasalah: <b>${k.rows}</b> dari <b>${k.slot}</b> (${ptPct(k.pct)}) &nbsp;|&nbsp; Total kejadian: <b>${k.ev}</b></div>
      ${idx === ks.length - 1 ? ptCara() + ptTtd(P) : ""}</section>`;
  }).join("");
}

function ptHalSiswa(P) {
  const daftar = P.siswaId ? P.A.siswa.filter((s) => s.id === P.siswaId) : P.A.siswa.slice().sort((a, b) => urut(a.kelas, b.kelas) || urut(a.nama, b.nama));
  return daftar.map((s) => {
    const rows = s.rows.slice().sort((a, b) => new Date(a.u.waktu_mulai) - new Date(b.u.waktu_mulai));
    const cat = Object.entries(s.cat).map(([j, v]) => `${PT_CATATAN[j]} ×${v}`).join(", ");
    return `<section class="cetak-hal pt-hal">${ptKepala(P, "RIWAYAT PELANGGARAN UJIAN SISWA", [["Nama siswa", s.nama], ["NISN", s.nisn], ["Kelas", s.kelas], ["Periode ujian", P.periode], ["Ringkasan", `${s.total} kejadian di ${s.rows.length} ujian · risiko ${PT_RISIKO[s.risiko]} (indikasi)`]])}
      <table class="cetak-tabel pt-t"><colgroup><col style="width:5%"><col style="width:16%"><col style="width:19%"><col style="width:8%"><col></colgroup>
        <thead><tr><th>No.</th><th>Tanggal</th><th>Mata pelajaran</th><th>Jumlah</th><th>Waktu &amp; jenis kejadian</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="c">${esc(ptTglPendek(r.u.waktu_mulai))}</td><td class="k">${esc(namaMapel(r.u.mapel_id))}${r.batas ? "<br><small>Dikumpulkan otomatis</small>" : ""}${r.reset ? "<br><small>Pernah direset pengawas</small>" : ""}</td><td class="c"><b>${r.n}</b></td>
          <td class="k"><div class="pt-kejp">${r.log.filter((e) => e && (PT_HITUNG.includes(e.j) || e.j === "reset") && Number(e.t) > 0).map((e) => `<span>${esc(ptJam(e.t))}</span><span>${e.j === "reset" ? "Direset pengawas" : esc(PT_LABEL[e.j] + ptEkstra(e))}</span>`).join("")}</div></td></tr>`).join("")}</tbody></table>
      ${cat ? `<div class="pt-catatan"><b>Catatan lain (tidak dihitung):</b> ${esc(cat)}.</div>` : ""}
      <div class="pt-sub2">Tindak lanjut</div><div class="baris-titik"></div><div class="baris-titik"></div><div class="baris-titik"></div>
      ${ptCara()}${ptTtd(P)}</section>`;
  }).join("");
}

function ptHalMapel(P) {
  const A = P.A, mapel = [...A.mapel].sort((a, b) => (b.pct || 0) - (a.pct || 0) || b.ev - a.ev);
  const maks = Math.max(1, ...mapel.flatMap((m) => PT_HITUNG.map((j) => m.jc[j] || 0)));
  const kel = A.kelas.filter((k) => k.slot || k.rows);
  const maksMk = Math.max(1, ...mapel.flatMap((m) => kel.map((k) => (m.perKelas[k.id] || { ev: 0 }).ev)));
  return `<section class="cetak-hal pt-hal">${ptKepala(P, "ANALISIS PELANGGARAN UJIAN PER MATA PELAJARAN", ptBioUmum(P))}
    <div class="pt-sub2">1. Perbandingan mata pelajaran (diurut dari persen tertinggi)</div>
    <table class="cetak-tabel pt-t"><thead><tr><th style="width:4%">No.</th><th>Mata pelajaran</th><th>Peng.</th><th>Bermasalah</th><th>%</th>${PT_HITUNG.map((j) => `<th>${esc(PT_SINGKAT[j])}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${mapel.map((m, i) => `<tr><td class="c">${i + 1}</td><td class="k"><b>${esc(m.nama)}</b></td><td class="c">${m.slot}</td><td class="c">${m.rows}</td><td class="c">${ptPct(m.pct)}</td>
        ${PT_HITUNG.map((j) => { const v = m.jc[j] || 0; return `<td class="c ${v ? "" : "h0"}" style="${ptHeat(v, maks)}">${v || "-"}</td>`; }).join("")}<td class="c"><b>${m.ev}</b></td></tr>`).join("")}</tbody></table>
    <div class="pt-sub2">2. Mata pelajaran × kelas (jumlah kejadian)</div>
    <table class="cetak-tabel pt-t"><thead><tr><th>Mata pelajaran</th>${kel.map((k) => `<th>${esc(k.nama)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${mapel.map((m) => `<tr><td class="k"><b>${esc(m.nama)}</b></td>${kel.map((k) => { const v = (m.perKelas[k.id] || { ev: 0 }).ev; return `<td class="c ${v ? "" : "h0"}" style="${ptHeat(v, maksMk)}">${v || "-"}</td>`; }).join("")}<td class="c"><b>${m.ev}</b></td></tr>`).join("")}</tbody></table>
    ${ptCara()}${ptTtd(P)}</section>`;
}

function ptRenderCetak(P) {
  return P.jenis === "ringkasan" ? ptHalRingkasan(P) : P.jenis === "kelas" ? ptHalKelas(P) : P.jenis === "mapel" ? ptHalMapel(P) : ptHalSiswa(P);
}

function ptTutup() {
  const el = document.getElementById("pt-layar"); if (el) el.remove();
  const gp = document.getElementById("gaya-pt-print"); if (gp) gp.remove();
  document.body.style.overflow = "";
  if (PT.onKey) { document.removeEventListener("keydown", PT.onKey); PT.onKey = null; }
  if (PT.onResize) { window.removeEventListener("resize", PT.onResize); PT.onResize = null; }
}

function ptPratinjau(P) {
  ptTutup();
  const gp = document.createElement("style"); gp.id = "gaya-pt-print"; document.head.appendChild(gp);
  const el = document.createElement("div"); el.id = "pt-layar";
  el.innerHTML = `
    <div class="cetak-bar no-print">
      <div class="cetak-bar-judul"><b>Pratinjau cetak</b><small>${esc(P.ringkas)}</small></div>
      <div class="aksi">
        <label>Kertas <select class="pilih" id="pt-orient"><option value="auto">Otomatis</option><option value="portrait">A4 Portrait</option><option value="landscape">A4 Landscape</option></select></label>
        <label>Tanggal TTD <input type="date" class="input" id="pt-tgl" value="${esc(P.tgl)}"></label>
        <label>Ketua Panitia <input type="text" class="input" id="pt-ketua" placeholder="Nama (boleh kosong)" value="${esc(P.ketua.nama)}"></label>
        <label>NIP <input type="text" class="input" id="pt-nip" placeholder="NIP (boleh kosong)" value="${esc(P.ketua.nip)}"></label>
        <button class="btn btn-primary" id="pt-print" type="button">🖨️ Cetak / Simpan PDF</button>
        <button class="btn" id="pt-tutup" type="button">Tutup</button>
      </div>
    </div>
    <p class="cetak-petunjuk no-print" id="pt-petunjuk"></p>
    <div class="pt-kertas" id="pt-kertas"></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  const gambar = () => {
    const o = ptOrient(P);
    gp.textContent = ptCssCetak(o);
    const k = $("#pt-kertas");
    k.classList.toggle("land", o === "landscape");
    k.innerHTML = ptRenderCetak(P);
    // Layar sempit (HP): kertas ditampilkan utuh lalu diperkecil agar muat selebar layar (bisa dicubit). Cetak/PDF tetap A4 asli.
    const lebar = (o === "landscape" ? 297 : 210) * 96 / 25.4;
    k.style.zoom = String(Math.min(1, Math.max(0.2, ($("#pt-layar").clientWidth - 16) / lebar)));
    $("#pt-petunjuk").innerHTML = `Kertas: <b>A4 ${o === "landscape" ? "Landscape" : "Portrait"}</b>${P.orient === "auto" ? " (otomatis sesuai jenis laporan)" : ""}. Klik <b>Cetak / Simpan PDF</b>, pilih printer atau <b>Simpan sebagai PDF</b>, dan matikan “Header dan footer” bila ada.`;
  };
  gambar();
  $("#pt-orient").onchange = (e) => { P.orient = e.target.value; gambar(); };
  $("#pt-tgl").onchange = (e) => { if (e.target.value) { P.tgl = e.target.value; gambar(); } };
  const simpan = () => { P.ketua = { nama: $("#pt-ketua").value, nip: $("#pt-nip").value }; ptKetuaSimpan(P.ketua); gambar(); };
  $("#pt-ketua").oninput = simpan; $("#pt-nip").oninput = simpan;
  $("#pt-tutup").onclick = ptTutup;
  $("#pt-print").onclick = () => window.print();
  PT.onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-bg")) ptTutup(); };
  document.addEventListener("keydown", PT.onKey);
  PT.onResize = () => { if (document.getElementById("pt-layar")) gambar(); };
  window.addEventListener("resize", PT.onResize);
}

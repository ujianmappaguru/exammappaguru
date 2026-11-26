"use strict";
// =====================================================================
//  BERANDA BARU  -  admin (rBerandaBaru) & guru (rBerandaGuruBaru)
//
//  File ini BERDIRI SENDIRI. Beranda lama di admin.js tidak dihapus
//  (hanya tidak dipanggil lagi), jadi bisa dikembalikan kapan saja
//  dengan mengganti 2 baris menu di admin.js.
//
//  Isi: sapaan + status ujian langsung, kartu ringkasan, ujian hari ini
//  (progres per ujian), perlu perhatian, tren kehadiran 7 hari, sebaran
//  siswa per kelas, aktifitas terbaru, cadangan data (admin).
//  "Kesiapan Sistem" sengaja dihapus.
//
//  Aturan data ujian sama dengan menu "Siswa Tidak Ikut Ujian":
//   - ujian nonaktif tetap dihitung bila pernah dikerjakan siswa,
//   - guru hanya melihat pasangan mapel + kelas yang ia ampu,
//   - "tidak ikut" hanya dihitung untuk ujian yang SUDAH berakhir.
// =====================================================================

(function pasangGayaBeranda() {
  if (document.getElementById("gaya-bn")) return;
  const st = document.createElement("style");
  st.id = "gaya-bn";
  st.textContent = `
.bn-live{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:1.1rem 1.25rem;backdrop-filter:blur(6px);color:#fff}
.bn-live-judul{display:flex;align-items:center;gap:.55rem;font-size:.74rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;opacity:.9}
.bn-dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;flex:none}
.bn-dot.on{background:#34d399;animation:bnDenyut 1.8s infinite}
@keyframes bnDenyut{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}70%{box-shadow:0 0 0 10px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
.bn-live-angka{font-size:2.5rem;font-weight:800;line-height:1.05;margin:.35rem 0 .1rem;color:var(--amber)}
.bn-live-ket{font-size:.85rem;opacity:.85}
.bn-live-baris{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:.85rem;padding-top:.75rem;border-top:1px solid rgba(255,255,255,.16)}
.bn-live-baris b{display:block;font-size:1.25rem;line-height:1.1}
.bn-live-baris span{font-size:.74rem;opacity:.8}

.bn-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:1rem;margin-bottom:1rem;align-items:start}
@media(max-width:900px){.bn-grid{grid-template-columns:1fr}}
.bn-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:.55rem;margin-bottom:.4rem}
.bn-strip div{background:var(--kertas);border:1px solid var(--garis);border-radius:12px;padding:.6rem .8rem}
.bn-strip b{display:block;font-size:1.45rem;line-height:1.1;color:var(--navy)}
.bn-strip span{font-size:.76rem;color:var(--tinta-2);font-weight:600}
.bn-strip .ok b{color:var(--ok)}.bn-strip .bhy b{color:var(--bahaya)}.bn-strip .inf b{color:var(--biru)}

.bn-uj{display:block;padding:.85rem 0;border-top:1px solid var(--garis);color:inherit;text-decoration:none}
.bn-uj:first-of-type{border-top:0}
.bn-uj:hover .bn-uj-nama{color:var(--biru)}
.bn-uj-atas{display:flex;justify-content:space-between;gap:.7rem;align-items:flex-start}
.bn-uj-nama{font-weight:700}
.bn-uj-atas small{display:block;color:var(--tinta-2);font-size:.78rem}
.bn-prog{display:flex;height:9px;border-radius:99px;overflow:hidden;background:#e4e9f2;margin:.55rem 0 .3rem}
.bn-prog i{display:block;height:100%}
.bn-prog .s{background:var(--ok)}.bn-prog .m{background:var(--amber)}
.bn-ket{font-size:.8rem;color:var(--tinta-2);display:flex;flex-wrap:wrap;gap:.2rem .9rem}
.bn-ket b{color:var(--tinta)}
.bn-ket .bhy{color:var(--bahaya);font-weight:700}

.bn-p{display:flex;align-items:center;gap:.8rem;padding:.7rem .75rem;border:1px solid var(--garis);border-radius:12px;margin-bottom:.55rem;color:inherit;text-decoration:none;background:#fff;transition:border-color .15s,transform .15s}
.bn-p:hover{border-color:var(--biru-garis);transform:translateY(-1px)}
.bn-p-ikon{flex:none;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-size:1.15rem;background:var(--peringatan-lembut)}
.bn-p.bhy .bn-p-ikon{background:var(--bahaya-lembut)}
.bn-p-isi{flex:1;min-width:0}
.bn-p-isi b{display:block;font-size:.9rem}
.bn-p-isi small{color:var(--tinta-2);font-size:.78rem}
.bn-p-n{flex:none;font-weight:800;font-size:1.15rem;color:var(--tinta)}

.bn-tren{display:flex;align-items:stretch;gap:.5rem;height:190px}
.bn-tren-kol{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:.25rem}
.bn-tren-batang{flex:1;width:100%;max-width:48px;display:flex;flex-direction:column;justify-content:flex-end;border-radius:9px 9px 3px 3px;overflow:hidden;background:var(--kertas)}
.bn-tren-batang i{display:block;width:100%}
.bn-tren-batang .ik{background:linear-gradient(180deg,#3b78f0,var(--biru))}
.bn-tren-batang .tk{background:#e5484d}
.bn-tren-pct{font-size:.74rem;font-weight:800;color:var(--navy);height:1.1em}
.bn-tren-hari{font-size:.7rem;color:var(--tinta-2);text-align:center;line-height:1.15}
.bn-legenda{display:flex;gap:1rem;margin-top:.7rem;font-size:.78rem;color:var(--tinta-2)}
.bn-legenda i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:.35rem;vertical-align:middle}

/* kartu ringkasan: laptop 3 kolom (admin) / 4 kolom (guru), HP 2 kolom yang dirapatkan */
.kpi-grid.bn-kpi{grid-template-columns:repeat(3,minmax(0,1fr))}
.kpi-grid.bn-kpi.empat{grid-template-columns:repeat(4,minmax(0,1fr))}
@media(max-width:1000px){.kpi-grid.bn-kpi.empat{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){
  .kpi-grid.bn-kpi,.kpi-grid.bn-kpi.empat{grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
  .bn-kpi .kpi-kartu{padding:.8rem .85rem;border-radius:14px}
  .bn-kpi .kpi-atas{margin-bottom:.5rem;gap:.4rem}
  .bn-kpi .kpi-ikon{width:32px;height:32px;font-size:1rem;flex:none}
  .bn-kpi .kpi-tag{font-size:.66rem;padding:.1rem .45rem;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bn-kpi .kpi-nilai{font-size:1.45rem}
  .bn-kpi .kpi-judul{font-size:.85rem;line-height:1.25}
  .bn-kpi .kpi-sub{font-size:.74rem;line-height:1.3}
}
.bn-chip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.7rem}
.bn-chip{border:1px solid var(--garis);border-radius:14px;padding:.8rem .95rem;background:#fff;box-shadow:var(--bayang-s)}
.bn-chip b{display:block;margin-bottom:.4rem}
`;
  document.head.appendChild(st);
})();

// ---------------------------------------------------------------------
//  Alat kecil
// ---------------------------------------------------------------------
const bnYmd = (t) => new Date((t instanceof Date ? t.getTime() : new Date(t).getTime()) + OFFSET_WITA_MS).toISOString().slice(0, 10);
const bnHariIni = () => witaKeInput(null).slice(0, 10);
const bnGeser = (ymd, n) => {
  const d = new Date(ymd + "T12:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + n);
  return bnYmd(d);
};
function bnSalam() {
  const jam = Number(fmtWITA(sekarangMs(), { hour: "2-digit", hour12: false })) % 24;
  return jam < 4 ? "Selamat malam" : jam < 11 ? "Selamat pagi" : jam < 15 ? "Selamat siang" : jam < 18 ? "Selamat sore" : "Selamat malam";
}
const bnAngka = (n) => Number(n || 0).toLocaleString("id-ID");
const bnKartu = (cls, href, ikon, tag, nilai, judul, sub) => `
  <a class="kpi-kartu ${cls}" href="${href}">
    <div class="kpi-atas"><span class="kpi-ikon">${ikon}</span><span class="kpi-tag">${esc(tag)}</span></div>
    <div class="kpi-nilai">${nilai}</div><div class="kpi-judul">${esc(judul)}</div>
    <div class="kpi-sub">${sub}</div>
  </a>`;

async function bnHitung(tabel, saring) {
  try {
    let q = sb.from(tabel).select("id", { count: "exact", head: true });
    if (saring) q = saring(q);
    const { count } = await q;
    return count || 0;
  } catch (_) { return 0; }
}

// ---------------------------------------------------------------------
//  Statistik ujian pada rentang tanggal (WITA)
//  Mengembalikan satu baris per ujian: peserta, selesai, mengerjakan, belum, status waktu
// ---------------------------------------------------------------------
async function bnUjianStat(dariYmd, sampaiYmd) {
  const awal = new Date(dariYmd + "T00:00:00+08:00");
  const akhir = new Date(sampaiYmd + "T23:59:59.999+08:00");
  const { data, error } = await sb.from("ujian")
    .select("id,judul,jenis_ujian,mapel_id,waktu_mulai,waktu_selesai,aktif,ujian_kelas(kelas_id)")
    .gte("waktu_selesai", awal.toISOString())
    .lte("waktu_mulai", akhir.toISOString())
    .order("waktu_mulai", { ascending: true })
    .limit(500);
  if (error) throw error;

  const pasangan = new Set(S.penugasan.map((p) => `${p.mapel_id}|${p.kelas_id}`));
  const kelasAda = new Set(S.kelas.map((k) => k.id));
  const daftar = [];
  (data || []).forEach((u) => {
    let kelasIds = (u.ujian_kelas || []).map((x) => x.kelas_id).filter((id) => kelasAda.has(id));
    if (PANEL === "guru") kelasIds = kelasIds.filter((id) => pasangan.has(`${u.mapel_id}|${id}`));
    if (kelasIds.length) daftar.push({ u, kelasIds });
  });

  const hasil = [];
  const ids = daftar.map((x) => x.u.id);
  for (let i = 0; i < ids.length; i += 25) {
    const potong = ids.slice(i, i + 25);
    hasil.push(...await semua("hasil_ujian", "id,ujian_id,siswa_id,status", (q) => q.in("ujian_id", potong)));
  }
  const peta = new Map();   // ujian_id -> { selesai, mengerjakan }
  hasil.forEach((h) => {
    if (!peta.has(h.ujian_id)) peta.set(h.ujian_id, { selesai: 0, mengerjakan: 0 });
    const c = peta.get(h.ujian_id);
    if (h.status === "selesai") c.selesai++;
    else if (h.status === "mengerjakan") c.mengerjakan++;
  });

  const aktifPerKelas = new Map();
  S.siswa.forEach((s) => { if (s.aktif !== false) aktifPerKelas.set(s.kelas_id, (aktifPerKelas.get(s.kelas_id) || 0) + 1); });

  const kini = sekarangMs();
  const out = [];
  daftar.forEach(({ u, kelasIds }) => {
    const c = peta.get(u.id) || { selesai: 0, mengerjakan: 0 };
    if (!u.aktif && !(c.selesai + c.mengerjakan)) return;   // nonaktif & tak pernah dikerjakan = batal
    const peserta = kelasIds.reduce((n, k) => n + (aktifPerKelas.get(k) || 0), 0);
    const mulai = new Date(u.waktu_mulai).getTime();
    const selesaiWaktu = new Date(u.waktu_selesai).getTime();
    const st = kini > selesaiWaktu ? "berakhir" : kini < mulai ? "terjadwal" : "berlangsung";
    const belum = Math.max(0, peserta - c.selesai - c.mengerjakan);
    out.push({ u, kelasIds, peserta, selesai: c.selesai, mengerjakan: c.mengerjakan, belum, st });
  });
  return out;
}

// ---------------------------------------------------------------------
//  Potongan tampilan bersama
// ---------------------------------------------------------------------
const BN_LABEL = { berlangsung: ["ok", "Berlangsung"], terjadwal: ["info", "Terjadwal"], berakhir: ["warn", "Berakhir"] };

function bnPanelHariIni(hari) {
  const hit = (st) => hari.filter((x) => x.st === st).length;
  const mengerjakan = hari.reduce((n, x) => n + (x.st === "berlangsung" ? x.mengerjakan : 0), 0);
  const tidakIkut = hari.reduce((n, x) => n + (x.st === "berakhir" ? x.belum : 0), 0);
  const urutan = { berlangsung: 0, terjadwal: 1, berakhir: 2 };
  const tampil = [...hari].sort((a, b) => urutan[a.st] - urutan[b.st] || new Date(a.u.waktu_mulai) - new Date(b.u.waktu_mulai)).slice(0, 8);

  return `<div class="panel-mewah">
    <div class="panel-kepala">
      <div><h3>Ujian Hari Ini</h3><p class="ket">Progres peserta setiap ujian secara langsung</p></div>
      <div class="alat-kiri"><button class="btn btn-kecil" type="button" id="bn-segar">Segarkan</button><a class="btn btn-kecil btn-primary" href="#monitor">Monitor</a></div>
    </div>
    <div class="bn-strip">
      <div class="ok"><b>${hit("berlangsung")}</b><span>Berlangsung</span></div>
      <div class="inf"><b>${hit("terjadwal")}</b><span>Terjadwal</span></div>
      <div><b>${hit("berakhir")}</b><span>Selesai</span></div>
      <div class="ok"><b>${mengerjakan}</b><span>Sedang mengerjakan</span></div>
      <div class="${tidakIkut ? "bhy" : ""}"><b>${tidakIkut}</b><span>Tidak ikut</span></div>
    </div>
    ${tampil.length ? tampil.map((x) => {
      const [kls, lbl] = BN_LABEL[x.st];
      const p = Math.max(1, x.peserta);
      const kelas = x.kelasIds.map(namaKelas).sort(urut).join(", ");
      return `<a class="bn-uj" href="#hasil">
        <div class="bn-uj-atas">
          <div><span class="bn-uj-nama">${esc(namaMapel(x.u.mapel_id))}</span>
            <small>${x.u.jenis_ujian ? esc(x.u.jenis_ujian) + " · " : ""}Kelas ${esc(kelas)} · ${esc(fmtWITA(x.u.waktu_mulai, { hour: "2-digit", minute: "2-digit" }))}–${esc(fmtWITA(x.u.waktu_selesai, { hour: "2-digit", minute: "2-digit" }))} WITA</small></div>
          <span class="badge ${kls}">${lbl}</span>
        </div>
        <div class="bn-prog" title="Selesai ${x.selesai}, mengerjakan ${x.mengerjakan}, belum ${x.belum}"><i class="s" style="width:${(x.selesai / p) * 100}%"></i><i class="m" style="width:${(x.mengerjakan / p) * 100}%"></i></div>
        <div class="bn-ket"><span><b>${x.selesai}</b>/${x.peserta} selesai</span>${x.mengerjakan ? `<span><b>${x.mengerjakan}</b> mengerjakan</span>` : ""}${x.st === "berakhir" ? (x.belum ? `<span class="bhy">${x.belum} tidak ikut</span>` : "<span>Semua ikut</span>") : `<span>${x.belum} belum mulai</span>`}</div>
      </a>`;
    }).join("") : kosong("Tidak ada ujian hari ini", "Ujian yang dijadwalkan atau berlangsung hari ini akan tampil di sini beserta progresnya.")}
    ${hari.length > tampil.length ? `<p class="ujian-catatan">dan ${hari.length - tampil.length} ujian lainnya. Buka menu Hasil Ujian untuk melihat semuanya.</p>` : ""}
  </div>`;
}

function bnPanelPerhatian(items) {
  const ada = items.filter((i) => i.n > 0);
  return `<div class="panel-mewah">
    <div class="panel-kepala"><div><h3>Perlu Perhatian</h3><p class="ket">Hal yang sebaiknya segera ditindaklanjuti</p></div></div>
    ${ada.length ? ada.map((i) => `<a class="bn-p ${i.bahaya ? "bhy" : ""}" href="${i.href}">
        <span class="bn-p-ikon">${i.ikon}</span>
        <span class="bn-p-isi"><b>${esc(i.judul)}</b><small>${esc(i.ket)}</small></span>
        <span class="bn-p-n">${bnAngka(i.n)}</span></a>`).join("")
      : '<div class="perhatian-ok">&#10003; Semuanya beres. Tidak ada yang perlu ditindaklanjuti saat ini.</div>'}
  </div>`;
}

function bnPanelTren(hari7, hariIni) {
  const hari = [];
  for (let i = 6; i >= 0; i--) hari.push(bnGeser(hariIni, -i));
  const peta = new Map(hari.map((d) => [d, { slot: 0, tidak: 0, ujian: 0 }]));
  hari7.forEach((x) => {
    if (x.st !== "berakhir") return;
    const c = peta.get(bnYmd(x.u.waktu_mulai));
    if (!c) return;
    c.slot += x.peserta; c.tidak += x.belum; c.ujian++;
  });
  const maks = Math.max(1, ...[...peta.values()].map((c) => c.slot));
  const totSlot = [...peta.values()].reduce((n, c) => n + c.slot, 0);
  const totTidak = [...peta.values()].reduce((n, c) => n + c.tidak, 0);
  const rata = totSlot ? Math.round(((totSlot - totTidak) / totSlot) * 100) : null;

  return `<div class="panel-mewah">
    <div class="panel-kepala">
      <div><h3>Kehadiran Ujian 7 Hari Terakhir</h3><p class="ket">${rata === null ? "Belum ada ujian yang berakhir pada 7 hari terakhir" : `Rata-rata kehadiran <b>${rata}%</b> · ${bnAngka(totTidak)} ketidakikutan`}</p></div>
      <a class="btn btn-kecil" href="#tidakikut">Lihat detail</a>
    </div>
    <div class="bn-tren">
      ${hari.map((d) => {
        const c = peta.get(d);
        const ikut = c.slot - c.tidak;
        const pct = c.slot ? Math.round((ikut / c.slot) * 100) : null;
        const tinggi = (c.slot / maks) * 100;
        return `<div class="bn-tren-kol" title="${esc(fmtWITA(new Date(d + "T12:00:00+08:00"), { weekday: "long", day: "numeric", month: "long" }))}: ${c.ujian} ujian, ${ikut} ikut, ${c.tidak} tidak ikut">
          <div class="bn-tren-pct">${pct === null ? "" : pct + "%"}</div>
          <div class="bn-tren-batang"><div style="height:${tinggi}%;display:flex;flex-direction:column;justify-content:flex-end;width:100%">
            <i class="tk" style="height:${c.slot ? (c.tidak / c.slot) * 100 : 0}%"></i><i class="ik" style="height:${c.slot ? (ikut / c.slot) * 100 : 0}%"></i></div></div>
          <div class="bn-tren-hari">${esc(fmtWITA(new Date(d + "T12:00:00+08:00"), { weekday: "short" }))}<br>${esc(fmtWITA(new Date(d + "T12:00:00+08:00"), { day: "numeric", month: "short" }))}</div>
        </div>`;
      }).join("")}
    </div>
    <div class="bn-legenda"><span><i style="background:var(--biru)"></i>Ikut ujian</span><span><i style="background:#e5484d"></i>Tidak ikut</span></div>
  </div>`;
}

// Ringkasan data langsung untuk hero (kotak kanan)
function bnHeroLive(hari) {
  const berlangsung = hari.filter((x) => x.st === "berlangsung");
  const mengerjakan = berlangsung.reduce((n, x) => n + x.mengerjakan, 0);
  const tidakIkut = hari.reduce((n, x) => n + (x.st === "berakhir" ? x.belum : 0), 0);
  const selesai = hari.reduce((n, x) => n + x.selesai, 0);
  return `<div class="bn-live">
    <div class="bn-live-judul"><span class="bn-dot ${berlangsung.length ? "on" : ""}"></span>${berlangsung.length ? "Sedang berlangsung" : "Status ujian"}</div>
    <div class="bn-live-angka">${berlangsung.length}</div>
    <div class="bn-live-ket">${berlangsung.length ? `ujian berjalan · ${mengerjakan} siswa mengerjakan` : hari.length ? `Tidak ada ujian berjalan · ${hari.length} ujian terjadwal hari ini` : "Tidak ada ujian hari ini"}</div>
    <div class="bn-live-baris"><div><b>${selesai}</b><span>Sudah selesai</span></div><div><b>${tidakIkut}</b><span>Tidak ikut</span></div></div>
  </div>`;
}

function bnKalimatHari(hari) {
  if (!hari.length) return "Tidak ada ujian terjadwal hari ini.";
  const b = hari.filter((x) => x.st === "berlangsung").length;
  const t = hari.filter((x) => x.st === "terjadwal").length;
  const e = hari.filter((x) => x.st === "berakhir").length;
  const bagian = [];
  if (b) bagian.push(`${b} berlangsung`);
  if (t) bagian.push(`${t} akan datang`);
  if (e) bagian.push(`${e} sudah selesai`);
  return `Hari ini ada ${hari.length} ujian: ${bagian.join(", ")}.`;
}

// ---------------------------------------------------------------------
//  BERANDA ADMIN
// ---------------------------------------------------------------------
async function rBerandaBaru() {
  await Promise.all([muatKelas(), muatMapel(), muatSiswa(), muatGuru(), muatRingkasanBank()]);
  const hariIni = bnHariIni();

  let hari7 = [], logTerbaru = [], esaiMenunggu = 0, galatUjian = "";
  const [r7, rLog, rEsai] = await Promise.allSettled([
    bnUjianStat(bnGeser(hariIni, -6), hariIni),
    sb.from("log_aktivitas").select("*").order("waktu", { ascending: false }).limit(6),
    bnHitung("hasil_ujian", (q) => q.eq("status", "selesai").eq("status_koreksi", "menunggu")),
  ]);
  if (r7.status === "fulfilled") hari7 = r7.value; else galatUjian = r7.reason && r7.reason.message ? r7.reason.message : String(r7.reason);
  if (rLog.status === "fulfilled") logTerbaru = (rLog.value && rLog.value.data) || [];
  if (rEsai.status === "fulfilled") esaiMenunggu = rEsai.value;

  const hari = hari7.filter((x) => bnYmd(x.u.waktu_mulai) === hariIni || x.st === "berlangsung");
  const siswaAktif = S.siswa.filter((s) => s.aktif !== false).length;
  const siswaL = S.siswa.filter((s) => s.aktif !== false && s.jenis_kelamin === "L").length;
  const siswaP = S.siswa.filter((s) => s.aktif !== false && s.jenis_kelamin === "P").length;
  const guruAktif = S.guru.filter((g) => g.aktif !== false);
  const bertugas = new Set(S.penugasan.map((p) => p.guru_id));
  const guruTanpaTugas = guruAktif.filter((g) => !bertugas.has(g.id)).length;
  const tidakIkut7 = hari7.reduce((n, x) => n + (x.st === "berakhir" ? x.belum : 0), 0);

  const masalahBank = S.banks.filter((b) =>
    b.jumlah === 0 || !b.kelas.length ||
    !S.penugasan.some((p) => p.mapel_id === b.mapel_id && b.kelas.includes(p.kelas_id))).length;

  const distKelas = S.kelas.map((k) => {
    const a = S.siswa.filter((s) => s.kelas_id === k.id && s.aktif !== false);
    return { nama: k.nama, total: a.length, l: a.filter((s) => s.jenis_kelamin === "L").length, p: a.filter((s) => s.jenis_kelamin === "P").length };
  });
  const maksKelas = Math.max(1, ...distKelas.map((d) => d.total));
  const sekarang = fmtWITA(sekarangMs(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  konten().innerHTML = `
    <section class="hero-mewah">
      <div class="hero-glow"></div>
      <div class="hero-top">
        <div>
          <div class="hero-pill"><span class="dot"></span><span>${esc(periodeAktifTeks())}</span><span>&middot;</span><span>${esc(sekarang)}</span></div>
          <h2>${bnSalam()}, ${esc(S.me.nama)}</h2>
          <p class="hero-desc">${galatUjian ? `Pusat kendali ujian <b>${esc(CONFIG.NAMA_SEKOLAH)}</b>.` : esc(bnKalimatHari(hari))}${!galatUjian && tidakIkut7 ? ` Dalam 7 hari terakhir tercatat <b>${bnAngka(tidakIkut7)}</b> ketidakikutan ujian.` : ""}</p>
        </div>
        ${bnHeroLive(hari)}
      </div>
      <div class="hero-aksi">
        <a class="btn btn-amber" href="#soal">+ Kelola Bank Soal</a>
        <a class="btn btn-glass" href="#monitor">Monitor Ujian</a>
        <a class="btn btn-glass" href="#hasil">Hasil Ujian${esaiMenunggu ? ` (${bnAngka(esaiMenunggu)})` : ""}</a>
        <a class="btn btn-glass" href="#tidakikut">Siswa Tidak Ikut</a>
        <button class="btn btn-glass" type="button" id="q-impor-siswa">Impor Siswa</button>
        <a class="btn btn-glass" href="#kartu">Kartu Login</a>
      </div>
    </section>

    <section class="kpi-grid bn-kpi" aria-label="Ringkasan utama">
      ${bnKartu("kpi-hijau", "#data/siswa", "🎓", `${siswaAktif} aktif`, bnAngka(S.siswa.length), "Total Siswa", `${siswaL} laki-laki · ${siswaP} perempuan`)}
      ${bnKartu("kpi-teal", "#data/guru", "👨‍🏫", `${guruAktif.length} aktif`, bnAngka(S.guru.length), "Total Guru", `${bertugas.size} guru sudah punya penugasan`)}
      ${bnKartu("kpi-biru", "#data/kelas", "🏫", "Rombel", bnAngka(S.kelas.length), "Total Kelas", `${S.mapel.length} mata pelajaran`)}
      ${bnKartu("kpi-amber", "#soal", "📝", `${S.banks.length} bank`, bnAngka(S.totalSoal), "Butir Soal", "Seluruh bank soal sekolah")}
      ${bnKartu("kpi-ungu", "#hasil", "🗓️", `${hari.filter((x) => x.st === "berlangsung").length} berlangsung`, bnAngka(hari.length), "Ujian Hari Ini", galatUjian ? "Data ujian belum bisa dimuat" : `${hari.reduce((n, x) => n + x.peserta, 0)} peserta terdaftar`)}
      ${bnKartu("kpi-navy", "#hasil", "✍️", esaiMenunggu ? "Perlu tindakan" : "Beres", bnAngka(esaiMenunggu), "Esai Menunggu Nilai", "Jawaban esai yang belum dinilai")}
    </section>

    ${galatUjian ? `<div class="galat-blok"><b>Data ujian belum bisa dimuat.</b><br>${esc(galatUjian)}</div>` : ""}

    <section class="bn-grid">
      ${bnPanelHariIni(hari)}
      ${bnPanelPerhatian([
        { ikon: "✍️", judul: "Esai menunggu penilaian", ket: "Buka Hasil Ujian lalu nilai jawaban esai", n: esaiMenunggu, href: "#hasil" },
        { ikon: "🚫", judul: "Siswa tidak ikut ujian", ket: "Dalam 7 hari terakhir (ujian yang sudah berakhir)", n: tidakIkut7, href: "#tidakikut", bahaya: true },
        { ikon: "📝", judul: "Bank soal belum lengkap", ket: "Kosong, belum punya kelas, atau belum ada guru pengampu", n: masalahBank, href: "#soal" },
        { ikon: "👨‍🏫", judul: "Guru belum punya penugasan", ket: "Guru aktif tanpa mapel dan kelas", n: guruTanpaTugas, href: "#data/guru" },
      ])}
    </section>

    <section class="panel-grid-2">
      ${bnPanelTren(hari7, hariIni)}
      <div class="panel-mewah">
        <div class="panel-kepala">
          <div><h3>Sebaran Siswa per Kelas</h3><p class="ket">Siswa aktif, laki-laki (L) dan perempuan (P)</p></div>
          <a class="btn btn-kecil" href="#data/siswa">Kelola Siswa</a>
        </div>
        ${distKelas.length ? `<div class="bar-list">${distKelas.map((d) => `<div class="bar-item">
            <div class="bar-label"><b>Kelas ${esc(d.nama)}</b><span class="mono">${d.total} siswa <small>(L:${d.l} · P:${d.p})</small></span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.round((d.total / maksKelas) * 100)}%"></div></div></div>`).join("")}</div>`
          : kosong("Belum ada kelas", "Tambahkan kelas di menu Data untuk melihat sebaran siswa.")}
      </div>
    </section>

    <section class="panel-grid-2">
      <div class="panel-mewah">
        <div class="panel-kepala">
          <div><h3>Aktifitas Terbaru</h3><p class="ket">Jejak perubahan data dan akun terakhir</p></div>
          <a class="btn btn-kecil" href="#log">Lihat Semua</a>
        </div>
        ${logTerbaru.length ? `<div class="log-feed">${logTerbaru.map((l) => `<div class="log-item"><span class="log-titik"></span>
            <div class="log-isi"><b>${esc(AKSI_LOG[l.aksi] || l.aksi)}</b><span class="mono">${esc(l.target || "-")}</span><small>${esc(waktu(l.waktu))}</small></div></div>`).join("")}</div>`
          : kosong("Belum ada aktifitas", "Perubahan data dan reset password akan muncul di sini.")}
      </div>
      <div class="panel-mewah">
        <div class="panel-kepala">
          <div><h3>Cadangan &amp; Ekspor Data</h3><p class="ket">Supabase paket gratis tidak membuat cadangan otomatis. Unduh data secara berkala.</p></div>
        </div>
        <div class="alat-kiri">
          <button class="btn" id="eks-siswa" type="button">Unduh Daftar Siswa (.xlsx)</button>
          <button class="btn" id="eks-guru" type="button">Unduh Daftar Guru (.xlsx)</button>
          <button class="btn btn-primary" id="eks-semua" type="button">Unduh Paket Cadangan Lengkap</button>
        </div>
      </div>
    </section>`;

  $("#eks-siswa").onclick = ekspSiswa;
  $("#eks-guru").onclick = ekspGuru;
  $("#eks-semua").onclick = ekspSemua;
  $("#q-impor-siswa").onclick = () => { location.hash = "data/siswa"; setTimeout(() => bukaImpor("siswa"), 120); };
  const segar = $("#bn-segar");
  if (segar) segar.onclick = () => rBerandaBaru();
}

// ---------------------------------------------------------------------
//  BERANDA GURU
// ---------------------------------------------------------------------
async function rBerandaGuruBaru() {
  await Promise.all([muatKelas(), muatMapel(), muatSiswa()]);
  const hariIni = bnHariIni();

  let hari7 = [], galatUjian = "";
  const [r7, rBank, rKerja, rEsai] = await Promise.allSettled([
    bnUjianStat(bnGeser(hariIni, -6), hariIni),
    bnHitung("bank"),
    bnHitung("hasil_ujian", (q) => q.eq("status", "mengerjakan")),
    bnHitung("hasil_ujian", (q) => q.eq("status", "selesai").eq("status_koreksi", "menunggu")),
  ]);
  if (r7.status === "fulfilled") hari7 = r7.value; else galatUjian = r7.reason && r7.reason.message ? r7.reason.message : String(r7.reason);
  const jmlBank = rBank.status === "fulfilled" ? rBank.value : 0;
  const jmlKerja = rKerja.status === "fulfilled" ? rKerja.value : 0;
  const jmlEsai = rEsai.status === "fulfilled" ? rEsai.value : 0;

  const hari = hari7.filter((x) => bnYmd(x.u.waktu_mulai) === hariIni || x.st === "berlangsung");
  const tidakIkut7 = hari7.reduce((n, x) => n + (x.st === "berakhir" ? x.belum : 0), 0);
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
          <h2>${bnSalam()}, ${esc(S.me.nama)}</h2>
          <p class="hero-desc">${galatUjian ? `Susun soal, pantau ujian, dan nilai esai siswa Anda di <b>${esc(CONFIG.NAMA_SEKOLAH)}</b>.` : esc(bnKalimatHari(hari))}${!galatUjian && jmlEsai ? ` Ada <b>${bnAngka(jmlEsai)}</b> jawaban esai yang menunggu penilaian Anda.` : ""}</p>
        </div>
        ${bnHeroLive(hari)}
      </div>
      <div class="hero-aksi">
        <a class="btn btn-amber" href="#soal">+ Kelola Bank Soal</a>
        <a class="btn btn-glass" href="#monitor">Monitor Ujian</a>
        <a class="btn btn-glass" href="#hasil">Hasil &amp; Penilaian${jmlEsai ? ` (${bnAngka(jmlEsai)})` : ""}</a>
        <a class="btn btn-glass" href="#tidakikut">Siswa Tidak Ikut</a>
      </div>
    </section>

    <section class="kpi-grid bn-kpi empat" aria-label="Ringkasan">
      ${bnKartu("kpi-biru", "#soal", "📝", "Bank soal", bnAngka(jmlBank), "Bank Soal Saya", `${S.mapel.length} mapel · ${S.kelas.length} kelas diampu`)}
      ${bnKartu("kpi-ungu", "#hasil", "🗓️", `${hari.filter((x) => x.st === "berlangsung").length} berlangsung`, bnAngka(hari.length), "Ujian Hari Ini", galatUjian ? "Data ujian belum bisa dimuat" : `${hari.reduce((n, x) => n + x.peserta, 0)} peserta terdaftar`)}
      ${bnKartu("kpi-hijau", "#monitor", "🚀", "Langsung", bnAngka(jmlKerja), "Sedang Mengerjakan", "Siswa yang sedang mengerjakan ujian")}
      ${bnKartu("kpi-amber", "#hasil", "✍️", jmlEsai ? "Perlu tindakan" : "Beres", bnAngka(jmlEsai), "Esai Menunggu Nilai", "Jawaban siswa yang belum Anda nilai")}
    </section>

    ${galatUjian ? `<div class="galat-blok"><b>Data ujian belum bisa dimuat.</b><br>${esc(galatUjian)}</div>` : ""}

    <section class="bn-grid">
      ${bnPanelHariIni(hari)}
      ${bnPanelPerhatian([
        { ikon: "✍️", judul: "Esai menunggu penilaian", ket: "Buka Hasil Ujian lalu nilai jawaban esai", n: jmlEsai, href: "#hasil" },
        { ikon: "🚫", judul: "Siswa tidak ikut ujian", ket: "Dalam 7 hari terakhir pada mapel & kelas Anda", n: tidakIkut7, href: "#tidakikut", bahaya: true },
      ])}
    </section>

    <section class="panel-grid-2">
      ${bnPanelTren(hari7, hariIni)}
      <div class="panel-mewah">
        <div class="panel-kepala"><div><h3>Mapel &amp; Kelas yang Saya Ampu</h3><p class="ket">Sesuai penugasan dari admin sekolah</p></div></div>
        ${perMapel.size ? `<div class="bn-chip-grid">${[...perMapel].sort((a, b) => urut(namaMapel(a[0]), namaMapel(b[0]))).map(([mid, ks]) => `<div class="bn-chip">
            <b>${esc(namaMapel(mid))}</b>${ks.map(namaKelas).sort(urut).map((n) => `<span class="badge info">${esc(n)}</span>`).join(" ")}</div>`).join("")}</div>`
          : kosong("Belum ada penugasan", "Admin belum menugaskan Anda ke mata pelajaran dan kelas mana pun. Hubungi admin sekolah.")}
      </div>
    </section>`;

  const segar = $("#bn-segar");
  if (segar) segar.onclick = () => rBerandaGuruBaru();
}
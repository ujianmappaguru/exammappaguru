"use strict";
// =====================================================================
//  ADMIN & GURU - MONITOR UJIAN (#monitor) + PENGATURAN ANTI CURANG
//
//  Monitor: satu panggilan ringan (monitor_ujian) tiap 15-60 detik, hanya
//  saat halaman terbuka dan tab terlihat. Log rinci per siswa baru diambil
//  saat tombol "Rincian" diklik.
//
//  Pengaturan (khusus admin): kartu "Anti curang & lokasi ujian" yang
//  disisipkan ke menu Pengaturan oleh cetak.js.
//
//  Butuh 22_anti_curang_monitor.sql sudah dijalankan di Supabase.
// =====================================================================
const MN = {
  ujianId: "", kelas: "", status: "", cari: "", urut: "kelas", jeda: 20,
  ujian: [], data: null, t0: 0, timer: null, memuat: false,
  pilih: new Set(),   // siswa_id yang dicentang untuk reset massal
};

const mnEpochSekarang = () => (MN.data ? MN.data.server_epoch + (performance.now() - MN.t0) / 1000 : Date.now() / 1000);
const mnWaktu = (t) => (t ? fmtWITA(t, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");
const mnJam = (epoch) => (epoch ? fmtWITA(new Date(epoch * 1000), { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-");

const MN_LABEL = {
  pindah_aplikasi: ["Pindah aplikasi / tab", "off"],
  kehilangan_fokus: ["Jendela kehilangan fokus", "off"],
  keluar_layar_penuh: ["Keluar layar penuh", "off"],
  layar_terbagi: ["Layar terbagi / split-screen", "off"],
  keluar_area: ["Keluar area ujian", "off"],
  lompat_lokasi: ["Lokasi melompat (curiga fake GPS)", "off"],
  gps_mati: ["GPS tidak terbaca", "off"],
  lokasi_ditolak: ["Lokasi ditolak saat mulai", "warn"],
  ganti_perangkat: ["Ujian dibuka di perangkat lain", "warn"],
  salin_tempel: ["Mencoba salin / tempel", "warn"],
  cetak: ["Mencoba cetak / screenshot", "warn"],
  kembali_aktif: ["Kembali ke halaman ujian", "ok"],
  ke_daftar: ["Keluar ke daftar ujian", "warn"],
  offline: ["Koneksi terputus", "warn"],
  reset: ["Pelanggaran direset pengawas", "ok"],
};

function mnStatusAktivitas(b) {
  // Hanya relevan saat siswa sedang mengerjakan.
  if (b.status !== "mengerjakan") return { k: "-", teks: "-" };
  if (!b.aktif_epoch) return { k: "putus", teks: "Belum ada laporan" };
  const selang = Math.max(0, mnEpochSekarang() - b.aktif_epoch);
  const iv = (MN.data && MN.data.anticurang && MN.data.anticurang.interval) || 45;
  const menit = Math.round(selang / 60);
  if (selang <= iv * 2 + 20) return { k: "aktif", teks: "Aktif" };
  if (selang <= iv * 6) return { k: "senyap", teks: `Senyap ${menit < 1 ? "<1" : menit} mnt` };
  return { k: "putus", teks: `Terputus ${menit} mnt` };
}

async function rMonitor() {
  await muatMapel();
  const { data, error } = await sb.from("ujian")
    .select("id,judul,jenis_ujian,mapel_id,waktu_mulai,waktu_selesai,aktif,durasi_menit")
    .order("waktu_mulai", { ascending: false }).limit(300);
  if (error) throw error;
  MN.ujian = data || [];

  if (!MN.ujian.length) {
    konten().innerHTML = kosong("Belum ada ujian", "Belum ada ujian yang bisa dipantau.");
    return;
  }
  if (!MN.ujian.some((u) => u.id === MN.ujianId)) {
    const kini = sekarangMs();
    const berjalan = MN.ujian.find((u) => new Date(u.waktu_mulai).getTime() <= kini && kini <= new Date(u.waktu_selesai).getTime());
    MN.ujianId = (berjalan || MN.ujian[0]).id;
    MN.kelas = "";
  }

  konten().innerHTML = `
    <div class="alat mn-alat">
      <div class="alat-kiri">
        <select class="pilih" id="mn-ujian" aria-label="Pilih ujian">
          ${MN.ujian.map((u) => `<option value="${u.id}" ${u.id === MN.ujianId ? "selected" : ""}>${u.jenis_ujian ? esc(u.jenis_ujian) + " · " : ""}${esc(u.judul)} · ${esc(namaMapel(u.mapel_id))} · ${esc(mnWaktu(u.waktu_mulai))}</option>`).join("")}
        </select>
        <select class="pilih" id="mn-kelas" aria-label="Filter kelas"></select>
        <select class="pilih" id="mn-status" aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="mengerjakan">Sedang mengerjakan</option>
          <option value="bermasalah">Perlu perhatian</option>
          <option value="selesai">Selesai</option>
          <option value="belum">Belum mulai</option>
        </select>
        <input class="input" id="mn-cari" type="search" placeholder="Cari nama / NISN" aria-label="Cari siswa">
      </div>
      <div class="alat-kanan">
        <select class="pilih" id="mn-jeda" aria-label="Segarkan otomatis">
          <option value="15">Segarkan tiap 15 dtk</option>
          <option value="20">Segarkan tiap 20 dtk</option>
          <option value="30">Segarkan tiap 30 dtk</option>
          <option value="60">Segarkan tiap 60 dtk</option>
          <option value="0">Manual</option>
        </select>
        <button class="btn" id="mn-cetak" type="button">🖨️ Cetak laporan</button>
        <button class="btn btn-primary" id="mn-segar" type="button">Segarkan</button>
      </div>
    </div>
    <div id="mn-isi"><p class="memuat">Memuat...</p></div>`;

  $("#mn-ujian").onchange = (e) => { MN.ujianId = e.target.value; MN.kelas = ""; MN.pilih = new Set(); mnMuat(); };
  $("#mn-kelas").onchange = (e) => { MN.kelas = e.target.value; mnGambar(); };
  $("#mn-status").onchange = (e) => { MN.status = e.target.value; mnGambar(); };
  $("#mn-cari").oninput = (e) => { MN.cari = e.target.value; mnGambar(); };
  $("#mn-jeda").onchange = (e) => { MN.jeda = Number(e.target.value); mnJadwal(); };
  $("#mn-segar").onclick = () => mnMuat();
  $("#mn-cetak").onclick = () => lpDialog();
  $("#mn-status").value = MN.status;
  $("#mn-cari").value = MN.cari;
  $("#mn-jeda").value = String(MN.jeda);

  await mnMuat();
  mnJadwal();
}

// Polling hanya berjalan bila: halaman monitor terbuka, tab terlihat, tidak ada modal.
function mnJadwal() {
  clearInterval(MN.timer);
  MN.timer = null;
  if (!MN.jeda) return;
  MN.timer = setInterval(() => {
    if (!location.hash.startsWith("#monitor") || !$("#mn-isi")) { clearInterval(MN.timer); MN.timer = null; return; }
    if (document.hidden || document.querySelector(".modal-bg")) return;
    mnMuat(true).catch(() => {});
  }, MN.jeda * 1000);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && MN.timer && location.hash.startsWith("#monitor") && $("#mn-isi")) mnMuat(true).catch(() => {});
});

async function mnMuat(senyap = false) {
  if (MN.memuat) return;
  MN.memuat = true;
  const isi = $("#mn-isi");
  if (isi && !senyap) isi.innerHTML = '<p class="memuat">Memuat...</p>';
  try {
    const { data, error } = await sb.rpc("monitor_ujian", { p_ujian_id: MN.ujianId });
    if (error) {
      const hilang = error.code === "PGRST202" || /could not find the function/i.test(error.message || "");
      throw new Error(hilang ? "Fungsi monitor belum terpasang. Jalankan 22_anti_curang_monitor.sql di Supabase." : error.message);
    }
    MN.data = data;
    MN.t0 = performance.now();
    const kls = [...new Set((data.baris || []).map((b) => b.kelas))].sort(urut);
    const sel = $("#mn-kelas");
    if (sel) {
      sel.innerHTML = `<option value="">Semua kelas</option>` +
        kls.map((k) => `<option value="${esc(k)}" ${MN.kelas === k ? "selected" : ""}>${esc(k)}</option>`).join("");
    }
    mnGambar();
  } catch (e) {
    if (isi && !senyap) isi.innerHTML = `<div class="galat-blok"><b>Gagal memuat monitor.</b><br>${esc(e.message || e)}</div>`;
  } finally {
    MN.memuat = false;
  }
}

function mnPerluPerhatian(b, maks) {
  const akt = mnStatusAktivitas(b).k;
  return b.status === "mengerjakan" && (b.pelanggaran > 0 || b.lokasi_ok === false || akt === "putus" || akt === "senyap")
    || (b.pelanggaran >= maks && maks > 0);
}

function mnGambar() {
  const isi = $("#mn-isi");
  const D = MN.data;
  if (!isi || !D) return;
  const ac = D.anticurang || {};
  const maks = ac.maks || 0;
  const semua = D.baris || [];
  const c = norm(MN.cari);

  let daftar = semua.filter((b) =>
    (!MN.kelas || b.kelas === MN.kelas) &&
    (!MN.status || (MN.status === "bermasalah" ? mnPerluPerhatian(b, maks) : b.status === MN.status)) &&
    (!c || norm(b.nama).includes(c) || norm(b.nisn).includes(c)));

  const rank = { mengerjakan: 0, belum: 1, selesai: 2 };
  daftar = daftar.sort((a, b) =>
    (rank[a.status] - rank[b.status]) ||
    (mnPerluPerhatian(b, maks) - mnPerluPerhatian(a, maks)) ||
    (b.pelanggaran - a.pelanggaran) ||
    urut(a.kelas, b.kelas) || urut(a.nama, b.nama));

  // Reset massal: hanya siswa yang punya pelanggaran. Buang pilihan yang sudah tidak relevan.
  const bisaReset = daftar.filter((b) => (b.pelanggaran || 0) > 0);
  const idAdaPel = new Set(semua.filter((b) => (b.pelanggaran || 0) > 0).map((b) => b.siswa_id));
  MN.pilih.forEach((id) => { if (!idAdaPel.has(id)) MN.pilih.delete(id); });
  const adaPilih = !!ac.aktif && bisaReset.length > 0;

  const hit = (st) => semua.filter((b) => b.status === st).length;
  const nKerja = hit("mengerjakan"), nSelesai = hit("selesai"), nBelum = hit("belum");
  const nMasalah = semua.filter((b) => b.pelanggaran > 0).length;
  const nLuar = semua.filter((b) => b.status === "mengerjakan" && b.lokasi_ok === false).length;
  const nPutus = semua.filter((b) => ["senyap", "putus"].includes(mnStatusAktivitas(b).k)).length;
  const kartu = (ikon, angka, label, warna = "") =>
    `<div class="mn-kartu ${warna}"><span class="mn-ikon" aria-hidden="true">${ikon}</span><div><div class="mn-angka">${angka}</div><div class="mn-label">${label}</div></div></div>`;

  const total = D.total_soal || 0;
  const kini = mnEpochSekarang();

  isi.innerHTML = `
    ${ac.aktif ? "" : `<div class="catatan">Anti curang sedang <b>nonaktif</b> (atau belum diatur). Status & progres tetap tampil, tetapi pelanggaran, lokasi, dan aktivitas tidak dicatat. Atur di menu Pengaturan (khusus admin).</div>`}
    <div class="mn-stat">
      ${kartu("👥", semua.length, "Peserta")}
      ${kartu("✍️", nKerja, "Mengerjakan", "warn")}
      ${kartu("✅", nSelesai, "Selesai", "ok")}
      ${kartu("⏳", nBelum, "Belum mulai", "abu")}
      ${ac.aktif ? kartu("⚠️", nMasalah, "Ada pelanggaran", nMasalah ? "off" : "ok") : ""}
      ${ac.aktif && ac.wajib_gps ? kartu("📍", nLuar, "Di luar area", nLuar ? "off" : "ok") : ""}
      ${kartu("📶", nPutus, "Senyap / terputus", nPutus ? "warn" : "ok")}
    </div>
    <p class="ket mn-ket">Diperbarui ${esc(mnJam(D.server_epoch))} WITA${MN.jeda ? ` · otomatis tiap ${MN.jeda} detik` : " · manual"}. Status &ldquo;Aktif&rdquo; berarti ada laporan dari perangkat siswa dalam ±${(ac.interval || 45) * 2} detik terakhir.</p>
    ${adaPilih ? `<div class="mn-massal">
      <label class="mn-massal-semua"><input type="checkbox" id="mn-pilih-semua"> Pilih semua yang ada pelanggaran (<span id="mn-n-bisa">${bisaReset.length}</span>)</label>
      <button class="btn btn-kecil btn-danger" type="button" id="mn-reset-massal">Reset pelanggaran terpilih (<span id="mn-n-pilih">0</span>)</button>
    </div>` : ""}
    ${daftar.length ? `<div class="tabel-bungkus mn-tabel"><table class="resp"><thead><tr>
      ${adaPilih ? '<th class="mn-cek"></th>' : ""}<th>No</th><th>Siswa</th><th>Kelas</th><th>Status / Progres</th><th>Aktivitas</th><th>Perangkat</th>
      ${ac.wajib_gps ? "<th>Lokasi</th>" : ""}<th>Pelanggaran</th><th></th></tr></thead><tbody>
      ${daftar.map((b, i) => {
        const akt = mnStatusAktivitas(b);
        const kerja = b.status === "mengerjakan";
        const t = Math.min(b.terjawab || 0, total);
        const p = total ? Math.round((t / total) * 100) : 0;
        const bat = kerja && b.mulai_pada ? Math.min(new Date(b.mulai_pada).getTime() / 1000 + (D.durasi_menit || 0) * 60, new Date(D.waktu_selesai).getTime() / 1000) : 0;
        const sisaMnt = kerja && bat ? Math.max(0, Math.round((bat - kini) / 60)) : null;
        const stBadge = b.status === "selesai" ? '<span class="badge ok">Selesai</span>'
          : kerja ? '<span class="badge warn">Mengerjakan</span>' : '<span class="badge off">Belum</span>';
        const pel = b.pelanggaran || 0;
        const pelKelas = !pel ? "ok" : (maks && pel >= maks) ? "off" : "warn";
        let lok = "-";
        if (b.lokasi_ok === true) lok = `<span class="badge ok">Di area</span>${b.jarak_m != null ? `<small>${Math.round(b.jarak_m)} m</small>` : ""}`;
        else if (b.lokasi_ok === false) lok = `<span class="badge off">Di luar area</span>${b.jarak_m != null ? `<small>${Math.round(b.jarak_m)} m</small>` : ""}`;
        return `<tr class="${mnPerluPerhatian(b, maks) ? "mn-baris-masalah" : ""}">
          ${adaPilih ? `<td data-label="Pilih" class="mn-cek">${pel > 0 ? `<input type="checkbox" data-pilih="${b.siswa_id}" aria-label="Pilih ${esc(b.nama)}"${MN.pilih.has(b.siswa_id) ? " checked" : ""}>` : ""}</td>` : ""}
          <td data-label="No" class="angka">${i + 1}</td>
          <td data-label="Siswa"><b>${esc(b.nama)}</b><small class="mono">${esc(b.nisn)}</small></td>
          <td data-label="Kelas">${esc(b.kelas)}</td>
          <td data-label="Status">${stBadge}${kerja ? `<div class="hp-mini"><div class="hp-bar"><i class="m" style="width:${p}%"></i></div><small>${t}/${total} soal · ${p}%${sisaMnt != null ? ` · sisa ~${sisaMnt} mnt` : ""}</small></div>` : ""}</td>
          <td data-label="Aktivitas">${kerja ? `<span class="mn-titik ${akt.k}"></span>${esc(akt.teks)}` : "-"}</td>
          <td data-label="Perangkat">${b.info ? `${esc(b.info)}${b.layar ? `<small>${b.layar === "penuh" ? "Layar penuh" : "Layar biasa"}</small>` : ""}` : "-"}</td>
          ${ac.wajib_gps ? `<td data-label="Lokasi">${lok}</td>` : ""}
          <td data-label="Pelanggaran"><span class="badge ${pelKelas}">${pel}${maks ? ` / ${maks}` : ""}</span></td>
          <td class="aksi">
            <button class="btn btn-kecil" data-rinci="${b.siswa_id}" data-nama="${esc(b.nama)}">Rincian</button>
            ${pel > 0 ? `<button class="btn btn-kecil" data-reset="${b.siswa_id}" data-nama="${esc(b.nama)}">Reset</button>` : ""}
          </td></tr>`;
      }).join("")}
      </tbody></table></div>`
      : kosong("Tidak ada data", "Ubah filter, atau pastikan ujian ini sudah ditujukan ke kelas peserta.")}`;

  isi.querySelectorAll("[data-rinci]").forEach((b) => { b.onclick = () => mnRincian(b.dataset.rinci, b.dataset.nama); });
  isi.querySelectorAll("[data-reset]").forEach((b) => { b.onclick = () => mnReset(b.dataset.reset, b.dataset.nama); });

  // --- reset massal ---
  const idBisa = bisaReset.map((b) => b.siswa_id);
  const perbaruiPilih = () => {
    const n = idBisa.filter((id) => MN.pilih.has(id)).length;
    const tn = $("#mn-n-pilih"); if (tn) tn.textContent = String(n);
    const tb = $("#mn-reset-massal"); if (tb) tb.disabled = n === 0;
    const ts = $("#mn-pilih-semua");
    if (ts) { ts.checked = n > 0 && n === idBisa.length; ts.indeterminate = n > 0 && n < idBisa.length; }
  };
  isi.querySelectorAll("[data-pilih]").forEach((c) => {
    c.onchange = () => { if (c.checked) MN.pilih.add(c.dataset.pilih); else MN.pilih.delete(c.dataset.pilih); perbaruiPilih(); };
  });
  const cekSemua = $("#mn-pilih-semua");
  if (cekSemua) cekSemua.onchange = () => {
    idBisa.forEach((id) => { if (cekSemua.checked) MN.pilih.add(id); else MN.pilih.delete(id); });
    isi.querySelectorAll("[data-pilih]").forEach((c) => { c.checked = cekSemua.checked; });
    perbaruiPilih();
  };
  const tombolMassal = $("#mn-reset-massal");
  if (tombolMassal) tombolMassal.onclick = () => mnResetMassal(idBisa.filter((id) => MN.pilih.has(id)), semua);
  perbaruiPilih();
}

// Reset pelanggaran banyak siswa sekaligus (memakai fungsi reset satuan, beberapa permintaan paralel).
async function mnResetMassal(ids, semua) {
  if (!ids.length) return;
  const nama = (id) => ((semua.find((b) => b.siswa_id === id) || {}).nama) || id;
  const contoh = ids.slice(0, 5).map((id) => esc(nama(id))).join(", ") + (ids.length > 5 ? `, dan ${ids.length - 5} lainnya` : "");
  const ya = await konfirmasi(
    `Reset hitungan pelanggaran <b>${ids.length} siswa</b> menjadi 0?<br><small>${contoh}</small><br><br>Riwayat kejadian tetap tersimpan, dan pengawas yang mereset tercatat.`,
    { ya: `Ya, reset ${ids.length} siswa`, bahaya: true, judul: "Reset massal pelanggaran" });
  if (!ya) return;
  const tombol = $("#mn-reset-massal");
  if (tombol) { tombol.disabled = true; tombol.textContent = "Mereset..."; }
  const ujianId = MN.ujianId;
  let ok = 0; const gagal = [];
  await antre(ids, 4, async (id) => {
    try {
      const { error } = await sb.rpc("reset_pelanggaran_ujian", { p_ujian_id: ujianId, p_siswa_id: id });
      if (error) throw error;
      ok++; MN.pilih.delete(id);
    } catch (e) { gagal.push({ id, pesan: (e && e.message) || String(e) }); }
  });
  if (!gagal.length) toast(`Pelanggaran ${ok} siswa direset.`, "ok");
  else toast(`${ok} siswa berhasil direset, ${gagal.length} gagal: ${gagal[0].pesan}`, "error");
  mnMuat(true).catch(() => {}).then(() => { if (ujianId === MN.ujianId) mnGambar(); });
}

async function mnReset(siswaId, nama) {
  const ya = await konfirmasi(`Reset hitungan pelanggaran <b>${esc(nama)}</b> menjadi 0? Riwayat kejadian tetap tersimpan, dan pengawas yang mereset tercatat.`, { ya: "Ya, reset" });
  if (!ya) return;
  const { error } = await sb.rpc("reset_pelanggaran_ujian", { p_ujian_id: MN.ujianId, p_siswa_id: siswaId });
  if (error) { toast(error.message, "error"); return; }
  toast("Pelanggaran direset.", "ok");
  mnMuat(true).catch(() => {});
}

async function mnRincian(siswaId, nama) {
  const m = tampilModal(`Rincian: ${nama}`, '<p class="memuat">Memuat...</p>', { lebar: "sedang", aksi: [{ label: "Tutup", kelas: "btn-primary" }] });
  try {
    const { data, error } = await sb.rpc("monitor_log_siswa", { p_ujian_id: MN.ujianId, p_siswa_id: siswaId });
    if (error) throw error;
    if (!data || !data.ada) { m.body.innerHTML = '<p class="ket">Belum ada data pemantauan untuk siswa ini.</p>'; return; }
    const log = (data.log || []).slice().reverse();
    const lat = data.lat, lng = data.lng;
    const selang = data.aktif_epoch ? Math.max(0, data.server_epoch - data.aktif_epoch) : null;
    m.body.innerHTML = `
      <div class="hasil-modal-identitas" style="margin-bottom:1rem">
        <div><small>Pelanggaran</small><b>${data.pelanggaran}</b></div>
        <div><small>Perangkat</small><b>${esc(data.info || "-")}</b></div>
        <div><small>Tampilan</small><b>${data.layar === "penuh" ? "Layar penuh" : data.layar === "biasa" ? "Layar biasa" : "-"}</b></div>
        <div><small>Laporan terakhir</small><b>${data.aktif_epoch ? `${esc(mnJam(data.aktif_epoch))} WITA${selang != null ? ` (${selang < 90 ? selang + " dtk" : Math.round(selang / 60) + " mnt"} lalu)` : ""}` : "-"}</b></div>
        ${lat != null ? `<div><small>Lokasi terakhir</small><b>${data.jarak_m != null ? Math.round(data.jarak_m) + " m dari titik ujian · " : ""}akurasi ${data.akurasi != null ? Math.round(data.akurasi) + " m" : "-"}
          <br><a href="https://www.google.com/maps?q=${encodeURIComponent(lat + "," + lng)}" target="_blank" rel="noopener noreferrer">Lihat di peta</a></b></div>` : ""}
      </div>
      <div class="sl-judul" style="margin-bottom:.4rem">Riwayat kejadian (40 terakhir)</div>
      ${log.length ? `<div class="mn-log">${log.map((e) => {
        const [teks, jenis] = MN_LABEL[e.j] || [e.j, "warn"];
        let ekstra = "";
        if (e.d != null) {
          if (["pindah_aplikasi", "kembali_aktif"].includes(e.j)) ekstra = ` · ${e.d} dtk`;
          else if (["keluar_area", "lompat_lokasi"].includes(e.j)) ekstra = ` · ${e.d} m`;
        }
        return `<div class="mn-log-baris"><span class="mono">${esc(mnJam(e.t))}</span><span class="badge ${jenis}">${esc(teks)}${esc(ekstra)}</span></div>`;
      }).join("")}</div>` : '<p class="ket">Belum ada kejadian tercatat.</p>'}`;
  } catch (e) {
    m.body.innerHTML = `<div class="galat-blok">${esc(e.message || e)}</div>`;
  }
}

// =====================================================================
//  PENGATURAN ANTI CURANG (kartu di menu Pengaturan, khusus admin)
// =====================================================================
async function rPengaturanAntiCurang(el) {
  if (!el || PANEL !== "admin") return;
  const { data, error } = await sb.from("pengaturan_anticurang").select("*").eq("id", 1).maybeSingle();
  if (error) {
    el.innerHTML = `<div class="panel-mewah"><div class="panel-kepala"><h3>Anti curang &amp; lokasi ujian</h3></div>
      <div class="galat-blok">${esc(error.message)}. Pastikan <b>22_anti_curang_monitor.sql</b> sudah dijalankan di Supabase.</div></div>`;
    return;
  }
  const c = data || {};
  const ang = (v, d) => (v === null || v === undefined ? d : v);
  el.innerHTML = `
    <div class="panel-mewah">
      <div class="panel-kepala"><h3>Anti curang &amp; lokasi ujian</h3></div>
      <p class="ket">Berlaku untuk semua ujian siswa (Android &amp; iPhone). Pelanggaran dicatat dan bisa dipantau di menu <b>Monitor Ujian</b>.</p>

      <label class="f ac-cek"><input type="checkbox" data-ac-f="aktif" ${c.aktif !== false ? "checked" : ""}> <span><b>Aktifkan anti curang</b><small>Deteksi pindah aplikasi/tab, split-screen, salin-tempel, dan satu akun satu perangkat.</small></span></label>
      <label class="f ac-cek"><input type="checkbox" data-ac-f="wajib_layar_penuh" ${c.wajib_layar_penuh !== false ? "checked" : ""}> <span><b>Wajib layar penuh</b><small>Android &amp; iPad/laptop: otomatis. iPhone: siswa diminta memakai &ldquo;Tambah ke Layar Utama&rdquo; (Safari iPhone tidak mendukung layar penuh).</small></span></label>
      <label class="f ac-cek"><input type="checkbox" data-ac-f="wajib_gps" ${c.wajib_gps ? "checked" : ""}> <span><b>Wajib GPS (ujian hanya di area sekolah)</b><small>Lokasi diperiksa di server. Bila diaktifkan, titik lokasi di bawah wajib diisi.</small></span></label>

      <div class="ac-gps" id="ac-gps">
        <div class="baris2">
          <label class="f">Latitude
            <input class="input" data-ac-f="gps_lat" inputmode="decimal" autocomplete="off" placeholder="-5.147665" value="${ang(c.gps_lat, "")}"></label>
          <label class="f">Longitude
            <input class="input" data-ac-f="gps_lng" inputmode="decimal" autocomplete="off" placeholder="119.432732" value="${ang(c.gps_lng, "")}"></label>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin:.2rem 0 .8rem">
          <button class="btn btn-kecil" type="button" id="ac-lokasi-saya">📍 Gunakan lokasi saya sekarang</button>
          <a class="btn btn-kecil" id="ac-peta" href="#" target="_blank" rel="noopener noreferrer">Lihat di peta</a>
          <span class="ket" id="ac-lokasi-info"></span>
        </div>
        <p class="ket" style="margin-top:-.3rem">Tips: berdiri di tengah sekolah (di luar ruangan, GPS aktif) lalu tekan tombol di atas. Atau buka Google Maps, tekan lama pada lokasi sekolah, lalu salin angka koordinatnya.</p>
        <div class="baris2">
          <label class="f">Jarak maksimal dari titik (meter)
            <input class="input" type="number" min="10" max="50000" step="10" data-ac-f="gps_radius_m" value="${ang(c.gps_radius_m, 200)}"></label>
          <label class="f">Akurasi GPS terburuk yang diterima (meter)
            <input class="input" type="number" min="10" max="2000" step="10" data-ac-f="gps_akurasi_maks_m" value="${ang(c.gps_akurasi_maks_m, 150)}"></label>
        </div>
        <p class="ket">Radius 150-300 m cocok untuk satu sekolah. Di dalam gedung GPS sering kurang akurat, jadi jangan terlalu kecil. Aplikasi lokasi palsu (fake GPS) bisa menipu browser; sistem mengurangi risikonya dengan menolak lokasi tak valid dan mendeteksi lompatan lokasi.</p>
      </div>

      <div class="baris2" style="margin-top:.6rem">
        <label class="f">Batas pelanggaran
          <input class="input" type="number" min="1" max="20" data-ac-f="maks_pelanggaran" value="${ang(c.maks_pelanggaran, 3)}"></label>
        <label class="f">Bila melebihi batas
          <select class="pilih" data-ac-f="aksi_melebihi">
            <option value="kumpul" ${c.aksi_melebihi !== "catat" ? "selected" : ""}>Kumpulkan ujian otomatis</option>
            <option value="catat" ${c.aksi_melebihi === "catat" ? "selected" : ""}>Hanya catat &amp; peringatkan</option>
          </select></label>
      </div>
      <label class="f">Interval laporan perangkat siswa (detik)
        <input class="input" type="number" min="20" max="180" data-ac-f="interval_detik" value="${ang(c.interval_detik, 45)}"></label>
      <p class="ket" id="ac-beban"></p>

      <div class="sl-judul" style="margin:1rem 0 .4rem">Waktu minimal mengerjakan</div>
      <label class="f">Siswa baru boleh mengumpulkan setelah (menit)
        <input class="input" type="number" min="0" max="600" step="1" data-ac-f="waktu_minimal_menit" value="${ang(c.waktu_minimal_menit, 0)}"></label>
      <p class="ket">Isi <b>0</b> untuk menonaktifkan. Berlaku untuk semua ujian dan tetap aktif walau fitur anti curang dimatikan. Dihitung sejak siswa mulai mengerjakan memakai jam server, jadi mengubah jam HP tidak berpengaruh. Bila angka ini lebih besar dari durasi sebuah ujian, batasnya otomatis dipotong sampai 1 menit sebelum waktu habis. Pengumpulan otomatis karena batas pelanggaran tidak ikut ditahan.</p>

      <div style="margin-top:.8rem"><button class="btn btn-primary" id="ac-simpan" type="button">Simpan anti curang</button></div>
    </div>`;

  const f = (k) => el.querySelector(`[data-ac-f="${k}"]`);
  const ringkas = () => {
    const iv = Math.max(20, Number(f("interval_detik").value) || 45);
    $("#ac-beban").textContent = `Perkiraan beban server: 100 siswa mengerjakan bersamaan ≈ ${(100 / iv).toFixed(1)} laporan kecil per detik. Makin besar intervalnya, makin ringan.`;
    const la = Number(f("gps_lat").value), lo = Number(f("gps_lng").value);
    const p = $("#ac-peta");
    if (f("gps_lat").value && f("gps_lng").value && isFinite(la) && isFinite(lo)) { p.href = `https://www.google.com/maps?q=${encodeURIComponent(la + "," + lo)}`; p.style.opacity = ""; }
    else { p.href = "#"; p.style.opacity = ".45"; }
    $("#ac-gps").classList.toggle("mati", !f("wajib_gps").checked);
  };
  el.addEventListener("input", ringkas);
  el.addEventListener("change", ringkas);
  ringkas();

  $("#ac-lokasi-saya").onclick = () => {
    const info = $("#ac-lokasi-info");
    if (!window.isSecureContext || !navigator.geolocation) { info.textContent = "Browser/alamat ini tidak mendukung GPS (butuh HTTPS)."; return; }
    info.textContent = "Membaca lokasi...";
    navigator.geolocation.getCurrentPosition((pos) => {
      f("gps_lat").value = pos.coords.latitude.toFixed(6);
      f("gps_lng").value = pos.coords.longitude.toFixed(6);
      info.textContent = `Terisi (akurasi ±${Math.round(pos.coords.accuracy)} m). Jangan lupa simpan.`;
      ringkas();
    }, (e) => {
      info.textContent = e.code === 1 ? "Izin lokasi ditolak di browser ini." : "Lokasi tidak terbaca. Coba di tempat terbuka.";
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  $("#ac-simpan").onclick = async () => {
    const tombol = $("#ac-simpan"); tombol.disabled = true;
    try {
      const angka = (k, min, max, nama) => {
        const n = Number(f(k).value);
        if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nama} harus berupa angka ${min} sampai ${max}.`);
        return Math.round(n);
      };
      const wajibGps = f("wajib_gps").checked;
      let lat = null, lng = null;
      if (f("gps_lat").value.trim() !== "" || f("gps_lng").value.trim() !== "" || wajibGps) {
        lat = Number(f("gps_lat").value.replace(",", ".")); lng = Number(f("gps_lng").value.replace(",", "."));
        if (f("gps_lat").value.trim() === "" || f("gps_lng").value.trim() === "" || !isFinite(lat) || !isFinite(lng)
          || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          if (wajibGps) throw new Error("Isi latitude dan longitude yang valid (contoh -5.147665 dan 119.432732).");
          lat = null; lng = null;
        }
      }
      const isi = {
        id: 1,
        aktif: f("aktif").checked,
        wajib_layar_penuh: f("wajib_layar_penuh").checked,
        wajib_gps: wajibGps,
        gps_lat: lat, gps_lng: lng,
        gps_radius_m: angka("gps_radius_m", 10, 50000, "Jarak maksimal"),
        gps_akurasi_maks_m: angka("gps_akurasi_maks_m", 10, 2000, "Akurasi GPS"),
        maks_pelanggaran: angka("maks_pelanggaran", 1, 20, "Batas pelanggaran"),
        aksi_melebihi: f("aksi_melebihi").value === "catat" ? "catat" : "kumpul",
        interval_detik: angka("interval_detik", 20, 180, "Interval laporan"),
        waktu_minimal_menit: angka("waktu_minimal_menit", 0, 600, "Waktu minimal"),
        diubah: new Date().toISOString(),
      };
      const { error: e1 } = await sb.from("pengaturan_anticurang").upsert(isi);
      if (e1) throw new Error(e1.message + (/waktu_minimal_menit/i.test(e1.message || "") ? ". Jalankan 26_waktu_minimal.sql di Supabase." : ""));
      try { await sb.from("log_aktivitas").insert({ pelaku: S.me.id, aksi: "ubah_pengaturan_anticurang", target: isi.aktif ? "aktif" : "nonaktif" }); } catch (_) { /* abaikan */ }
      toast("Pengaturan anti curang disimpan.", "ok");
    } catch (err) {
      toast(err.message || String(err), "error");
    } finally {
      tombol.disabled = false;
    }
  };
}


// =====================================================================
//  LAPORAN PELANGGARAN (cetak A4 / tampilan HP) - dibuka dari tombol
//  "Cetak laporan" di Monitor Ujian. Memakai kop, pratinjau, dan tanda
//  tangan dari cetak.js. Butuh 27_laporan_pelanggaran.sql.
//
//  Tiga mode: per kelas, per mapel, per siswa. Semua siswa tampil
//  (urut abjad nama), NISN di bawah nama, lengkap dengan jam kejadian.
// =====================================================================
const LP_HITUNG = ["pindah_aplikasi", "kehilangan_fokus", "keluar_layar_penuh", "layar_terbagi", "keluar_area", "lompat_lokasi", "gps_mati"];

// epoch detik -> teks ISO yang sudah digeser ke WITA ("2026-11-21T09:14:05.000Z")
const lpWita = (t) => new Date(Number(t) * 1000 + OFFSET_WITA_MS).toISOString();
function lpHariKey(x) {
  const ms = new Date(x).getTime();
  return Number.isNaN(ms) ? "" : new Date(ms + OFFSET_WITA_MS).toISOString().slice(0, 10);
}
const lpGalat = (e) => (e && (e.code === "PGRST202" || /could not find the function/i.test(e.message || ""))
  ? "Fungsi laporan belum terpasang. Jalankan 27_laporan_pelanggaran.sql di Supabase."
  : (e && e.message) || String(e));
const lpBelumTeks = (u) => (ctUjianBerakhir(u) ? "Tidak ikut ujian" : "Belum mengerjakan");

// Satu baris laporan dari satu baris data RPC. c = { u, maks, aktifKumpul }
function lpBaris(b, c) {
  const jumlah = Number(b.pelanggaran) || 0;
  const log = Array.isArray(b.log) ? b.log : [];
  const kej = log.filter((e) => e && Number(e.t) > 0 && (LP_HITUNG.includes(e.j) || e.j === "reset"));
  let kode = "belum", status = lpBelumTeks(c.u);
  if (b.status === "mengerjakan") { kode = "kerja"; status = "Belum mengumpulkan"; }
  else if (b.status === "selesai") {
    if (c.aktifKumpul && c.maks > 0 && jumlah >= c.maks) { kode = "batas"; status = "Dikumpulkan otomatis"; }
    else { kode = "selesai"; status = "Selesai"; }
  }
  return { jumlah, kej, potong: log.length >= 40, kode, status, refKey: lpHariKey(b.mulai_pada || c.u.waktu_mulai) };
}

// Daftar jam + jenis kejadian (kolom terakhir tabel / bagian bawah kartu HP)
function lpKejHtml(r) {
  if (!r.kej.length) return '<span>&ndash;</span>';
  const baris = r.kej.map((e) => {
    const w = lpWita(e.t);
    const jam = (w.slice(0, 10) === r.refKey ? "" : `${w.slice(8, 10)}/${w.slice(5, 7)} `) + w.slice(11, 16);
    if (e.j === "reset") return `<div class="lp-kej lp-reset"><span class="lp-jam">${jam}</span><span>&#8634; Pelanggaran direset pengawas</span></div>`;
    const teks = (MN_LABEL[e.j] || [e.j])[0];
    let ekstra = "";
    if (e.d != null) {
      if (e.j === "pindah_aplikasi") ekstra = ` (${e.d} dtk)`;
      else if (e.j === "keluar_area" || e.j === "lompat_lokasi") ekstra = ` (${e.d} m)`;
    }
    return `<div class="lp-kej"><span class="lp-jam">${jam}</span><span>${esc(teks + ekstra)}</span></div>`;
  }).join("");
  return baris + (r.potong ? '<div class="lp-catatan">Riwayat dibatasi 40 kejadian terakhir.</div>' : "");
}

// Tabel (kertas) + kartu (layar HP). CSS memilih salah satu.
function lpTabel(rows, judulKol) {
  const tabel = `<div class="lp-tabel-wrap"><table class="cetak-tabel lp-tabel">
    <thead><tr><th style="width:6%">No.</th><th style="width:31%">${esc(judulKol)}</th><th style="width:15%">Status</th><th style="width:9%">Jumlah</th><th>Waktu &amp; jenis pelanggaran</th></tr></thead>
    <tbody>${rows.length ? rows.map((r, i) => `<tr>
      <td class="c">${i + 1}</td><td>${r.utama}</td><td class="c">${esc(r.status)}</td>
      <td class="c">${r.jumlah ? `<b>${r.jumlah}</b>` : "0"}</td><td class="c">${lpKejHtml(r)}</td></tr>`).join("")
      : '<tr><td colspan="5" class="c">Tidak ada data.</td></tr>'}</tbody></table></div>`;
  const kartu = `<div class="lp-kartu-wrap">${rows.map((r, i) => `<div class="lp-kartu">
      <div class="lp-k-atas"><div class="lp-k-no">${i + 1}.</div><div class="lp-k-nama">${r.utama}</div>
        <div class="lp-k-jml">${r.jumlah}<small>pelanggaran</small></div></div>
      <div class="lp-k-status">${esc(r.status)}</div>
      ${r.kej.length ? `<div class="lp-k-kej">${lpKejHtml(r)}</div>` : ""}</div>`).join("")}</div>`;
  return tabel + kartu;
}

function lpRingkas(rows, u) {
  const n = rows.length;
  const absen = rows.filter((r) => r.kode === "belum").length;
  const melanggar = rows.filter((r) => r.jumlah > 0).length;
  const batas = rows.filter((r) => r.kode === "batas").length;
  const total = rows.reduce((a, r) => a + r.jumlah, 0);
  const item = [`Jumlah siswa: <b>${n}</b>`, `Melanggar: <b>${melanggar}</b>`, `Tanpa pelanggaran: <b>${n - absen - melanggar}</b>`, `Total pelanggaran: <b>${total}</b>`];
  if (absen) item.push(`${esc(lpBelumTeks(u))}: <b>${absen}</b>`);
  if (batas) item.push(`Batas pelanggaran tercapai: <b>${batas}</b>`);
  return item.join(" &nbsp;|&nbsp; ");
}

function lpBlokTtd(P, mapelNama, c, pil, idx) {
  const pilih = pil.length > 1
    ? `<div class="no-print"><select class="pilih" data-ttd="${idx}">${pil.map((g, i) => `<option value="${i}" ${i === pil.sel ? "selected" : ""}>${esc(g.nama)}</option>`).join("")}</select></div>` : "";
  return `<div class="ttd-blok">
      <div>${ctTempatTgl(P)}</div>
      <div>Guru ${esc(mapelNama)},</div>
      <div class="ttd-ruang"></div>
      <div class="ttd-nama">${ctNamaTtd(c)}</div>
      <div>NIP. ${esc(ctNip(c))}</div>${pilih}</div>`;
}

function lpHalamanKelas(P, sc, idx) {
  const u = P.u;
  const c = sc.calon[sc.pil];
  sc.calon.sel = sc.pil;
  return `<section class="cetak-hal lp">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">LAPORAN PELANGGARAN UJIAN</h2>
    ${ctSub(u.jenis_ujian, sc.tahun)}
    <table class="cetak-bio">
      <tr><td>Mata Pelajaran</td><td>:</td><td><b>${esc(P.mapelNama)}</b></td></tr>
      ${u.judul && norm(u.judul) !== norm(P.mapelNama) ? `<tr><td>Ujian</td><td>:</td><td>${esc(u.judul)}</td></tr>` : ""}
      <tr><td>Kelas</td><td>:</td><td><b>${esc(sc.kelasNama)}</b></td></tr>
      ${sc.tahun ? `<tr><td>Tahun Ajaran</td><td>:</td><td>${esc(sc.tahun)}</td></tr>` : ""}
      <tr><td>Tanggal Ujian</td><td>:</td><td>${esc(ctTglUjian(u))}</td></tr>
      ${P.maks > 0 ? `<tr><td>Batas Pelanggaran</td><td>:</td><td>${P.maks} kali${P.aktifKumpul ? " (ujian dikumpulkan otomatis)" : ""}</td></tr>` : ""}
    </table>
    ${lpTabel(sc.rows, "Nama Siswa / NISN")}
    <div class="cetak-ringkas">${lpRingkas(sc.rows, u)}</div>
    <div class="cetak-ttd">${lpBlokTtd(P, P.mapelNama, c, sc.calon, idx)}</div>
  </section>`;
}

// Halaman rekap per kelas (hanya mode per mapel dengan lebih dari satu kelas)
function lpHalamanRekap(P) {
  const u = P.u;
  const th = P.sections[0] ? P.sections[0].tahun : "";
  const baris = P.sections.map((sc) => {
    const n = sc.rows.length, absen = sc.rows.filter((r) => r.kode === "belum").length;
    const mel = sc.rows.filter((r) => r.jumlah > 0).length;
    const tot = sc.rows.reduce((a, r) => a + r.jumlah, 0);
    const bat = sc.rows.filter((r) => r.kode === "batas").length;
    return { sc, n, mel, tanpa: n - absen - mel, absen, tot, bat };
  });
  const jml = (k) => baris.reduce((a, b) => a + b[k], 0);
  return `<section class="cetak-hal lp">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">REKAP PELANGGARAN UJIAN</h2>
    ${ctSub(u.jenis_ujian, th)}
    <table class="cetak-bio">
      <tr><td>Mata Pelajaran</td><td>:</td><td><b>${esc(P.mapelNama)}</b></td></tr>
      ${u.judul && norm(u.judul) !== norm(P.mapelNama) ? `<tr><td>Ujian</td><td>:</td><td>${esc(u.judul)}</td></tr>` : ""}
      ${th ? `<tr><td>Tahun Ajaran</td><td>:</td><td>${esc(th)}</td></tr>` : ""}
      <tr><td>Tanggal Ujian</td><td>:</td><td>${esc(ctTglUjian(u))}</td></tr>
      ${P.maks > 0 ? `<tr><td>Batas Pelanggaran</td><td>:</td><td>${P.maks} kali${P.aktifKumpul ? " (ujian dikumpulkan otomatis)" : ""}</td></tr>` : ""}
    </table>
    <div class="lp-rekap-bungkus"><table class="cetak-tabel">
      <thead><tr><th>Kelas</th><th>Siswa</th><th>Melanggar</th><th>Tanpa pelanggaran</th><th>Tidak ikut</th><th>Total</th></tr></thead>
      <tbody>${baris.map((b) => `<tr><td class="c"><b>${esc(b.sc.kelasNama)}</b></td><td class="c">${b.n}</td><td class="c">${b.mel}</td><td class="c">${b.tanpa}</td><td class="c">${b.absen}</td><td class="c">${b.tot}</td></tr>`).join("")}
      <tr><td class="c"><b>Jumlah</b></td><td class="c"><b>${jml("n")}</b></td><td class="c"><b>${jml("mel")}</b></td><td class="c"><b>${jml("tanpa")}</b></td><td class="c"><b>${jml("absen")}</b></td><td class="c"><b>${jml("tot")}</b></td></tr></tbody>
    </table></div>
    <div class="cetak-ringkas">Rincian siswa dan waktu pelanggaran tiap kelas ada pada halaman berikutnya.</div>
  </section>`;
}

function lpHalamanSiswa(P) {
  const s = P.siswa;
  const total = P.rows.reduce((a, r) => a + r.jumlah, 0);
  const mel = P.rows.filter((r) => r.jumlah > 0).length;
  const blok = P.ttd.map((t, i) => { t.calon.sel = t.pil; return lpBlokTtd(P, ctNamaMapel(t.mapelId), t.calon[t.pil], t.calon, i); }).join("");
  return `<section class="cetak-hal lp">
    ${kopHtml(P.pg, P.urlKiri, P.urlKanan)}
    <h2 class="cetak-judul">LAPORAN PELANGGARAN UJIAN SISWA</h2>
    ${ctSub("", P.tahun)}
    <table class="cetak-bio">
      <tr><td>Nama Siswa</td><td>:</td><td><b>${esc(s.nama)}</b></td></tr>
      <tr><td>NISN</td><td>:</td><td>${esc(s.username)}</td></tr>
      <tr><td>Kelas</td><td>:</td><td><b>${esc(P.kelasNama)}</b></td></tr>
      ${P.tahun ? `<tr><td>Tahun Ajaran</td><td>:</td><td>${esc(P.tahun)}</td></tr>` : ""}
      ${P.maks > 0 ? `<tr><td>Batas Pelanggaran</td><td>:</td><td>${P.maks} kali per ujian</td></tr>` : ""}
    </table>
    ${lpTabel(P.rows, "Mata Pelajaran / Tanggal")}
    <div class="cetak-ringkas">Ujian diikuti: <b>${P.rows.length}</b> &nbsp;|&nbsp; Ujian dengan pelanggaran: <b>${mel}</b> &nbsp;|&nbsp; Total pelanggaran: <b>${total}</b></div>
    ${blok ? `<div class="cetak-ttd-grid"><div class="cetak-ttd-baris">${blok}</div></div>` : ""}
  </section>`;
}

function lpRender(P) {
  if (P.mode === "siswa") return lpHalamanSiswa(P);
  const hal = P.sections.map((sc, i) => lpHalamanKelas(P, sc, i)).join("");
  return (P.mode === "mapel" && P.sections.length > 1 ? lpHalamanRekap(P) : "") + hal;
}

// ---------- menyusun data ----------
async function lpSusun(o) {
  const [pg, G] = await Promise.all([ctPengaturan(), ctMuatGuru()]);
  const P = {
    mode: o.mode, pg, G, render: lpRender,
    urlKiri: pgUrlLogo(pg.logo_kiri), urlKanan: pgUrlLogo(pg.logo_kanan),
    tgl: witaKeInput(null).slice(0, 10), sections: [],
  };

  if (o.mode === "siswa") {
    const s = S.siswa.find((x) => x.id === o.siswaId);
    if (!s) throw new Error("Siswa tidak ditemukan.");
    const { data, error } = await sb.rpc("laporan_pelanggaran_siswa", { p_siswa_id: s.id });
    if (error) throw new Error(lpGalat(error));
    const ac = data.anticurang || {};
    const c0 = { maks: Number(ac.maks) || 0, aktifKumpul: ac.aksi === "kumpul" };
    const rows = (data.baris || []).map((b) => {
      const r = lpBaris(b, { ...c0, u: b });
      const mapel = namaMapel(b.mapel_id);
      const sub = [b.jenis_ujian, b.judul && norm(b.judul) !== norm(mapel) ? b.judul : ""].filter(Boolean).join(" · ");
      r.mapelId = b.mapel_id;
      r.urutMapel = mapel;
      r.mulai = new Date(b.waktu_mulai).getTime();
      r.utama = `<div><b>${esc(mapel)}</b></div>${sub ? `<div class="nisn">${esc(sub)}</div>` : ""}<div class="nisn">${esc(ctTgl(b.mulai_pada || b.waktu_mulai))}</div>`;
      return r;
    }).sort((a, b) => urut(a.urutMapel, b.urutMapel) || a.mulai - b.mulai);
    if (!rows.length) throw new Error("Siswa ini belum mengikuti ujian apa pun.");
    const kls = S.kelas.find((k) => k.id === s.kelas_id) || {};
    P.siswa = s; P.kelasNama = kls.nama || "-"; P.tahun = kls.tahun_ajaran || tahunAjaranAktif();
    P.maks = c0.maks; P.rows = rows;
    P.ttd = [...new Set(rows.filter((r) => r.jumlah > 0).map((r) => r.mapelId))]
      .map((mid) => ({ mapelId: mid, calon: ctCalonGuru(G, mid, s.kelas_id), pil: 0 }));
    P.ringkas = `${s.nama} · ${P.kelasNama} · ${rows.length} ujian`;
    return P;
  }

  const { data, error } = await sb.rpc("laporan_pelanggaran_ujian", { p_ujian_id: o.ujianId });
  if (error) throw new Error(lpGalat(error));
  const u = data.ujian;
  const ac = data.anticurang || {};
  P.u = u; P.mapelNama = namaMapel(u.mapel_id);
  P.maks = Number(ac.maks) || 0; P.aktifKumpul = ac.aksi === "kumpul";

  const kelasOk = new Set(S.kelas.map((k) => k.id));
  const peta = new Map();
  (data.baris || []).forEach((b) => {
    if (!kelasOk.has(b.kelas_id)) return;
    if (o.mode === "kelas" && b.kelas_id !== o.kelasId) return;
    if (!peta.has(b.kelas_id)) peta.set(b.kelas_id, []);
    peta.get(b.kelas_id).push(b);
  });
  if (!peta.size) throw new Error("Tidak ada siswa yang bisa dilaporkan untuk pilihan ini.");

  const kelasIds = [...peta.keys()].sort((a, b) => urut(namaKelas(a), namaKelas(b)));
  P.sections = kelasIds.map((kid) => {
    const kls = S.kelas.find((k) => k.id === kid) || {};
    const rows = peta.get(kid).slice().sort((a, b) => urut(a.nama, b.nama)).map((b) => {
      const r = lpBaris(b, { u, maks: P.maks, aktifKumpul: P.aktifKumpul });
      r.utama = `<div><b>${esc(b.nama)}</b></div><div class="nisn">NISN: ${esc(b.nisn)}</div>`;
      return r;
    });
    return { kelasId: kid, kelasNama: kls.nama || "-", tahun: kls.tahun_ajaran || tahunAjaranAktif(), rows, calon: ctCalonGuru(G, u.mapel_id, kid), pil: 0 };
  });
  const total = P.sections.reduce((n, sc) => n + sc.rows.length, 0);
  P.ringkas = `${P.mapelNama} · ${P.sections.map((sc) => sc.kelasNama).join(", ")} · ${total} siswa`;
  return P;
}

// ---------- dialog pilihan ----------
async function lpDialog() {
  try { await Promise.all([muatKelas(), muatMapel(), muatSiswa()]); }
  catch (e) { return toast("Gagal memuat data: " + (e.message || e), "error"); }
  if (!MN.ujian.length) return toast("Belum ada ujian.", "error");

  const kelasOk = new Set(S.kelas.map((k) => k.id));
  const cache = new Map();
  const kelasUjian = async (ujianId) => {
    if (!cache.has(ujianId)) {
      const { data, error } = await sb.from("ujian_kelas").select("kelas_id").eq("ujian_id", ujianId);
      if (error) throw error;
      cache.set(ujianId, (data || []).map((x) => x.kelas_id).filter((id) => kelasOk.has(id))
        .sort((a, b) => urut(namaKelas(a), namaKelas(b))));
    }
    return cache.get(ujianId);
  };
  const awalKelas = (S.kelas.find((k) => k.nama === MN.kelas) || {}).id || "";
  const radio = (v, teks, ket, cek) => `<label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><input type="radio" name="lp-mode" value="${v}" ${cek ? "checked" : ""}> ${teks} <small class="ket">${ket}</small></label>`;

  const html = `
    <div class="f"><div class="sl-judul">Jenis laporan</div>
      ${radio("kelas", "Per kelas", "(satu mapel, satu kelas)", true)}
      ${radio("mapel", "Per mapel", "(satu mapel, semua kelas pesertanya)", false)}
      ${radio("siswa", "Per siswa", "(semua mapel yang ia ikuti)", false)}
    </div>
    <label class="f" id="lp-b-ujian">Pilih ujian / mata pelajaran
      <select class="pilih" id="lp-ujian">${MN.ujian.map((u) => `<option value="${u.id}" ${u.id === MN.ujianId ? "selected" : ""}>${u.jenis_ujian ? esc(u.jenis_ujian) + " · " : ""}${esc(namaMapel(u.mapel_id))} · ${esc(u.judul)} · ${esc(mnWaktu(u.waktu_mulai))}</option>`).join("")}</select></label>
    <label class="f" id="lp-b-kelas">Kelas<select class="pilih" id="lp-kelas"></select></label>
    <p class="ket" id="lp-info-mapel" hidden></p>
    <label class="f" id="lp-b-siswa" hidden>Siswa<select class="pilih" id="lp-siswa"></select></label>
    <p class="ket">Semua siswa ditampilkan, urut abjad nama, lengkap dengan jam kejadian pelanggaran. Pratinjau bisa dicetak atau disimpan sebagai PDF.</p>`;

  const m = tampilModal("Cetak laporan pelanggaran", html, {
    lebar: "sedang",
    aksi: [{ label: "Batal" }, {
      label: "Tampilkan pratinjau", kelas: "btn-primary",
      onClick: async () => {
        const md = mode();
        const o = { mode: md, ujianId: q("#lp-ujian").value, kelasId: q("#lp-kelas").value, siswaId: q("#lp-siswa").value };
        if (md === "kelas" && !o.kelasId) throw new Error("Pilih kelas dulu.");
        if (md === "siswa" && !o.siswaId) throw new Error("Pilih siswa dulu.");
        ctPratinjau(await lpSusun(o));
      },
    }],
  });
  const q = (s) => m.body.querySelector(s);
  const mode = () => m.body.querySelector('input[name="lp-mode"]:checked').value;

  const isiSiswa = () => {
    const daftar = S.siswa.filter((s) => s.kelas_id === q("#lp-kelas").value).sort((a, b) => urut(a.nama, b.nama));
    q("#lp-siswa").innerHTML = daftar.length ? daftar.map((s) => `<option value="${s.id}">${esc(s.nama)} (${esc(s.username)})</option>`).join("")
      : '<option value="">(tidak ada siswa)</option>';
  };
  const isiKelas = async () => {
    const md = mode(), sel = q("#lp-kelas");
    let ids = [];
    try {
      ids = md === "siswa" ? S.kelas.map((k) => k.id).sort((a, b) => urut(namaKelas(a), namaKelas(b))) : await kelasUjian(q("#lp-ujian").value);
    } catch (_) { ids = []; }
    const pilih = sel.value || awalKelas;
    sel.innerHTML = ids.length ? ids.map((id) => `<option value="${id}" ${id === pilih ? "selected" : ""}>${esc(namaKelas(id))}</option>`).join("")
      : '<option value="">(tidak ada kelas)</option>';
    if (md === "mapel") q("#lp-info-mapel").textContent = ids.length ? "Kelas yang dicetak: " + ids.map(namaKelas).join(", ") : "Ujian ini belum ditujukan ke kelas yang bisa Anda lihat.";
    if (md === "siswa") isiSiswa();
  };
  const atur = () => {
    const md = mode();
    q("#lp-b-ujian").hidden = md === "siswa";
    q("#lp-b-kelas").hidden = md === "mapel";
    q("#lp-info-mapel").hidden = md !== "mapel";
    q("#lp-b-siswa").hidden = md !== "siswa";
    return isiKelas();
  };
  m.body.addEventListener("change", (e) => {
    if (e.target.name === "lp-mode" || e.target.id === "lp-ujian") atur();
    else if (e.target.id === "lp-kelas" && mode() === "siswa") isiSiswa();
  });
  atur();
}
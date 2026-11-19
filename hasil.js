"use strict";
// =====================================================================
//  ADMIN - MENU HASIL UJIAN (#hasil)
//  Progres & rekap nilai per ujian, filter kelas/status, unduh Excel,
//  penilaian esai manual (tombol "Nilai"), dan - khusus admin -
//  "Izinkan ulang" (hapus hasil siswa agar bisa mengerjakan lagi).
//  Dipakai admin dan guru (guru hanya melihat mapel & kelas yang diampu).
// =====================================================================
const HU = { ujianId: "", kelas: "", status: "", cari: "", ujian: [], hasil: [], peserta: [], totalSoal: 0, totalEsai: 0, timer: null };

const huWaktu = (t) => t ? fmtWITA(t, {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}) + " WITA" : "-";

function huDurasi(a, b) {
  if (!a || !b) return "-";
  const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  return m + " mnt";
}

// Batas nilai tuntas (KKM): nilai >= KKM berwarna hijau, di bawahnya merah.
// Isi 0 untuk mematikan pewarnaan (semua nilai berwarna biru netral).
const HU_KKM = 75;
const huKelasNilai = (n) => (!HU_KKM ? "hp-netral" : Number(n) >= HU_KKM ? "hp-lulus" : "hp-remed");
const huInisial = (nama) => (String(nama || "?").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("") || "?").toUpperCase();
const huKartu = (ikon, angka, label, warna = "") =>
  `<div class="hp-kartu ${warna}"><span class="hp-ikon">${proIkon(ikon)}</span><div><div class="hp-angka">${angka}</div><div class="hp-label">${label}</div></div></div>`;

async function rHasil() {
  await Promise.all([muatKelas(), muatMapel(), muatSiswa()]);
  const { data, error } = await sb.from("ujian")
    .select("id,judul,jenis_ujian,bank_id,mapel_id,waktu_mulai,waktu_selesai,aktif,ujian_kelas(kelas_id)")
    .order("waktu_mulai", { ascending: false }).limit(500);
  if (error) throw error;
  HU.ujian = data || [];

  if (!HU.ujian.length) {
    konten().innerHTML = kosong("Belum ada ujian", "Aktifkan sebuah bank soal di menu Bank Soal agar ujian muncul di sini.",
      '<a class="btn btn-primary" href="#soal">Ke Bank Soal</a>');
    return;
  }
  if (!HU.ujian.some((u) => u.id === HU.ujianId)) HU.ujianId = HU.ujian[0].id;

  konten().innerHTML = `
    <div class="alat pro-alat">
      <div class="alat-kiri">
        <select class="pilih" id="hu-ujian" aria-label="Pilih ujian">
          ${HU.ujian.map((u) => `<option value="${u.id}" ${u.id === HU.ujianId ? "selected" : ""}>${u.jenis_ujian ? esc(u.jenis_ujian) + " · " : ""}${esc(u.judul)} · ${esc(namaMapel(u.mapel_id))} · ${esc(huWaktu(u.waktu_mulai))}</option>`).join("")}
        </select>
        <select class="pilih" id="hu-kelas" aria-label="Filter kelas"></select>
        <select class="pilih" id="hu-status" aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="selesai">Selesai</option>
          <option value="mengerjakan">Sedang mengerjakan</option>
          <option value="belum">Belum mengerjakan</option>
          <option value="menunggu_esai">Perlu dinilai (esai)</option>
        </select>
        <input class="input" id="hu-cari" type="search" placeholder="Cari nama / NISN" aria-label="Cari siswa">
      </div>
      <div class="alat-kanan">
        <button class="btn" id="hu-segar" type="button">Segarkan</button>
        <button class="btn" id="hu-cetak" type="button">Cetak PDF</button>
        <button class="btn btn-primary" id="hu-unduh" type="button">Unduh Excel</button>
      </div>
    </div>
    <div id="hu-isi"><p class="memuat">Memuat...</p></div>`;

  $("#hu-ujian").onchange = (e) => { HU.ujianId = e.target.value; HU.kelas = ""; muatHasilUjian(); };
  $("#hu-kelas").onchange = (e) => { HU.kelas = e.target.value; huGambar(); };
  $("#hu-status").onchange = (e) => { HU.status = e.target.value; huGambar(); };
  $("#hu-cari").oninput = (e) => { HU.cari = e.target.value; huGambar(); };
  $("#hu-segar").onclick = () => muatHasilUjian();
  $("#hu-unduh").onclick = huUnduh;
  $("#hu-cetak").onclick = () => cetakDialog({ ujianId: HU.ujianId, kelasId: HU.kelas });
  $("#hu-status").value = HU.status;
  $("#hu-cari").value = HU.cari;
  await muatHasilUjian();

  // Progres ujian diperbarui otomatis tiap 20 detik selama halaman ini dibuka.
  clearInterval(HU.timer);
  HU.timer = setInterval(() => {
    if (!location.hash.startsWith("#hasil") || document.querySelector(".modal-bg") || !$("#hu-isi")) return;
    muatHasilUjian(true).catch(() => {});
  }, 20000);
}

async function muatHasilUjian(senyap = false) {
  const isi = $("#hu-isi");
  if (isi && !senyap) isi.innerHTML = '<p class="memuat">Memuat...</p>';
  const u = HU.ujian.find((x) => x.id === HU.ujianId);
  if (!u) return;
  const kelasIds = new Set((u.ujian_kelas || []).map((x) => x.kelas_id));
  const hitungSoal = async (esai) => {
    let q = sb.from("bank_soal").select("id", { count: "exact", head: true }).eq("bank_id", u.bank_id);
    if (esai) q = q.eq("jenis", "esai");
    const { count } = await q;
    return count || 0;
  };
  [HU.hasil, HU.totalSoal, HU.totalEsai] = await Promise.all([
    semua("hasil_ujian",
      "id,siswa_id,status,mulai_pada,selesai_pada,jumlah_benar,jumlah_salah,jumlah_kosong,nilai,terjawab,jumlah_esai,status_koreksi",
      (q) => q.eq("ujian_id", HU.ujianId)),
    hitungSoal(false), hitungSoal(true),
  ]);
  const peta = new Map(HU.hasil.map((h) => [h.siswa_id, h]));
  // Peserta = semua siswa di kelas peserta + siapa pun yang sudah punya hasil
  HU.peserta = S.siswa
    .filter((s) => kelasIds.has(s.kelas_id) || peta.has(s.id))
    .map((s) => ({ s, h: peta.get(s.id) || null }))
    .sort((a, b) => urut(namaKelas(a.s.kelas_id), namaKelas(b.s.kelas_id)) || urut(a.s.nama, b.s.nama));

  const kls = [...new Set(HU.peserta.map((p) => p.s.kelas_id))].sort((a, b) => urut(namaKelas(a), namaKelas(b)));
  $("#hu-kelas").innerHTML = `<option value="">Semua kelas</option>` +
    kls.map((id) => `<option value="${id}" ${HU.kelas === id ? "selected" : ""}>${esc(namaKelas(id))}</option>`).join("");
  huGambar();
}

const huStatus = (h) => h ? h.status : "belum";
// Sudah selesai mengerjakan, tetapi esainya belum selesai dinilai guru.
const huMenunggu = (h) => !!h && h.status === "selesai" && h.status_koreksi === "menunggu";
const huBadge = (st) => st === "selesai" ? '<span class="badge ok">Selesai</span>'
  : st === "mengerjakan" ? '<span class="badge warn">Mengerjakan</span>'
  : '<span class="badge off">Belum</span>';

function huSaring() {
  const c = norm(HU.cari);
  return HU.peserta.filter(({ s, h }) =>
    (!HU.kelas || s.kelas_id === HU.kelas) &&
    (!HU.status || (HU.status === "menunggu_esai" ? huMenunggu(h) : huStatus(h) === HU.status)) &&
    (!c || norm(s.nama).includes(c) || norm(s.username).includes(c)));
}

function huGambar() {
  const isi = $("#hu-isi");
  if (!isi) return;
  const daftar = huSaring();
  const adaEsai = HU.totalEsai > 0;
  // Nilai yang dihitung hanya yang sudah FINAL (esai sudah dinilai)
  const final = daftar.filter((p) => huStatus(p.h) === "selesai" && p.h.status_koreksi !== "menunggu");
  const nilai = final.map((p) => Number(p.h.nilai) || 0);
  const rata = nilai.length ? (nilai.reduce((a, b) => a + b, 0) / nilai.length) : 0;
  const hitung = (st) => daftar.filter((p) => huStatus(p.h) === st).length;
  const perluDinilai = daftar.filter((p) => huMenunggu(p.h)).length;
  const admin = PANEL === "admin";
  const nSelesai = hitung("selesai"), nKerja = hitung("mengerjakan"), nBelum = hitung("belum");
  const pct = (n) => (daftar.length ? (n / daftar.length) * 100 : 0);
  const tuntas = HU_KKM ? nilai.filter((n) => n >= HU_KKM).length : 0;

  const sel = (s, h) => {
    const st = huStatus(h);
    if (st === "mengerjakan") {
      const t = Math.min(h.terjawab || 0, HU.totalSoal);
      const p = HU.totalSoal ? Math.round((t / HU.totalSoal) * 100) : 0;
      return `${huBadge(st)}<div class="hp-mini"><div class="hp-bar"><i class="m" style="width:${p}%"></i></div><small>${t}/${HU.totalSoal} soal · ${p}%</small></div>`;
    }
    return huBadge(st);
  };

  isi.innerHTML = `
    <div class="hp-stat">
      ${huKartu("peserta", daftar.length, "Peserta")}
      ${huKartu("cek", nSelesai, "Selesai", "ok")}
      ${huKartu("pensil", nKerja, "Mengerjakan", "warn")}
      ${huKartu("belum", nBelum, "Belum", "abu")}
      ${huKartu("rata", nilai.length ? rata.toFixed(1) : "-", "Rata-rata")}
      ${huKartu("naik", nilai.length ? Math.max(...nilai) : "-", "Tertinggi", "ok")}
      ${huKartu("turun", nilai.length ? Math.min(...nilai) : "-", "Terendah", "off")}
      ${adaEsai ? huKartu("esai", perluDinilai, "Esai perlu dinilai", perluDinilai ? "warn" : "ok") : ""}
    </div>
    <div class="hp-progres">
      <div class="hp-progres-atas">
        <span>Progres ujian: ${Math.round(pct(nSelesai))}% selesai</span>
        <span>${nilai.length ? (HU_KKM ? `Tuntas (KKM ${HU_KKM}): ${tuntas} dari ${nilai.length} nilai final` : `${nilai.length} nilai final`) : "Belum ada nilai final yang masuk."}${adaEsai ? ` · Soal esai: ${HU.totalEsai}` : ""}</span>
      </div>
      <div class="hp-bar"><i class="s" style="width:${pct(nSelesai)}%"></i><i class="m" style="width:${pct(nKerja)}%"></i></div>
      <div class="hp-legenda"><span class="s">Selesai ${nSelesai}</span><span class="m">Mengerjakan ${nKerja}</span><span>Belum ${nBelum}</span></div>
    </div>
    ${daftar.length ? `<div class="tabel-bungkus hp-tabel"><table class="resp"><thead><tr>
      <th>No</th><th>Siswa</th><th>Kelas</th><th>Status / Progres</th><th>Waktu</th><th>Durasi</th>
      <th class="hp-th-jwb">Benar · Salah · Kosong</th>${adaEsai ? "<th>Esai</th>" : ""}<th>Nilai</th><th></th></tr></thead><tbody>
      ${daftar.map(({ s, h }, i) => {
        const st = huStatus(h);
        const ok = st === "selesai";
        const tunggu = huMenunggu(h);
        const butuhEsai = ok && (h.jumlah_esai > 0 || adaEsai);
        return `<tr>
        <td data-label="No" class="angka">${i + 1}</td>
        <td data-label="Siswa"><div class="hp-siswa"><span class="hp-av">${esc(huInisial(s.nama))}</span><div><b>${esc(s.nama)}</b><small class="mono">${esc(s.username)}</small></div></div></td>
        <td data-label="Kelas">${esc(namaKelas(s.kelas_id))}</td>
        <td data-label="Status">${sel(s, h)}</td>
        <td data-label="Waktu">${h ? `<div class="hp-waktu">${esc(huWaktu(h.mulai_pada))}${ok ? `<small>s/d ${esc(huWaktu(h.selesai_pada))}</small>` : ""}</div>` : "-"}</td>
        <td data-label="Durasi">${ok ? huDurasi(h.mulai_pada, h.selesai_pada) : "-"}</td>
        <td data-label="Jawaban">${ok ? `<span class="hp-jwb"><span class="b" title="Benar">${h.jumlah_benar}</span><span class="s" title="Salah">${h.jumlah_salah}</span><span class="k" title="Kosong">${h.jumlah_kosong}</span></span>` : "-"}</td>
        ${adaEsai ? `<td data-label="Esai">${!ok ? "-" : h.jumlah_esai > 0 ? (tunggu ? '<span class="badge warn">Belum dinilai</span>' : '<span class="badge ok">Sudah dinilai</span>') : '<span class="badge off">Kosong</span>'}</td>` : ""}
        <td data-label="Nilai" class="angka">${!ok ? "-" : tunggu ? '<span class="badge warn">Menunggu</span>' : `<span class="hp-nilai ${huKelasNilai(h.nilai)}">${esc(String(+h.nilai))}</span>`}</td>
        <td class="aksi">
          ${butuhEsai && h.jumlah_esai > 0 ? `<button class="btn btn-kecil ${tunggu ? "btn-primary" : ""}" data-nilai="${h.id}" data-sid="${s.id}">${tunggu ? "Nilai esai" : "Periksa"}</button>` : ""}
          ${admin && h ? `<button class="btn btn-kecil btn-danger" data-ulang="${h.id}" data-nama="${esc(s.nama)}">Izinkan ulang</button>` : ""}
        </td>
      </tr>`;
      }).join("")}
      </tbody></table></div>`
      : kosong("Tidak ada data", "Ubah filter, atau pastikan ujian ini sudah ditujukan ke kelas peserta.")}`;

  isi.querySelectorAll("[data-nilai]").forEach((b) => {
    b.onclick = () => {
      const p = HU.peserta.find((x) => x.s.id === b.dataset.sid);
      const u = HU.ujian.find((x) => x.id === HU.ujianId);
      if (p && u) bukaPenilaian(b.dataset.nilai, p.s, u, () => muatHasilUjian(true));
    };
  });

  isi.querySelectorAll("[data-ulang]").forEach((b) => {
    b.onclick = async () => {
      const ya = await konfirmasi(`Hapus hasil ujian <b>${esc(b.dataset.nama)}</b>? Siswa akan bisa mengerjakan ujian ini dari awal. Tindakan ini tidak bisa dibatalkan.`,
        { ya: "Ya, izinkan ulang", bahaya: true });
      if (!ya) return;
      const { error } = await sb.from("hasil_ujian").delete().eq("id", b.dataset.ulang);
      if (error) return toast(error.message, "error");
      toast("Hasil dihapus. Siswa dapat mengerjakan ulang.", "ok");
      muatHasilUjian();
    };
  });
}

function huUnduh() {
  const u = HU.ujian.find((x) => x.id === HU.ujianId);
  const daftar = huSaring();
  if (!daftar.length) return toast("Tidak ada data untuk diunduh", "error");
  const st = { selesai: "Selesai", mengerjakan: "Mengerjakan", belum: "Belum" };
  unduhExcel(`hasil_${(u.judul || "ujian").replace(/[^\w-]+/g, "_")}_${stempel()}.xlsx`,
    daftar.map(({ s, h }, i) => {
      const ok = huStatus(h) === "selesai";
      return {
        No: i + 1, NISN: s.username, Nama: s.nama, Kelas: namaKelas(s.kelas_id), Status: st[huStatus(h)],
        Mulai: h ? huWaktu(h.mulai_pada) : "", Selesai: ok ? huWaktu(h.selesai_pada) : "",
        Benar: ok ? h.jumlah_benar : "", Salah: ok ? h.jumlah_salah : "", Kosong: ok ? h.jumlah_kosong : "",
        ...(HU.totalEsai > 0 ? { Esai: !ok ? "" : h.jumlah_esai > 0 ? (huMenunggu(h) ? "Belum dinilai" : "Sudah dinilai") : "Kosong" } : {}),
        Nilai: ok && !huMenunggu(h) ? +h.nilai : (ok ? "Menunggu penilaian esai" : ""),
      };
    }), "Hasil");
}
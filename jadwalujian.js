"use strict";
// =====================================================================
//  MENU "JADWAL UJIAN"  (#jadwal)  -  dipakai admin.html, guru.html, siswa.html
//
//  File ini BERDIRI SENDIRI (semua nama berawalan JU / ju). Butuh
//  29_jadwal_ujian.sql lalu 31_jadwal_ujian_multi.sql (fungsi jadwal_ujian_baca & jadwal_ujian_simpan).
//  Untuk kop & logo di hasil cetak: 30_kop_jadwal_ujian.sql (opsional).
//  Mapel & guru boleh lebih dari satu per jadwal: 31_jadwal_ujian_multi.sql.
//
//  Admin : tambah / ubah / duplikat / hapus jadwal, filter, cetak (hanya admin).
//  Guru  : lihat jadwal (bawaan "Jadwal saya", bisa pindah ke semua jadwal).
//  Siswa : lihat jadwal untuk kelasnya saja (disaring di database).
//
//  Tanggal disimpan sebagai tanggal biasa, jam sebagai jam biasa (WITA),
//  persis seperti yang diisi admin. Nama hari dihitung dari tanggal.
//  Satu jadwal boleh untuk banyak kelas.
// =====================================================================

const JU_PERAN = typeof PANEL !== "undefined" ? PANEL : "siswa";
const JU = { rows: [], periode: "mendatang", kelas: "", mapel: "", guru: "", milik: JU_PERAN === "guru" ? "saya" : "" };

(function pasangGayaJU() {
  if (document.getElementById("gaya-ju")) return;
  const st = document.createElement("style");
  st.id = "gaya-ju";
  st.textContent = `
.ju-atas{display:flex;justify-content:space-between;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.8rem}
.ju-aksi{display:flex;gap:.5rem;flex-wrap:wrap}
.ju-aksi .btn{min-height:44px}
.ju-bar{display:grid;gap:.7rem;grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:.6rem}
.ju-f{display:flex;flex-direction:column;gap:.25rem;min-width:0;font-size:.82rem;font-weight:700;color:var(--tinta-2)}
.ju-f .pilih{width:100%;min-height:44px}
@media(min-width:900px){.ju-bar{grid-template-columns:repeat(4,minmax(0,1fr))}}
.ju-grup{margin-top:1.1rem}
.ju-hari{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:0 0 .55rem}
.ju-hari h3{font-size:1.05rem}
.ju-grid{display:grid;gap:.6rem;grid-template-columns:minmax(0,1fr)}
@media(min-width:900px){.ju-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ju-item{background:var(--putih);border:1px solid var(--garis);border-left:5px solid var(--biru);border-radius:14px;padding:.8rem 1rem;box-shadow:var(--bayang-s);display:grid;gap:.3rem;min-width:0}
.ju-item.hariini,.ju-item.jalan{border-left-color:var(--amber)}
.ju-item.lewat{opacity:.62;border-left-color:var(--garis-2)}
.ju-baris{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.ju-waktu{font-weight:800;font-family:var(--f-kode);font-size:.95rem}
.ju-mapel{font-weight:800;font-size:1.08rem;line-height:1.3}
.ju-meta{color:var(--tinta-2);font-size:.9rem;display:flex;flex-wrap:wrap;gap:.2rem 1rem}
.ju-kelas{display:flex;flex-wrap:wrap;gap:.3rem}
.ju-kelas span,.ju-chip{background:var(--biru-lembut);color:var(--biru);border-radius:999px;padding:.05rem .6rem;font-size:.8rem;font-weight:700;display:inline-block}
.ju-cat{font-size:.88rem;color:var(--tinta-2);border-top:1px dashed var(--garis-2);padding-top:.35rem;white-space:pre-wrap}
.ju-chips{display:flex;flex-wrap:wrap;gap:.3rem}
.ju-sel{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:.4rem;max-height:210px;overflow:auto;padding:.5rem;border:1px solid var(--garis-2);border-radius:12px;margin-top:.35rem;font-weight:400}
.ju-cek{display:flex;align-items:center;gap:.4rem;min-height:36px;font-weight:600}
.ju-cek input{width:18px;height:18px}
.ju-pilihcepat{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.35rem}
.ju-dua{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
.ju-sel.lebar{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.ju-grp{grid-column:1/-1;font-size:.76rem;font-weight:800;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.04em;margin-top:.25rem}
.ju-hit{font-weight:400;color:var(--tinta-2);font-size:.85rem}
.ju-baris-mapel{display:flex;flex-direction:column;gap:.1rem}
.ju-pv{position:fixed;inset:0;z-index:200;background:#cbd5e1;display:flex;flex-direction:column}
.ju-pv-bar{display:flex;flex-direction:column;gap:.65rem;background:#fff;border-bottom:1px solid #cbd5e1;padding:.7rem 1rem;box-shadow:0 2px 8px rgba(0,0,0,.08);max-height:50vh;overflow:auto}
.ju-pv-atas{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;justify-content:space-between}
.ju-pv-judul small{display:block;color:#64748b}
.ju-pv-aksi{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end}
.ju-pv-aksi label,.ju-pv-isian label{display:flex;flex-direction:column;gap:.2rem;font-size:.8rem;font-weight:700;color:var(--tinta-2);min-width:0}
.ju-pv-aksi .pilih,.ju-pv-aksi .btn{min-height:42px}
.ju-pv-isian{display:grid;gap:.6rem;grid-template-columns:repeat(2,minmax(0,1fr))}
.ju-pv-isian .input{min-height:42px;width:100%;min-width:0}
.ju-pv-isian .dua{grid-column:span 2}
.ju-pv-isian .semua{grid-column:1/-1}
@media(min-width:900px){.ju-pv-isian{grid-template-columns:repeat(4,minmax(0,1fr))}}
.ju-pv-pet{margin:0;padding:.45rem 1rem;font-size:.85rem;color:#475569;background:#e2e8f0}
.ju-pv-layar{flex:1;overflow:auto;padding:.8rem .5rem 2rem}
.ju-pv-kertas{margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);width:max-content}
.ju-pv-kertas iframe{display:block;border:0;background:#fff}
`;
  document.head.appendChild(st);
})();

// ---------------------------------------------------------------------
//  Alat tanggal & waktu (semua dalam WITA, tanpa pergeseran zona perangkat)
// ---------------------------------------------------------------------
const juHariIni = () => new Date(sekarangMs() + OFFSET_WITA_MS).toISOString().slice(0, 10);
const juJamIni = () => new Date(sekarangMs() + OFFSET_WITA_MS).toISOString().slice(11, 16);
const juTgl = (s) => new Date(String(s) + "T00:00:00Z");
const juFmt = (s, o) => juTgl(s).toLocaleDateString("id-ID", { timeZone: "UTC", ...o });
const juHari = (s) => juFmt(s, { weekday: "long" });
const juTglPanjang = (s) => juFmt(s, { day: "numeric", month: "long", year: "numeric" });
const juTglPendek = (s) => juFmt(s, { day: "numeric", month: "short", year: "numeric" });
const juSelisih = (s) => Math.round((juTgl(s) - juTgl(juHariIni())) / 86400000);
const juJam = (t) => String(t || "").replace(":", ".");
const juWaktu = (r) => `${juJam(r.waktu_mulai)} – ${juJam(r.waktu_selesai)} WITA`;

function juStatus(r) {
  const d = juSelisih(r.tanggal);
  if (d < 0) return { k: "lewat", t: "Selesai" };
  if (d === 0) {
    const j = juJamIni();
    if (j >= r.waktu_selesai) return { k: "lewat", t: "Selesai" };
    if (j >= r.waktu_mulai) return { k: "jalan", t: "Sedang berlangsung" };
    return { k: "hariini", t: "Hari ini" };
  }
  if (d === 1) return { k: "besok", t: "Besok" };
  return { k: "depan", t: `${d} hari lagi` };
}

const juNama = (arr, sep = ", ") => (arr || []).map((x) => x.nama).join(sep);
const juKosong = (judul, teks, aksiHtml = "") =>
  `<div class="kosong"><h3>${esc(judul)}</h3><p>${esc(teks)}</p>${aksiHtml}</div>`;

// ---------------------------------------------------------------------
//  Muat & saring data
// ---------------------------------------------------------------------
async function juMuat() {
  const { data, error } = await sb.rpc("jadwal_ujian_baca");
  if (error) {
    const hilang = error.code === "PGRST202" || /could not find the function|does not exist/i.test(error.message || "");
    throw new Error(hilang
      ? "Fitur Jadwal Ujian belum dipasang di database. Jalankan 29_jadwal_ujian.sql di Supabase > SQL Editor."
      : error.message);
  }
  JU.rows = Array.isArray(data) ? data : [];
}

function juSaring() {
  const h = juHariIni();
  const meId = typeof S !== "undefined" && S.me ? S.me.id : null;
  let list = JU.rows.filter((r) => {
    if (JU.periode === "mendatang" && r.tanggal < h) return false;
    if (JU.periode === "lewat" && r.tanggal >= h) return false;
    if (JU.kelas && !r.kelas.some((k) => k.id === JU.kelas)) return false;
    if (JU.mapel && !r.mapel.some((x) => x.id === JU.mapel)) return false;
    if (JU.guru && !r.guru.some((x) => x.id === JU.guru)) return false;
    if (JU.milik === "saya" && !r.guru.some((x) => x.id === meId)) return false;
    return true;
  });
  if (JU.periode === "lewat") list = list.slice().reverse();
  return list;
}

function juOpsi(peta, terpilih, semuaLabel) {
  const arr = [...peta].sort((a, b) => urut(a[1], b[1]));
  return `<option value="">${esc(semuaLabel)}</option>` +
    arr.map(([id, nama]) => `<option value="${esc(id)}" ${id === terpilih ? "selected" : ""}>${esc(nama)}</option>`).join("");
}

// ---------------------------------------------------------------------
//  Tampilan daftar
// ---------------------------------------------------------------------
function juKartu(r) {
  const st = juStatus(r);
  const meId = typeof S !== "undefined" && S.me ? S.me.id : null;
  const milikku = JU_PERAN === "guru" && r.guru.some((x) => x.id === meId);
  return `<article class="ju-item ${st.k}">
    <div class="ju-baris">
      <span class="ju-waktu">${esc(juWaktu(r))}</span>
      ${st.k === "jalan" ? '<span class="badge ok">Sedang berlangsung</span>' : ""}
      ${st.k === "lewat" ? '<span class="badge off">Selesai</span>' : ""}
      ${milikku ? '<span class="badge info">Jadwal Anda</span>' : ""}
      ${r.jenis_ujian ? `<span class="badge jenis-ujian">${esc(r.jenis_ujian)}</span>` : ""}
    </div>
    <div class="ju-mapel">${r.mapel.map((x) => esc(x.nama)).join("<br>")}</div>
    <div class="ju-meta"><span>👤 ${esc(juNama(r.guru) || "-")}</span>${r.ruang ? `<span>📍 ${esc(r.ruang)}</span>` : ""}</div>
    <div class="ju-kelas">${r.kelas.map((k) => `<span>${esc(k.nama)}</span>`).join("")}</div>
    ${r.catatan ? `<div class="ju-cat">${esc(r.catatan)}</div>` : ""}
  </article>`;
}

function juKartuHari(list) {
  const per = new Map();
  list.forEach((r) => { if (!per.has(r.tanggal)) per.set(r.tanggal, []); per.get(r.tanggal).push(r); });
  return [...per].map(([tgl, arr]) => {
    const d = juSelisih(tgl);
    const rel = d === 0 ? '<span class="badge warn">Hari ini</span>' : d === 1 ? '<span class="badge info">Besok</span>' : "";
    return `<section class="ju-grup">
      <div class="ju-hari"><h3>${esc(juHari(tgl))}, ${esc(juTglPanjang(tgl))}</h3>${rel}</div>
      <div class="ju-grid">${arr.map(juKartu).join("")}</div>
    </section>`;
  }).join("");
}

function juTabelAdmin(list) {
  return `<div class="tabel-bungkus"><table class="resp"><thead><tr>
    <th>Hari, tanggal</th><th>Waktu</th><th>Mata pelajaran</th><th>Guru pengampu</th><th>Kelas</th><th>Ruang</th><th></th>
  </tr></thead><tbody>
  ${list.map((r) => {
    const st = juStatus(r);
    return `<tr>
      <td data-label="Hari, tanggal"><b>${esc(juHari(r.tanggal))}</b>, ${esc(juTglPendek(r.tanggal))}${st.k === "lewat" ? ' <span class="badge off">Selesai</span>' : st.k === "hariini" || st.k === "jalan" ? ' <span class="badge warn">Hari ini</span>' : ""}</td>
      <td data-label="Waktu" class="mono">${esc(juWaktu(r))}</td>
      <td data-label="Mata pelajaran"><span class="ju-baris-mapel">${r.mapel.map((x) => `<b>${esc(x.nama)}</b>`).join("")}</span>${r.jenis_ujian ? ` <span class="badge jenis-ujian">${esc(r.jenis_ujian)}</span>` : ""}</td>
      <td data-label="Guru pengampu"><span class="ju-baris-mapel">${r.guru.length ? r.guru.map((x) => `<span>${esc(x.nama)}</span>`).join("") : "-"}</span></td>
      <td data-label="Kelas"><span class="ju-chips">${r.kelas.map((k) => `<span class="ju-chip">${esc(k.nama)}</span>`).join("")}</span></td>
      <td data-label="Ruang">${esc(r.ruang || "-")}</td>
      <td class="aksi">
        <button class="btn btn-kecil" data-aksi="ubah" data-id="${esc(r.id)}">Ubah</button>
        <button class="btn btn-kecil" data-aksi="duplikat" data-id="${esc(r.id)}">Duplikat</button>
        <button class="btn btn-kecil" data-aksi="hapus" data-id="${esc(r.id)}">Hapus</button>
      </td></tr>`;
  }).join("")}
  </tbody></table></div>`;
}

function juIsiDaftar() {
  const admin = JU_PERAN === "admin";
  const list = juSaring();
  const ring = document.getElementById("ju-ringkas");
  if (ring) ring.textContent = `${list.length} jadwal ditampilkan dari ${JU.rows.length} jadwal`;
  const el = document.getElementById("ju-daftar");
  if (!el) return;
  if (list.length) { el.innerHTML = admin ? juTabelAdmin(list) : juKartuHari(list); return; }
  if (!JU.rows.length) {
    el.innerHTML = admin
      ? juKosong("Belum ada jadwal ujian", "Tambahkan jadwal pertama. Jadwal akan langsung terbaca oleh guru dan siswa.", '<button class="btn btn-primary" data-aksi="tambah">+ Tambah jadwal</button>')
      : juKosong("Belum ada jadwal ujian", "Jadwal ujian belum diumumkan oleh admin. Cek lagi nanti.");
    return;
  }
  el.innerHTML = juKosong("Tidak ada jadwal", "Tidak ada jadwal yang cocok dengan filter. Ubah filter di atas.");
}

function juGambar() {
  const admin = JU_PERAN === "admin", guru = JU_PERAN === "guru";
  const pKelas = new Map(), pMapel = new Map(), pGuru = new Map();
  JU.rows.forEach((r) => {
    r.kelas.forEach((k) => pKelas.set(k.id, k.nama));
    r.mapel.forEach((x) => pMapel.set(x.id, x.nama));
    r.guru.forEach((x) => pGuru.set(x.id, x.nama));
  });
  konten().innerHTML = `<div id="ju-akar">
    <div class="ju-atas">
      <p class="ket">${esc(periodeAktifTeks())}${admin ? " · Jadwal ini langsung terbaca di panel guru dan siswa." : ""}</p>
      ${admin ? `<div class="ju-aksi">
        <button class="btn btn-primary" data-aksi="tambah" type="button">+ Tambah jadwal</button>
        <button class="btn" data-aksi="cetak" type="button">🖨️ Cetak</button>
      </div>` : ""}
    </div>
    <div class="ju-bar">
      <label class="ju-f">Periode<select class="pilih" id="ju-periode">
        <option value="mendatang">Hari ini &amp; mendatang</option>
        <option value="lewat">Sudah lewat</option>
        <option value="semua">Semua tanggal</option></select></label>
      ${guru ? `<label class="ju-f">Jadwal<select class="pilih" id="ju-milik">
        <option value="saya">Jadwal saya</option><option value="">Semua jadwal</option></select></label>` : ""}
      ${admin || guru ? `<label class="ju-f">Kelas<select class="pilih" id="ju-kelas">${juOpsi(pKelas, JU.kelas, "Semua kelas")}</select></label>` : ""}
      <label class="ju-f">Mata pelajaran<select class="pilih" id="ju-mapel">${juOpsi(pMapel, JU.mapel, "Semua mapel")}</select></label>
      ${admin ? `<label class="ju-f">Guru<select class="pilih" id="ju-guru">${juOpsi(pGuru, JU.guru, "Semua guru")}</select></label>` : ""}
    </div>
    <p class="ket" id="ju-ringkas"></p>
    <div id="ju-daftar"></div>
  </div>`;

  const set = (id, kunci, nilai) => {
    const e = document.getElementById(id); if (!e) return;
    e.value = nilai;
    e.onchange = () => { JU[kunci] = e.value; juIsiDaftar(); };
  };
  set("ju-periode", "periode", JU.periode);
  set("ju-milik", "milik", JU.milik);
  [["ju-kelas", "kelas", JU.kelas], ["ju-mapel", "mapel", JU.mapel], ["ju-guru", "guru", JU.guru]].forEach((a) => set(...a));

  document.getElementById("ju-akar").onclick = (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const r = JU.rows.find((x) => x.id === b.dataset.id);
    const a = b.dataset.aksi;
    if (a === "tambah") juModalForm(null, "tambah");
    else if (a === "ubah" && r) juModalForm(r, "ubah");
    else if (a === "duplikat" && r) juModalForm(r, "duplikat");
    else if (a === "hapus" && r) juHapus(r);
    else if (a === "cetak" && admin) juCetak(juSaring());
  };
  juIsiDaftar();
}

async function rJadwalUjian() {
  try { await WAKTU.siap; } catch (_) { /* pakai jam perangkat bila sinkron gagal */ }
  if (JU_PERAN === "admin") await Promise.all([muatKelas(), muatMapel(), muatGuru()]);
  await juMuat();
  juGambar();
}

// ---------------------------------------------------------------------
//  Admin: form tambah / ubah / duplikat
// ---------------------------------------------------------------------
function juCariBentrok(v, idSendiri) {
  const out = [];
  JU.rows.forEach((r) => {
    if (r.id === idSendiri || r.tanggal !== v.tanggal) return;
    if (!(v.waktu_mulai < r.waktu_selesai && v.waktu_selesai > r.waktu_mulai)) return;
    const info = `${esc(juNama(r.mapel))} (${esc(juWaktu(r))})`;
    const guruSama = r.guru.filter((g) => v.guru.includes(g.id)).map((g) => g.nama);
    if (guruSama.length) out.push(`Guru <b>${esc(guruSama.join(", "))}</b> sudah punya jadwal ${info}`);
    const sama = r.kelas.filter((k) => v.kelas.includes(k.id)).map((k) => k.nama);
    if (sama.length) out.push(`Kelas <b>${esc(sama.join(", "))}</b> sudah punya jadwal ${info}`);
  });
  return out;
}

function juModalForm(r, mode) {
  const awal = r ? { ...r, mapel: r.mapel.map((x) => x.id), guru: r.guru.map((x) => x.id), kelas: r.kelas.map((k) => k.id) } : {
    tanggal: "", waktu_mulai: "", waktu_selesai: "", mapel: [], guru: [], kelas: [], ruang: "", jenis_ujian: "", catatan: "",
  };
  const idUbah = mode === "ubah" && r ? r.id : null;
  const judul = mode === "ubah" ? "Ubah jadwal ujian" : mode === "duplikat" ? "Duplikat jadwal ujian" : "Tambah jadwal ujian";
  const pilihGuru = new Set(awal.guru);

  const tingkat = new Map();
  S.kelas.forEach((k) => {
    const m = /^\s*(\d+)/.exec(k.nama);
    if (m) { if (!tingkat.has(m[1])) tingkat.set(m[1], []); tingkat.get(m[1]).push(k.id); }
  });

  const m = tampilModal(judul, `
    ${mode === "duplikat" ? '<p class="ket">Isi disalin dari jadwal sebelumnya. Ubah tanggal, kelas, atau lainnya lalu simpan sebagai jadwal baru.</p>' : ""}
    <label class="f">Tanggal<input class="input" type="date" id="ju-tgl" value="${esc(awal.tanggal)}">
      <small id="ju-hari-info"></small></label>
    <div class="ju-dua">
      <label class="f">Waktu mulai (WITA)<input class="input" type="time" id="ju-mulai" value="${esc(awal.waktu_mulai)}"></label>
      <label class="f">Waktu selesai (WITA)<input class="input" type="time" id="ju-selesai" value="${esc(awal.waktu_selesai)}"></label>
    </div>

    <div class="f" style="font-weight:700;font-size:.92rem">Mata pelajaran <span class="ju-hit" id="ju-mapel-n"></span>
      <div class="ju-pilihcepat">
        <button type="button" class="btn btn-kecil" id="ju-mapel-kosong">Kosongkan</button>
      </div>
      <div class="ju-sel lebar" id="ju-mapel-sel">
        ${S.mapel.length ? S.mapel.map((x) => `<label class="ju-cek"><input type="checkbox" value="${esc(x.id)}" ${awal.mapel.includes(x.id) ? "checked" : ""}>${esc(x.nama)}</label>`).join("") : '<span class="ket">Belum ada mapel. Buat dulu di menu Data.</span>'}
      </div>
    </div>

    <div class="f" style="font-weight:700;font-size:.92rem;margin-top:1rem">Guru pengampu <span class="ju-hit" id="ju-guru-n"></span>
      <div class="ju-pilihcepat">
        <button type="button" class="btn btn-kecil" id="ju-guru-ampu">Pilih guru pengampu mapel terpilih</button>
        <button type="button" class="btn btn-kecil" id="ju-guru-kosong">Kosongkan</button>
      </div>
      <input class="input" id="ju-guru-cari" placeholder="Cari nama guru..." style="margin-top:.4rem;font-weight:400">
      <div class="ju-sel lebar" id="ju-guru-sel"></div>
    </div>

    <div class="f" style="font-weight:700;font-size:.92rem;margin-top:1rem">Kelas peserta
      <div class="ju-pilihcepat">
        <button type="button" class="btn btn-kecil" id="ju-semua">Pilih semua</button>
        <button type="button" class="btn btn-kecil" id="ju-kosong">Kosongkan</button>
        ${tingkat.size >= 2 ? [...tingkat.keys()].sort((a, b) => a - b).map((t) => `<button type="button" class="btn btn-kecil" data-tingkat="${esc(t)}">Semua kelas ${esc(t)}</button>`).join("") : ""}
      </div>
      <div class="ju-sel" id="ju-kelas-sel">
        ${S.kelas.length ? S.kelas.map((k) => `<label class="ju-cek"><input type="checkbox" value="${esc(k.id)}" ${awal.kelas.includes(k.id) ? "checked" : ""}>${esc(k.nama)}</label>`).join("") : '<span class="ket">Belum ada kelas. Buat dulu di menu Data.</span>'}
      </div>
    </div>
    <div class="ju-dua" style="margin-top:1rem">
      <label class="f">Ruang (opsional)<input class="input" id="ju-ruang" maxlength="80" value="${esc(awal.ruang)}" placeholder="Contoh: Lab Komputer"></label>
      <label class="f">Jenis ujian (opsional)<input class="input" id="ju-jenis" maxlength="80" value="${esc(awal.jenis_ujian)}" placeholder="Contoh: PAS"></label>
    </div>
    <label class="f">Catatan (opsional)<textarea class="area" id="ju-cat" maxlength="500" placeholder="Contoh: Membawa kartu peserta">${esc(awal.catatan)}</textarea></label>`, {
    lebar: "sedang",
    aksi: [{ label: "Batal" }, {
      label: mode === "ubah" ? "Simpan perubahan" : "Simpan jadwal", kelas: "btn-primary",
      onClick: async (mm) => {
        const q = (s) => mm.body.querySelector(s);
        const v = {
          tanggal: q("#ju-tgl").value,
          waktu_mulai: q("#ju-mulai").value,
          waktu_selesai: q("#ju-selesai").value,
          mapel: [...mm.body.querySelectorAll("#ju-mapel-sel input:checked")].map((c) => c.value),
          guru: [...pilihGuru],
          kelas: [...mm.body.querySelectorAll("#ju-kelas-sel input:checked")].map((c) => c.value),
          ruang: q("#ju-ruang").value.trim(),
          jenis_ujian: q("#ju-jenis").value.trim(),
          catatan: q("#ju-cat").value.trim(),
        };
        const salah = (t) => { toast(t, "error"); return false; };
        if (!v.tanggal) return salah("Tanggal wajib diisi");
        if (!v.waktu_mulai || !v.waktu_selesai) return salah("Waktu mulai dan selesai wajib diisi");
        if (v.waktu_selesai <= v.waktu_mulai) return salah("Waktu selesai harus lebih besar dari waktu mulai");
        if (!v.mapel.length) return salah("Pilih minimal satu mata pelajaran");
        if (!v.guru.length) return salah("Pilih minimal satu guru pengampu");
        if (!v.kelas.length) return salah("Pilih minimal satu kelas");

        const bentrok = juCariBentrok(v, idUbah);
        if (bentrok.length) {
          const ya = await konfirmasi(
            `<b>Ada kemungkinan bentrok jadwal:</b><ul>${bentrok.slice(0, 6).map((t) => `<li>${t}</li>`).join("")}</ul>${bentrok.length > 6 ? `<p>dan ${bentrok.length - 6} lainnya.</p>` : ""}<p>Tetap simpan jadwal ini?</p>`,
            { ya: "Tetap simpan", judul: "Periksa jadwal" });
          if (!ya) return false;
        }
        const { error } = await sb.rpc("jadwal_ujian_simpan", { p_id: idUbah, p_data: v });
        if (error) return salah("Gagal menyimpan: " + error.message);
        toast(idUbah ? "Jadwal diperbarui" : "Jadwal disimpan", "ok");
        muatUlang();
      },
    }],
  });

  const q = (s) => m.body.querySelector(s);
  const cekKelas = () => [...m.body.querySelectorAll("#ju-kelas-sel input")];
  const cekMapel = () => [...m.body.querySelectorAll("#ju-mapel-sel input")];

  // ---- mapel (banyak)
  const hitungMapel = () => { const n = cekMapel().filter((c) => c.checked).length; q("#ju-mapel-n").textContent = n ? `· ${n} dipilih` : ""; };
  q("#ju-mapel-sel").onchange = () => { hitungMapel(); gambarGuru(); };
  q("#ju-mapel-kosong").onclick = () => { cekMapel().forEach((c) => { c.checked = false; }); hitungMapel(); gambarGuru(); };

  // ---- guru (banyak, ada pencarian; pengampu mapel terpilih ditaruh di atas)
  const mapelDipilih = () => new Set(cekMapel().filter((c) => c.checked).map((c) => c.value));
  const idAmpu = () => { const mp = mapelDipilih(); return new Set(S.penugasan.filter((p) => mp.has(p.mapel_id)).map((p) => p.guru_id)); };
  function gambarGuru() {
    const ampu = idAmpu(), cari = norm(q("#ju-guru-cari").value);
    const daftar = S.guru.filter((g) => (g.aktif || pilihGuru.has(g.id)) && (!cari || norm(g.nama).includes(cari)));
    const utama = daftar.filter((g) => ampu.has(g.id)), lain = daftar.filter((g) => !ampu.has(g.id));
    const item = (g) => `<label class="ju-cek"><input type="checkbox" value="${esc(g.id)}" ${pilihGuru.has(g.id) ? "checked" : ""}>${esc(g.nama)}${g.aktif ? "" : " (nonaktif)"}</label>`;
    const html = (utama.length ? `<div class="ju-grp">Mengampu mapel terpilih</div>${utama.map(item).join("")}${lain.length ? '<div class="ju-grp">Guru lainnya</div>' : ""}` : "") + lain.map(item).join("");
    q("#ju-guru-sel").innerHTML = html || '<span class="ket">Guru tidak ditemukan.</span>';
    q("#ju-guru-n").textContent = pilihGuru.size ? `· ${pilihGuru.size} dipilih` : "";
  }
  q("#ju-guru-sel").onchange = (e) => {
    const c = e.target.closest("input[type=checkbox]"); if (!c) return;
    if (c.checked) pilihGuru.add(c.value); else pilihGuru.delete(c.value);
    q("#ju-guru-n").textContent = pilihGuru.size ? `· ${pilihGuru.size} dipilih` : "";
  };
  q("#ju-guru-cari").oninput = gambarGuru;
  q("#ju-guru-kosong").onclick = () => { pilihGuru.clear(); gambarGuru(); };
  q("#ju-guru-ampu").onclick = () => {
    const ampu = idAmpu();
    if (!ampu.size) return toast("Pilih mata pelajaran dulu, atau mapel ini belum punya guru pengampu di menu Data", "error");
    S.guru.forEach((g) => { if (g.aktif && ampu.has(g.id)) pilihGuru.add(g.id); });
    gambarGuru();
  };
  hitungMapel(); gambarGuru();

  const infoHari = () => {
    const v = q("#ju-tgl").value;
    q("#ju-hari-info").textContent = v ? `Hari: ${juHari(v)}` : "Hari terisi otomatis dari tanggal.";
  };
  q("#ju-tgl").onchange = infoHari; q("#ju-tgl").oninput = infoHari; infoHari();

  q("#ju-semua").onclick = () => cekKelas().forEach((c) => { c.checked = true; });
  q("#ju-kosong").onclick = () => cekKelas().forEach((c) => { c.checked = false; });
  m.body.querySelectorAll("[data-tingkat]").forEach((b) => {
    b.onclick = () => { const ids = new Set(tingkat.get(b.dataset.tingkat)); cekKelas().forEach((c) => { if (ids.has(c.value)) c.checked = true; }); };
  });
}

async function juHapus(r) {
  const ok = await konfirmasi(
    `Hapus jadwal <b>${esc(juNama(r.mapel))}</b> hari ${esc(juHari(r.tanggal))}, ${esc(juTglPendek(r.tanggal))} (${esc(juWaktu(r))})?<br><small>Jadwal ini juga hilang dari panel guru dan siswa.</small>`,
    { ya: "Hapus jadwal", bahaya: true });
  if (!ok) return;
  const { error } = await sb.from("jadwal_ujian").delete().eq("id", r.id);
  if (error) return toast("Gagal menghapus: " + error.message, "error");
  toast("Jadwal dihapus", "ok");
  muatUlang();
}

// ---------------------------------------------------------------------
//  Cetak dengan PRATINJAU (sesuai filter yang sedang tampil).
//  - Pratinjau = iframe yang berisi dokumen cetak; tombol Cetak mencetak
//    iframe itu, jadi yang dicetak persis yang terlihat.
//  - Judul & sub judul boleh diubah manual (judul diingat di perangkat ini).
//  - Font Times New Roman, seperti cetakan lain di aplikasi.
//  - Tata letak: dikelompokkan per hari, garis tabel halus, ringkasan otomatis,
//    catatan di bawah tabel, dan blok tanda tangan Kepala Sekolah.
//  - Kop & logo dari menu Pengaturan (fungsi kop_sekolah, 30_kop_jadwal_ujian.sql).
//    Bila belum diisi / belum dipasang, kop hanya memuat nama sekolah (config.js).
// ---------------------------------------------------------------------
const JU_KUNCI_JUDUL = "ju_judul_cetak";
const JU_KUNCI_TTD = "ju_cetak_ttd";
const juJudulIngat = () => { try { return localStorage.getItem(JU_KUNCI_JUDUL) || ""; } catch (_) { return ""; } };
const juJudulSimpan = (t) => { try { localStorage.setItem(JU_KUNCI_JUDUL, t); } catch (_) { /* abaikan */ } };
// Nama & NIP kepala sekolah, catatan, dan tempat diingat di perangkat ini supaya tidak diketik ulang.
const juTtdIngat = () => { try { return JSON.parse(localStorage.getItem(JU_KUNCI_TTD) || "{}") || {}; } catch (_) { return {}; } };
const juTtdSimpan = (o) => { try { localStorage.setItem(JU_KUNCI_TTD, JSON.stringify(o)); } catch (_) { /* abaikan */ } };

async function juAmbilKop() {
  try {
    const { data, error } = await sb.rpc("kop_sekolah");
    return error || !data ? null : data;
  } catch (_) { return null; }
}

function juKopHtml(pg) {
  const urlLogo = (n) => (n ? sb.storage.from("logo-sekolah").getPublicUrl(n).data.publicUrl : "");
  const baris = (kls, t) => (String(t || "").trim() ? `<div class="${kls}">${esc(t)}</div>` : "");
  const logo = (n) => `<div class="logo">${n ? `<img src="${esc(urlLogo(n))}" alt="">` : ""}</div>`;
  const ada = pg && ["pemerintah", "instansi", "nama_sekolah", "alamat_1", "alamat_2", "logo_kiri", "logo_kanan"]
    .some((k) => String(pg[k] || "").trim());
  if (!ada) {
    return `<div class="kop"><div class="logo"></div><div class="teks"><div class="k3">${esc(CONFIG.NAMA_SEKOLAH)}</div></div><div class="logo"></div></div>`;
  }
  return `<div class="kop">${logo(pg.logo_kiri)}<div class="teks">
    ${baris("k1", pg.pemerintah)}${baris("k2", pg.instansi)}${baris("k3", pg.nama_sekolah)}${baris("k4", pg.alamat_1)}${baris("k4", pg.alamat_2)}
  </div>${logo(pg.logo_kanan)}</div>`;
}

const juKertasMm = (o) => (o === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 });

function juDokumen(P) {
  const urutList = P.list.slice().sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.waktu_mulai.localeCompare(y.waktu_mulai));
  const adaRuang = urutList.some((r) => r.ruang);
  const kolom = 4 + (adaRuang ? 1 : 0);
  const baris = (arr) => (arr.length ? arr.map((x) => esc(x.nama)).join("<br>") : "-");
  const per = new Map();
  urutList.forEach((r) => { if (!per.has(r.tanggal)) per.set(r.tanggal, []); per.get(r.tanggal).push(r); });
  const isi = [...per].map(([tgl, arr]) => `<tbody>
    <tr class="hari"><td colspan="${kolom}">${esc(juHari(tgl))}, ${esc(juTglPanjang(tgl))}</td></tr>
    ${arr.map((r) => `<tr>
      <td class="w">${esc(juJam(r.waktu_mulai))} – ${esc(juJam(r.waktu_selesai))}</td>
      <td class="m">${baris(r.mapel)}</td>
      <td class="g">${baris(r.guru)}</td>
      <td class="g">${esc(juNama(r.kelas))}</td>
      ${adaRuang ? `<td class="g">${esc(r.ruang || "")}</td>` : ""}</tr>`).join("")}
  </tbody>`).join("");

  const tglTtd = P.tgl ? juTglPanjang(P.tgl) : "";
  const barisTempat = [P.tempat.trim(), tglTtd].filter(Boolean).map((t) => esc(t)).join(", ");
  const ttd = `<div class="ttd">
    ${barisTempat ? `<div>${barisTempat}</div>` : ""}
    <div>Kepala Sekolah,</div>
    <div class="ttd-nama">${P.nama.trim() ? `<b><u>${esc(P.nama.trim())}</u></b>` : "..........................................."}</div>
    ${P.nip.trim() || !P.nama.trim() ? `<div>NIP. ${P.nip.trim() ? esc(P.nip.trim()) : "..........................."}</div>` : ""}
  </div>`;

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${esc(P.judul || "Jadwal Ujian")}</title><style>
    @page{size:A4 ${P.orient};margin:12mm 14mm}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;background:#fff}
    body{font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.35;color:#000}
    @media screen{body{padding:12mm 14mm}}
    .kop{display:flex;align-items:center;gap:4mm;border-bottom:3px double #000;padding-bottom:3mm;margin-bottom:5mm}
    .kop .logo{flex:none;width:24mm;height:24mm;display:flex;align-items:center;justify-content:center}
    .kop .logo img{max-width:100%;max-height:100%;object-fit:contain}
    .kop .teks{flex:1;text-align:center;line-height:1.25}
    .k1{font-size:12pt;font-weight:600;text-transform:uppercase}
    .k2{font-size:13pt;font-weight:700;text-transform:uppercase}
    .k3{font-size:15pt;font-weight:800;text-transform:uppercase}
    .k4{font-size:9.5pt}
    h1{font-size:15pt;font-weight:700;text-align:center;letter-spacing:.4pt;margin:0}
    h1::after{content:"";display:block;width:36mm;border-top:.6pt solid #000;margin:1.6mm auto 0}
    .sub{text-align:center;margin:1.6mm 0 4.5mm}
    table{width:100%;border-collapse:collapse;border-left:1.2pt solid #000;border-right:1.2pt solid #000;border-bottom:1.2pt solid #000}
    thead{display:table-header-group}
    thead th{background:#e9ecef;border-top:1.2pt solid #000;border-bottom:1.2pt solid #000;padding:1.6mm 2.2mm;text-align:center;vertical-align:middle;font-weight:700;font-size:10.5pt}
    tbody{break-inside:avoid;page-break-inside:avoid}
    tbody td{padding:1.5mm 2.2mm;border-bottom:.4pt solid #9aa0a6;vertical-align:top;text-align:left}
    tbody tr.hari td{background:#f1f3f5;font-weight:700;border-top:.8pt solid #444;border-bottom:.6pt solid #444;padding:1.3mm 2.2mm}
    td.w{width:31mm;white-space:nowrap;font-weight:700}
    td.m{font-weight:700}
    td.g{font-size:10pt}
    th.w{width:31mm}
    .cat{margin-top:4mm;font-size:10pt;break-inside:avoid;page-break-inside:avoid}
    .ttd{width:68mm;margin:7mm 0 0 auto;break-inside:avoid;page-break-inside:avoid}
    .ttd-nama{margin-top:18mm}
  </style></head><body>
    ${P.kop}
    ${P.judul.trim() ? `<h1>${esc(P.judul)}</h1>` : ""}
    ${P.sub.trim() ? `<div class="sub">${esc(P.sub)}</div>` : ""}
    <table><thead><tr><th class="w">Waktu (WITA)</th><th>Mata Pelajaran</th><th>Guru Pengampu</th><th>Kelas</th>${adaRuang ? "<th>Ruang</th>" : ""}</tr></thead>
    ${isi}</table>
    ${P.catatan.trim() ? `<div class="cat"><b>Catatan:</b> ${esc(P.catatan.trim())}</div>` : ""}
    ${ttd}
  </body></html>`;
}

async function juCetak(list) {
  if (JU_PERAN !== "admin") return; // cetak hanya untuk admin (guru & siswa tidak punya tombol cetak)
  if (!list.length) return toast("Tidak ada jadwal untuk dicetak", "error");
  if (document.getElementById("ju-pv")) return;
  const pg = await juAmbilKop();
  const ing = juTtdIngat();
  const P = {
    list, kop: juKopHtml(pg),
    judul: juJudulIngat() || "JADWAL UJIAN", sub: periodeAktifTeks(), orient: "landscape",
    tempat: (pg && pg.tempat_ttd) || ing.tempat || "", tgl: juHariIni(),
    nama: ing.nama || "", nip: ing.nip || "", catatan: ing.catatan || "",
  };
  const simpanTtd = () => juTtdSimpan({ tempat: P.tempat, nama: P.nama, nip: P.nip, catatan: P.catatan });

  const el = document.createElement("div");
  el.id = "ju-pv"; el.className = "ju-pv";
  el.innerHTML = `
    <div class="ju-pv-bar">
      <div class="ju-pv-atas">
        <div class="ju-pv-judul"><b>Pratinjau cetak</b><small>${list.length} jadwal</small></div>
        <div class="ju-pv-aksi">
          <label>Kertas<select class="pilih" id="ju-pv-kertas"><option value="landscape">A4 Landscape</option><option value="portrait">A4 Portrait</option></select></label>
          <button class="btn btn-primary" id="ju-pv-print" type="button">🖨️ Cetak / Simpan PDF</button>
          <button class="btn" id="ju-pv-tutup" type="button">Tutup</button>
        </div>
      </div>
      <div class="ju-pv-isian">
        <label class="dua">Judul cetak<input class="input" id="ju-pv-judul" maxlength="120" value="${esc(P.judul)}" placeholder="Contoh: JADWAL PENILAIAN AKHIR SEMESTER"></label>
        <label class="dua">Sub judul<input class="input" id="ju-pv-sub" maxlength="160" value="${esc(P.sub)}" placeholder="(boleh kosong)"></label>
        <label>Tempat<input class="input" id="ju-pv-tempat" maxlength="60" value="${esc(P.tempat)}" placeholder="Contoh: Makassar"></label>
        <label>Tanggal tanda tangan<input class="input" type="date" id="ju-pv-tgl" value="${esc(P.tgl)}"></label>
        <label>Nama Kepala Sekolah<input class="input" id="ju-pv-nama" maxlength="100" value="${esc(P.nama)}" placeholder="(boleh kosong)"></label>
        <label>NIP<input class="input" id="ju-pv-nip" maxlength="40" value="${esc(P.nip)}" placeholder="(boleh kosong)"></label>
        <label class="semua">Catatan di bawah tabel<input class="input" id="ju-pv-cat" maxlength="300" value="${esc(P.catatan)}" placeholder="Contoh: Peserta hadir 15 menit sebelum ujian dimulai."></label>
      </div>
    </div>
    <p class="ju-pv-pet">Isi judul dan keterangan di atas, lalu klik <b>Cetak / Simpan PDF</b>. Pilih printer atau <b>Simpan sebagai PDF</b>, dan matikan “Header dan footer” bila ada. Pembagian halaman mengikuti printer.</p>
    <div class="ju-pv-layar" id="ju-pv-layar"><div class="ju-pv-kertas" id="ju-pv-kertas"><iframe id="ju-pv-ifr" title="Pratinjau jadwal ujian"></iframe></div></div>`;
  document.body.appendChild(el);
  const overflowLama = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const ifr = document.getElementById("ju-pv-ifr");
  const layar = document.getElementById("ju-pv-layar");
  const kertas = document.getElementById("ju-pv-kertas");

  const sesuaikan = () => {
    const mm = juKertasMm(P.orient), w = mm.w * 96 / 25.4, h = mm.h * 96 / 25.4;
    ifr.style.width = w + "px";
    ifr.style.height = "10px";
    let tinggi = h;
    try { tinggi = Math.max(h, ifr.contentDocument.documentElement.scrollHeight); } catch (_) { /* abaikan */ }
    ifr.style.height = tinggi + "px";
    kertas.style.zoom = String(Math.min(1, Math.max(0.2, (layar.clientWidth - 16) / w)));
  };
  ifr.onload = sesuaikan;
  const gambar = () => { ifr.srcdoc = juDokumen(P); };
  let tunda = null;
  const tundaGambar = () => { clearTimeout(tunda); tunda = setTimeout(gambar, 250); };
  const pasang = (id, kunci, simpan) => {
    document.getElementById(id).oninput = (e) => { P[kunci] = e.target.value; if (simpan) simpan(); tundaGambar(); };
  };

  pasang("ju-pv-judul", "judul", () => juJudulSimpan(P.judul));
  pasang("ju-pv-sub", "sub");
  pasang("ju-pv-tempat", "tempat", simpanTtd);
  pasang("ju-pv-tgl", "tgl");
  pasang("ju-pv-nama", "nama", simpanTtd);
  pasang("ju-pv-nip", "nip", simpanTtd);
  pasang("ju-pv-cat", "catatan", simpanTtd);
  document.getElementById("ju-pv-kertas").onchange = (e) => { P.orient = e.target.value; gambar(); };
  document.getElementById("ju-pv-print").onclick = () => {
    try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (_) { toast("Gagal membuka dialog cetak", "error"); }
  };

  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-bg")) tutup(); };
  const onResize = () => sesuaikan();
  function tutup() {
    clearTimeout(tunda);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    document.body.style.overflow = overflowLama;
    el.remove();
  }
  document.getElementById("ju-pv-tutup").onclick = tutup;
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  gambar();
}
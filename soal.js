"use strict";
// =====================================================================
//  BANK SOAL - Tahap 2B + Aktivasi Ujian (Jadwal, Kelas, Token)
// =====================================================================

const JENIS = {
  pg: "Pilihan ganda",
  pgk: "Pilihan ganda kompleks",
  bs: "Benar / Salah",
  jodoh: "Menjodohkan",
  esai: "Esai",
};
const HURUF = "ABCDEF";
const SL = { hal: 1, per: 20, jenis: "", cari: "", total: 0, baris: [], pilih: new Set(), timer: null, bank: null };

const slAdmin = () => PANEL === "admin"; // hanya admin: buat/ubah/hapus bank & aktifkan ujian
const slBr = (s) => teksSoalHtml(s); // termasuk gambar soal
const slPotong = (s, n = 140) => {
  s = teksRingkasGambar(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

// =====================================================================
//  1. PARSER FORMAT WORD
// =====================================================================
const SL_TAG = /^\[\s*(PG|PGK|BS|JODOH|ESAI|ESSAY)\s*\]\s*$/i;
const SL_NOMOR = /^\d{1,3}\s*[.)]\s+(.*)$/;
const SL_OPSI = /^([A-Fa-f])\s*[.)]\s*(.*)$/;
const SL_META = /^(kunci|jawaban|jawab|pembahasan|bobot|skor|pengecoh)\s*[:=]\s*(.*)$/i;
const SL_BS = /^(.*?)\s*\|\s*(benar|salah|b|s|true|false)\s*$/i;
const SL_PASANG = /^(.+?)\s*=\s*(.+)$/;
const SL_CONTOH = `[PG]
1. Ibu kota Indonesia adalah ...
A. Bandung
B. Jakarta
C. Surabaya
D. Medan
Kunci: B
Pembahasan: Jakarta adalah ibu kota negara.
Bobot: 2

[PGK]
2. Manakah yang termasuk bilangan prima?
A. 2
B. 4
C. 7
D. 9
Kunci: A, C

[BS]
3. Tentukan Benar atau Salah.
a. Matahari terbit di timur | Benar
b. Air mendidih pada 50 derajat Celsius | Salah

[JODOH]
4. Pasangkan negara dengan ibu kotanya.
Indonesia = Jakarta
Jepang = Tokyo
Prancis = Paris
Pengecoh: Roma

[ESAI]
5. Jelaskan proses fotosintesis!
Kunci: Tumbuhan mengubah cahaya, air, dan CO2 menjadi glukosa dan oksigen.
Bobot: 5`;

function slPecahBlok(teks) {
  const baris = String(teks || "").replace(/\r/g, "").split("\n")
    .map((s) => s.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const bloks = [];
  let sek = null, cur = null, diabaikan = 0;
  const tutup = () => { if (cur && cur.baris.length) bloks.push(cur); cur = null; };
  for (const b of baris) {
    const t = b.match(SL_TAG);
    if (t) { tutup(); sek = t[1].toLowerCase().replace("essay", "esai"); continue; }
    const n = b.match(SL_NOMOR);
    const lanjutan = n && cur && ((cur.jenis === "jodoh" && /=/.test(n[1])) || (cur.jenis === "bs" && /\|/.test(n[1])));
    if (n && !lanjutan) { tutup(); cur = { jenis: sek, baris: [n[1]] }; continue; }
    if (cur) { cur.baris.push(lanjutan ? n[1] : b); continue; }
    if (sek) { cur = { jenis: sek, baris: [b] }; continue; }
    diabaikan++;
  }
  tutup();
  return { bloks, diabaikan };
}

const slHurufKunci = (v) => {
  const set = new Set();
  String(v || "").split(/[^A-Za-z]+/).filter(Boolean).forEach((tok) => {
    if (/^[A-Fa-f]+$/.test(tok)) tok.toUpperCase().split("").forEach((h) => set.add(h));
  });
  return [...set].sort();
};

function slBangun(blok) {
  const stem = [], opsi = [], bs = [], pasang = [], meta = {}, lanjut = {};
  let mode = "stem", metaAktif = null;
  const j0 = blok.jenis;
  for (const b of blok.baris) {
    const m = b.match(SL_META);
    if (m) {
      let nama = m[1].toLowerCase();
      if (nama === "jawaban" || nama === "jawab") nama = "kunci";
      if (nama === "skor") nama = "bobot";
      metaAktif = nama; mode = "meta";
      if (nama === "pengecoh") (meta.pengecoh = meta.pengecoh || []).push(m[2].trim());
      else meta[nama] = m[2].trim();
      continue;
    }
    if (mode === "meta") { (lanjut[metaAktif] = lanjut[metaAktif] || []).push(b); continue; }
    if (j0 === "bs" || !j0) {
      const x = b.match(SL_BS);
      if (x) { bs.push({ teks: x[1].replace(/^[A-Za-z0-9]{1,2}\s*[.)]\s+/, "").trim(), benar: /^(benar|b|true)$/i.test(x[2]) }); mode = "bs"; continue; }
    }
    if (j0 === "jodoh") {
      const x = b.match(SL_PASANG);
      if (x) { pasang.push([x[1].trim(), x[2].trim()]); mode = "jodoh"; continue; }
      if (pasang.length) { pasang[pasang.length - 1][1] += " " + b; continue; }
    }
    if (!j0 || j0 === "pg" || j0 === "pgk") {
      const x = b.match(SL_OPSI);
      if (x) { opsi.push(x[2].trim()); mode = "opsi"; continue; }
      if (mode === "opsi" && opsi.length) { opsi[opsi.length - 1] += " " + b; continue; }
    }
    stem.push(b);
  }

  let jenis = j0;
  if (!jenis) jenis = bs.length ? "bs" : opsi.length ? (slHurufKunci(meta.kunci).length > 1 ? "pgk" : "pg") : "esai";

  const hasil = { jenis, pertanyaan: stem.join("\n").trim(), pilihan: null, kunci: null, pembahasan: null, bobot: 1 };
  if (meta.pembahasan !== undefined) {
    hasil.pembahasan = [meta.pembahasan, ...(lanjut.pembahasan || [])].join("\n").trim() || null;
  }
  if (meta.bobot !== undefined) {
    const v = parseFloat(String(meta.bobot).replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 9999) throw new Error("Bobot tidak valid. Tulis angka, contoh: Bobot: 2");
    hasil.bobot = v;
  }

  if (jenis === "pg" || jenis === "pgk") {
    if (!hasil.pertanyaan) throw new Error("Teks pertanyaan kosong.");
    if (opsi.length < 2) throw new Error("Pilihan jawaban tidak ditemukan. Tulis dengan huruf: A. B. C. D.");
    if (opsi.length > 6) throw new Error("Pilihan maksimal 6 (A sampai F).");
    if (opsi.some((o) => !o)) throw new Error("Ada pilihan yang isinya kosong.");
    if (!meta.kunci) throw new Error("Kunci jawaban belum ada. Tambahkan baris, contoh: Kunci: B");
    const huruf = slHurufKunci(meta.kunci);
    if (!huruf.length) throw new Error(`Kunci "${slPotong(meta.kunci, 30)}" tidak terbaca. Tulis huruf pilihan, contoh: Kunci: B`);
    const idx = huruf.map((h) => HURUF.indexOf(h));
    if (idx.some((i) => i >= opsi.length)) throw new Error("Kunci menunjuk huruf yang tidak ada di pilihan.");
    hasil.pilihan = opsi;
    if (jenis === "pg") {
      if (idx.length !== 1) throw new Error("Pilihan ganda hanya boleh satu kunci. Untuk banyak jawaban benar, pakai tag [PGK].");
      hasil.kunci = idx[0];
    } else hasil.kunci = idx;
  } else if (jenis === "bs") {
    let daftar = bs;
    const k = String(meta.kunci || "").trim();
    if (!daftar.length && /^(benar|salah|b|s|true|false)$/i.test(k) && hasil.pertanyaan) {
      daftar = [{ teks: hasil.pertanyaan, benar: /^(benar|b|true)$/i.test(k) }];
      hasil.pertanyaan = "";
    }
    if (!daftar.length) throw new Error("Pernyataan tidak ditemukan. Tulis tiap pernyataan, contoh: Matahari terbit di timur | Benar");
    if (daftar.some((d) => !d.teks)) throw new Error("Ada pernyataan yang kosong.");
    if (daftar.length > 10) throw new Error("Pernyataan maksimal 10 per soal.");
    if (!hasil.pertanyaan) hasil.pertanyaan = "Tentukan apakah setiap pernyataan berikut Benar atau Salah.";
    hasil.pilihan = daftar.map((d) => d.teks);
    hasil.kunci = daftar.map((d) => d.benar);
  } else if (jenis === "jodoh") {
    if (pasang.length < 2) throw new Error("Pasangan kurang dari 2. Tulis tiap pasangan, contoh: Indonesia = Jakarta");
    if (pasang.length > 10) throw new Error("Pasangan maksimal 10 per soal.");
    const kiri = pasang.map((p) => p[0]);
    const kanan = pasang.map((p) => p[1]);
    (meta.pengecoh || []).forEach((p) => p.split(";").map((x) => x.trim()).filter(Boolean).forEach((x) => kanan.push(x)));
    hasil.pilihan = { kiri, kanan };
    hasil.kunci = kiri.map((_, i) => i);
    if (!hasil.pertanyaan) hasil.pertanyaan = "Pasangkan pernyataan di kiri dengan pasangan yang tepat.";
  } else {
    if (!hasil.pertanyaan) throw new Error("Teks pertanyaan kosong.");
    hasil.kunci = [meta.kunci, ...(lanjut.kunci || [])].filter((x) => x !== undefined).join("\n").trim() || null;
  }
  return hasil;
}

function slParse(teks) {
  const { bloks, diabaikan } = slPecahBlok(teks);
  const soal = [], galat = [], semua = [];
  bloks.forEach((blok, i) => {
    const no = i + 1;
    const ringkas = slPotong(blok.baris[0], 90);
    try {
      const s = slBangun(blok);
      soal.push(s);
      semua.push({ no, ringkas: slPotong(s.pertanyaan || ringkas, 90), jenis: s.jenis, ok: true });
    } catch (e) {
      galat.push({ no, ringkas, pesan: e.message });
      semua.push({ no, ringkas, jenis: blok.jenis, ok: false, pesan: e.message });
    }
  });
  return { soal, galat, semua, diabaikan };
}

if (typeof module !== "undefined" && module.exports) module.exports = { slParse, SL_CONTOH };

// =====================================================================
//  2. BANK SOAL: DAFTAR (#soal), ISI BANK (#soal/<id>), & AKTIVASI UJIAN
// =====================================================================
const SB = { mapel: "", kelas: "", cari: "" };
const slIdHash = () => location.hash.slice(1).split("/")[1] || "";
const slKelasNama = (ids) => ids.map(namaKelas).sort(urut);
const slChipKelas = (ids) => ids.length
  ? slKelasNama(ids).map((n) => `<span class="chip">${esc(n)}</span>`).join("")
  : '<span class="badge warn">Kelas belum dipilih</span>';

const SL_PETUNJUK_DB = "Pastikan sudah menjalankan 04_database_bank_soal.sql, 08_database_aktifkan_bank_ujian.sql, dan 21_pengaturan_umum_jenis_ujian.sql di Supabase.";
const slBadgeJenis = (b) => (b.jenis_ujian ? `<span class="badge info jenis-ujian">${esc(b.jenis_ujian)}</span>` : "");

// Ikon garis (SVG) untuk tampilan Bank Soal & Hasil Ujian (pengganti emoji).
const PRO_IKON_DATA = {
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  jam: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  kunci: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l3 3M14 9l2 2"/>',
  tanggal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  peserta: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  cek: '<path d="M20 6 9 17l-5-5"/>',
  pensil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  rata: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  naik: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  turun: '<path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/>',
  belum: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  esai: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
};
const proIkon = (n) => `<svg class="pro-ikon" viewBox="0 0 24 24" aria-hidden="true">${PRO_IKON_DATA[n] || ""}</svg>`;
const SL_BANK_KOLOM = "id,nama,jenis_ujian,mapel_id,aktif,durasi_menit,waktu_mulai,waktu_selesai,token,acak_soal,tampil_nilai,ujian_id,bank_kelas(kelas_id),bank_soal(count)";

const slPetaBank = (b) => ({
  id: b.id,
  nama: b.nama,
  jenis_ujian: b.jenis_ujian || "",
  mapel_id: b.mapel_id,
  aktif: !!b.aktif,
  durasi_menit: b.durasi_menit || 60,
  waktu_mulai: b.waktu_mulai || null,
  waktu_selesai: b.waktu_selesai || null,
  token: b.token || "",
  acak_soal: b.acak_soal !== false,
  tampil_nilai: b.tampil_nilai !== false,
  ujian_id: b.ujian_id || null,
  kelas: (b.bank_kelas || []).map((x) => x.kelas_id),
  jumlah: (b.bank_soal && b.bank_soal[0] && b.bank_soal[0].count) || 0,
});

function slFormatJadwal(t) {
  if (!t) return "-";
  return fmtWITA(t, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " WITA";
}

function slToLocalInput(iso) {
  // Selalu WITA (bukan zona waktu perangkat admin)
  return witaKeInput(iso);
}

function slBuatTokenAcak(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function slBadgeStatusUjian(b) {
  if (!b.aktif) {
    return `<span class="badge off">Nonaktif (Draft)</span>`;
  }
  const now = sekarangMs(); // jam server
  const mulai = b.waktu_mulai ? new Date(b.waktu_mulai).getTime() : 0;
  const selesai = b.waktu_selesai ? new Date(b.waktu_selesai).getTime() : 0;
  if (selesai && now > selesai) {
    return `<span class="badge warn">Aktif &bull; Waktu Berakhir</span>`;
  }
  if (mulai && now < mulai) {
    return `<span class="badge info">Aktif &bull; Terjadwal</span>`;
  }
  return `<span class="badge ok">Aktif &bull; Siswa Bisa Ujian</span>`;
}

// Nama guru per bank (fungsi info_guru_bank dari 19_admin_kelola_bank_guru_isi_soal.sql).
// Guru pengisi soal diutamakan; bila belum ada soal, tampil guru pengampu mapel.
async function slIsiNamaGuru(daftar) {
  let peta = new Map();
  try {
    const { data, error } = await sb.rpc("info_guru_bank");
    if (error) throw error;
    peta = new Map((data || []).map((r) => [r.bank_id, r]));
  } catch (_) { /* fungsi belum dipasang: nama guru dikosongkan saja */ }
  daftar.forEach((b) => { const r = peta.get(b.id) || {}; b.guru = r.pengisi || r.pengampu || ""; });
  return daftar;
}
const slBarisGuru = (b) => `<div class="bank-guru">${proIkon("user")}<span>Guru: ${b.guru ? `<b>${esc(b.guru)}</b>` : '<span class="ket">belum ada guru ditugaskan</span>'}</span></div>`;

async function slMuatSemuaBank() {
  const { data, error } = await sb.from("bank").select(SL_BANK_KOLOM).order("nama").limit(1000);
  if (error) throw new Error(`${error.message}. ${SL_PETUNJUK_DB}`);
  return slIsiNamaGuru(data.map(slPetaBank));
}
async function slAmbilBank(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await sb.from("bank").select(SL_BANK_KOLOM).eq("id", id).maybeSingle();
  if (error) throw new Error(`${error.message}. ${SL_PETUNJUK_DB}`);
  if (!data) return null;
  const [b] = await slIsiNamaGuru([slPetaBank(data)]);
  return b;
}
// Jumlah seluruh bobot nilai soal. Memakai fungsi server total_bobot_bank (SQL 23)
// bila ada; bila belum dijalankan, dihitung di browser sebagai cadangan.
const slFmtBobot = (n) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
async function slMuatBobot(bankId) {
  const peta = new Map();
  try {
    const { data, error } = await sb.rpc("total_bobot_bank", bankId ? { p_bank_id: bankId } : {});
    if (error) throw error;
    (data || []).forEach((r) => peta.set(r.bank_id, Number(r.total_bobot) || 0));
    return peta;
  } catch (_) {
    try {
      const baris = await semua("bank_soal", "bank_id,bobot", bankId ? (q) => q.eq("bank_id", bankId) : null);
      baris.forEach((r) => peta.set(r.bank_id, (peta.get(r.bank_id) || 0) + (Number(r.bobot) || 0)));
      return peta;
    } catch (_2) {
      return null; // total tidak ditampilkan, fitur lain tetap jalan
    }
  }
}
const slInfoBank = (b) => `<div class="bank-info"><b>${esc(b.nama)}</b>
  <span class="badge info">Mapel: ${esc(namaMapel(b.mapel_id))}</span>${slChipKelas(b.kelas)}${b.guru ? `<span class="chip">${proIkon("user")} ${esc(b.guru)}</span>` : ""}</div>`;

async function rSoal() {
  await Promise.all([muatMapel(), muatKelas()]);
  if (PANEL === "guru" && (!S.mapel.length || !S.kelas.length)) {
    konten().innerHTML = kosong("Anda belum ditugaskan", "Bank soal disiapkan admin untuk mata pelajaran dan kelas yang Anda ampu. Minta admin sekolah menugaskan Anda di menu Data > Guru.");
    return;
  }
  if (!S.mapel.length) {
    konten().innerHTML = kosong("Belum ada mata pelajaran", "Bank soal dibuat untuk sebuah mata pelajaran. Tambahkan mapel dulu.",
      '<a class="btn btn-primary" href="#data/mapel">Ke menu Mata pelajaran</a>');
    return;
  }
  if (!S.kelas.length) {
    konten().innerHTML = kosong("Belum ada kelas", "Bank soal ditujukan untuk kelas tertentu. Tambahkan kelas dulu.",
      '<a class="btn btn-primary" href="#data/kelas">Ke menu Kelas</a>');
    return;
  }
  const id = slIdHash();
  return id ? slDetail(id) : slDaftar();
}

// ---------- daftar bank soal ----------
async function slDaftar() {
  SL.bank = null;
  const banks = await slMuatSemuaBank();
  const petaBobot = await slMuatBobot();
  banks.forEach((b) => { b.total_bobot = petaBobot ? (petaBobot.get(b.id) || 0) : null; });
  konten().innerHTML = `
    <div class="alat pro-alat">
      <div class="alat-kiri">
        <input class="input" id="bk-cari" type="search" placeholder="Cari nama bank soal / guru" value="${esc(SB.cari)}" aria-label="Cari bank soal">
        <select class="pilih" id="bk-f-mapel" aria-label="Filter mapel"><option value="">Semua mapel</option>
          ${S.mapel.map((m) => `<option value="${m.id}" ${SB.mapel === m.id ? "selected" : ""}>${esc(m.nama)}</option>`).join("")}</select>
        <select class="pilih" id="bk-f-kelas" aria-label="Filter kelas"><option value="">Semua kelas</option>
          ${S.kelas.map((k) => `<option value="${k.id}" ${SB.kelas === k.id ? "selected" : ""}>${esc(k.nama)}</option>`).join("")}</select>
      </div>
      <div class="alat-kanan">${slAdmin() ? '<button class="btn btn-primary" data-aksi="buat-bank">+ Buat bank soal</button>' : ""}</div>
    </div>
    ${slAdmin() ? "" : '<p class="ket">Bank soal dibuat dan diaktifkan oleh admin. Tugas Anda mengisi butir soal pada bank mata pelajaran Anda.</p>'}
    <div id="bk-isi"></div>`;

  const kartu = (b) => `
    <article class="bank-kartu ${b.aktif ? "bank-kartu-aktif" : ""}">
      <a class="bank-buka" href="#soal/${b.id}">
        <div class="bank-status-bar">${slBadgeStatusUjian(b)} ${slBadgeJenis(b)}</div>
        <h4>${esc(b.nama)}</h4>
        ${slBarisGuru(b)}
        <div class="bank-kelas">${slChipKelas(b.kelas)}</div>
        <div class="bank-jml"><b>${b.jumlah}</b> butir soal${b.total_bobot != null ? ` &middot; total bobot <b>${slFmtBobot(b.total_bobot)}</b>` : ""}</div>
        ${b.waktu_mulai || b.token ? `
          <div class="bank-jadwal-ringkas">
            ${b.waktu_mulai ? `<div class="bj-baris">${proIkon("jam")}<span class="bj-teks">${esc(slFormatJadwal(b.waktu_mulai))} &ndash; ${esc(slFormatJadwal(b.waktu_selesai))}</span></div>` : ""}
            <div class="bj-baris">${proIkon("timer")}<span>Durasi <b>${b.durasi_menit} menit</b></span><span class="bj-sep">&bull;</span>${b.token ? `${proIkon("kunci")}<span class="mono token-pill">${esc(b.token)}</span>` : "<span>Tanpa token</span>"}</div>
          </div>
        ` : `<div class="bank-jadwal-ringkas bj-kosong">Jadwal & token ujian belum diatur</div>`}
      </a>
      <div class="bank-aksi">
        ${slAdmin() ? `<button class="btn btn-kecil ${b.aktif ? "btn-amber" : "btn-primary"}" data-aksi="atur-ujian" data-id="${b.id}">
          ${b.aktif ? "Atur / Nonaktifkan" : "Aktifkan Ujian"}
        </button>` : ""}
        <a class="btn btn-kecil ${slAdmin() ? "" : "btn-primary"}" href="#soal/${b.id}">${slAdmin() ? "Soal" : "Isi Soal"}</a>
        ${slAdmin() ? `<span class="bank-sek"><button class="btn btn-kecil" data-aksi="ubah-bank" data-id="${b.id}">Ubah</button>
        <button class="btn btn-kecil btn-bahaya-halus" data-aksi="hapus-bank" data-id="${b.id}">Hapus</button></span>` : ""}
      </div>
    </article>`;

  const gambar = () => {
    const q = norm(SB.cari);
    const daftar = banks.filter((b) => (!SB.mapel || b.mapel_id === SB.mapel) && (!SB.kelas || b.kelas.includes(SB.kelas)) && (!q || norm(b.nama).includes(q) || norm(b.guru || "").includes(q)));
    let isi;
    if (!banks.length) {
      isi = slAdmin()
        ? kosong("Belum ada bank soal",
          "Bank soal adalah wadah soal untuk satu mata pelajaran dan kelas tertentu, misalnya Matematika kelas 9. Buat bank soalnya dulu, lalu guru mengisi soalnya.",
          '<button class="btn btn-primary" data-aksi="buat-bank">Buat bank soal</button>')
        : kosong("Belum ada bank soal untuk Anda",
          "Admin belum membuat bank soal untuk mata pelajaran yang Anda ampu. Hubungi admin sekolah.");
    } else if (!daftar.length) {
      isi = kosong("Tidak ada bank soal yang cocok", "Ubah kata kunci atau filter pencarian.");
    } else {
      daftar.sort((a, b) => urut(namaMapel(a.mapel_id), namaMapel(b.mapel_id)) || urut(a.nama, b.nama));
      const grup = new Map();
      daftar.forEach((b) => { if (!grup.has(b.mapel_id)) grup.set(b.mapel_id, []); grup.get(b.mapel_id).push(b); });
      isi = `<p class="ket">${daftar.length} bank soal</p>` + [...grup].map(([mid, arr]) =>
        `<h3 class="bank-grup">${esc(namaMapel(mid))}<small>${arr.length} bank soal</small></h3>
         <div class="bank-grid">${arr.map(kartu).join("")}</div>`).join("");
    }
    $("#bk-isi").innerHTML = isi;
  };

  $("#bk-cari").oninput = (e) => { SB.cari = e.target.value; gambar(); };
  $("#bk-f-mapel").onchange = (e) => { SB.mapel = e.target.value; gambar(); };
  $("#bk-f-kelas").onchange = (e) => { SB.kelas = e.target.value; gambar(); };
  konten().onclick = (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const bank = banks.find((x) => x.id === b.dataset.id);
    if (!slAdmin()) return;
    if (b.dataset.aksi === "buat-bank") slModalBank(null);
    if (b.dataset.aksi === "atur-ujian" && bank) slModalAturUjian(bank);
    if (b.dataset.aksi === "ubah-bank" && bank) slModalBank(bank);
    if (b.dataset.aksi === "hapus-bank" && bank) slHapusBank(bank);
  };
  gambar();
}

// ---------- isi satu bank soal ----------
async function slDetail(id) {
  const bank = await slAmbilBank(id);
  if (!bank) {
    SL.bank = null;
    konten().innerHTML = kosong("Bank soal tidak ditemukan", "Mungkin sudah dihapus.",
      '<a class="btn btn-primary" href="#soal">Kembali ke daftar bank soal</a>');
    return;
  }
  if (!SL.bank || SL.bank.id !== bank.id) { SL.hal = 1; SL.jenis = ""; SL.cari = ""; }
  SL.bank = bank; SL.pilih.clear();
  konten().innerHTML = `
    <p class="ket"><a class="bank-kembali" href="#soal">&larr; Semua bank soal</a></p>
    <div class="bank-kepala">
      <div>
        <div class="bank-status-bar">${slBadgeStatusUjian(bank)} ${slBadgeJenis(bank)}</div>
        <h2>${esc(bank.nama)}</h2>
        ${slBarisGuru(bank)}
        <div class="bank-meta">
          <span class="badge info">Mapel: ${esc(namaMapel(bank.mapel_id))}</span>
          ${slChipKelas(bank.kelas)}
          <span class="chip">${proIkon("timer")} ${bank.durasi_menit} menit</span>
          <span class="chip" id="sl-total-bobot" title="Nilai akhir siswa = skor yang diperoleh / total bobot x 100" hidden></span>
          ${bank.token ? `<span class="chip mono">${proIkon("kunci")} Token: ${esc(bank.token)}</span>` : ""}
        </div>
        ${bank.waktu_mulai ? `<p class="bank-jadwal-det">${proIkon("tanggal")}<span>Jadwal: <b>${esc(slFormatJadwal(bank.waktu_mulai))}</b> s/d <b>${esc(slFormatJadwal(bank.waktu_selesai))}</b></span></p>` : ""}
      </div>
      <div class="alat-kanan">
        ${slAdmin() ? `<button class="btn ${bank.aktif ? "btn-amber" : "btn-primary"}" data-aksi="atur-ujian">
          ${bank.aktif ? "Pengaturan Ujian (Aktif)" : "Aktifkan & Atur Ujian"}
        </button>
        <button class="btn btn-kecil" data-aksi="ubah-bank">Ubah bank</button>
        <button class="btn btn-kecil" data-aksi="hapus-bank">Hapus bank</button>` : '<span class="ket">Ujian diaktifkan oleh admin</span>'}
      </div>
    </div>
    <div class="alat pro-alat">
      <div class="alat-kiri">
        <input class="input" id="sl-cari" type="search" placeholder="Cari teks soal" value="${esc(SL.cari)}" aria-label="Cari soal">
        <select class="pilih" id="sl-jenis" aria-label="Filter jenis"><option value="">Semua jenis</option>
          ${Object.entries(JENIS).map(([k, v]) => `<option value="${k}" ${SL.jenis === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
      </div>
      <div class="alat-kanan">
        <button class="btn" data-aksi="impor">Impor dari Word</button>
        <button class="btn btn-primary" data-aksi="tambah">Tambah soal</button>
      </div>
    </div>
    <div id="sl-isi"><p class="memuat">Memuat...</p></div>`;

  $("#sl-cari").oninput = () => {
    clearTimeout(SL.timer);
    SL.timer = setTimeout(() => { SL.cari = $("#sl-cari").value.trim(); SL.hal = 1; slMuat(); }, 350);
  };
  $("#sl-jenis").onchange = () => { SL.jenis = $("#sl-jenis").value; SL.hal = 1; slMuat(); };
  $("#sl-isi").onchange = (e) => {
    const c = e.target;
    if (c.id === "sl-semua") SL.baris.forEach((s) => (c.checked ? SL.pilih.add(s.id) : SL.pilih.delete(s.id)));
    else if (c.dataset.id) c.checked ? SL.pilih.add(c.dataset.id) : SL.pilih.delete(c.dataset.id);
    else return;
    slGambar();
  };
  konten().onclick = async (e) => {
    const h = e.target.closest("[data-hal]");
    if (h) { SL.hal = +h.dataset.hal; slMuat(); return; }
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const a = b.dataset.aksi, sid = b.dataset.id;
    if (a === "tambah") slModal(null);
    if (a === "impor") slImpor();
    if (a === "lihat") slLihat(sid);
    if (a === "ubah") slUbah(sid);
    if (a === "hapus") slHapus([sid]);
    if (a === "hapus-pilih") slHapus([...SL.pilih]);
    if ((a === "atur-ujian" || a === "ubah-bank" || a === "hapus-bank") && slAdmin()) {
      let baru; try { baru = await slAmbilBank(SL.bank.id); } catch (err) { return toast(err.message, "error"); }
      if (!baru) return toast("Bank soal tidak ditemukan", "error");
      if (a === "atur-ujian") slModalAturUjian(baru);
      else if (a === "ubah-bank") slModalBank(baru);
      else slHapusBank(baru);
    }
  };
  await slMuat();
}

// =====================================================================
//  MODAL PENGATURAN & AKTIVASI UJIAN (Waktu, Kelas, Token, Status Aktif)
// =====================================================================
function slModalAturUjian(bank) {
  if (!slAdmin()) return toast("Hanya admin yang boleh mengaktifkan atau menonaktifkan ujian.", "error");
  const now = sekarangDate(); // jam server
  const defMulai = bank.waktu_mulai ? slToLocalInput(bank.waktu_mulai) : slToLocalInput(now.toISOString());
  const defSelesai = bank.waktu_selesai
    ? slToLocalInput(bank.waktu_selesai)
    : slToLocalInput(new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString());

  const html = `
    <div class="bank-info">
      <b>${esc(bank.nama)}</b>
      <span class="badge info">${esc(namaMapel(bank.mapel_id))}</span>
      <span class="badge ok">${bank.jumlah} Soal</span>
    </div>

    ${bank.jumlah === 0 ? `<div class="catatan"><b>Perhatian:</b> Bank soal ini belum memiliki butir soal. Tambahkan soal terlebih dahulu sebelum siswa mulai mengerjakan.</div>` : ""}

    <label class="f" style="display:flex;align-items:center;gap:.65rem;background:var(--biru-lembut);padding:.8rem 1rem;border-radius:12px;border:1px solid var(--biru-garis);cursor:pointer">
      <input type="checkbox" id="uj-aktif" ${bank.aktif ? "checked" : ""}>
      <div>
        <div style="font-weight:800;color:var(--navy)">Aktifkan Ujian untuk Siswa</div>
        <small style="margin:0">Jika dicentang, siswa pada kelas terpilih dapat melihat jadwal dan mengerjakan soal sesuai waktu ujian.</small>
      </div>
    </label>

    <label class="f">Jenis Ujian
      <input class="input" id="uj-jenis" maxlength="80" autocomplete="off" list="uj-jenis-daftar" placeholder="Contoh: UJIAN SEKOLAH atau UJIAN AKHIR SEMESTER" value="${esc(bank.jenis_ujian || "")}" style="text-transform:uppercase">
      <datalist id="uj-jenis-daftar"></datalist>
      <small>Ditulis manual. Tampil di layar siswa dan di cetakan hasil, supaya jelas ini ujian apa. Boleh dikosongkan.</small>
    </label>

    <div class="baris2">
      <label class="f">Waktu Mulai Ujian (WITA)
        <input class="input" type="datetime-local" id="uj-mulai" value="${esc(defMulai)}" required>
      </label>
      <label class="f">Waktu Selesai (Batas Akhir, WITA)
        <input class="input" type="datetime-local" id="uj-selesai" value="${esc(defSelesai)}" required>
      </label>
    </div>

    <div class="baris2">
      <label class="f">Durasi Pengerjaan (Menit)
        <input class="input" type="number" id="uj-durasi" min="1" max="600" value="${esc(String(bank.durasi_menit || 60))}">
        <small>Lama waktu hitung mundur masing-masing siswa.</small>
      </label>
      <label class="f">Token Ujian (Opsional)
        <div style="display:flex;gap:.45rem;margin-top:.35rem">
          <input class="input mono" id="uj-token" maxlength="20" placeholder="Kosong = tanpa token" value="${esc(bank.token || "")}" style="margin-top:0;text-transform:uppercase;font-weight:700;letter-spacing:.1em">
          <button class="btn btn-kecil" type="button" id="uj-gen-token" title="Buat token acak 6 karakter">Acak</button>
        </div>
        <small>Siswa wajib memasukkan token ini saat mulai ujian.</small>
      </label>
    </div>

    <div class="f">
      <div class="sl-judul">Kelas Peserta Ujian (centang kelas yang diizinkan ujian)</div>
      ${kotakPilih(S.kelas, "uj-kelas", bank.kelas)}
      <div class="bank-pk">
        <button class="btn btn-kecil btn-teks" type="button" data-uj-pk="semua">Pilih semua</button>
        <button class="btn btn-kecil btn-teks" type="button" data-uj-pk="kosong">Kosongkan</button>
      </div>
    </div>

    <div class="baris2" style="margin-top:.5rem">
      <label class="f" style="display:flex;align-items:center;gap:.5rem;margin:0">
        <input type="checkbox" id="uj-acak" ${bank.acak_soal !== false ? "checked" : ""}> Acak urutan soal per siswa
      </label>
      <label class="f" style="display:flex;align-items:center;gap:.5rem;margin:0">
        <input type="checkbox" id="uj-nilai" ${bank.tampil_nilai !== false ? "checked" : ""}> Tampilkan nilai setelah selesai
      </label>
    </div>
  `;

  const m = tampilModal("Aktifkan & Atur Jadwal Ujian", html, {
    lebar: "sedang",
    aksi: [
      { label: "Batal" },
      {
        label: "Simpan Pengaturan Ujian",
        kelas: "btn-primary",
        onClick: async () => {
          const aktif = m.body.querySelector("#uj-aktif").checked;
          const mulaiVal = m.body.querySelector("#uj-mulai").value;
          const selesaiVal = m.body.querySelector("#uj-selesai").value;
          const durasi = parseInt(m.body.querySelector("#uj-durasi").value, 10);
          const token = m.body.querySelector("#uj-token").value.trim().toUpperCase();
          const kelasIds = terpilih(m.body, "uj-kelas");
          const acak = m.body.querySelector("#uj-acak").checked;
          const tampilNilai = m.body.querySelector("#uj-nilai").checked;
          const jenis = m.body.querySelector("#uj-jenis").value.trim().replace(/\s+/g, " ").toUpperCase();

          if (!mulaiVal || !selesaiVal) throw new Error("Waktu mulai dan waktu selesai wajib diisi.");
          const mulaiDate = inputWitaKeDate(mulaiVal);
          const selesaiDate = inputWitaKeDate(selesaiVal);
          if (Number.isNaN(mulaiDate.getTime()) || Number.isNaN(selesaiDate.getTime())) {
            throw new Error("Format waktu ujian tidak valid.");
          }
          if (selesaiDate <= mulaiDate) {
            throw new Error("Waktu selesai ujian harus lebih akhir daripada waktu mulai.");
          }
          if (!Number.isFinite(durasi) || durasi < 1) {
            throw new Error("Durasi ujian minimal 1 menit.");
          }
          if (aktif && !kelasIds.length) {
            throw new Error("Centang minimal satu kelas peserta untuk mengaktifkan ujian.");
          }
          if (aktif && bank.jumlah === 0) {
            throw new Error("Bank soal masih kosong (0 soal). Tambahkan soal dulu sebelum mengaktifkan ujian.");
          }

          const { error } = await sb.rpc("sinkron_bank_ke_ujian", {
            p_bank_id: bank.id,
            p_aktif: aktif,
            p_durasi_menit: durasi,
            p_waktu_mulai: mulaiDate.toISOString(),
            p_waktu_selesai: selesaiDate.toISOString(),
            p_token: token || null,
            p_acak_soal: acak,
            p_tampil_nilai: tampilNilai,
            p_kelas_ids: kelasIds,
          });
          if (error) throw new Error(error.message);

          // Jenis ujian disimpan setelah jadwal (baris ujian sudah pasti ada)
          const { error: eJenis } = await sb.rpc("atur_jenis_ujian", { p_bank_id: bank.id, p_jenis: jenis });
          if (eJenis) throw new Error("Jadwal tersimpan, tetapi jenis ujian gagal disimpan: " + eJenis.message + ". Pastikan 21_pengaturan_umum_jenis_ujian.sql sudah dijalankan di Supabase.");

          toast(aktif ? "Ujian berhasil DIAKTIFKAN! Siswa sudah dapat mengakses ujian." : "Pengaturan ujian disimpan (status Nonaktif).", "ok");
          rSoal();
        },
      },
    ],
  });

  // Saran jenis ujian dari yang pernah ditulis (supaya penulisannya seragam)
  sb.from("bank").select("jenis_ujian").then(({ data }) => {
    const dl = m.body.querySelector("#uj-jenis-daftar");
    if (!dl) return;
    const l = [...new Set((data || []).map((x) => String(x.jenis_ujian || "").trim()).filter(Boolean))].sort(urut);
    dl.innerHTML = l.map((x) => `<option value="${esc(x)}"></option>`).join("");
  });
  m.body.querySelector("#uj-gen-token").onclick = () => {
    m.body.querySelector("#uj-token").value = slBuatTokenAcak(6);
  };
  m.body.addEventListener("click", (e) => {
    const p = e.target.closest("[data-uj-pk]");
    if (!p) return;
    m.body.querySelectorAll('input[name="uj-kelas"]').forEach((c) => {
      if (!c.disabled) c.checked = p.dataset.ujPk === "semua";
    });
  });
  // Guru: hanya kelas yang ia ampu untuk mapel bank ini yang bisa dicentang.
  if (PANEL === "guru") {
    const boleh = new Set(S.penugasan.filter((p) => p.mapel_id === bank.mapel_id).map((p) => p.kelas_id));
    const awal = new Set(bank.kelas);
    m.body.querySelectorAll('input[name="uj-kelas"]').forEach((c) => {
      const tutup = !boleh.has(c.value) && !awal.has(c.value);
      c.disabled = tutup;
      if (tutup) { c.checked = false; c.closest("label").style.opacity = ".45"; }
    });
  }
}

// ---------- buat / ubah / hapus bank ----------
function slModalBank(b) {
  if (!slAdmin()) return toast("Hanya admin yang boleh membuat atau mengubah bank soal.", "error");
  const edit = !!b;
  const kunciMapel = edit && b.jumlah > 0;
  const mapel0 = b ? b.mapel_id : SB.mapel || S.mapel[0].id;
  const html = `
    <label class="f">Mata pelajaran
      <select class="pilih" id="bk-mapel" ${kunciMapel ? "disabled" : ""}>
        ${S.mapel.map((m) => `<option value="${m.id}" ${m.id === mapel0 ? "selected" : ""}>${esc(m.nama)}</option>`).join("")}</select>
      ${kunciMapel ? "<small>Mapel tidak bisa diubah karena bank ini sudah berisi soal.</small>" : ""}</label>
    <div class="f"><div class="sl-judul">Kelas (centang semua yang memakai bank ini)</div>
      ${kotakPilih(S.kelas, "bk-kelas", b ? b.kelas : [])}
      <div class="bank-pk"><button class="btn btn-kecil btn-teks" type="button" data-pk="semua">Pilih semua</button>
        <button class="btn btn-kecil btn-teks" type="button" data-pk="kosong">Kosongkan</button></div></div>
    <label class="f">Nama bank soal
      <input class="input" id="bk-nama" maxlength="120" autocomplete="off" value="${esc(b ? b.nama : "")}">
      <small>Terisi otomatis dari mapel dan kelas. Boleh diubah. Soalnya nanti diisi oleh guru pengampu mapel ini.</small></label>`;

  const m = tampilModal(edit ? "Ubah bank soal" : "Buat bank soal", html, {
    lebar: "sedang",
    aksi: [{ label: "Batal" }, {
      label: edit ? "Simpan perubahan" : "Buat bank soal", kelas: "btn-primary",
      onClick: async () => {
        const mapel_id = q("#bk-mapel").value, nama = q("#bk-nama").value.trim(), kelas = terpilih(m.body, "bk-kelas");
        if (!nama) throw new Error("Nama bank soal tidak boleh kosong.");
        if (!kelas.length) throw new Error("Centang minimal satu kelas.");
        const galat = (er) => new Error(er.code === "23505" ? "Sudah ada bank soal dengan nama itu pada mapel ini." : er.message);
        if (!edit) {
          const { data, error } = await sb.from("bank").insert({ nama, mapel_id, pembuat: S.me.id }).select("id").single();
          if (error) throw galat(error);
          const { error: e2 } = await sb.from("bank_kelas").insert(kelas.map((k) => ({ bank_id: data.id, kelas_id: k })));
          if (e2) { await sb.from("bank").delete().eq("id", data.id); throw new Error(e2.message); }
          toast("Bank soal dibuat. Guru pengampu mapel ini sekarang bisa mengisi soalnya.", "ok");
          location.hash = "soal/" + data.id;
          return;
        }
        const ubah = { nama };
        if (!kunciMapel) ubah.mapel_id = mapel_id;
        const { error } = await sb.from("bank").update(ubah).eq("id", b.id);
        if (error) throw galat(error);
        const lama = new Set(b.kelas), baru = new Set(kelas);
        const buang = [...lama].filter((k) => !baru.has(k)), tambah = [...baru].filter((k) => !lama.has(k));
        if (buang.length) {
          const { error: e3 } = await sb.from("bank_kelas").delete().eq("bank_id", b.id).in("kelas_id", buang);
          if (e3) throw new Error(e3.message);
        }
        if (tambah.length) {
          const { error: e4 } = await sb.from("bank_kelas").insert(tambah.map((k) => ({ bank_id: b.id, kelas_id: k })));
          if (e4) throw new Error(e4.message);
        }
        if (b.ujian_id) {
          await sb.from("ujian_kelas").delete().eq("ujian_id", b.ujian_id);
          await sb.from("ujian_kelas").insert(kelas.map((k) => ({ ujian_id: b.ujian_id, kelas_id: k })));
        }
        toast("Bank soal diperbarui", "ok");
        rSoal();
      },
    }],
  });
  const q = (s) => m.body.querySelector(s);
  // Guru: hanya kelas yang ia ampu untuk mapel terpilih yang bisa dicentang.
  const batasiKelasGuru = () => {
    if (PANEL !== "guru") return;
    const mp = q("#bk-mapel").value;
    const boleh = new Set(S.penugasan.filter((p) => p.mapel_id === mp).map((p) => p.kelas_id));
    const awal = new Set(b ? b.kelas : []);
    m.body.querySelectorAll('input[name="bk-kelas"]').forEach((c) => {
      const ok = boleh.has(c.value);
      c.disabled = !ok && !awal.has(c.value);
      if (!ok && !awal.has(c.value)) c.checked = false;
      c.closest("label").style.opacity = c.disabled ? ".45" : "";
    });
  };
  batasiKelasGuru();
  q("#bk-mapel").addEventListener("change", () => { batasiKelasGuru(); });
  const saran = () => {
    const ks = terpilih(m.body, "bk-kelas").map(namaKelas).sort(urut);
    const mp = namaMapel(q("#bk-mapel").value);
    return ks.length ? `${mp} - Kelas ${ks.join(", ")}` : mp;
  };
  let manual = edit && b.nama !== saran();
  if (!edit) q("#bk-nama").value = saran();
  q("#bk-nama").addEventListener("input", () => { manual = true; });
  const sinkron = () => { if (!manual) q("#bk-nama").value = saran(); };
  m.body.addEventListener("change", (e) => { if (e.target.id === "bk-mapel" || e.target.name === "bk-kelas") sinkron(); });
  m.body.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pk]"); if (!p) return;
    m.body.querySelectorAll('input[name="bk-kelas"]').forEach((c) => { if (!c.disabled) c.checked = p.dataset.pk === "semua"; });
    sinkron();
  });
}

async function slHapusBank(b) {
  if (!slAdmin()) return toast("Hanya admin yang boleh menghapus bank soal.", "error");
  const pesan = b.jumlah
    ? `Hapus bank soal <b>${esc(b.nama)}</b> beserta <b>${b.jumlah}</b> soal di dalamnya? Tindakan ini tidak bisa dibatalkan.`
    : `Hapus bank soal <b>${esc(b.nama)}</b>? Bank ini masih kosong.`;
  if (!await konfirmasi(pesan, { ya: "Hapus bank soal", bahaya: true, judul: "Hapus bank soal" })) return;
  if (b.ujian_id) {
    await sb.from("ujian").delete().eq("id", b.ujian_id);
  }
  const { error } = await sb.from("bank").delete().eq("id", b.id);
  if (error) return toast("Gagal menghapus: " + error.message, "error");
  toast("Bank soal dihapus", "ok");
  if (slIdHash()) location.hash = "soal"; else rSoal();
}

// ---------- tabel soal di dalam bank ----------
async function slMuat() {
  const isi = $("#sl-isi"); if (!isi || !SL.bank) return;
  const bid = SL.bank.id;
  const dari = (SL.hal - 1) * SL.per;
  let q = sb.from("bank_soal").select("id,jenis,pertanyaan,bobot", { count: "exact" })
    .eq("bank_id", bid).order("no", { ascending: true }).range(dari, dari + SL.per - 1);
  if (SL.jenis) q = q.eq("jenis", SL.jenis);
  if (SL.cari) q = q.ilike("pertanyaan", `%${SL.cari.replace(/[%_\\]/g, "\\$&")}%`);
  const [{ data, error, count }, petaBobot] = await Promise.all([q, slMuatBobot(bid)]);
  if (!SL.bank || SL.bank.id !== bid || !$("#sl-isi")) return;
  const chipBobot = $("#sl-total-bobot");
  if (chipBobot) {
    chipBobot.hidden = !petaBobot;
    if (petaBobot) chipBobot.innerHTML = `Total bobot: <b>${slFmtBobot(petaBobot.get(bid) || 0)}</b>`;
  }
  if (error) { $("#sl-isi").innerHTML = `<div class="galat-blok"><b>Gagal memuat soal.</b><br>${esc(error.message)}<br><small>${SL_PETUNJUK_DB}</small></div>`; return; }
  if (!data.length && SL.hal > 1) { SL.hal--; return slMuat(); }
  SL.baris = data; SL.total = count || 0;
  slGambar();
}

function slGambar() {
  const isi = $("#sl-isi"); if (!isi) return;
  const filter = SL.cari || SL.jenis;
  const n = SL.pilih.size;
  const awal = (SL.hal - 1) * SL.per;
  const semuaDicek = SL.baris.length && SL.baris.every((s) => SL.pilih.has(s.id));
  isi.innerHTML = `
    <p class="ket">${SL.total} soal${filter ? " (sesuai filter)" : ""}</p>
    ${n ? `<div class="pilihan"><span>${n} soal dipilih</span><button class="btn btn-kecil btn-danger" data-aksi="hapus-pilih">Hapus terpilih</button></div>` : ""}
    ${SL.baris.length ? `<div class="tabel-bungkus"><table class="resp"><thead><tr>
      <th class="cek"><input type="checkbox" id="sl-semua" ${semuaDicek ? "checked" : ""} aria-label="Pilih semua di halaman ini"></th>
      <th>No</th><th>Soal</th><th>Jenis</th><th>Bobot</th><th></th></tr></thead><tbody>
      ${SL.baris.map((s, i) => `<tr ${SL.pilih.has(s.id) ? 'class="sorot-baris"' : ""}>
        <td class="cek"><input type="checkbox" data-id="${s.id}" ${SL.pilih.has(s.id) ? "checked" : ""} aria-label="Pilih soal"></td>
        <td data-label="No" class="angka">${awal + i + 1}</td>
        <td data-label="Soal">${esc(slPotong(s.pertanyaan))}</td>
        <td data-label="Jenis"><span class="badge info jenis-${esc(s.jenis)}">${esc(JENIS[s.jenis] || s.jenis)}</span></td>
        <td data-label="Bobot" class="angka">${esc(String(+s.bobot))}</td>
        <td class="aksi"><button class="btn btn-kecil" data-aksi="lihat" data-id="${s.id}">Lihat</button>
          <button class="btn btn-kecil" data-aksi="ubah" data-id="${s.id}">Ubah</button>
          <button class="btn btn-kecil" data-aksi="hapus" data-id="${s.id}">Hapus</button></td></tr>`).join("")}
      </tbody></table></div>${pager(SL.total, SL.hal, SL.per)}`
    : kosong(filter ? "Tidak ada soal yang cocok" : "Bank soal ini masih kosong",
        filter ? "Ubah kata kunci atau filter pencarian." : "Tambahkan soal satu per satu, atau impor sekaligus dari berkas Word.",
        filter ? "" : '<button class="btn btn-primary" data-aksi="tambah">Tambah soal</button> <button class="btn" data-aksi="impor">Impor dari Word</button>')}`;
}

// =====================================================================
//  3. EDITOR SOAL
// =====================================================================
const SL_MAKS = { pg: 6, pgk: 6, bs: 10, jodoh: 10 };
const SL_MIN = { pg: 2, pgk: 2, bs: 1, jodoh: 2 };

function slDefault(jenis) {
  if (jenis === "pg") return { pilihan: ["", "", "", ""], kunci: 0 };
  if (jenis === "pgk") return { pilihan: ["", "", "", ""], kunci: [] };
  if (jenis === "bs") return { pilihan: ["", ""], kunci: [true, true] };
  if (jenis === "jodoh") return { pilihan: { kiri: ["", "", ""], kanan: ["", "", ""] }, kunci: [0, 1, 2] };
  return { pilihan: null, kunci: "" };
}

const SL_TOMBOL_GBR = '<button class="btn btn-kecil sl-gbr" type="button" data-aksi="gambar" title="Sisipkan gambar" aria-label="Sisipkan gambar">&#128444;</button>';

function slBarisHtml(jenis, i, v = {}) {
  const x = '<button class="btn btn-kecil sl-hapus" type="button" data-aksi="hapus-baris" aria-label="Hapus baris">&times;</button>';
  if (jenis === "pg" || jenis === "pgk") {
    return `<div class="sl-baris"><span class="sl-huruf">${HURUF[i]}</span>
      <input class="input" data-f="teks" value="${esc(v.teks || "")}" placeholder="Isi pilihan" aria-label="Isi pilihan">${SL_TOMBOL_GBR}
      <label class="sl-kunci"><input type="${jenis === "pg" ? "radio" : "checkbox"}" name="sl-kunci" data-f="kunci" ${v.benar ? "checked" : ""}> Kunci</label>${x}</div>`;
  }
  if (jenis === "bs") {
    return `<div class="sl-baris"><span class="sl-huruf">${i + 1}</span>
      <input class="input" data-f="teks" value="${esc(v.teks || "")}" placeholder="Tulis pernyataan" aria-label="Pernyataan">${SL_TOMBOL_GBR}
      <select class="pilih sl-bs" data-f="bs" aria-label="Kunci">
        <option value="1" ${v.benar !== false ? "selected" : ""}>Benar</option><option value="0" ${v.benar === false ? "selected" : ""}>Salah</option></select>${x}</div>`;
  }
  return `<div class="sl-baris"><span class="sl-huruf">${i + 1}</span>
    <input class="input" data-f="kiri" value="${esc(v.kiri || "")}" placeholder="Sisi kiri" aria-label="Sisi kiri">${SL_TOMBOL_GBR}
    <span class="sl-panah" aria-hidden="true">&harr;</span>
    <input class="input" data-f="kanan" value="${esc(v.kanan || "")}" placeholder="Pasangan kanan" aria-label="Pasangan kanan">${SL_TOMBOL_GBR}${x}</div>`;
}

function slDinamisHtml(jenis, d) {
  if (jenis === "esai") {
    return `<label class="f">Pedoman jawaban (opsional)<textarea class="area" id="sl-f-kunci">${esc(d.kunci || "")}</textarea>
      <small>Dipakai guru saat menilai. Soal esai dinilai manual.</small></label>`;
  }
  let baris, judul, tambah, ekstra = "";
  if (jenis === "pg" || jenis === "pgk") {
    baris = d.pilihan.map((t, i) => slBarisHtml(jenis, i, { teks: t, benar: jenis === "pg" ? d.kunci === i : (d.kunci || []).includes(i) }));
    judul = jenis === "pg" ? "Pilihan jawaban (pilih satu kunci)" : "Pilihan jawaban (centang semua yang benar)";
    tambah = "+ Pilihan";
  } else if (jenis === "bs") {
    baris = d.pilihan.map((t, i) => slBarisHtml("bs", i, { teks: t, benar: d.kunci[i] !== false }));
    judul = "Pernyataan dan kuncinya"; tambah = "+ Pernyataan";
  } else {
    const n = d.pilihan.kiri.length;
    baris = d.pilihan.kiri.map((k, i) => slBarisHtml("jodoh", i, { kiri: k, kanan: d.pilihan.kanan[i] }));
    judul = "Pasangan yang benar"; tambah = "+ Pasangan";
    ekstra = `<label class="f">Pengecoh (opsional)<textarea class="area" id="sl-f-pengecoh" style="min-height:70px" placeholder="Satu per baris">${esc(d.pilihan.kanan.slice(n).join("\n"))}</textarea>
      <small>Pilihan di sisi kanan yang tidak punya pasangan.</small></label>`;
  }
  return `<div class="f"><div class="sl-judul">${judul}</div>
    <div class="sl-daftar" data-jenis="${jenis}">${baris.join("")}</div>
    <button class="btn btn-kecil" type="button" data-aksi="tambah-baris">${tambah}</button></div>${ekstra}`;
}

function slNomori(daftar, jenis) {
  daftar.querySelectorAll(".sl-baris").forEach((r, i) => {
    r.querySelector(".sl-huruf").textContent = jenis === "pg" || jenis === "pgk" ? HURUF[i] : i + 1;
  });
}

function slAmbil(m, jenis) {
  const g = (id) => m.body.querySelector(id);
  const err = (p) => { throw new Error(p); };
  const pertanyaan = g("#sl-f-tanya").value.trim();
  const bobot = parseFloat(String(g("#sl-f-bobot").value).replace(",", "."));
  const pembahasan = g("#sl-f-bahas").value.trim() || null;
  if (!pertanyaan) err("Tulis pertanyaan atau petunjuk soal.");
  if (!Number.isFinite(bobot) || bobot < 0 || bobot > 9999) err("Bobot harus berupa angka 0 atau lebih.");
  const baris = [...m.body.querySelectorAll(".sl-baris")];
  const f = (r, k) => r.querySelector(`[data-f=${k}]`);
  let pilihan = null, kunci = null;
  if (jenis === "pg" || jenis === "pgk") {
    pilihan = baris.map((r) => f(r, "teks").value.trim());
    const kos = pilihan.findIndex((t) => !t);
    if (kos >= 0) err(`Pilihan ${HURUF[kos]} masih kosong.`);
    const cek = baris.map((r, i) => (f(r, "kunci").checked ? i : -1)).filter((i) => i >= 0);
    if (!cek.length) err("Tandai kunci jawaban yang benar.");
    kunci = jenis === "pg" ? cek[0] : cek;
  } else if (jenis === "bs") {
    pilihan = baris.map((r) => f(r, "teks").value.trim());
    const kos = pilihan.findIndex((t) => !t);
    if (kos >= 0) err(`Pernyataan ${kos + 1} masih kosong.`);
    kunci = baris.map((r) => f(r, "bs").value === "1");
  } else if (jenis === "jodoh") {
    const kiri = baris.map((r) => f(r, "kiri").value.trim());
    const kanan = baris.map((r) => f(r, "kanan").value.trim());
    const kos = kiri.findIndex((t, i) => !t || !kanan[i]);
    if (kos >= 0) err(`Pasangan ${kos + 1} belum lengkap (kiri dan kanan harus terisi).`);
    const peng = g("#sl-f-pengecoh").value.split("\n").map((x) => x.trim()).filter(Boolean);
    pilihan = { kiri, kanan: [...kanan, ...peng] };
    kunci = kiri.map((_, i) => i);
  } else {
    kunci = g("#sl-f-kunci").value.trim() || null;
  }
  return { jenis, pertanyaan, pilihan, kunci, pembahasan, bobot };
}

// ---------------------------------------------------------------------
//  Gambar di editor soal
// ---------------------------------------------------------------------
const SL_GBR_FIELD = "#sl-f-tanya, #sl-f-pengecoh, .sl-baris input[data-f=teks], .sl-baris input[data-f=kiri], .sl-baris input[data-f=kanan]";

function slSisipTeks(el, token) {
  const a = el.selectionStart ?? el.value.length;
  const b = el.selectionEnd ?? a;
  let pre = el.value.slice(0, a);
  let post = el.value.slice(b);
  if (el.tagName === "TEXTAREA") {
    if (pre && !pre.endsWith("\n")) pre += "\n";
    if (post && !post.startsWith("\n")) post = "\n" + post;
  }
  el.value = pre + token + post;
  const pos = (pre + token).length;
  try { el.setSelectionRange(pos, pos); } catch (_) {}
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function slSisipGambar(el, files, tombol) {
  const maxSisi = el.id === "sl-f-tanya" ? 1280 : 800; // pilihan jawaban cukup lebih kecil
  const labelAsal = tombol ? tombol.innerHTML : "";
  if (tombol) { tombol.disabled = true; tombol.textContent = "Memproses..."; }
  try {
    for (const f of files) {
      try {
        const r = await unggahGambarSoal(f, { maxSisi });
        slSisipTeks(el, r.token);
        toast(`Gambar tersimpan: ${r.asliKB} KB → ${r.hasilKB} KB`, "ok");
      } catch (e) {
        toast(e.message || "Gagal mengunggah gambar", "error");
      }
    }
  } finally {
    if (tombol) { tombol.disabled = false; tombol.innerHTML = labelAsal; }
  }
}

function slPilihFile(el, tombol) {
  const fi = document.createElement("input");
  fi.type = "file"; fi.accept = "image/*"; fi.multiple = true;
  fi.onchange = () => { if (fi.files && fi.files.length) slSisipGambar(el, [...fi.files], tombol); };
  fi.click();
}

// Gambar kecil (thumbnail) + tombol hapus di bawah tiap kolom yang memuat gambar
function slThumbs(body) {
  const strip = (host, fields) => {
    const nama = [];
    fields.forEach((f) => { for (const m of f.value.matchAll(GAMBAR_TOKEN_RE)) nama.push(m[1]); });
    const sig = nama.join("|");
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig;
    host.innerHTML = nama.map((n) => `<span class="sl-thumb"><img class="sl-thumb-img" src="${urlGambar(n)}" alt="Gambar"><button type="button" class="sl-thumb-x" data-aksi="buang-gambar" data-nama="${n}" title="Hapus gambar dari soal" aria-label="Hapus gambar">&times;</button></span>`).join("");
  };
  const tanya = body.querySelector("#sl-f-tanya");
  const hostTanya = body.querySelector('.sl-thumbs[data-thumb-untuk="#sl-f-tanya"]');
  if (tanya && hostTanya) strip(hostTanya, [tanya]);
  body.querySelectorAll(".sl-baris").forEach((r) => {
    let host = r.querySelector(":scope > .sl-thumbs");
    if (!host) { host = document.createElement("div"); host.className = "sl-thumbs"; r.appendChild(host); }
    strip(host, [...r.querySelectorAll("input[data-f=teks], input[data-f=kiri], input[data-f=kanan]")]);
  });
}

function slModal(s, awal = {}) {
  const bank = SL.bank;
  if (!bank) return toast("Buka sebuah bank soal dulu", "error");
  const edit = !!s;
  let jenis = s ? s.jenis : awal.jenis || "pg";
  const html = `
    ${slInfoBank(bank)}
    <label class="f">Jenis soal<select class="pilih" id="sl-f-jenis" ${edit ? "disabled" : ""}>
      ${Object.entries(JENIS).map(([k, v]) => `<option value="${k}" ${k === jenis ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
      ${edit ? "<small>Jenis tidak bisa diubah. Buat soal baru bila perlu.</small>" : ""}</label>
    <label class="f">Pertanyaan<textarea class="area" id="sl-f-tanya" placeholder="Tulis pertanyaan atau petunjuk soal">${esc(s ? s.pertanyaan : "")}</textarea></label>
    <div class="sl-tombol-gbr">
      <button class="btn btn-kecil" type="button" data-aksi="gambar" data-target="#sl-f-tanya">&#128444; Sisipkan gambar</button>
      <small>atau tempel (Ctrl+V) / seret gambar ke kolom teks. Otomatis dikompres &le; ${GAMBAR_TARGET_KB} KB.</small>
      <div class="sl-thumbs" data-thumb-untuk="#sl-f-tanya"></div>
    </div>
    <div id="sl-dinamis"></div>
    <div class="baris2">
      <label class="f">Bobot nilai<input class="input" id="sl-f-bobot" type="number" min="0" step="0.5" value="${s ? +s.bobot : 1}"></label>
      <span></span>
    </div>
    <label class="f">Penjelasan jawaban (opsional)<textarea class="area" id="sl-f-bahas" style="min-height:70px">${esc(s && s.pembahasan ? s.pembahasan : "")}</textarea></label>`;

  const simpan = async (m) => {
    const data = slAmbil(m, jenis);
    if (edit) { const { error } = await sb.from("bank_soal").update(data).eq("id", s.id); if (error) throw error; }
    else { const { error } = await sb.from("bank_soal").insert({ ...data, bank_id: bank.id, mapel_id: bank.mapel_id, pembuat: S.me.id }); if (error) throw error; }
    toast(edit ? "Soal diperbarui" : "Soal tersimpan", "ok");
    return data;
  };
  const m = tampilModal(edit ? "Ubah soal" : "Tambah soal", html, {
    lebar: "sedang",
    aksi: [
      { label: "Batal" },
      ...(edit ? [] : [{ label: "Simpan & tambah lagi", onClick: async (mm) => {
        const d = await simpan(mm); slMuat();
        setTimeout(() => slModal(null, { jenis: d.jenis }), 0);
      } }]),
      { label: "Simpan", kelas: "btn-primary", onClick: async (mm) => { await simpan(mm); slMuat(); } },
    ],
  });
  const dinamis = (d) => { m.body.querySelector("#sl-dinamis").innerHTML = slDinamisHtml(jenis, d); };
  dinamis(s ? { pilihan: s.pilihan, kunci: s.kunci } : slDefault(jenis));
  slThumbs(m.body);
  m.body.querySelector("#sl-f-jenis").onchange = (e) => { jenis = e.target.value; dinamis(slDefault(jenis)); slThumbs(m.body); };

  // --- Gambar: tombol, hapus, tempel (Ctrl+V), seret-lepas ---
  m.body.addEventListener("input", () => slThumbs(m.body));
  m.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aksi=gambar], [data-aksi=buang-gambar]"); if (!b) return;
    if (b.dataset.aksi === "gambar") {
      const el = b.dataset.target ? m.body.querySelector(b.dataset.target)
        : (b.previousElementSibling && b.previousElementSibling.matches("input") ? b.previousElementSibling : null);
      if (el) slPilihFile(el, b);
    } else {
      const nama = b.dataset.nama;
      const hapusToken = (el) => { el.value = el.value.split(`[gambar:${nama}]`).join("").replace(/\n{3,}/g, "\n\n").trim(); };
      const lingkup = b.closest(".sl-baris") || b.closest(".sl-tombol-gbr");
      const fields = lingkup && lingkup.classList.contains("sl-baris")
        ? [...lingkup.querySelectorAll("input[data-f=teks], input[data-f=kiri], input[data-f=kanan]")]
        : [m.body.querySelector("#sl-f-tanya")];
      const target = fields.find((f) => f && f.value.includes(`[gambar:${nama}]`));
      if (target) { hapusToken(target); slThumbs(m.body); }
    }
  });
  m.body.addEventListener("paste", (e) => {
    const t = e.target;
    if (!(t && t.matches && t.matches(SL_GBR_FIELD))) return;
    const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    slSisipGambar(t, files, null);
  });
  m.body.addEventListener("dragover", (e) => {
    if (e.target && e.target.matches && e.target.matches(SL_GBR_FIELD) && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault();
  });
  m.body.addEventListener("drop", (e) => {
    const t = e.target;
    if (!(t && t.matches && t.matches(SL_GBR_FIELD))) return;
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    slSisipGambar(t, files, null);
  });

  m.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aksi]"); if (!b) return;
    const daftar = m.body.querySelector(".sl-daftar"); if (!daftar) return;
    const n = daftar.querySelectorAll(".sl-baris").length;
    if (b.dataset.aksi === "tambah-baris") {
      if (n >= SL_MAKS[jenis]) return toast(`Maksimal ${SL_MAKS[jenis]} baris`, "error");
      daftar.insertAdjacentHTML("beforeend", slBarisHtml(jenis, n, { benar: jenis === "bs" ? true : false }));
      slNomori(daftar, jenis);
      const baru = daftar.lastElementChild.querySelector("input"); if (baru) baru.focus();
    }
    if (b.dataset.aksi === "hapus-baris") {
      if (n <= SL_MIN[jenis]) return toast(`Minimal ${SL_MIN[jenis]} baris`, "error");
      b.closest(".sl-baris").remove();
      slNomori(daftar, jenis);
    }
  });
}

async function slAmbilSoal(id) {
  const { data, error } = await sb.from("bank_soal").select("*").eq("id", id).single();
  if (error) { toast(error.message, "error"); return null; }
  return data;
}
async function slUbah(id) { const s = await slAmbilSoal(id); if (s) slModal(s); }

async function slLihat(id) {
  const s = await slAmbilSoal(id); if (!s) return;
  let isi = "";
  const kuncinya = (t, ok) => `<div class="sl-baris sl-ro">${t}${ok}</div>`;
  if (s.jenis === "pg" || s.jenis === "pgk") {
    const kk = s.jenis === "pg" ? [s.kunci] : s.kunci;
    isi = s.pilihan.map((t, i) => kuncinya(`<span class="sl-huruf">${HURUF[i]}</span><span>${slBr(t)}</span>`,
      kk.includes(i) ? '<span class="badge ok">Kunci</span>' : "")).join("");
  } else if (s.jenis === "bs") {
    isi = s.pilihan.map((t, i) => kuncinya(`<span class="sl-huruf">${i + 1}</span><span>${slBr(t)}</span>`,
      `<span class="badge ${s.kunci[i] ? "ok" : "off"}">${s.kunci[i] ? "Benar" : "Salah"}</span>`)).join("");
  } else if (s.jenis === "jodoh") {
    const { kiri, kanan } = s.pilihan;
    isi = kiri.map((k, i) => kuncinya(`<span class="sl-huruf">${i + 1}</span><span>${slBr(k)} &harr; <b>${slBr(kanan[s.kunci[i]])}</b></span>`, "")).join("");
    const pakai = new Set(s.kunci);
    const peng = kanan.filter((_, i) => !pakai.has(i));
    if (peng.length) isi += `<p class="ket">Pengecoh: ${peng.map(slBr).join(", ")}</p>`;
  } else {
    isi = `<p class="ket"><b>Pedoman jawaban:</b></p><p>${s.kunci ? slBr(s.kunci) : '<span class="ket">Belum ada pedoman.</span>'}</p>`;
  }
  tampilModal("Lihat soal", `
    ${SL.bank ? slInfoBank(SL.bank) : ""}
    <p class="ket">${esc(JENIS[s.jenis])} &middot; bobot ${esc(String(+s.bobot))}</p>
    <p style="font-size:1.05rem;margin:.6rem 0 1rem">${slBr(s.pertanyaan)}</p>${isi}
    ${s.pembahasan ? `<p class="catatan" style="margin-top:1rem"><b>Penjelasan:</b> ${slBr(s.pembahasan)}</p>` : ""}`, {
    lebar: "sedang",
    aksi: [{ label: "Tutup" }, { label: "Ubah soal", kelas: "btn-primary", onClick: () => { setTimeout(() => slModal(s), 0); } }],
  });
}

async function slHapus(ids) {
  if (!ids.length) return;
  const ok = await konfirmasi(`Hapus <b>${ids.length}</b> soal? Tindakan ini tidak bisa dibatalkan.`, { ya: "Hapus", bahaya: true, judul: "Hapus soal" });
  if (!ok) return;
  const { error } = await sb.from("bank_soal").delete().in("id", ids);
  if (error) return toast(error.message, "error");
  ids.forEach((id) => SL.pilih.delete(id));
  toast(`${ids.length} soal dihapus`, "ok");
  slMuat();
}

// =====================================================================
//  4. IMPOR DARI WORD
// =====================================================================
function slImpor() {
  const bank = SL.bank;
  if (!bank) return toast("Buka sebuah bank soal dulu", "error");
  const html = `
    ${slInfoBank(bank)}
    <p class="ket">Semua soal di berkas akan masuk ke bank soal di atas.</p>
    <label class="f">Berkas Word (.docx)
      <input class="input" id="sl-i-berkas" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>
    <p class="ket"><a href="template_soal.docx" download>Unduh template Word</a> berisi contoh semua jenis soal. Hapus contohnya, isi dengan soal Anda, lalu unggah di sini.</p>
    <details class="sl-petunjuk"><summary>Aturan penulisan di Word</summary>
      <p class="ket">Tulis tag jenis soal di baris sendiri, lalu soalnya. Ketik nomor dan huruf pilihan secara manual (jangan pakai penomoran otomatis Word).</p>
      <pre class="sl-contoh">${esc(SL_CONTOH)}</pre>
    </details>`;
  const m = tampilModal("Impor soal dari Word", html, {
    lebar: "lebar",
    aksi: [{ label: "Batal" }, {
      label: "Baca berkas", kelas: "btn-primary", tutup: false,
      onClick: async () => {
        const file = $("#sl-i-berkas").files[0];
        if (!file) throw new Error("Pilih berkas Word (.docx) dulu.");
        if (!/\.docx$/i.test(file.name)) throw new Error("Format harus .docx.");
        if (typeof mammoth === "undefined") throw new Error("Pustaka pembaca Word gagal dimuat.");
        let teks;
        try { teks = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
        catch (e) { throw new Error("Berkas tidak bisa dibaca."); }
        const hasil = slParse(teks);
        if (!hasil.semua.length) throw new Error("Tidak ada soal yang terbaca.");
        slPratinjau(m, bank, hasil);
        return false;
      },
    }],
  });
}

function slPratinjau(m, bank, hasil) {
  const ok = hasil.soal.length, bad = hasil.galat.length;
  m.body.innerHTML = `
    ${slInfoBank(bank)}
    <div class="sl-ringkas"><span class="badge ok">${ok} soal siap disimpan</span>
      ${bad ? `<span class="badge off">${bad} soal bermasalah (dilewati)</span>` : ""}</div>
    <div class="gulung"><table><thead><tr><th>No</th><th>Jenis</th><th>Soal</th><th>Status</th></tr></thead><tbody>
      ${hasil.semua.map((r) => `<tr ${r.ok ? "" : 'class="sorot-baris"'}>
        <td class="angka">${r.no}</td>
        <td>${r.jenis ? esc(JENIS[r.jenis] || r.jenis) : "-"}</td>
        <td>${esc(r.ringkas)}</td>
        <td>${r.ok ? '<span class="badge ok">Siap</span>' : `<span class="badge off">Bermasalah</span><div class="ket">${esc(r.pesan)}</div>`}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="prog" id="sl-prog" hidden><div></div></div>`;
  m.setAksi([
    { label: "Pilih berkas lain", tutup: false, onClick: () => { m.tutup(); slImpor(); return false; } },
    {
      label: ok ? `Simpan ${ok} soal` : "Tidak ada soal yang valid", kelas: "btn-primary", id: "simpan",
      onClick: async () => {
        if (!ok) return false;
        const rows = hasil.soal.map((s) => ({ bank_id: bank.id, mapel_id: bank.mapel_id, pembuat: S.me.id, jenis: s.jenis, pertanyaan: s.pertanyaan,
          pilihan: s.pilihan, kunci: s.kunci, pembahasan: s.pembahasan, bobot: s.bobot }));
        const bar = m.body.querySelector("#sl-prog"); bar.hidden = false;
        let tersimpan = 0;
        try {
          for (let i = 0; i < rows.length; i += 100) {
            const { error } = await sb.from("bank_soal").insert(rows.slice(i, i + 100));
            if (error) throw error;
            tersimpan += Math.min(100, rows.length - i);
            bar.firstElementChild.style.width = Math.round((tersimpan / rows.length) * 100) + "%";
          }
        } catch (e) {
          slMuat();
          throw new Error(`${tersimpan} soal tersimpan, lalu gagal: ${e.message}`);
        }
        try { await sb.from("log_aktivitas").insert({ pelaku: S.me.id, aksi: "impor_soal", target: bank.nama, detail: { jumlah: tersimpan, bank_id: bank.id } }); } catch (e) {}
        toast(`${tersimpan} soal berhasil diimpor`, "ok");
        SL.hal = 1;
        slMuat();
      },
    },
  ]);
  if (!ok && m.tombol.simpan) m.tombol.simpan.disabled = true;
}
"use strict";
// =====================================================================
//  PANDUAN & TATA TERTIB UJIAN
//  Satu file dipakai tiga panel (siswa.html, guru.html, admin.html).
//  Isi menyesuaikan peran yang login. Isi TETAP di kode ini; angka
//  anti-curang (batas pelanggaran, GPS, dll.) diambil dari pengaturan admin.
//
//  Ubah kontak panitia di bawah ini bila nomornya berganti.
// =====================================================================
const PDN_KONTAK = { nama: "Panitia Ujian", hp: "085259259767" };

const pdnPeran = () => (typeof PANEL !== "undefined" ? PANEL : "siswa"); // "siswa" | "guru" | "admin"
const pdnWa = () => "https://wa.me/62" + PDN_KONTAK.hp.replace(/\D/g, "").replace(/^0/, "");
const pdnHpTampil = () => PDN_KONTAK.hp.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");

const pdnUl = (arr) => `<ul>${arr.map((x) => `<li>${x}</li>`).join("")}</ul>`;
const pdnOl = (arr) => `<ol>${arr.map((x) => `<li>${x}</li>`).join("")}</ol>`;
const pdnCatatan = (x) => `<div class="catatan">${x}</div>`;

// Aturan anti-curang dari pengaturan admin (sama dengan yang tampil saat mulai ujian).
function pdnAturanAntiCurang(c) {
  if (!c || !c.aktif) return [];
  const li = [];
  if (c.wajib_layar_penuh) li.push("Ujian dikerjakan dalam <b>layar penuh</b>. Di iPhone, buka lewat ikon &ldquo;Tambah ke Layar Utama&rdquo; agar tampil penuh.");
  if (c.wajib_gps) li.push(`<b>GPS wajib aktif</b>. Ujian hanya dapat dikerjakan di area sekolah (radius ${esc(c.gps_radius_m)} m). Nyalakan GPS dan izinkan akses lokasi <b>sebelum</b> menekan tombol mulai. Bila GPS mati atau Anda keluar area, layar ujian <b>dikunci</b> dan kejadian dicatat.`);
  li.push("Dilarang berpindah aplikasi/tab, membuka layar terbagi (split-screen), serta menyalin &amp; menempel soal.");
  li.push(c.aksi_melebihi === "kumpul"
    ? `Batas pelanggaran <b>${esc(c.maks_pelanggaran)} kali</b>. Setelah itu ujian <b>dikumpulkan otomatis</b>.`
    : `Setiap pelanggaran dicatat dan dapat dilihat pengawas/guru (batas peringatan ${esc(c.maks_pelanggaran)} kali).`);
  li.push("Satu akun hanya boleh dipakai di satu perangkat selama ujian.");
  return li;
}

const PDN_TATA_TERTIB_UMUM = [
  "Kerjakan ujian dengan <b>jujur dan mandiri</b>. Dilarang bekerja sama, menyontek, atau membuka sumber lain.",
  "Gunakan <b>akun sendiri</b>. Jangan meminjamkan atau meminta kartu login dan password teman.",
  "Hadir dan mulai tepat waktu sesuai jadwal. Ujian yang sudah lewat batas jadwal tidak dapat dimulai.",
  "Ikuti arahan pengawas selama ujian berlangsung.",
  "Dilarang menyebarkan soal, jawaban, atau token ujian dalam bentuk apa pun.",
];

// ---------------------------------------------------------------------
//  Isi per peran
// ---------------------------------------------------------------------
function pdnTentang(peran) {
  const nama = typeof CONFIG !== "undefined" ? CONFIG.NAMA_SEKOLAH : "sekolah";
  const fitur = {
    siswa: "Di sini Anda mengerjakan ujian secara online, melihat jadwal ujian, dan melihat riwayat nilai.",
    guru: "Di sini Anda mengisi soal pada bank soal mata pelajaran Anda, memantau ujian, menilai esai, dan melihat hasil siswa.",
    admin: "Di sini Anda mengelola data sekolah, bank soal, jadwal dan aktivasi ujian, kartu login, pemantauan, serta hasil ujian.",
  }[peran];
  return `<p><b>EXAM MAPPAGURU</b> adalah aplikasi ujian berbasis online milik <b>${esc(nama)}</b>. ${fitur}</p>
    ${pdnUl([
      "Soal tampil di layar perangkat, jawaban tersimpan otomatis, dan nilai dapat dihitung sistem.",
      "Mendukung lima jenis soal: pilihan ganda, pilihan ganda kompleks, benar/salah, menjodohkan, dan esai.",
      "Dapat dibuka dari HP, tablet, maupun laptop dengan koneksi internet.",
      "Dilengkapi pengawasan anti-curang dan pemantauan ujian secara langsung.",
    ])}`;
}

function pdnSiswa(cfg) {
  const aturan = pdnAturanAntiCurang(cfg);
  return [
    { id: "persiapan", ikon: "🎒", judul: "Sebelum Ujian", isi: pdnUl([
      "Bawa <b>kartu login</b> (berisi username dan password) dan pastikan perangkat sudah siap.",
      "Isi baterai penuh dan pastikan <b>koneksi internet stabil</b>.",
      "Di HP/tablet, <b>pasang aplikasi</b> ke layar utama bila diminta (Android: Pasang/Install; iPhone: Bagikan &rarr; Tambah ke Layar Utama).",
      "Bila ujian mewajibkan GPS, nyalakan <b>GPS</b> dan izinkan akses lokasi di browser.",
      "Tutup aplikasi lain dan matikan notifikasi agar tidak terganggu saat ujian.",
      "Datang tepat waktu. Ujian hanya bisa dimulai pada jadwalnya.",
    ]) },
    { id: "mulai", ikon: "🚀", judul: "Cara Masuk & Memulai Ujian", isi: pdnOl([
      "Buka halaman login, masukkan <b>username</b> dan <b>password</b> dari kartu login Anda.",
      "Buka menu <b>UJIAN</b>, lalu pilih paket ujian yang statusnya sudah dibuka.",
      "Tekan <b>Mulai Ujian</b>. Bila diminta, masukkan <b>token</b> yang diberikan pengawas.",
      "Baca tata tertib yang tampil, lalu tekan <b>Mulai Kerjakan Sekarang</b>.",
      "<b>Waktu langsung berjalan</b> begitu ujian dimulai.",
    ]) + pdnCatatan("Lupa password? Hubungi guru atau panitia. Admin dapat membuat password baru untuk Anda.") },
    { id: "kerjakan", ikon: "✍️", judul: "Cara Mengerjakan Soal", isi: `
      <p><b>Jenis soal</b></p>
      ${pdnUl([
        "<b>Pilihan Ganda</b>: pilih satu jawaban yang paling benar.",
        "<b>Pilihan Ganda Kompleks</b>: pilih <b>semua</b> jawaban yang benar (bisa lebih dari satu).",
        "<b>Benar/Salah</b>: tentukan tiap pernyataan benar atau salah.",
        "<b>Menjodohkan</b>: pasangkan setiap pernyataan dengan pasangannya.",
        "<b>Esai</b>: ketik jawaban uraian. Nilainya diberikan oleh guru.",
      ])}
      <p><b>Fitur di layar ujian</b></p>
      ${pdnUl([
        "Gunakan tombol <b>Sebelumnya</b> / <b>Berikutnya</b> atau ketuk <b>nomor soal</b> untuk berpindah.",
        "Centang <b>Ragu-ragu</b> pada soal yang ingin Anda periksa lagi nanti.",
        "Warna nomor menunjukkan status: aktif, sudah dijawab, ragu, atau belum dijawab.",
        "Jawaban <b>tersimpan otomatis</b> di perangkat dan dicadangkan ke server secara berkala.",
        "Perhatikan <b>sisa waktu</b> di bagian atas layar.",
      ])}
      <p><b>Mengakhiri ujian</b></p>
      ${pdnUl([
        "Periksa nomor yang masih kosong atau ragu, lalu tekan <b>Kumpulkan Ujian</b>.",
        "Bila <b>waktu habis</b>, jawaban dikumpulkan <b>otomatis</b>.",
        "Setelah dikumpulkan, jawaban tidak dapat diubah. Nilai dapat dilihat di menu <b>Hasil Ujian</b> bila sekolah menampilkannya.",
      ])}` },
    { id: "tertib", ikon: "📜", judul: "Tata Tertib Ujian", isi: `
      <p><b>Ketentuan umum</b></p>${pdnUl(PDN_TATA_TERTIB_UMUM)}
      ${aturan.length ? `<p><b>Aturan sistem anti-curang</b> <small>(sesuai pengaturan sekolah)</small></p>${pdnUl(aturan)}` : ""}
      ${pdnCatatan("Pelanggaran <b>dicatat otomatis</b> oleh sistem dan dapat dilihat guru serta pengawas. Sanksi mengikuti ketentuan sekolah.")}` },
    { id: "kendala", ikon: "🆘", judul: "Jika Ada Kendala", isi: pdnUl([
      "<b>Internet putus:</b> tetap tenang. Jawaban yang sudah dikerjakan tersimpan di perangkat. Sambungkan kembali, buka ujian, lalu tekan <b>Lanjutkan Ujian</b>. <b>Waktu tetap berjalan</b>, jadi segera pulihkan koneksi.",
      "<b>Layar terkunci karena GPS/lokasi:</b> nyalakan GPS (mode akurat), izinkan lokasi, dan pastikan Anda berada di area sekolah.",
      "<b>Layar penuh keluar sendiri:</b> tekan tombol yang muncul untuk kembali ke layar penuh. Hal ini dapat dihitung sebagai pelanggaran.",
      "<b>Perangkat mati atau macet:</b> segera lapor ke pengawas. Login kembali dan lanjutkan dari perangkat yang sama.",
      "<b>Tidak bisa login atau lupa password:</b> hubungi guru atau panitia.",
      "<b>Soal tidak tampil atau ada kesalahan soal:</b> catat nomornya dan lapor ke pengawas, jangan menutup halaman.",
    ]) },
  ];
}

function pdnGuru(cfg) {
  const aturan = pdnAturanAntiCurang(cfg);
  return [
    { id: "alur", ikon: "🧭", judul: "Alur Kerja Guru", isi: pdnOl([
      "Admin menugaskan Anda pada <b>mata pelajaran dan kelas</b> tertentu, dan membuat bank soalnya.",
      "Buka menu <b>Bank Soal</b>, pilih bank mapel dan kelas Anda, lalu <b>isi butir soalnya</b>.",
      "Periksa dengan tombol <b>Preview</b> (tampilan seperti siswa).",
      "Admin mengaktifkan ujian, mengatur jadwal, durasi, dan token.",
      "Saat ujian berjalan, pantau di <b>Monitor Ujian</b>.",
      "Setelah ujian, nilai <b>esai</b> dan lihat rekap di <b>Hasil Ujian</b>.",
    ]) },
    { id: "akses", ikon: "🔐", judul: "Hak Akses Guru", isi: pdnUl([
      "Anda hanya melihat dan mengisi <b>bank soal pada mapel dan kelas yang Anda ampu</b>. Bank mapel yang sama untuk kelas lain tidak terlihat.",
      "Membuat bank soal, mengaktifkan ujian, dan mengatur jadwal/token dilakukan oleh <b>admin</b>.",
      "Hasil dan pemantauan hanya untuk <b>kelas yang Anda ampu</b>.",
      "Bila bank soal tidak muncul, kemungkinan penugasan mapel/kelas Anda belum diatur. Hubungi admin.",
    ]) },
    { id: "soal", ikon: "📝", judul: "Mengisi Soal", isi: `
      ${pdnUl([
        "<b>Satu per satu:</b> tombol <b>Tambah soal</b>, pilih jenis soal, isi pertanyaan, pilihan, kunci, dan <b>bobot</b>.",
        "<b>Sekaligus dari Word:</b> tombol <b>Impor dari Word</b> (.docx). Unduh <b>template Word</b> di jendela impor, isi soalnya, lalu unggah.",
        "Tulis tag jenis soal di baris sendiri: <span class=\"mono\">[PG]</span>, <span class=\"mono\">[PGK]</span>, <span class=\"mono\">[BS]</span>, <span class=\"mono\">[JODOH]</span>, <span class=\"mono\">[ESAI]</span>.",
        "Ketik nomor dan huruf pilihan <b>secara manual</b>. Jangan memakai penomoran otomatis Word.",
        "Soal <b>esai</b> dinilai manual oleh guru, soal lainnya dinilai otomatis.",
      ])}
      ${pdnCatatan("Setelah mengimpor, periksa kembali hasilnya (kunci jawaban, bobot, dan gambar) sebelum ujian diaktifkan.")}` },
    { id: "pantau", ikon: "📡", judul: "Memantau & Menilai", isi: pdnUl([
      "<b>Monitor Ujian:</b> lihat siswa yang belum masuk, sedang mengerjakan, atau selesai, termasuk catatan pelanggaran.",
      "<b>Hasil Ujian:</b> rekap nilai per kelas dan rincian jawaban siswa.",
      "<b>Penilaian esai:</b> buka hasil siswa, beri nilai pada tiap jawaban esai, lalu simpan.",
    ]) },
    { id: "tertib", ikon: "📜", judul: "Tata Tertib Pengawasan", isi: `
      ${pdnUl([
        "Jaga <b>kerahasiaan soal dan token</b>. Jangan dibagikan sebelum waktunya.",
        "Bantu siswa yang mengalami kendala teknis, tetapi <b>jangan memberi petunjuk jawaban</b>.",
        "Pastikan siswa mengerjakan di perangkat sendiri dan sesuai tata tertib di bawah.",
        "Catat dan laporkan kejadian khusus kepada panitia.",
      ])}
      <p><b>Tata tertib untuk peserta</b></p>${pdnUl(PDN_TATA_TERTIB_UMUM)}
      ${aturan.length ? `<p><b>Aturan sistem anti-curang</b> <small>(sesuai pengaturan sekolah)</small></p>${pdnUl(aturan)}` : ""}` },
    { id: "kendala", ikon: "🆘", judul: "Jika Ada Kendala", isi: pdnUl([
      "Soal atau bank tidak muncul, atau penugasan salah: hubungi <b>admin</b>.",
      "Siswa lupa password atau perlu mengerjakan ulang: dilakukan oleh <b>admin</b>.",
      "Kendala teknis lain saat ujian: hubungi <b>panitia</b> (kontak di bawah).",
    ]) },
  ];
}

function pdnAdmin(cfg) {
  const aturan = pdnAturanAntiCurang(cfg);
  return [
    { id: "alur", ikon: "🧭", judul: "Alur Persiapan Ujian", isi: pdnOl([
      "<b>Data &rarr; Kelas</b>: buat rombongan belajar.",
      "<b>Data &rarr; Mata Pelajaran</b>: daftarkan mapel.",
      "<b>Data &rarr; Guru</b>: tambah/impor guru, lalu atur <b>mapel dan kelas yang diampu</b>.",
      "<b>Data &rarr; Siswa</b>: impor siswa dari Excel. Kartu login terbentuk otomatis.",
      "<b>Bank Soal</b>: buat bank per mapel dan pilih kelasnya. Guru mengisi butir soalnya.",
      "<b>Bank Soal &rarr; Aktifkan Ujian</b>: atur jadwal, durasi, token, dan opsi acak soal.",
      "<b>Kartu Login</b>: cetak atau unduh kartu untuk peserta.",
      "<b>Pengaturan</b>: lengkapi kop surat dan atur anti-curang/lokasi ujian.",
    ]) + pdnCatatan("Pantau kemajuan persiapan lewat <b>Kesiapan Sistem</b>, <b>Status &amp; Jadwal Ujian</b>, dan <b>Bank Soal Perlu Perhatian</b> di Beranda.") },
    { id: "hari", ikon: "📡", judul: "Pada Hari Ujian", isi: pdnUl([
      "Buka <b>Monitor Ujian</b> untuk melihat siswa yang masuk, progres, dan pelanggaran.",
      "Bagikan <b>token</b> hanya kepada pengawas/siswa saat ujian akan dimulai.",
      "Siswa lupa password: buat password baru di <b>Data &rarr; Siswa</b>, lalu cetak kartunya.",
      "Siswa perlu mengulang karena kendala teknis: gunakan <b>Izinkan ulang</b> di <b>Hasil Ujian</b> (menghapus hasil siswa itu).",
      "Nonaktifkan ujian bila perlu menghentikan akses siswa.",
    ]) },
    { id: "anticurang", ikon: "🛡️", judul: "Pengaturan Anti-Curang", isi: `
      <p>Diatur di menu <b>Pengaturan</b>. Pilihan yang tersedia:</p>
      ${pdnUl([
        "<b>Wajib layar penuh</b>: otomatis di Android/iPad/laptop. iPhone memakai &ldquo;Tambah ke Layar Utama&rdquo;.",
        "<b>Wajib GPS</b>: ujian hanya di area sekolah. Isi titik lokasi dan radius (150-300 m cocok untuk satu sekolah).",
        "<b>Batas pelanggaran</b> dan tindakan bila terlampaui: dikumpulkan otomatis atau hanya dicatat.",
        "<b>Batas kembali ke Daftar</b>: berapa kali siswa boleh menekan &ldquo;Daftar&rdquo; saat ujian.",
      ])}
      ${aturan.length ? `<p>Saat ini siswa melihat aturan berikut:</p>${pdnUl(aturan)}` : pdnCatatan("Anti-curang saat ini <b>nonaktif</b> atau belum diatur.")}
      ${pdnCatatan("Web tidak dapat memblokir aplikasi lain. Sistem <b>mendeteksi, memperingatkan, mencatat</b>, lalu menindak sesuai pengaturan ini.")}` },
    { id: "setelah", ikon: "📊", judul: "Setelah Ujian", isi: pdnUl([
      "<b>Hasil Ujian</b>: rekap nilai dan status pengerjaan. Cetak melalui fitur cetak.",
      "Pastikan guru sudah <b>menilai soal esai</b> sebelum nilai dipublikasikan.",
      "Unduh <b>Paket Cadangan Lengkap</b> di Beranda. Paket Supabase gratis <b>tidak membuat cadangan otomatis</b>, jadi lakukan secara berkala.",
      "Tinjau menu <b>Aktifitas</b> untuk riwayat perubahan data dan reset password.",
    ]) },
    { id: "tertib", ikon: "📜", judul: "Tata Tertib untuk Peserta", isi: `
      <p>Ringkasan yang dibaca siswa di menu Panduan mereka:</p>
      ${pdnUl(PDN_TATA_TERTIB_UMUM)}
      ${aturan.length ? pdnUl(aturan) : ""}` },
    { id: "kendala", ikon: "🆘", judul: "Keamanan & Kendala", isi: pdnUl([
      "Jangan membagikan <b>akun admin</b>. Beri akses admin hanya kepada orang yang dipercaya.",
      "Ganti password siswa/guru yang diduga diketahui orang lain.",
      "Jangan memasukkan kunci <span class=\"mono\">service_role</span> Supabase ke <span class=\"mono\">config.js</span>.",
      "Bila halaman tidak memuat data, periksa koneksi internet dan pastikan SQL terbaru sudah dijalankan di Supabase.",
    ]) },
  ];
}

// ---------------------------------------------------------------------
//  Tampilan
// ---------------------------------------------------------------------
async function rPanduan() {
  const peran = pdnPeran();
  let cfg = null;
  try {
    const { data, error } = await sb.from("pengaturan_anticurang").select("*").eq("id", 1).maybeSingle();
    cfg = error ? null : data;
  } catch (_) { cfg = null; }

  const bagian = [
    { id: "tentang", ikon: "ℹ️", judul: "Tentang Aplikasi", isi: pdnTentang(peran) },
    ...(peran === "siswa" ? pdnSiswa(cfg) : peran === "guru" ? pdnGuru(cfg) : pdnAdmin(cfg)),
  ];
  const label = { siswa: "Peserta Didik", guru: "Guru", admin: "Administrator" }[peran];

  konten().innerHTML = `
    <section class="pdn-hero">
      <div>
        <span class="pdn-pill">${label}</span>
        <h2>Panduan &amp; Tata Tertib Ujian</h2>
        <p>Baca sebelum ujian dimulai. Panduan ini berisi cara memakai aplikasi, tata cara ujian, dan aturan yang harus dipatuhi.</p>
      </div>
      <a class="btn btn-amber" href="${pdnWa()}" target="_blank" rel="noopener">Hubungi Panitia</a>
    </section>

    <nav class="pdn-daftar" aria-label="Daftar isi">
      ${bagian.map((b) => `<button type="button" class="pdn-chip" data-pdn-ke="${b.id}">${b.ikon} ${esc(b.judul)}</button>`).join("")}
    </nav>

    <div class="pdn-isi">
      ${bagian.map((b, i) => `
        <details class="pdn-bagian" id="pdn-${b.id}" ${i === 0 ? "open" : ""}>
          <summary><span class="pdn-ikon" aria-hidden="true">${b.ikon}</span><span>${esc(b.judul)}</span></summary>
          <div class="pdn-teks">${b.isi}</div>
        </details>`).join("")}
    </div>

    <section class="pdn-kontak">
      <div class="pdn-kontak-ikon" aria-hidden="true">📞</div>
      <div>
        <h3>Kontak ${esc(PDN_KONTAK.nama)}</h3>
        <p>Ada kendala atau pertanyaan seputar ujian? Hubungi panitia.</p>
        <p class="pdn-hp"><a href="tel:${esc(PDN_KONTAK.hp)}">${esc(pdnHpTampil())}</a></p>
      </div>
      <a class="btn btn-primary" href="${pdnWa()}" target="_blank" rel="noopener">Chat WhatsApp</a>
    </section>`;

  konten().onclick = (e) => {
    const b = e.target.closest("[data-pdn-ke]"); if (!b) return;
    const el = document.getElementById("pdn-" + b.dataset.pdnKe); if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

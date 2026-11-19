"use strict";
// =====================================================================
//  PWA: pendaftaran service worker + popup WAJIB pasang aplikasi di HP.
//
//  - Popup hanya muncul di HP/tablet yang membuka lewat browser (bukan aplikasi terpasang).
//    Laptop/PC tidak dikunci.
//  - Aktif di halaman yang menetapkan  window.PWA_WAJIB = true  (index.html, siswa.html).
//  - Untuk mematikan kewajiban: di config.js tambahkan  WAJIB_PASANG: false
//
//  Catatan: ini kunci tampilan (tidak bisa memaksa pemasangan secara teknis).
// =====================================================================
(function () {
  const UA = navigator.userAgent || "";
  const iOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(UA);
  const hp = iOS || android;
  const dalamAplikasiLain = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok|; wv\)/i.test(UA);
  const safariIos = iOS && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(UA);
  const aman = location.protocol === "https:" || location.hostname === "localhost";
  const terpasangSekarang = () => !!(navigator.standalone ||
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches));

  // ---------- service worker ----------
  if ("serviceWorker" in navigator && aman) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  // ---------- popup wajib pasang ----------
  let tunda = null;        // event beforeinstallprompt (Android/Chrome)
  let baruTerpasang = false;
  let overlay = null;
  let siapManual = false;  // lewat beberapa detik tanpa event: tampilkan langkah manual

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); tunda = e; gambar(); });
  window.addEventListener("appinstalled", () => { baruTerpasang = true; tunda = null; gambar(); });

  function wajibAktif() {
    if (!window.PWA_WAJIB) return false;
    if (typeof CONFIG !== "undefined" && CONFIG.WAJIB_PASANG === false) return false;
    return hp && !terpasangSekarang();
  }

  function langkahManual() {
    if (iOS) {
      if (!safariIos) {
        return `<p>Di iPhone/iPad, pemasangan harus lewat <b>Safari</b>. Salin tautan ini, buka di Safari, lalu:</p>${langkahSafari()}
          <button class="pwa-btn pwa-ghost" data-pwa="salin" type="button">Salin tautan</button>`;
      }
      return langkahSafari();
    }
    return `<ol>
      <li>Ketuk menu <b>&#8942;</b> (tiga titik) di pojok kanan atas Chrome.</li>
      <li>Pilih <b>Pasang aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</li>
      <li>Ketuk <b>Pasang</b>, lalu buka aplikasi dari ikon di layar utama.</li></ol>`;
  }
  function langkahSafari() {
    return `<ol>
      <li>Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di Safari.</li>
      <li>Gulir, pilih <b>Tambah ke Layar Utama</b>.</li>
      <li>Ketuk <b>Tambah</b>, lalu buka aplikasi dari ikon di layar utama.</li></ol>`;
  }

  function isi() {
    if (baruTerpasang) {
      return { ikon: "✅", judul: "Aplikasi berhasil dipasang",
        badan: "<p>Tutup halaman ini, lalu buka aplikasi dari <b>ikon di layar utama</b> HP Anda. Anda mungkin perlu masuk (login) lagi.</p>" };
    }
    if (!aman) {
      return { ikon: "🔒", judul: "Perlu sambungan aman (HTTPS)",
        badan: "<p>Aplikasi hanya bisa dipasang lewat alamat yang diawali <b>https://</b>. Hubungi admin sekolah.</p>" };
    }
    if (dalamAplikasiLain) {
      return { ikon: "🌐", judul: "Buka di browser dulu",
        badan: `<p>Halaman ini dibuka di dalam aplikasi lain (WhatsApp, Instagram, dsb.) sehingga tidak bisa dipasang. Salin tautan, lalu buka di <b>${iOS ? "Safari" : "Chrome"}</b>.</p>
          <button class="pwa-btn" data-pwa="salin" type="button">Salin tautan</button>` };
    }
    if (tunda) {
      return { ikon: "📲", judul: "Pasang EXAM MAPPAGURU untuk melanjutkan",
        badan: `<p>Ujian online hanya dapat dibuka lewat <b>aplikasi yang terpasang</b> di HP. Ketuk tombol di bawah, lalu buka aplikasi dari ikon di layar utama.</p>
          <button class="pwa-btn" data-pwa="pasang" type="button">Pasang Aplikasi</button>` };
    }
    if (!iOS && !siapManual) {
      return { ikon: "📲", judul: "Pasang EXAM MAPPAGURU untuk melanjutkan",
        badan: '<p>Menyiapkan pemasangan...</p>' };
    }
    return { ikon: "📲", judul: "Pasang EXAM MAPPAGURU untuk melanjutkan",
      badan: `<p>Ujian online hanya dapat dibuka lewat <b>aplikasi yang terpasang</b> di HP. Ikuti langkah berikut:</p>${langkahManual()}
        <p class="pwa-kecil">Sudah pernah memasang? Tutup halaman ini dan buka lewat <b>ikon di layar utama</b>.</p>` };
  }

  function gambar() {
    if (!wajibAktif() && !baruTerpasang) { if (overlay) { overlay.remove(); overlay = null; } return; }
    const t = isi();
    if (!overlay) {
      const css = document.createElement("style");
      css.textContent = `
        #pwa-wajib{position:fixed;inset:0;z-index:2147483000;background:#0a1f4f;display:flex;align-items:center;justify-content:center;padding:1.2rem;overflow:auto;font-family:inherit}
        #pwa-wajib .pwa-kartu{background:#fff;color:#16223f;border-radius:18px;max-width:420px;width:100%;padding:1.6rem 1.4rem;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}
        #pwa-wajib img{width:72px;height:72px;border-radius:16px;margin-bottom:.6rem}
        #pwa-wajib h2{margin:.2rem 0 .6rem;font-size:1.2rem;line-height:1.3}
        #pwa-wajib p{margin:.5rem 0;font-size:.95rem;line-height:1.5}
        #pwa-wajib ol{text-align:left;margin:.6rem 0;padding-left:1.3rem;font-size:.93rem;line-height:1.55}
        #pwa-wajib .pwa-kecil{font-size:.82rem;color:#5b6684}
        #pwa-wajib .pwa-btn{display:block;width:100%;margin-top:.9rem;padding:.85rem 1rem;border:0;border-radius:12px;background:#0a1f4f;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}
        #pwa-wajib .pwa-ghost{background:#eef1f8;color:#0a1f4f}`;
      document.head.appendChild(css);
      overlay = document.createElement("div");
      overlay.id = "pwa-wajib";
      overlay.setAttribute("role", "alertdialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.onclick = aksi;
      document.documentElement.appendChild(overlay);
      document.documentElement.style.overflow = "hidden";
    }
    overlay.innerHTML = `<div class="pwa-kartu"><img src="icon-192.png" alt="" onerror="this.style.display='none'">
      <div style="font-size:1.6rem" aria-hidden="true">${t.ikon}</div><h2>${t.judul}</h2>${t.badan}</div>`;
  }

  async function aksi(e) {
    const b = e.target.closest("[data-pwa]");
    if (!b) return;
    if (b.dataset.pwa === "pasang" && tunda) {
      const p = tunda; tunda = null;
      try { p.prompt(); const r = await p.userChoice; if (r && r.outcome === "accepted") baruTerpasang = true; } catch (_) { /* abaikan */ }
      siapManual = true; gambar();
    } else if (b.dataset.pwa === "salin") {
      try { await navigator.clipboard.writeText(location.origin + location.pathname.replace(/[^/]*$/, "")); b.textContent = "Tautan disalin ✓"; }
      catch (_) { b.textContent = "Salin manual dari kolom alamat"; }
    }
  }

  function mulai() {
    if (!wajibAktif()) return;
    gambar();
    setTimeout(() => { siapManual = true; if (overlay) gambar(); }, 3000);
    // bila pengguna memasang lalu kembali ke tab ini
    window.matchMedia && matchMedia("(display-mode: standalone)").addEventListener &&
      matchMedia("(display-mode: standalone)").addEventListener("change", gambar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai); else mulai();
})();

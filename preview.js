"use strict";
// =====================================================================
//  PREVIEW BANK SOAL (khusus Admin & Guru)
//  Menampilkan soal dengan tampilan yang sama seperti siswa saat ujian,
//  tetapi: tidak ada timer yang berjalan, jawaban TIDAK disimpan ke server,
//  tidak ada anti-curang, dan ada saklar "Tampilkan kunci jawaban".
//  Dimuat otomatis oleh soal.js saat tombol Preview ditekan.
//  Memakai kelas CSS .cbt-* yang sama dengan siswa (style.css tidak diubah).
// =====================================================================

const PV = {
  bank: null, soal: [], idx: 0, jawaban: {}, ragu: new Set(),
  font: "normal", kunci: false, el: null, tombolEsc: null,
};
const PV_HURUF = "ABCDEF";
const pvBr = (s) => teksSoalHtml(s);
const pvJenisPendek = { pg: "PG", pgk: "PG Kompleks", bs: "Benar/Salah", jodoh: "Menjodohkan", esai: "Esai" };
const pvJenis = {
  pg: "Pilihan Ganda",
  pgk: "Pilihan Ganda Kompleks (Pilih lebih dari satu)",
  bs: "Benar / Salah",
  jodoh: "Menjodohkan",
  esai: "Uraian / Esai",
};

(function pvGaya() {
  if (document.getElementById("pv-gaya")) return;
  const st = document.createElement("style");
  st.id = "pv-gaya";
  st.textContent = `
  .pv-overlay{position:fixed;inset:0;z-index:75;background:var(--kertas);overflow:auto;-webkit-overflow-scrolling:touch}
  .pv-wrap{max-width:1180px;margin:0 auto;padding:1rem clamp(.75rem,2.5vw,1.5rem) 1.5rem}
  .pv-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem .9rem;
    background:var(--peringatan-lembut);color:var(--peringatan);border:1px solid #f1d58a;border-radius:14px;
    padding:.65rem 1rem;margin-bottom:1rem;font-size:.9rem}
  .pv-banner b{font-weight:800}
  .pv-banner-aksi{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
  .pv-sakelar{display:inline-flex;align-items:center;gap:.45rem;font-weight:700;cursor:pointer;margin:0}
  .pv-timer-diam strong{font-size:1.05rem}
  .pv-kunci-badge{margin-left:auto}
  .cbt-opsi-btn.pv-benar{border-color:var(--ok);background:var(--ok-lembut)}
  .cbt-opsi-btn.pv-benar .cbt-opsi-huruf{background:var(--ok);color:#fff;border-color:var(--ok)}
  .pv-ro{cursor:default}
  .pv-kunci-ket{display:inline-flex;align-items:center;gap:.35rem;margin-top:.5rem;font-size:.85rem;font-weight:700;color:var(--ok)}
  .pv-pedoman,.pv-bahas{border-radius:12px;padding:.8rem 1rem;margin-top:1rem;font-size:.95rem;line-height:1.6}
  .pv-pedoman{background:var(--ok-lembut);color:#0a5a3a;border:1px solid #b9e3cf}
  .pv-bahas{background:var(--biru-lembut);color:var(--navy);border:1px solid var(--biru-garis)}
  .pv-jodoh-kunci{font-weight:800;color:var(--ok)}
  .pv-bs-kunci{font-size:.8rem;font-weight:800;color:var(--ok);white-space:nowrap}
  .pv-topbar-sticky{position:sticky;top:0;z-index:6}
  .pv-kom{display:flex;flex-wrap:wrap;gap:.35rem;margin:0 0 .8rem}
  .pv-kom span{display:inline-flex;align-items:center;gap:.35rem;font-size:.76rem;font-weight:700;color:var(--tinta);
    background:var(--kertas);border:1px solid var(--garis);border-radius:999px;padding:.2rem .55rem}
  .pv-kom i,.pv-lg i{width:10px;height:10px;border-radius:3px;display:inline-block;background:var(--wj)}
  .pv-kom-total{font-size:.78rem;color:var(--tinta-2);margin:0 0 .5rem}
  .cbt-no-btn[data-jenis]{box-shadow:inset 0 -5px 0 var(--wj)}
  .pv-j-pg{--wj:#2563eb}.pv-j-pgk{--wj:#f97316}.pv-j-bs{--wj:#16a34a}.pv-j-jodoh{--wj:#facc15}.pv-j-esai{--wj:#dc2626}
  .pv-ket-warna{font-size:.72rem;color:var(--tinta-2);margin:-.4rem 0 .8rem}
  `;
  document.head.appendChild(st);
})();

// ---------------------------------------------------------------------
//  Muat seluruh soal bank (berhalaman 500 baris agar tidak terpotong)
// ---------------------------------------------------------------------
async function pvMuatSoal(bankId) {
  const hasil = [];
  for (let dari = 0; ; dari += 500) {
    const { data, error } = await sb.from("bank_soal")
      .select("id,jenis,pertanyaan,pilihan,kunci,pembahasan,bobot,no")
      .eq("bank_id", bankId).order("no", { ascending: true }).range(dari, dari + 499);
    if (error) throw new Error(error.message);
    hasil.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return hasil;
}

const pvTerjawab = (s, j) => {
  if (s.jenis === "pg") return typeof j === "number";
  if (s.jenis === "pgk") return Array.isArray(j) && j.length > 0;
  if (s.jenis === "bs") return Array.isArray(j) && j.some((v) => v === true || v === false);
  if (s.jenis === "jodoh") return Array.isArray(j) && j.some((v) => typeof v === "number");
  return typeof j === "string" && j.trim().length > 0;
};

// ---------------------------------------------------------------------
//  Pintu masuk
// ---------------------------------------------------------------------
async function bukaPreviewBank(bankId, namaBank, durasiMenit) {
  if (typeof PANEL === "undefined" || (PANEL !== "admin" && PANEL !== "guru")) return;
  if (PV.el) return; // sudah terbuka
  toast("Memuat preview soal...", "info");
  let soal;
  try { soal = await pvMuatSoal(bankId); }
  catch (e) { return toast("Gagal memuat soal: " + e.message, "error"); }
  if (!soal.length) return toast("Bank soal ini belum berisi soal, tidak ada yang bisa di-preview.", "error");

  PV.bank = { id: bankId, nama: namaBank || "Bank Soal", durasi: Number(durasiMenit) || 0 };
  PV.soal = soal; PV.idx = 0; PV.jawaban = {}; PV.ragu = new Set(); PV.kunci = false;
  if (typeof prakunciGambarSoal === "function") prakunciGambarSoal(soal);

  const ov = document.createElement("div");
  ov.className = "pv-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", "Preview soal");
  document.body.appendChild(ov);
  PV.el = ov;
  document.body.style.overflow = "hidden";
  PV.tombolEsc = (e) => {
    if (document.querySelector(".gbr-lightbox")) return; // Esc menutup gambar dulu
    if (e.key === "Escape") tutupPreview();
    else if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    else if (e.key === "ArrowLeft") pvPindah(-1);
    else if (e.key === "ArrowRight") pvPindah(1);
  };
  document.addEventListener("keydown", PV.tombolEsc);
  pvKerangka();
}

function tutupPreview() {
  if (!PV.el) return;
  document.removeEventListener("keydown", PV.tombolEsc);
  PV.el.remove(); PV.el = null;
  document.body.style.overflow = "";
  PV.soal = []; PV.jawaban = {}; PV.ragu = new Set();
}

function pvPindah(arah) {
  const baru = PV.idx + arah;
  if (baru < 0 || baru >= PV.soal.length) return;
  PV.idx = baru;
  pvSoalAktif();
  const w = PV.el && PV.el.querySelector(".cbt-soal-card");
  if (w && w.scrollIntoView && PV.el.scrollTop > w.offsetTop) PV.el.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------
//  Kerangka (sama dengan renderKerangkaCBT milik siswa)
// ---------------------------------------------------------------------
function pvKerangka() {
  const n = PV.soal.length;
  const durasi = PV.bank.durasi ? `${PV.bank.durasi}:00` : "--:--";
  PV.el.innerHTML = `
  <div class="pv-wrap">
    <div class="pv-banner">
      <span><b>MODE PREVIEW</b> &middot; ${esc(PV.bank.nama)} &middot; ${n} soal. Tampilan seperti siswa, tetapi jawaban tidak disimpan dan tidak ada penilaian.</span>
      <span class="pv-banner-aksi">
        <label class="pv-sakelar"><input type="checkbox" id="pv-kunci"> Tampilkan kunci jawaban</label>
        <button class="btn btn-kecil btn-primary" type="button" id="pv-tutup">&times; Tutup Preview</button>
      </span>
    </div>
    <div class="cbt-shell font-${PV.font}" id="pv-shell">
      <div class="cbt-topbar pv-topbar-sticky">
        <div class="cbt-top-kiri">
          <div class="cbt-no-badge">Soal <strong id="pv-no">1</strong> <span class="ket">/ ${n}</span></div>
          <span class="cbt-simpan-pill" id="pv-bobot"></span>
        </div>
        <div class="cbt-top-kanan">
          <div class="cbt-font-ctrl" aria-label="Ukuran huruf soal">
            <button type="button" data-pvfont="kecil" title="Huruf Kecil">A-</button>
            <button type="button" data-pvfont="normal" class="aktif" title="Huruf Normal">A</button>
            <button type="button" data-pvfont="besar" title="Huruf Besar">A+</button>
          </div>
          <div class="cbt-timer pv-timer-diam" aria-label="Durasi ujian">
            <span class="cbt-timer-label">Durasi Ujian</span>
            <strong class="mono">${esc(durasi)}</strong>
          </div>
        </div>
      </div>

      <div class="cbt-workspace">
        <section class="cbt-soal-card" aria-label="Lembar soal ujian">
          <div id="pv-isi"></div>
          <div class="cbt-nav-bawah">
            <button class="btn" type="button" id="pv-prev">&larr; Sebelumnya</button>
            <label class="cbt-ragu-check"><input type="checkbox" id="pv-ragu"><span>Ragu-ragu</span></label>
            <button class="btn btn-kecil cbt-btn-grid-hp" type="button" id="pv-buka-grid">&#9783; Nomor (<span id="pv-jawab-hp">0</span>/${n})</button>
            <button class="btn btn-primary" type="button" id="pv-next">Berikutnya &rarr;</button>
            <button class="btn btn-amber" type="button" id="pv-selesai" hidden>Selesai Preview ✓</button>
          </div>
        </section>

        <div class="cbt-drawer-backdrop" id="pv-drawer-bg"></div>
        <aside class="cbt-nav-panel" id="pv-nav" aria-label="Navigasi nomor soal">
          <div class="cbt-nav-head">
            <div><strong>Navigasi Soal</strong><small id="pv-ringkas">0 dari ${n} terjawab</small></div>
            <button class="btn btn-kecil cbt-tutup-grid" type="button" id="pv-tutup-grid">&times;</button>
          </div>
          <div class="cbt-legenda">
            <span><i class="lg-aktif"></i> Aktif</span>
            <span><i class="lg-jawab"></i> Dijawab</span>
            <span><i class="lg-ragu"></i> Ragu</span>
            <span><i class="lg-kosong"></i> Belum</span>
          </div>
          ${pvKomposisiHtml()}
          <div class="cbt-nomor-grid" id="pv-grid"></div>
          <div class="cbt-nav-foot">
            <button class="btn btn-amber btn-besar" type="button" id="pv-kumpul" style="width:100%">Selesai Preview</button>
          </div>
        </aside>
      </div>
      <footer class="cbt-footer">${esc(CONFIG.NAMA_SEKOLAH)} - Preview untuk ${PANEL === "guru" ? "Guru" : "Admin"}</footer>
    </div>
  </div>`;

  const q = (s) => PV.el.querySelector(s);
  q("#pv-tutup").onclick = tutupPreview;
  q("#pv-kumpul").onclick = tutupPreview;
  q("#pv-selesai").onclick = tutupPreview;
  q("#pv-kunci").onchange = (e) => { PV.kunci = e.target.checked; pvSoalAktif(); };
  q("#pv-prev").onclick = () => pvPindah(-1);
  q("#pv-next").onclick = () => pvPindah(1);
  const tutupDrawer = () => q("#pv-nav").classList.remove("buka");
  q("#pv-buka-grid").onclick = () => q("#pv-nav").classList.add("buka");
  q("#pv-tutup-grid").onclick = tutupDrawer;
  q("#pv-drawer-bg").onclick = tutupDrawer;
  q("#pv-ragu").onchange = (e) => {
    const s = PV.soal[PV.idx]; if (!s) return;
    if (e.target.checked) PV.ragu.add(s.id); else PV.ragu.delete(s.id);
    pvGrid();
  };
  PV.el.querySelectorAll("[data-pvfont]").forEach((b) => {
    b.onclick = () => {
      PV.font = b.dataset.pvfont;
      const sh = q("#pv-shell");
      sh.classList.remove("font-kecil", "font-normal", "font-besar");
      sh.classList.add("font-" + PV.font);
      PV.el.querySelectorAll("[data-pvfont]").forEach((x) => x.classList.toggle("aktif", x === b));
    };
  });
  pvSoalAktif();
}

// Ringkasan komposisi bank: jumlah soal & total bobot per jenis (warna sama dengan garis di nomor)
function pvKomposisiHtml() {
  const jml = {}, bobot = {};
  let total = 0;
  PV.soal.forEach((s) => {
    jml[s.jenis] = (jml[s.jenis] || 0) + 1;
    bobot[s.jenis] = (bobot[s.jenis] || 0) + (Number(s.bobot) || 0);
    total += Number(s.bobot) || 0;
  });
  const urut = ["pg", "pgk", "bs", "jodoh", "esai"].filter((j) => jml[j]);
  const fmt = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `<div class="pv-kom" aria-label="Komposisi soal">${urut.map((j) =>
    `<span class="pv-j-${j}" title="Total bobot ${fmt(bobot[j])}"><i></i>${esc(pvJenisPendek[j])} <b>${jml[j]}</b></span>`).join("")}</div>
    <p class="pv-kom-total">Total bobot: <b>${fmt(total)}</b> &middot; garis warna di bawah nomor = jenis soal</p>`;
}

function pvGrid() {
  const grid = PV.el && PV.el.querySelector("#pv-grid"); if (!grid) return;
  let jml = 0;
  grid.innerHTML = PV.soal.map((s, i) => {
    const t = pvTerjawab(s, PV.jawaban[s.id]); if (t) jml++;
    const k = ["cbt-no-btn"];
    if (i === PV.idx) k.push("aktif");
    if (PV.ragu.has(s.id)) k.push("ragu"); else if (t) k.push("jawab");
    return `<button type="button" class="${k.join(" ")} pv-j-${esc(s.jenis)}" data-jenis="${esc(s.jenis)}" data-pvlompat="${i}" title="${esc(pvJenisPendek[s.jenis] || "")}">${i + 1}</button>`;
  }).join("");
  const r1 = PV.el.querySelector("#pv-ringkas"); if (r1) r1.textContent = `${jml} dari ${PV.soal.length} terjawab`;
  const r2 = PV.el.querySelector("#pv-jawab-hp"); if (r2) r2.textContent = jml;
  grid.querySelectorAll("[data-pvlompat]").forEach((b) => {
    b.onclick = () => {
      PV.idx = Number(b.dataset.pvlompat);
      PV.el.querySelector("#pv-nav").classList.remove("buka");
      pvSoalAktif();
    };
  });
}

// ---------------------------------------------------------------------
//  Satu soal (sama dengan renderSoalAktif milik siswa + kunci opsional)
// ---------------------------------------------------------------------
function pvSoalAktif() {
  const s = PV.soal[PV.idx]; if (!s) return;
  const q = (x) => PV.el.querySelector(x);
  const n = PV.soal.length, jwb = PV.jawaban[s.id], tampilKunci = PV.kunci;
  q("#pv-no").textContent = PV.idx + 1;
  q("#pv-ragu").checked = PV.ragu.has(s.id);
  q("#pv-prev").disabled = PV.idx === 0;
  q("#pv-next").hidden = PV.idx === n - 1;
  q("#pv-selesai").hidden = PV.idx !== n - 1;
  q("#pv-bobot").textContent = "Bobot " + (Number(s.bobot) || 0);

  const kk = s.kunci;
  let area = "";
  if (s.jenis === "pg") {
    const opsi = Array.isArray(s.pilihan) ? s.pilihan : [];
    area = `<div class="cbt-opsi-list" role="radiogroup" aria-label="Pilihan jawaban">${opsi.map((t, i) => `
      <button type="button" class="cbt-opsi-btn ${jwb === i ? "dipilih" : ""} ${tampilKunci && kk === i ? "pv-benar" : ""}" data-pv-pg="${i}">
        <span class="cbt-opsi-huruf">${PV_HURUF[i] || i + 1}</span><span class="cbt-opsi-teks">${pvBr(t)}</span>
        ${tampilKunci && kk === i ? '<span class="badge ok pv-kunci-badge">Kunci</span>' : ""}
      </button>`).join("")}</div>`;
  } else if (s.jenis === "pgk") {
    const opsi = Array.isArray(s.pilihan) ? s.pilihan : [];
    const set = new Set(Array.isArray(jwb) ? jwb : []);
    const kunciSet = new Set(Array.isArray(kk) ? kk : []);
    area = `<p class="ket" style="margin-bottom:.6rem">Centang semua jawaban yang benar:</p>
      <div class="cbt-opsi-list">${opsi.map((t, i) => `
      <button type="button" class="cbt-opsi-btn cbt-opsi-multi ${set.has(i) ? "dipilih" : ""} ${tampilKunci && kunciSet.has(i) ? "pv-benar" : ""}" data-pv-pgk="${i}">
        <span class="cbt-opsi-cek">${set.has(i) ? "✓" : ""}</span>
        <span class="cbt-opsi-huruf">${PV_HURUF[i] || i + 1}</span><span class="cbt-opsi-teks">${pvBr(t)}</span>
        ${tampilKunci && kunciSet.has(i) ? '<span class="badge ok pv-kunci-badge">Kunci</span>' : ""}
      </button>`).join("")}</div>`;
  } else if (s.jenis === "bs") {
    const peny = Array.isArray(s.pilihan) ? s.pilihan : [];
    const arr = Array.isArray(jwb) ? jwb : [];
    area = `<div class="cbt-bs-list">${peny.map((t, i) => `
      <div class="cbt-bs-row"><div class="cbt-bs-teks">${pvBr(t)}</div>
        <div class="cbt-bs-aksi">
          ${tampilKunci && Array.isArray(kk) ? `<span class="pv-bs-kunci">Kunci: ${kk[i] ? "Benar" : "Salah"}</span>` : ""}
          <button type="button" class="btn btn-kecil ${arr[i] === true ? "btn-primary" : ""}" data-pv-bs="${i}" data-pv-val="true">Benar</button>
          <button type="button" class="btn btn-kecil ${arr[i] === false ? "btn-danger" : ""}" data-pv-bs="${i}" data-pv-val="false">Salah</button>
        </div></div>`).join("")}</div>`;
  } else if (s.jenis === "jodoh") {
    const kiri = s.pilihan && Array.isArray(s.pilihan.kiri) ? s.pilihan.kiri : [];
    const kanan = s.pilihan && Array.isArray(s.pilihan.kanan) ? s.pilihan.kanan : [];
    const arr = Array.isArray(jwb) ? jwb : [];
    const gbr = kanan.some(adaGambar);
    const hk = (i) => PV_HURUF[i] || String(i + 1);
    const daftar = gbr ? `<div class="cbt-jodoh-daftar"><div class="ket">Pilihan pasangan:</div>
      ${kanan.map((t, i) => `<div class="cbt-jodoh-item"><span class="cbt-opsi-huruf">${hk(i)}</span><div>${pvBr(t)}</div></div>`).join("")}</div>` : "";
    area = `${daftar}<div class="cbt-jodoh-list">${kiri.map((tk, i) => {
      const pil = typeof arr[i] === "number" ? arr[i] : "";
      const bersih = (t) => teksRingkasGambar(t).replace(/🖼/g, "").trim();
      const kunciTeks = tampilKunci && Array.isArray(kk) && typeof kk[i] === "number"
        ? `<div class="pv-jodoh-kunci">Kunci: ${gbr ? hk(kk[i]) : pvBr(kanan[kk[i]])}</div>` : "";
      return `<div class="cbt-jodoh-row"><div class="cbt-jodoh-kiri">${pvBr(tk)}${kunciTeks}</div>
        <div class="cbt-jodoh-panah">&rarr;</div>
        <select class="pilih cbt-jodoh-pilih" data-pv-jodoh="${i}"><option value="">-- Pilih pasangan --</option>
          ${kanan.map((tr, ki) => `<option value="${ki}" ${pil === ki ? "selected" : ""}>${gbr ? hk(ki) + (bersih(tr) ? " - " + esc(bersih(tr)) : "") : esc(tr)}</option>`).join("")}
        </select></div>`;
    }).join("")}</div>`;
  } else {
    area = `<label class="f">Jawaban Anda:
      <textarea class="area" id="pv-esai" rows="6" placeholder="Ketik jawaban uraian Anda di sini...">${esc(typeof jwb === "string" ? jwb : "")}</textarea></label>
      ${tampilKunci ? `<div class="pv-pedoman"><b>Pedoman jawaban:</b><br>${kk ? pvBr(kk) : '<span class="ket">Belum ada pedoman.</span>'}</div>` : ""}`;
  }

  q("#pv-isi").innerHTML = `
    <div class="cbt-soal-meta"><span class="badge info">${esc(pvJenis[s.jenis] || "Soal Ujian")}</span></div>
    <div class="cbt-pertanyaan">${pvBr(s.pertanyaan)}</div>
    <div class="cbt-jawaban-wrap">${area}</div>
    ${tampilKunci && s.pembahasan ? `<div class="pv-bahas"><b>Pembahasan:</b><br>${pvBr(s.pembahasan)}</div>` : ""}`;

  const box = q("#pv-isi");
  box.querySelectorAll("[data-pv-pg]").forEach((b) => b.onclick = () => {
    PV.jawaban[s.id] = Number(b.dataset.pvPg); pvSoalAktif();
  });
  box.querySelectorAll("[data-pv-pgk]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.pvPgk);
    const set = new Set(Array.isArray(PV.jawaban[s.id]) ? PV.jawaban[s.id] : []);
    if (set.has(i)) set.delete(i); else set.add(i);
    PV.jawaban[s.id] = [...set].sort((a, b2) => a - b2); pvSoalAktif();
  });
  box.querySelectorAll("[data-pv-bs]").forEach((b) => b.onclick = () => {
    const cur = Array.isArray(PV.jawaban[s.id]) ? [...PV.jawaban[s.id]] : [];
    cur[Number(b.dataset.pvBs)] = b.dataset.pvVal === "true";
    PV.jawaban[s.id] = cur; pvSoalAktif();
  });
  box.querySelectorAll("[data-pv-jodoh]").forEach((sel) => sel.onchange = () => {
    const cur = Array.isArray(PV.jawaban[s.id]) ? [...PV.jawaban[s.id]] : [];
    cur[Number(sel.dataset.pvJodoh)] = sel.value === "" ? null : Number(sel.value);
    PV.jawaban[s.id] = cur; pvGrid();
  });
  const es = box.querySelector("#pv-esai");
  if (es) es.oninput = () => { PV.jawaban[s.id] = es.value; pvGrid(); };

  pvGrid();
}
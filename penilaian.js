"use strict";
// =====================================================================
//  PENILAIAN ESAI MANUAL (dipakai guru dan admin)
//  Esai TIDAK dinilai otomatis. Siswa mengumpulkan ujian -> status
//  "menunggu penilaian". Guru membuka lembar jawaban, memberi skor tiap
//  soal esai (0 s.d. bobot soal), lalu menekan "Simpan & finalisasi".
//  Nilai akhir = (skor otomatis + skor esai) / total bobot x 100.
//  Semua penghitungan final dilakukan di server (fungsi
//  simpan_penilaian_esai), bukan di browser.
// =====================================================================

const pnAngka = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

async function bukaPenilaian(hasilId, siswa, ujian, setelahSimpan) {
  let hasil, soal;
  try {
    const [h, q] = await Promise.all([
      sb.from("hasil_ujian")
        .select("id,status,jawaban,esai_dinilai,status_koreksi,skor_otomatis,total_bobot,nilai,catatan_guru")
        .eq("id", hasilId).single(),
      sb.from("bank_soal").select("id,no,pertanyaan,kunci,bobot")
        .eq("bank_id", ujian.bank_id).eq("jenis", "esai").order("no", { ascending: true }),
    ]);
    if (h.error) throw h.error;
    if (q.error) throw q.error;
    hasil = h.data; soal = q.data || [];
  } catch (e) {
    return toast("Gagal membuka lembar jawaban: " + (e.message || e), "error");
  }
  if (!soal.length) return toast("Ujian ini tidak memiliki soal esai.", "info");

  const jwb = hasil.jawaban || {};
  const lama = hasil.esai_dinilai || {};
  const teksJawaban = (s) => {
    const v = jwb[s.id];
    return typeof v === "string" && v.trim() ? v : "";
  };
  const totalBobot = Number(hasil.total_bobot) || 0;
  const skorOto = Number(hasil.skor_otomatis) || 0;
  const sudahFinal = hasil.status_koreksi === "selesai";

  const kartu = soal.map((s, i) => {
    const jawab = teksJawaban(s);
    const nilai0 = lama[s.id] ? lama[s.id].skor : "";
    const cat0 = lama[s.id] && lama[s.id].catatan ? lama[s.id].catatan : "";
    const bobot = Number(s.bobot) || 1;
    const pedoman = typeof s.kunci === "string" && s.kunci.trim() ? s.kunci : "";
    return `
    <section class="pn-kartu" data-soal="${esc(s.id)}" data-bobot="${bobot}" data-jawab="${jawab ? 1 : 0}">
      <header><b>Soal esai ${i + 1}</b><span class="badge info">Bobot ${pnAngka(bobot)}</span></header>
      <div class="pn-tanya">${teksSoalHtml(s.pertanyaan)}</div>
      ${pedoman ? `<div class="pn-pedoman"><small>Pedoman jawaban</small><div>${teksSoalHtml(pedoman)}</div></div>` : ""}
      <div class="pn-jawab ${jawab ? "" : "kosong"}"><small>Jawaban siswa</small>
        <div>${jawab ? esc(jawab) : "<i>Siswa tidak menjawab soal ini (skor otomatis 0).</i>"}</div></div>
      ${jawab ? `
      <div class="pn-nilai">
        <label>Skor
          <input class="input pn-skor" type="number" inputmode="decimal" min="0" max="${bobot}" step="0.5"
                 value="${nilai0 === "" ? "" : esc(nilai0)}" placeholder="0 - ${pnAngka(bobot)}">
        </label>
        <span class="pn-maks">dari ${pnAngka(bobot)}</span>
        <span class="pn-cepat">
          <button type="button" class="btn btn-kecil" data-cepat="0">0</button>
          <button type="button" class="btn btn-kecil" data-cepat="0.5">&frac12;</button>
          <button type="button" class="btn btn-kecil" data-cepat="1">Penuh</button>
        </span>
      </div>
      <label class="f pn-cat">Komentar untuk soal ini (opsional)
        <input class="input pn-catatan" maxlength="300" value="${esc(cat0)}" placeholder="Mis. Konsep benar, kurang contoh"></label>` : ""}
    </section>`;
  }).join("");

  const html = `
    <div class="hasil-modal-identitas">
      <div><small>Siswa</small><b>${esc(siswa.nama)} (${esc(siswa.username)})</b></div>
      <div><small>Kelas</small><b>${esc(namaKelas(siswa.kelas_id))}</b></div>
      <div><small>Ujian</small><b>${esc(ujian.judul)}</b></div>
      <div><small>Status</small><b>${sudahFinal ? '<span class="badge ok">Sudah dinilai</span>' : '<span class="badge warn">Menunggu penilaian</span>'}</b></div>
    </div>
    <div class="pn-ringkas">
      <div><small>Skor otomatis (non-esai)</small><b>${pnAngka(skorOto)}</b></div>
      <div><small>Skor esai</small><b id="pn-skor-esai">0</b></div>
      <div><small>Total bobot</small><b>${pnAngka(totalBobot)}</b></div>
      <div class="pn-nilai-akhir"><small>Perkiraan nilai akhir</small><b id="pn-nilai-akhir">-</b></div>
    </div>
    <div id="pn-daftar">${kartu}</div>
    <label class="f">Catatan untuk siswa (opsional)
      <textarea class="area" id="pn-umum" maxlength="600" rows="3" placeholder="Mis. Tingkatkan lagi pemahaman bab 3.">${esc(hasil.catatan_guru || "")}</textarea></label>`;

  const m = tampilModal(`Penilaian esai - ${siswa.nama}`, html, {
    lebar: "lebar",
    aksi: [
      { label: "Tutup" },
      { id: "draf", label: "Simpan draf", tutup: false, onClick: (mm) => simpan(mm, false) },
      { id: "final", label: sudahFinal ? "Simpan perubahan nilai" : "Simpan & finalisasi", kelas: "btn-primary", tutup: false,
        onClick: (mm) => simpan(mm, true) },
    ],
  });

  m.el.querySelector(".modal").classList.add("modal-nilai"); // penanda untuk tata letak HP
  const kartuEl = () => [...m.body.querySelectorAll(".pn-kartu")];
  const bacaSkor = (k) => {
    const el = k.querySelector(".pn-skor");
    if (!el) return null;                      // tidak dijawab
    const v = el.value.trim();
    return v === "" ? "" : Number(v);          // "" = belum diisi
  };

  function hitung() {
    let total = 0, kurang = 0;
    kartuEl().forEach((k) => {
      const v = bacaSkor(k);
      if (v === null) return;
      if (v === "" || Number.isNaN(v)) { kurang++; return; }
      total += Math.min(Math.max(v, 0), Number(k.dataset.bobot));
    });
    m.body.querySelector("#pn-skor-esai").textContent = pnAngka(total);
    const nilai = totalBobot > 0 ? Math.min(100, ((skorOto + total) / totalBobot) * 100) : 0;
    m.body.querySelector("#pn-nilai-akhir").textContent = kurang
      ? `${nilai.toFixed(1)} (sementara, ${kurang} soal belum diberi skor)` : nilai.toFixed(1);
  }
  hitung();

  m.body.addEventListener("input", (e) => { if (e.target.classList.contains("pn-skor")) hitung(); });
  m.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cepat]"); if (!b) return;
    const k = b.closest(".pn-kartu");
    k.querySelector(".pn-skor").value = pnAngka(Number(k.dataset.bobot) * Number(b.dataset.cepat));
    hitung();
  });

  async function simpan(mm, final) {
    const p_skor = {}, p_catatan = {};
    for (const k of kartuEl()) {
      const v = bacaSkor(k);
      if (v === null) continue;
      const id = k.dataset.soal, bobot = Number(k.dataset.bobot);
      if (v === "") {
        if (final) throw new Error("Masih ada soal esai yang belum diberi skor. Isi semua skor, atau pilih Simpan draf.");
        p_skor[id] = null;
      } else {
        if (Number.isNaN(v) || v < 0 || v > bobot) throw new Error(`Skor harus antara 0 dan ${pnAngka(bobot)}.`);
        p_skor[id] = v;
      }
      p_catatan[id] = k.querySelector(".pn-catatan").value.trim();
    }
    const { data, error } = await sb.rpc("simpan_penilaian_esai", {
      p_hasil_id: hasilId, p_skor, p_catatan, p_selesai: final,
      p_catatan_umum: mm.body.querySelector("#pn-umum").value,
    });
    if (error) throw new Error(error.message);
    if (setelahSimpan) setelahSimpan();
    if (final) {
      toast(`Penilaian tersimpan. Nilai akhir ${siswa.nama}: ${pnAngka(data.nilai)}`, "ok");
      mm.tutup();
    } else {
      toast("Draf penilaian tersimpan. Nilai belum dirilis ke siswa.", "ok");
    }
    return false;
  }
}
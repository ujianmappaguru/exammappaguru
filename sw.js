"use strict";
// Service worker sederhana: jaringan dulu, cadangan dari cache.
// - Hanya file milik aplikasi sendiri (same-origin, GET). Panggilan ke Supabase,
//   CDN, dan semua permintaan non-GET TIDAK disentuh, jadi data ujian selalu langsung ke server.
// - Jaringan dulu supaya perubahan kode langsung terpakai (tidak terjebak versi lama).
// - Naikkan VERSI bila ingin membuang cache lama.
const VERSI = "ujian-v3";
const INTI = [
  "./", "index.html", "siswa.html", "admin.html", "guru.html",
  "style.css", "config.js", "common.js", "anticurang.js", "pwa.js",
  "siswa.js", "admin.js", "soal.js", "hasil.js", "penilaian.js", "monitor.js", "cetak.js",
  "manifest.webmanifest", "icon-192.png", "icon-512.png", "favicon-64.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSI)
      .then((c) => Promise.all(INTI.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSI);
    const jaringan = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    // Jaringan lambat (>3,5 dtk) dan ada salinan tersimpan: pakai salinan.
    const lambat = new Promise((ok) => setTimeout(async () => {
      const c = await cache.match(req, { ignoreSearch: true });
      if (c) ok(c);
    }, 3500));
    try {
      return await Promise.race([jaringan, lambat]);
    } catch (_) {
      const c = await cache.match(req, { ignoreSearch: true });
      if (c) return c;
      if (req.mode === "navigate") { const h = await cache.match("index.html"); if (h) return h; }
      return Response.error();
    }
  })());
});

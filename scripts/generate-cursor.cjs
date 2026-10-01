/* eslint-disable @typescript-eslint/no-require-imports */
// Fare imleci görsellerini üretir: node scripts/generate-cursor.cjs
//
// Kaynak: dükkan fotoğrafları/FARE İMLECİ/İMLEÇ.png (kullanıcının zeytin dalı çizimi).
// Çıktı : public/cursor/olive{,-link}-{32,64}.png  (64 = 2x)
//
// - Zeytin meyvesi dalın sağ alt ucunda; yapraklar sol üste uzanır. Tıklama noktası (hotspot)
//   zeytinin sivri ucudur, yapraklar imlecin arkasında (sol-üstte) kalır.
// - Tuval 32×32 CSS px: Chrome 32 px'ten büyük imleçleri tarayıcı arayüzüne değdiğinde gizler.
// - Okunabilirlik: ince açık kenar + yumuşak gölge (koyu zeytin koyu zeminde de görünsün).
// - "-link" sürümü zeytinin ucuna altın halka ekler (tıklanabilir öğeler için).
// - Hotspot app/globals.css'teki değerle aynı olmalı; betik sonda yazdırır.
const sharp = require("sharp");
const path = require("node:path");

const SRC = path.resolve(__dirname, "..", "..", "dükkan fotoğrafları", "FARE İMLECİ", "İMLEÇ.png");
const OUT = path.resolve(__dirname, "..", "public", "cursor");

const S = 32; // tuval (CSS px)
const BOX = 26; // dalın tuvaldeki genişliği (sağ/alt tarafta halka + gölge payı kalsın)
const PAD = 1.5; // dalın sol-üst boşluğu (kenar çizgisi için)
const SS = 4; // süper-örnekleme (kenarlar pürüzsüz olsun)

// Kaynak görselde (1254×1254) dalın kapladığı alan ve zeytinin köşegen ucu (analizle bulundu)
const BBOX = { left: 52, top: 53, width: 1161, height: 1132 };
const TIP = { x: 1188, y: 1154 }; // zeytinin sağ-alt ucu (max x+y)
const OLIVE_CENTER = { x: 1086, y: 1029 };

const scale = BOX / BBOX.width; // kaynak px → CSS px
const toCanvas = (sx, sy) => [PAD + (sx - BBOX.left) * scale, PAD + (sy - BBOX.top) * scale];

// Hotspot: zeytin ucundan ~1 CSS px içeride (tam kenar değil, zeytinin üstüne tıklansın)
const dx = OLIVE_CENTER.x - TIP.x;
const dy = OLIVE_CENTER.y - TIP.y;
const dl = Math.hypot(dx, dy);
const inset = 1 / scale;
const [hxF, hyF] = toCanvas(TIP.x + (dx / dl) * inset, TIP.y + (dy / dl) * inset);
const HX = Math.round(hxF);
const HY = Math.round(hyF);
// Halka merkezi: zeytin merkeziyle hotspot arasında — halka zeytini sarar, tıklama noktası içinde kalır
const [ocx, ocy] = toCanvas(OLIVE_CENTER.x, OLIVE_CENTER.y);
const RING_C = { x: ocx + (hxF - ocx) * 0.45, y: ocy + (hyF - ocy) * 0.45 };
const RING_R = 4.6;

function gaussianBlur(src, n, sigma) {
  const r = Math.ceil(sigma * 3);
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < n) a += src[y * n + xx] * k[i + r];
      }
      tmp[y * n + x] = a;
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < n) a += tmp[yy * n + x] * k[i + r];
      }
      out[y * n + x] = a;
    }
  return out;
}

function dilate(src, n, radius) {
  const offs = [];
  const r = Math.ceil(radius);
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) if (i * i + j * j <= radius * radius) offs.push([i, j]);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let m = 0;
      for (const [i, j] of offs) {
        const xx = x + i;
        const yy = y + j;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const v = src[yy * n + xx];
        if (v > m) {
          m = v;
          if (m >= 1) break;
        }
      }
      out[y * n + x] = m;
    }
  return out;
}

// Premultiplied RGBA (Float32, 0..1) üstüne "over" kompozit
function over(dst, i, r, g, b, a) {
  if (a <= 0) return;
  const inv = 1 - a;
  dst[i] = r * a + dst[i] * inv;
  dst[i + 1] = g * a + dst[i + 1] * inv;
  dst[i + 2] = b * a + dst[i + 2] * inv;
  dst[i + 3] = a + dst[i + 3] * inv;
}

async function render(k, withRing, branch) {
  const P = S * k; // çıktı boyutu (px)
  const N = P * SS; // süper-örneklenmiş tuval
  const sHi = scale * k * SS;
  const w = Math.round(BBOX.width * sHi);
  const h = Math.round(BBOX.height * sHi);
  const { data } = await sharp(branch)
    .resize(w, h, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ox = Math.round(PAD * k * SS);
  const oy = Math.round(PAD * k * SS);
  const A = new Float32Array(N * N); // dalın alfa maskesi
  const rgb = new Float32Array(N * N * 3); // düz (premultiplied olmayan) renk
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = x + ox;
      const Y = y + oy;
      if (X >= N || Y >= N) continue;
      const s = (y * w + x) * 4;
      const d = Y * N + X;
      A[d] = data[s + 3] / 255;
      rgb[d * 3] = data[s] / 255;
      rgb[d * 3 + 1] = data[s + 1] / 255;
      rgb[d * 3 + 2] = data[s + 2] / 255;
    }

  const px = k * SS; // 1 CSS px kaç süper-örnek
  const outline = dilate(A, N, 0.95 * px);
  const shadowMask = new Float32Array(N * N);
  const sx = Math.round(0.7 * px);
  const sy = Math.round(1.0 * px);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const xx = x - sx;
      const yy = y - sy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N) shadowMask[y * N + x] = outline[yy * N + xx];
    }
  const shadow = gaussianBlur(shadowMask, N, 0.9 * px);

  const cx = RING_C.x * px;
  const cy = RING_C.y * px;
  const acc = new Float32Array(N * N * 4); // premultiplied
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const p = y * N + x;
      const i = p * 4;
      // 1) gölge
      over(acc, i, 0.09, 0.06, 0.02, Math.min(1, shadow[p] * 0.42));
      // 2) altın halka (yalnız bağlantı imleci): dolgu + altın çizgi + dış beyaz çizgi
      if (withRing) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / px; // CSS px
        const R = RING_R;
        const fill = dist <= R ? 1 : 0;
        over(acc, i, 0.79, 0.66, 0.3, fill * 0.3);
        const ringGold = Math.max(0, 1 - Math.abs(dist - R) / 0.7);
        over(acc, i, 0.79, 0.66, 0.3, Math.min(1, ringGold * 1.15));
        const ringWhite = Math.max(0, 1 - Math.abs(dist - (R + 0.95)) / 0.5);
        over(acc, i, 1, 1, 1, Math.min(1, ringWhite * 0.85));
      }
      // 3) açık kenar
      over(acc, i, 1, 1, 1, Math.min(1, outline[p] * 0.85));
      // 4) dal
      over(acc, i, rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], A[p]);
    }

  // SS×SS kutu süzgeciyle küçült → düz alfa RGBA
  const out = Buffer.alloc(P * P * 4);
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const q = ((y * SS + j) * N + (x * SS + i)) * 4;
          r += acc[q]; g += acc[q + 1]; b += acc[q + 2]; a += acc[q + 3];
        }
      const cnt = SS * SS;
      a /= cnt;
      const o = (y * P + x) * 4;
      if (a > 0) {
        out[o] = Math.round(Math.min(1, r / cnt / a) * 255);
        out[o + 1] = Math.round(Math.min(1, g / cnt / a) * 255);
        out[o + 2] = Math.round(Math.min(1, b / cnt / a) * 255);
      }
      out[o + 3] = Math.round(a * 255);
    }
  return sharp(out, { raw: { width: P, height: P, channels: 4 } }).png({ compressionLevel: 9 });
}

(async () => {
  // Kaynağı önce dalın sınır kutusuna kırp (kenar boşlukları atılır)
  const branch = await sharp(SRC).extract(BBOX).png().toBuffer();
  for (const [name, ring] of [["olive", false], ["olive-link", true]]) {
    for (const k of [1, 2]) {
      const img = await render(k, ring, branch);
      await img.toFile(path.join(OUT, `${name}-${S * k}.png`));
    }
  }
  console.log("imleç görselleri üretildi:", OUT);
  console.log(`hotspot (CSS px): ${HX} ${HY}  (zeytin ucu; tuval ${S}×${S})`);
})();

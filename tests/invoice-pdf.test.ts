/**
 * Teslim e-postasındaki basit fatura PDF'i (lib/invoice/pdf.ts): KDV dökümü yalnız oranlar biliniyorsa; yazı tipi
 * Türkçe harfleri taşır; belge açılabilir, küçük ve sipariş numarasını taşır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { includedVatKurus, invoiceFileName, renderInvoicePdf, vatBreakdown } from "@/lib/invoice/pdf";
import { loadOrderEmailData } from "@/lib/notifications/order-data";
import { setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

const item = (lineTotalKurus: number, vatRateBps: number | null) => ({
  name: "Zeytin",
  variant: "1 kg",
  quantity: 1,
  unitPriceKurus: lineTotalKurus,
  lineTotalKurus,
  imageUrl: null,
  vatRateBps,
});

test("tutara dahil KDV kuruşa yuvarlanır; döküm yalnız bütün oranlar biliniyorsa ve sipariş indirimi yoksa", () => {
  assert.equal(includedVatKurus(10_100, 100), 100); // 101 TL, %1 → 1 TL
  assert.equal(includedVatKurus(12_000, 2000), 2000); // 120 TL, %20 → 20 TL
  assert.equal(includedVatKurus(32_000, 100), 317); // 316,83 → 3,17 TL
  assert.deepEqual(vatBreakdown({ items: [item(10_100, 100), item(12_000, 2000), item(20_200, 100)], discountKurus: 0 }), [
    { bps: 100, vatKurus: 300 },
    { bps: 2000, vatKurus: 2000 },
  ]);
  assert.equal(vatBreakdown({ items: [item(10_100, 100), item(5000, null)], discountKurus: 0 }), null, "oran girilmemiş kalem");
  assert.equal(vatBreakdown({ items: [item(10_100, 100)], discountKurus: 500 }), null, "sipariş geneli indirim");
});

test("yazı tipleri Türkçe harfleri ve para/tire işaretlerini taşır", () => {
  for (const file of ["Inter-Regular.ttf", "Inter-Bold.ttf"]) {
    const font = fontkit.create(readFileSync(path.join(process.cwd(), "assets", "fonts", file)));
    for (const ch of "ğĞşŞıİçÇöÖüÜâÂîÎûÛ–—−₺€·") {
      assert.ok(font.hasGlyphForCodePoint(ch.codePointAt(0)!), `${file}: "${ch}" yok`);
    }
  }
});

test("sipariş faturası: açılabilen tek sayfalık küçük PDF; başlıkta sipariş numarası; girilen fatura no kullanılır", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", quantity: 2 });
  await prisma.order.update({ where: { id: order.id }, data: { invoiceNumber: "CEA2026000000001" } });
  const d = (await loadOrderEmailData(order.id))!;
  assert.equal(d.invoiceNumber, "CEA2026000000001");
  const bytes = await renderInvoicePdf({ ...d, customerNote: "Kapıya bırakın 🙂 teşekkürler\nikinci satır" }, { issuedAt: new Date() });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
  assert.ok(bytes.length < 200_000, `PDF ${bytes.length} bayt`);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), `Fatura — Sipariş ${order.reference}`);
  assert.equal(invoiceFileName(order.reference), `fatura-${order.reference}.pdf`);
});

test("çok kalemli sipariş sayfalara bölünür", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER" });
  const d = (await loadOrderEmailData(order.id))!;
  const items = Array.from({ length: 40 }, (_, k) => ({ ...d.items[0], name: `Ürün ${k + 1} — uzun bir ürün adı ki satıra sığmasın, bölünsün` }));
  const pdf = await PDFDocument.load(await renderInvoicePdf({ ...d, items }, { issuedAt: new Date() }));
  assert.ok(pdf.getPageCount() >= 3, `${pdf.getPageCount()} sayfa`);
});

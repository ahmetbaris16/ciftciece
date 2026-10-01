/**
 * Admin Ödeme Ayarları
 * GET /api/admin/payment — mevcut ayarlar
 * PUT /api/admin/payment — kart (taksit), havale/EFT (IBAN), kapıda ödeme (bedel, üst sınır)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { getPaymentSettings, savePaymentSettings } from "@/lib/payment/settings.repository";
import { INSTALLMENT_CHOICES, isValidTrIban, normalizeIban } from "@/lib/payment/methods";

const SettingsSchema = z
  .object({
    card: z.object({
      enabled: z.boolean(),
      maxInstallment: z
        .number()
        .int()
        .refine((n) => (INSTALLMENT_CHOICES as readonly number[]).includes(n), { error: "Geçersiz taksit sayısı." }),
    }),
    bankTransfer: z.object({
      enabled: z.boolean(),
      bankName: z.string().trim().max(80),
      accountHolder: z.string().trim().max(120),
      iban: z.string().transform(normalizeIban),
      paymentWindowHours: z.number().int().min(6, { error: "Havale süresi en az 6 saat olmalı." }).max(168, {
        error: "Havale süresi en fazla 168 saat (7 gün) olabilir.",
      }),
    }),
    cashOnDelivery: z.object({
      enabled: z.boolean(),
      feeKurus: z.number().int().min(0).max(100_000_00),
      maxOrderKurus: z.number().int().min(1).max(1_000_000_00).nullable(),
    }),
  })
  .superRefine((v, ctx) => {
    const b = v.bankTransfer;
    if (b.iban && !isValidTrIban(b.iban)) {
      ctx.addIssue({ code: "custom", message: "IBAN geçersiz (TR ile başlayan 26 karakter olmalı; kontrol hanesi tutmuyor)." });
    }
    if (b.enabled && b.iban && (!b.accountHolder || !b.bankName)) {
      ctx.addIssue({ code: "custom", message: "Havale için banka adı ve hesap sahibini de girin." });
    }
  });

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  return NextResponse.json({ settings: await getPaymentSettings() });
}

export async function PUT(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const parsed = SettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ayarları kontrol edin." }, { status: 400 });
  }

  try {
    const settings = await savePaymentSettings(parsed.data);
    await createAuditLog({
      userId: user.id,
      action: "payment_settings.update",
      entity: "site_setting",
      // IBAN denetim kaydında son 4 haneyle tutulur
      details: {
        ...settings,
        bankTransfer: { ...settings.bankTransfer, iban: settings.bankTransfer.iban ? `…${settings.bankTransfer.iban.slice(-4)}` : "" },
      } as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[admin/payment PUT]", err);
    return NextResponse.json({ error: "Kaydedilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

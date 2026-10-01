import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    // MariaDB'nin varsayılan yalıtım düzeyi REPEATABLE READ: işlem içindeki düz okumalar işlemin ilk
    // okumasındaki anlık görüntüyü görür. Ödeme ve stok kodu "önce satırı kilitle, sonra oku" düzeniyle
    // yazıldı; kilit beklenirken başka işlemin onayladığı değişikliğin sonraki okumalarda görünmesi için
    // işlemler READ COMMITTED açılır (her okuma en son onaylı veriyi görür).
    transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

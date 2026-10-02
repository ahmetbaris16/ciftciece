-- Yönetici girişi için kullanıcı adı. Yalnız ekleme: boş geçilebilir sütun + tekil dizin; mevcut satırlar boş kalır,
-- eski kod bu sütunu okumadan çalışmaya devam eder.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `username` VARCHAR(40) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);

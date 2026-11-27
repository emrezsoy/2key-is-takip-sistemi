-- Randevu süresi varsayılanı 1 saat; varsayılanda (30 dk) kalan mevcut ayarlar da 60 dk yapılır.
ALTER TABLE "DmConfig" ALTER COLUMN "appointmentDurationMin" SET DEFAULT 60;
UPDATE "DmConfig" SET "appointmentDurationMin" = 60 WHERE "appointmentDurationMin" = 30;

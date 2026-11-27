-- İçerik satırı: caption ve planlanan paylaşım günü/saati; iş: caption.
ALTER TABLE "ContentItem" ADD COLUMN "caption" TEXT, ADD COLUMN "shareDate" TEXT, ADD COLUMN "shareTime" TEXT;
ALTER TABLE "Task" ADD COLUMN "caption" TEXT;

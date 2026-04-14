-- Two-phase diagnostic form: Fase 1 obligatoria + Fase 2 opcional
-- Hace nullable los campos de Fase 2 y añade columnas nuevas.
-- No dropea columnas legacy (se dropean en una migración posterior cuando
-- se confirme que ningún consumer las lee).

ALTER TABLE "diagnostics"
  ADD COLUMN IF NOT EXISTS "industria_otro" text;

ALTER TABLE "diagnostics"
  ADD COLUMN IF NOT EXISTS "phase2_completed_at" timestamp;

-- Campos que pasan de NOT NULL a nullable (Fase 2 opcional)
ALTER TABLE "diagnostics" ALTER COLUMN "anos_operacion" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "ciudades" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "objetivos" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "resultado_esperado" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "productos" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "volumen_mensual" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "cliente_principal" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "canales_adquisicion" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "canal_principal" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "herramientas" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "conectadas" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "nivel_tech" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "usa_ia" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "comodidad_tech" DROP NOT NULL;
ALTER TABLE "diagnostics" ALTER COLUMN "familiaridad" DROP NOT NULL;

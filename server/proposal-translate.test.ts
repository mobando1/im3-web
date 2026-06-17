/**
 * Tests de la lógica pura de traducción de propuestas (fingerprint + caché + reimposición).
 * Funciones puras, sin DB ni IA. Correr con:  npx tsx server/proposal-translate.test.ts
 * (No usa framework; node:assert + salida con código != 0 si algo falla.)
 */
import assert from "node:assert/strict";
import { fingerprintSections, reimposeImmutable, TRANSLATION_LOGIC_VERSION } from "./proposal-translate-helpers";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

// ── fingerprint ──────────────────────────────────────────────
test("fingerprint es estable ante reordenamiento de claves (round-trip json)", () => {
  assert.equal(fingerprintSections({ a: 1, b: 2 }), fingerprintSections({ b: 2, a: 1 }));
  assert.equal(
    fingerprintSections({ hero: { x: "a", y: "b" } }),
    fingerprintSections({ hero: { y: "b", x: "a" } }),
  );
});

test("fingerprint cambia si cambia el contenido", () => {
  assert.notEqual(fingerprintSections({ t: "hola" }), fingerprintSections({ t: "hello" }));
});

test("fingerprint incluye la versión de lógica (invalida cachés viejas al subir versión)", () => {
  const fp = fingerprintSections({ a: 1 });
  // El prefijo de versión DEBE estar y ser exactamente la versión actual (assert load-bearing).
  assert.ok(fp.startsWith(`v${TRANSLATION_LOGIC_VERSION}:`), `fp debe empezar con la versión actual: ${fp}`);
  // Quitando el prefijo de versión queda el formato "viejo" (len:hash) → una caché pre-versión NO coincide.
  const withoutVersion = fp.replace(/^v\d+:/, "");
  assert.notEqual(fp, withoutVersion);
  assert.match(withoutVersion, /^\d+:[a-z0-9]+$/);
});

// ── reimposeImmutable ────────────────────────────────────────
const original = {
  meta: { clientName: "Álamo Angels", industry: "Retail" },
  hero: { painHeadline: "Pierdes dinero —", painAmount: " y cada semana se escapa una oportunidad." },
  summary: { stats: [{ label: "Tiempo", value: "4 semanas" }, { label: "Agentes", value: "2 agentes" }] },
  problem: { monthlyLossCOP: 5000000, problemCards: [{ icon: "⚠️", title: "Demoras" }] },
  pricing: { amount: "26.000.000", milestones: [{ step: 1, name: "Inicio", amount: "10.000.000" }] },
  roi: { recoveries: [{ amount: "50", currency: "COP", label: "Ahorro" }], paybackMonths: "8 meses" },
  operationalCosts: { groups: [{ billingModel: "passthrough", name: "Uso" }] },
  hardware: { items: [{ name: "Cámara", paidBy: "cliente-compra", quantity: 2, unitPriceUSD: "100" }] },
};
const translated = {
  meta: { clientName: "WRONG", industry: "Retail (EN)" },
  hero: { painHeadline: "You lose money —", painAmount: " and every week a chance slips away." },
  summary: { stats: [{ label: "Time", value: "4 weeks" }, { label: "Agents", value: "2 agents" }] },
  problem: { monthlyLossCOP: 0, problemCards: [{ icon: "X", title: "Delays" }] },
  pricing: { amount: "26,000,000", milestones: [{ step: 9, name: "Kickoff", amount: "99" }] },
  roi: { recoveries: [{ amount: "99", currency: "USD", label: "Savings" }], paybackMonths: "8 months" },
  operationalCosts: { groups: [{ billingModel: "traspaso", name: "Usage" }] },
  hardware: { items: [{ name: "Camera", paidBy: "im3-incluye", quantity: 9, unitPriceUSD: "99" }] },
};
const r = reimposeImmutable(original, translated) as any;

test("traduce prosa/unidades antes intocables (bug painAmount/value corregido)", () => {
  assert.equal(r.hero.painAmount, " and every week a chance slips away.");
  assert.equal(r.summary.stats[0].value, "4 weeks");
  assert.equal(r.summary.stats[1].value, "2 agents");
  assert.equal(r.roi.paybackMonths, "8 months");
});

test("preserva enums de UI, íconos, moneda y nombres propios", () => {
  assert.equal(r.meta.clientName, "Álamo Angels");          // nombre propio
  assert.equal(r.problem.problemCards[0].icon, "⚠️");         // icon
  assert.equal(r.roi.recoveries[0].currency, "COP");          // currency
  assert.equal(r.operationalCosts.groups[0].billingModel, "passthrough"); // enum
  assert.equal(r.hardware.items[0].paidBy, "cliente-compra"); // enum
});

test("preserva números JS aunque la IA los cambie", () => {
  assert.equal(r.problem.monthlyLossCOP, 5000000);
  assert.equal(r.hardware.items[0].quantity, 2);
});

test("traduce labels y texto normal", () => {
  assert.equal(r.summary.stats[0].label, "Time");
  assert.equal(r.meta.industry, "Retail (EN)");
  assert.equal(r.roi.recoveries[0].label, "Savings");
});

test("arrays se emparejan por índice (riesgo si la IA reordena → lo mitiga el prompt)", () => {
  // quantity (número) del item original[0] se reimpone sobre translated[0]
  assert.equal(r.hardware.items[0].quantity, 2);
  assert.equal(r.pricing.milestones[0].step, 1); // número preservado por posición
});

test("conserva claves ausentes en la traducción (no pierde secciones)", () => {
  const r2 = reimposeImmutable({ a: { x: "uno" }, b: { y: "dos" } }, { a: { x: "one" } }) as any;
  assert.equal(r2.b.y, "dos");
  assert.equal(r2.a.x, "one");
});

// ── simulación de invalidación de caché ──────────────────────
test("caché: fp coincide → hit; tras 'editar' el contenido → miss", () => {
  const src = { meta: { clientName: "A" }, hero: { h: "hola" } };
  const stored = { srcFingerprint: fingerprintSections(src) };
  assert.equal(stored.srcFingerprint === fingerprintSections(src), true); // hit
  const edited = { meta: { clientName: "A" }, hero: { h: "hola editado" } };
  assert.equal(stored.srcFingerprint === fingerprintSections(edited), false); // miss → re-traduce
});

console.log(`\n${passed} tests passed`);

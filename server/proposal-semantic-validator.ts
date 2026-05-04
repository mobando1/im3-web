import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = "claude-haiku-4-5-20251001";

export type SemanticIssue = {
  severity: "error" | "warning";
  field?: string;
  message: string;
};

/**
 * Validador semántico — usa Claude Haiku (barato y rápido) para detectar
 * inconsistencias de contenido que el schema Zod no puede pillar:
 *  - Nombre de cliente equivocado
 *  - Fechas inconsistentes
 *  - Números que no salen del contexto del cliente
 *  - Información inventada vs lo que dice el diagnóstico
 *
 * Devuelve issues. Si está vacío, el cambio es semánticamente coherente.
 * Costo aproximado: ~$0.001 por validación.
 */
export async function validateSemanticChange(params: {
  sectionKey: string;
  newContent: Record<string, unknown>;
  contactName: string;
  contactCompany: string;
  clientContextSummary: string; // resumen corto del diagnóstico/contexto
}): Promise<SemanticIssue[]> {
  const anthropic = getClient();
  if (!anthropic) return []; // sin API key, no validamos (no bloqueamos)

  const prompt = `Eres un validador rápido de contenido de propuestas. Detecta SOLO inconsistencias factuales graves.

CLIENTE:
- Empresa: ${params.contactCompany}
- Contacto: ${params.contactName}

CONTEXTO BREVE DEL CLIENTE:
${params.clientContextSummary.substring(0, 5000)}

CAMBIO PROPUESTO EN SECCIÓN "${params.sectionKey}":
${JSON.stringify(params.newContent, null, 2).substring(0, 8000)}

DETECTA SOLO:
1. Nombre de empresa o contacto distinto al asignado (errores graves)
2. Fechas claramente inconsistentes (ej. validUntil < proposalDate)
3. Datos numéricos del cliente fabricados que NO aparecen en el contexto
4. Industria o sector que contradice el contexto

NO reportes:
- Estilo, tono, redacción
- Detalles que el contexto no menciona pero son razonables
- Cosas que mejorarían pero no son errores

Responde SOLO con JSON. Si todo está OK, devuelve {"ok": true, "issues": []}.
Si hay problemas: {"ok": false, "issues": [{"severity": "error"|"warning", "field": "<campo>", "message": "<problema breve>"}]}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { ok?: boolean; issues?: SemanticIssue[] };
    return parsed.issues || [];
  } catch (err) {
    log(`[semantic-validator] failed: ${(err as Error).message}`);
    return []; // si falla, no bloqueamos
  }
}

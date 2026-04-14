import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { agentRuns, notifications } from "@shared/schema";
import { and, eq, gte, isNull, desc } from "drizzle-orm";
import { sendEmail, isEmailConfigured } from "../email-sender";
import { log } from "../index";
import { findAgent } from "./registry";
import { runAgent } from "./runner";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

type Classification = "transient" | "bug" | "config" | "dead_record";
type Severity = "low" | "medium" | "high";
type Action = "retry" | "alert" | "ignore";

type SupervisorAnalysis = {
  classification: Classification;
  severity: Severity;
  suggestedAction: Action;
  reasoning: string;
};

export async function runErrorSupervisor(): Promise<{ recordsProcessed: number; metadata?: Record<string, unknown> }> {
  if (!db) return { recordsProcessed: 0 };
  const anthropic = getClient();
  if (!anthropic) {
    log("[error-supervisor] ANTHROPIC_API_KEY not set — skipping");
    return { recordsProcessed: 0 };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const errors = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.status, "error"),
        gte(agentRuns.startedAt, oneHourAgo),
        isNull(agentRuns.supervisorAnalyzedAt)
      )
    )
    .orderBy(desc(agentRuns.startedAt))
    .limit(20);

  if (errors.length === 0) return { recordsProcessed: 0 };

  log(`[error-supervisor] analizando ${errors.length} error(es) reciente(s)`);

  let retried = 0;
  let alerted = 0;
  let ignored = 0;

  for (const err of errors) {
    // Contexto: últimos 3 runs exitosos del mismo agente
    const recentSuccess = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.agentName, err.agentName), eq(agentRuns.status, "success")))
      .orderBy(desc(agentRuns.startedAt))
      .limit(3);

    const analysis = await analyzeError(anthropic, err, recentSuccess);

    // Marcar como analizado siempre (evitar re-análisis)
    await db
      .update(agentRuns)
      .set({
        supervisorAnalyzedAt: new Date(),
        metadata: { ...(err.metadata ?? {}), supervisorAnalysis: analysis },
      })
      .where(eq(agentRuns.id, err.id));

    if (analysis.suggestedAction === "retry" && analysis.classification === "transient") {
      const def = findAgent(err.agentName);
      if (def?.runnable) {
        try {
          await runAgent(err.agentName, def.runnable, { triggeredBy: "webhook" });
          retried++;
          log(`[error-supervisor] reintento exitoso: ${err.agentName}`);
        } catch (retryErr) {
          log(`[error-supervisor] reintento falló para ${err.agentName}: ${retryErr}`);
          await alertAdmin(err, analysis);
          alerted++;
        }
      } else {
        ignored++;
      }
    } else if (analysis.suggestedAction === "alert" || analysis.severity === "high") {
      await alertAdmin(err, analysis);
      alerted++;
    } else {
      ignored++;
    }
  }

  return {
    recordsProcessed: errors.length,
    metadata: { retried, alerted, ignored },
  };
}

async function analyzeError(
  anthropic: Anthropic,
  err: typeof agentRuns.$inferSelect,
  recentSuccess: Array<typeof agentRuns.$inferSelect>
): Promise<SupervisorAnalysis> {
  const prompt = `Eres un supervisor de errores de un sistema de automatización. Analiza este error y decide qué hacer.

AGENTE: ${err.agentName}
ERROR: ${err.errorMessage ?? "(sin mensaje)"}
STACK TRACE: ${(err.errorStack ?? "").substring(0, 1500)}
DURACIÓN: ${err.durationMs ?? 0}ms
TRIGGERED_BY: ${err.triggeredBy}
RUNS EXITOSOS RECIENTES DEL MISMO AGENTE: ${recentSuccess.length}

Clasifica el error y sugiere acción. Responde SOLO con JSON válido, sin markdown:
{
  "classification": "transient" | "bug" | "config" | "dead_record",
  "severity": "low" | "medium" | "high",
  "suggestedAction": "retry" | "alert" | "ignore",
  "reasoning": "1-2 oraciones explicando por qué"
}

GUÍA:
- "transient": errores de red, rate limits, timeouts, 5xx de APIs externas → suggestedAction: "retry"
- "bug": errores de código, null pointers, type errors → suggestedAction: "alert"
- "config": API keys faltantes, variables de entorno mal → suggestedAction: "alert", severity: "high"
- "dead_record": datos inválidos o contactos que ya no existen → suggestedAction: "ignore"
- Si hay muchos runs exitosos recientes, probablemente es transient.
- Si es un agente crítico (email-queue, whatsapp-queue, gmail-sync), severity mínimo "medium".`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      classification: parsed.classification ?? "bug",
      severity: parsed.severity ?? "medium",
      suggestedAction: parsed.suggestedAction ?? "alert",
      reasoning: parsed.reasoning ?? "Sin análisis",
    };
  } catch (parseErr) {
    log(`[error-supervisor] no pudo parsear análisis: ${parseErr}`);
    return {
      classification: "bug",
      severity: "medium",
      suggestedAction: "alert",
      reasoning: "Análisis automático falló, escalando al admin",
    };
  }
}

async function alertAdmin(err: typeof agentRuns.$inferSelect, analysis: SupervisorAnalysis) {
  if (!db) return;

  try {
    await db.insert(notifications).values({
      type: "agent_error",
      title: `🚨 Agente ${err.agentName} falló (${analysis.severity})`,
      description: `${analysis.classification}: ${analysis.reasoning}`.substring(0, 500),
    });
  } catch (_) {}

  if (!isEmailConfigured()) return;

  const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";

  const severityColor =
    analysis.severity === "high" ? "#DC2626" : analysis.severity === "medium" ? "#D97706" : "#2563EB";

  const html = `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
    <div style="background:${severityColor};padding:20px 28px;border-radius:8px 8px 0 0">
      <h1 style="color:#fff;font-size:18px;margin:0">🚨 Agente falló: ${err.agentName}</h1>
      <p style="color:#fff;opacity:0.9;margin:4px 0 0;font-size:13px">Severidad: ${analysis.severity.toUpperCase()} · Tipo: ${analysis.classification}</p>
    </div>
    <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
      <h3 style="margin:0 0 8px;font-size:14px;color:#0F172A">Análisis del supervisor</h3>
      <p style="color:#334155;font-size:14px;line-height:1.5;margin:0 0 20px">${analysis.reasoning}</p>

      <h3 style="margin:0 0 8px;font-size:14px;color:#0F172A">Error</h3>
      <pre style="background:#F1F5F9;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;color:#BE123C;white-space:pre-wrap;margin:0 0 16px">${escapeHtml(err.errorMessage ?? "(sin mensaje)")}</pre>

      ${err.errorStack ? `<details style="margin-bottom:20px"><summary style="cursor:pointer;color:#64748B;font-size:13px">Ver stack trace</summary><pre style="background:#F8FAFC;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;color:#64748B;white-space:pre-wrap;margin-top:8px">${escapeHtml(err.errorStack.substring(0, 3000))}</pre></details>` : ""}

      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #E2E8F0">
        <a href="${baseUrl}/admin/agents" style="display:inline-block;background:#2FA4A9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Ver dashboard de agentes →</a>
      </div>

      <p style="color:#94A3B8;font-size:12px;margin-top:24px;text-align:center">— Error Supervisor · IM3 Systems</p>
    </div>
  </div>`;

  await sendEmail(
    adminEmail,
    `🚨 Agente ${err.agentName} falló — ${analysis.severity}`,
    html
  ).catch((e) => log(`[error-supervisor] no pudo enviar alerta: ${e}`));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

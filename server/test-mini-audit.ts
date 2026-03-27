/**
 * Test script: generates and sends a mini-audit email to verify the template design.
 * Usage: RESEND_API_KEY=xxx ANTHROPIC_API_KEY=xxx npx tsx server/test-mini-audit.ts
 * Delete this file after testing.
 */
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!RESEND_API_KEY || !ANTHROPIC_API_KEY) {
  console.error("Set RESEND_API_KEY and ANTHROPIC_API_KEY");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// --- Replicate buildMiniAuditEmail inline for the test ---
function buildMiniAuditEmail(
  insights: Array<{ title: string; description: string; stat: string }>,
  diagnosticData: any,
  contactId: string
): string {
  const nombre = diagnosticData.participante || "there";
  const empresa = diagnosticData.empresa || "tu empresa";
  const industria = diagnosticData.industria || "tu sector";
  const fechaCita = diagnosticData.fechaCita || "";
  const horaCita = diagnosticData.horaCita || "";
  const meetLink = diagnosticData.meetLink || "";
  const areaPrioridad = Array.isArray(diagnosticData.areaPrioridad) ? diagnosticData.areaPrioridad : [];
  const baseUrl = "https://im3systems.com";

  const insightColors = [
    { border: "#3B82F6", bg: "#EFF6FF", icon: "&#9889;", iconBg: "#DBEAFE", label: "OBSERVACION" },
    { border: "#10B981", bg: "#ECFDF5", icon: "&#128200;", iconBg: "#D1FAE5", label: "DATO" },
    { border: "#F59E0B", bg: "#FFFBEB", icon: "&#127919;", iconBg: "#FEF3C7", label: "AREA DE INTERES" },
  ];

  const insightCards = insights.map((insight, i) => {
    const c = insightColors[i] || insightColors[0];
    return `
    <div style="background:${c.bg};border-left:4px solid ${c.border};border-radius:0 8px 8px 0;padding:20px;margin:0 0 16px">
      <div style="margin:0 0 10px">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:36px;height:36px;background:${c.iconBg};border-radius:8px;text-align:center;font-size:18px;vertical-align:middle">${c.icon}</td>
          <td style="padding-left:12px;vertical-align:middle">
            <span style="font-size:10px;font-weight:700;letter-spacing:1px;color:${c.border};text-transform:uppercase">${c.label}</span><br/>
            <span style="font-size:16px;font-weight:700;color:#1a1a1a">${insight.title}</span>
          </td>
        </tr></table>
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">${insight.description}</p>
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:6px;padding:10px 14px;display:inline-block">
        <span style="font-size:13px;font-weight:600;color:#1F2937">&#128202; ${insight.stat}</span>
      </div>
    </div>`;
  }).join("");

  const priorityTags = areaPrioridad.map((area: string) =>
    `<span style="display:inline-block;background:#EFF6FF;color:#3B82F6;font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;margin:2px 4px 2px 0">${area}</span>`
  ).join("");

  const meetSection = meetLink ? `
    <div style="text-align:center;margin:24px 0 0">
      <a href="${meetLink}" style="display:inline-block;background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Unirse a la reunion &#8594;</a>
    </div>` : "";

  const calendarInfo = fechaCita && horaCita ? `
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:20px 0 0;text-align:center">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px">Tu sesion de diagnostico</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1E293B">${fechaCita} a las ${horaCita}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#64748B">45 minutos &middot; Google Meet</p>
    </div>` : "";

  return `<div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#ffffff">
  <div style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 50%,#0F172A 100%);padding:32px 24px;border-radius:8px 8px 0 0;text-align:center">
    <p style="margin:0 0 6px;font-size:11px;color:#64748B;letter-spacing:2px;text-transform:uppercase">IM3 SYSTEMS</p>
    <h1 style="color:#fff;font-size:24px;margin:0 0 6px;font-weight:700">Primeras observaciones</h1>
    <p style="color:#94A3B8;font-size:14px;margin:0 0 16px">sobre lo que nos compartiste</p>
    <div style="display:inline-block;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:20px;padding:6px 18px">
      <span style="color:#60A5FA;font-size:12px;font-weight:600;letter-spacing:0.5px">REVISION INICIAL &middot; ${empresa.toUpperCase()}</span>
    </div>
  </div>

  <div style="padding:28px 24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;line-height:1.6"><strong>${nombre}</strong>, le dimos una primera mirada a lo que nos compartiste sobre <strong>${empresa}</strong>. Hay algunas areas que nos llamaron la atencion y que creemos que vale la pena explorar juntos en la sesion:</p>

    ${insightCards}

    <div style="background:linear-gradient(135deg,#F8FAFC,#F1F5F9);border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:24px 0 0">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
        <td style="width:28px;height:28px;background:#DBEAFE;border-radius:6px;text-align:center;font-size:14px;vertical-align:middle">&#128640;</td>
        <td style="padding-left:10px;font-size:14px;font-weight:700;color:#1E293B">Resumen de tu diagnostico</td>
      </tr></table>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B">Sector</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1E293B;text-align:right">${industria}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B">Areas para revisar</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1E293B;text-align:right">3 identificadas</td>
        </tr>
        ${areaPrioridad.length > 0 ? `<tr>
          <td style="padding:6px 0;font-size:13px;color:#64748B;vertical-align:top">Tus prioridades</td>
          <td style="padding:6px 0;text-align:right">${priorityTags}</td>
        </tr>` : ""}
      </table>
    </div>

    ${calendarInfo}
    ${meetSection}

    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 20px;margin:24px 0 0">
      <p style="margin:0;font-size:14px;color:#475569;line-height:1.6">Esto es una primera lectura — en la sesion vamos a entrar en detalle, revisar tus procesos y ver que tiene sentido para <strong>${empresa}</strong>. Puede que encontremos mas cosas, o que algunas de estas no apliquen tanto. Para eso es la sesion.</p>
    </div>

    <p style="margin:20px 0 0;color:#64748B;font-size:13px">Si tienes preguntas antes de la sesion, responde a este correo. Estamos para ayudarte.</p>

    <p style="margin:16px 0 0;color:#999;font-size:14px">— Equipo IM3 Systems</p>
  </div>

  <div style="max-width:600px;margin:8px auto 0;text-align:center;padding:12px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
    <p style="margin:0 0 4px;font-size:13px;color:#475569">¿Necesitas cambiar la fecha?</p>
    <p style="margin:0"><a href="${baseUrl}/api/reschedule/test" style="color:#3B82F6;font-size:13px;text-decoration:none;font-weight:600">Reagendar</a> <span style="color:#CBD5E1;margin:0 8px">&middot;</span> <a href="${baseUrl}/api/cancel/test" style="color:#94A3B8;font-size:13px;text-decoration:none">Cancelar reunion</a></p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <a href="${baseUrl}/api/unsubscribe/test" style="color:#999;font-size:11px;text-decoration:none">No recibir mas emails de esta secuencia</a>
  </div>
</div>`;
}

async function main() {
  console.log("Generating mini-audit with AI...");

  const testDiagnostic = {
    participante: "Mateo",
    empresa: "TechnoLogistics S.A.S.",
    industria: "Logística y transporte",
    empleados: "50-100",
    areaPrioridad: ["Automatización de procesos", "CRM e integración", "Análisis de datos"],
    objetivos: ["Reducir tiempos operativos", "Mejorar seguimiento de clientes", "Automatizar reportes"],
    herramientas: "Excel, WhatsApp Business, Siigo, Google Workspace",
    fechaCita: "Miércoles 19 de marzo, 2026",
    horaCita: "10:00 AM",
    meetLink: "https://meet.google.com/abc-defg-hij",
  };

  // Generate insights with AI (under-promise tone)
  const insightsResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: `Eres un consultor senior de tecnologia e IA de IM3 Systems. Haces observaciones iniciales — areas que vale la pena explorar, no promesas. Responde UNICAMENTE con un JSON array valido. Sin texto antes ni despues. Sin bloques de codigo markdown. Solo el JSON.

Formato:
[
  {"title": "titulo (3-5 palabras)", "description": "2-3 oraciones describiendo el area observada. Tono consultivo y moderado — no prometas resultados grandes. Max 50 palabras.", "stat": "dato de referencia con fuente real (McKinsey, Gartner, Forrester, Deloitte)"},
  {"title": "...", "description": "...", "stat": "..."},
  {"title": "...", "description": "...", "stat": "..."}
]

Cada observacion debe ser DIFERENTE (automatizacion, datos/IA, integracion). Usa frases como "podria valer la pena explorar", "hay señales de que". Usa los datos reales del diagnostico.`,
    messages: [{
      role: "user",
      content: `Genera 3 observaciones iniciales para: empresa=${testDiagnostic.empresa}, industria=${testDiagnostic.industria}, herramientas=${testDiagnostic.herramientas}, objetivos=${testDiagnostic.objetivos.join(", ")}, areas=${testDiagnostic.areaPrioridad.join(", ")}, empleados=${testDiagnostic.empleados}`,
    }],
  });

  const insightsText = insightsResponse.content?.[0]?.type === "text"
    ? insightsResponse.content[0].text.trim()
    : "[]";

  let insights;
  try {
    const cleaned = insightsText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    insights = JSON.parse(cleaned);
    console.log("AI insights generated:", insights.map((i: any) => i.title));
  } catch {
    console.log("AI returned invalid JSON, using fallback insights");
    insights = [
      { title: "Procesos que se repiten", description: "Notamos que en logística y transporte hay tareas de asignación y seguimiento que probablemente se están haciendo de forma manual. Vale la pena revisar cuáles tienen más impacto.", stat: "McKinsey: 45% de actividades en logística son automatizables" },
      { title: "Herramientas desconectadas", description: "Parece que TechnoLogistics usa Siigo, Excel y Google Workspace sin conexión entre sí. Conectarlas podría reducir trabajo duplicado, aunque habría que ver caso por caso.", stat: "Forrester: empresas integradas reducen 30% el tiempo de reportes" },
      { title: "Datos sin aprovechar", description: "Con el historial de entregas y datos de Siigo, es posible que haya patrones útiles para anticipar demanda. Es un área que podría valer la pena explorar.", stat: "Gartner: 75% de empresas logísticas adoptarán IA operativa para 2026" },
    ];
  }

  // Build HTML
  const html = buildMiniAuditEmail(insights, testDiagnostic, "test-contact-id");

  // Generate subject with AI (moderate tone)
  const subjectResp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: "Genera SOLO el texto del subject. Sin comillas. Maximo 60 caracteres. Tono profesional y moderado.",
    messages: [{
      role: "user",
      content: `Subject para primeras observaciones del diagnostico de ${testDiagnostic.empresa} (${testDiagnostic.industria}). Tono consultivo, no vendedor. Estilo: "Primeras observaciones sobre ${testDiagnostic.empresa}"`,
    }],
  });
  const subject = subjectResp.content?.[0]?.type === "text"
    ? subjectResp.content[0].text.trim()
    : `Primeras observaciones sobre ${testDiagnostic.empresa}`;

  console.log(`Subject: ${subject}`);
  console.log("Sending to info@im3systems.com...");

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "IM3 Systems <info@im3systems.com>",
    to: "info@im3systems.com",
    subject: `[TEST] ${subject}`,
    html,
  });

  if (error) {
    console.error("Error sending:", error);
  } else {
    console.log("Email sent! ID:", data?.id);
    console.log("Check info@im3systems.com inbox");
  }
}

main().catch(err => { console.error(err); process.exit(1); });

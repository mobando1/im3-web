import Anthropic from "@anthropic-ai/sdk";
import { log } from "./index";
import type { EmailTemplate, Diagnostic } from "@shared/schema";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `Eres el equipo de IM3 Systems, una empresa de tecnología especializada en inteligencia artificial, automatización y desarrollo de software para empresas.

Tu tarea es generar emails profesionales y personalizados para clientes que agendaron una sesión de diagnóstico tecnológico.

Reglas:
- Tono: profesional pero cercano, no corporativo genérico
- Idioma: español latinoamericano
- Largo: conciso, máximo 200 palabras el body
- No uses emojis excesivos (máximo 1-2 si es necesario)
- Personaliza usando los datos reales del cliente
- No inventes datos que no tengas
- El email debe ser HTML con estilos inline simples (sin CSS externo)
- Usa una estructura limpia: saludo, contenido principal, cierre
- Firma: "Equipo IM3 Systems"
- Color primario de la marca: #2B7A78 (teal)`;

function buildContext(data: Diagnostic): string {
  return `DATOS DEL CLIENTE:
- Empresa: ${data.empresa}
- Industria: ${data.industria}
- Años de operación: ${data.anosOperacion}
- Empleados: ${data.empleados}
- Ciudades: ${data.ciudades}
- Participante: ${data.participante}
- Fecha de cita: ${data.fechaCita}
- Hora de cita: ${data.horaCita}
- Objetivos: ${Array.isArray(data.objetivos) ? data.objetivos.join(", ") : data.objetivos}
- Resultado esperado: ${data.resultadoEsperado}
- Productos/Servicios: ${data.productos}
- Volumen mensual: ${data.volumenMensual}
- Herramientas actuales: ${data.herramientas}
- Nivel tecnológico: ${data.nivelTech}
- Usa IA: ${data.usaIA}
- Áreas prioritarias: ${Array.isArray(data.areaPrioridad) ? data.areaPrioridad.join(", ") : data.areaPrioridad}
- Presupuesto: ${data.presupuesto}`;
}

export async function generateEmailContent(
  template: EmailTemplate,
  diagnosticData: Diagnostic
): Promise<{ subject: string; body: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const context = buildContext(diagnosticData);

  // Generate subject
  const subjectResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: "Genera SOLO el texto del subject de un email. Sin comillas, sin prefijo, solo el texto. Máximo 60 caracteres.",
    messages: [
      {
        role: "user",
        content: `${template.subjectPrompt}\n\n${context}`,
      },
    ],
  });

  const subject =
    subjectResponse.content[0].type === "text"
      ? subjectResponse.content[0].text.trim()
      : "Diagnóstico IM3 Systems";

  // Generate body
  const bodyResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${template.bodyPrompt}\n\n${context}\n\nGenera el email completo en HTML con estilos inline. Incluye un wrapper con max-width: 600px, font-family: sans-serif.`,
      },
    ],
  });

  const body =
    bodyResponse.content[0].type === "text"
      ? bodyResponse.content[0].text.trim()
      : "<p>Error generando contenido</p>";

  log(`Email AI generado: "${subject}" para ${diagnosticData.empresa}`);

  return { subject, body };
}

import express, { type Express } from "express";
import fs from "fs";
import path from "path";

const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp',
  'gptbot', 'chatgpt-user', 'claudebot', 'anthropic-ai',
  'perplexitybot', 'bytespider', 'ccbot', 'applebot',
  'youbot', 'google-extended', 'facebookexternalhit',
  'twitterbot', 'linkedinbot', 'whatsapp', 'telegrambot',
  'ia_archiver', 'semrushbot', 'ahrefsbot',
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

/**
 * Static HTML content injected for crawlers that don't execute JavaScript.
 * This ensures AI search engines and traditional crawlers can index the page content.
 */
function getCrawlerContent(): string {
  return `
    <main>
      <article>
        <h1>IM3 Systems — Desarrollo de software con inteligencia artificial para empresas</h1>
        <p>Desarrollamos software a medida con inteligencia artificial para PYMEs en Latinoamérica y España. Chatbots de WhatsApp con IA, automatización inteligente de procesos, dashboards con IA y aplicaciones internas. Diagnóstico gratuito.</p>

        <section>
          <h2>Qué construimos</h2>

          <h3>Aplicaciones internas con inteligencia artificial</h3>
          <p>Herramientas de software a medida para control operativo: dashboards inteligentes con IA, reportes automatizados, checklists digitales, registros y flujos de trabajo internos. Reemplazan hojas de cálculo, WhatsApp y procesos manuales con software diseñado para tu operación.</p>

          <h3>Automatización de procesos empresariales con IA</h3>
          <p>Conectamos tus apps y datos para eliminar tareas repetitivas y reducir errores. Integramos CRMs, POS, Google Sheets, ERPs y cualquier herramienta que tu negocio ya utilice. Creamos flujos automáticos inteligentes que ahorran horas de trabajo diario.</p>

          <h3>Chatbots de WhatsApp y asistentes de IA</h3>
          <p>Chatbots de ventas y atención al cliente en WhatsApp potenciados por inteligencia artificial. Asistentes internos para equipos. Dashboards con IA que sugieren acciones. Clasificación automática de datos, predicciones operativas y análisis de patrones.</p>
        </section>

        <section>
          <h2>Cómo trabajamos</h2>
          <ol>
            <li><strong>Diagnóstico estratégico gratuito</strong> — Analizamos tu operación, detectamos oportunidades de automatización e IA, y definimos el sistema que realmente necesitas. Sin costo y sin compromiso.</li>
            <li><strong>Desarrollo de la solución con IA</strong> — Diseñamos y construimos el sistema a medida con inteligencia artificial: interfaces, automatizaciones, integraciones y flujos adaptados a tu operación.</li>
            <li><strong>Implementación en producción</strong> — Integramos el sistema en tu operación real, migramos datos, conectamos herramientas existentes y validamos que todo funcione.</li>
            <li><strong>Entrega y acompañamiento</strong> — Documentamos todo, entrenamos a tu equipo, y acompañamos las primeras semanas para una adopción sin fricciones.</li>
          </ol>
        </section>

        <section>
          <h2>Para quién trabajamos</h2>
          <ul>
            <li>Empresas que necesitan software a medida con inteligencia artificial para ordenar su operación</li>
            <li>Negocios que quieren automatizar procesos repetitivos usando IA</li>
            <li>PYMEs que buscan chatbots de WhatsApp, asistentes de IA o dashboards inteligentes</li>
            <li>Empresas con operaciones complejas que necesitan control, trazabilidad y automatización</li>
          </ul>
        </section>

        <section>
          <h2>Resultados</h2>
          <ul>
            <li>12+ sistemas construidos con IA integrada</li>
            <li>6 industrias atendidas: retail, logística, educación, manufactura, servicios, alimentos</li>
            <li>100% de diagnósticos continúan a implementación</li>
            <li>MVP funcional en 4 a 8 semanas</li>
          </ul>
        </section>

        <section>
          <h2>Testimonios</h2>

          <blockquote>
            <p>"Nos automatizaron todo el agendamiento de clases, cronogramas y la página web. Lo que antes nos tomaba horas de coordinación manual ahora funciona solo."</p>
            <cite>— Sebastián Garzón, Fundador, Passport2Fluency</cite>
          </blockquote>

          <blockquote>
            <p>"Nos construyeron la página web y un chatbot de ventas y atención al cliente en WhatsApp. Los resultados fueron asombrosos — cerramos más ventas y nuestros clientes reciben respuesta inmediata, 24/7."</p>
            <cite>— Nicolás Hernández, Fundador y CEO, Xtremcol</cite>
          </blockquote>

          <blockquote>
            <p>"Diseñaron una app de contratación y preselección de personal que nos ahorra horas. Antes revisábamos 200 hojas de vida a mano — ahora el sistema filtra, clasifica y nos muestra solo los perfiles que encajan."</p>
            <cite>— Andrés Villamizar, Gerente de Operaciones, La Glorieta</cite>
          </blockquote>

          <blockquote>
            <p>"El sistema de seguimiento de talento humano nos cambió la gestión. Ahora tenemos visibilidad real del desempeño de cada trabajador, evaluaciones automatizadas y alertas antes de que un problema escale."</p>
            <cite>— Camila Restrepo, Directora RRHH, Grupo Santamaría</cite>
          </blockquote>

          <blockquote>
            <p>"Nos armaron un sistema de procesos y checklists operativos. Cada turno se ejecuta igual, con trazabilidad completa. Las auditorías que antes tomaban días ahora se resuelven con un click."</p>
            <cite>— Diego Morales, Director de Calidad, FreshBox</cite>
          </blockquote>

          <blockquote>
            <p>"La app de ventas e inventario nos dio control total. Sabemos en tiempo real qué se vende, qué hay en stock y cuándo reponer."</p>
            <cite>— Valentina Ospina, Administradora, Salomé Momentos</cite>
          </blockquote>
        </section>

        <section>
          <h2>Modelos de trabajo</h2>

          <h3>Implementación completa (Done For You)</h3>
          <p>Nos encargamos de todo: diagnóstico, diseño, desarrollo con IA y entrega del sistema funcionando. Tu equipo solo se preocupa de usarlo. Ideal para empresas que buscan velocidad y garantía de ejecución.</p>

          <h3>Acompañamiento estratégico (Consultoría + Diseño)</h3>
          <p>Diseñamos la arquitectura incluyendo componentes de IA y guiamos a tu equipo técnico para que construyan con nuestra supervisión de calidad.</p>
        </section>

        <section id="faq">
          <h2>Preguntas frecuentes</h2>

          <h3>¿IM3 Systems usa inteligencia artificial en sus proyectos?</h3>
          <p>Sí. Aplicamos IA donde tiene sentido práctico: chatbots de ventas y atención en WhatsApp, clasificación automática de datos, predicciones operativas, asistentes internos, análisis de patrones, procesamiento de lenguaje natural, y dashboards inteligentes que sugieren acciones.</p>

          <h3>¿Pueden construir un chatbot con IA para WhatsApp?</h3>
          <p>Sí. Construimos chatbots de ventas y atención al cliente en WhatsApp potenciados por inteligencia artificial. Responden consultas, califican leads, procesan pedidos y cierran ventas 24/7.</p>

          <h3>¿Pueden automatizar procesos de mi empresa con inteligencia artificial?</h3>
          <p>Sí. Automatizamos procesos combinando integraciones técnicas con IA. Conectamos CRMs, POS, ERPs y herramientas existentes. La IA decide, prioriza y ejecuta acciones automáticas basadas en el contexto del negocio.</p>

          <h3>¿Cuánto toma una implementación típica?</h3>
          <p>Un MVP funcional suele estar listo en 4 a 8 semanas. Empezamos con lo que más impacta la operación y vamos iterando con entregas semanales.</p>

          <h3>¿Qué pasa si mi equipo no es técnico?</h3>
          <p>No necesitas equipo técnico. Diseñamos todo para que sea fácil de usar. Entregamos documentación y capacitación para que tu equipo opere sin depender de nosotros.</p>

          <h3>¿El diagnóstico tiene algún costo?</h3>
          <p>No. El diagnóstico es 100% gratuito y sin compromiso. Si podemos ayudar, presentamos opciones. Si no, damos una recomendación honesta.</p>

          <h3>¿Cuánto cuesta desarrollar software con inteligencia artificial?</h3>
          <p>Cada proyecto es diferente. El diagnóstico inicial es gratuito y al final entregamos una propuesta clara con alcance, tiempos y costos definidos. Sin sorpresas.</p>

          <h3>¿Qué tipo de empresas atiende IM3 Systems?</h3>
          <p>PYMEs en Latinoamérica y España que necesitan software a medida, automatización de procesos o inteligencia artificial aplicada a su operación. Industrias: retail, logística, servicios, educación, alimentos, manufactura.</p>

          <h3>¿En qué países trabaja IM3 Systems?</h3>
          <p>Operamos en Colombia y toda Latinoamérica, así como en España. El servicio es completamente remoto.</p>
        </section>

        <section>
          <h2>Contacto</h2>
          <p>Email: info@im3systems.com</p>
          <p><a href="https://www.im3systems.com/booking">Solicitar diagnóstico gratuito</a></p>
          <p><a href="https://www.linkedin.com/company/im3-systems">LinkedIn</a></p>
        </section>
      </article>
    </main>
  `;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const userAgent = req.headers['user-agent'] || '';

    // For bots/crawlers: inject static HTML content so they can index the page
    if (isBot(userAgent) && (req.path === '/' || req.path === '/booking')) {
      let html = fs.readFileSync(indexPath, 'utf-8');
      // Inject crawlable content inside the root div
      html = html.replace(
        '<div id="root"></div>',
        `<div id="root">${getCrawlerContent()}</div>`
      );
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      return;
    }

    res.sendFile(indexPath);
  });
}

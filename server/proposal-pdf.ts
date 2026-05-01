import puppeteer, { type Browser } from "puppeteer";

let cachedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) return cachedBrowser;
  console.log("[proposal-pdf] Launching browser...", {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "(auto)",
  });
  cachedBrowser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-zygote",
      "--single-process",
    ],
  });
  console.log("[proposal-pdf] Browser launched.");
  return cachedBrowser;
}

/** Test rápido: ¿podemos lanzar Chrome y abrir una página vacía? */
export async function pdfHealthCheck(): Promise<{ ok: boolean; detail: string }> {
  try {
    const b = await getBrowser();
    const p = await b.newPage();
    await p.goto("about:blank", { timeout: 10000 });
    await p.close();
    return { ok: true, detail: "browser launched + about:blank loaded" };
  } catch (err: any) {
    return { ok: false, detail: err?.message || String(err) };
  }
}

/**
 * Renderiza una propuesta como PDF idéntico al render web (dark bg, gradientes,
 * web fonts incluidos). Usa `emulateMediaType('screen')` para evitar las
 * transformaciones de @media print que aclaran los fondos.
 */
export async function generateProposalPdf(opts: {
  token: string;
  baseUrl?: string;
}): Promise<Buffer> {
  const port = process.env.PORT || "3000";
  // En producción puede ser que 127.0.0.1 no responda al mismo puerto que se ve afuera;
  // si BASE_URL_INTERNAL está seteado, usalo. Fallback: localhost del propio container.
  const internal = process.env.BASE_URL_INTERNAL || `http://127.0.0.1:${port}`;
  const baseUrl = opts.baseUrl || internal;

  console.log("[proposal-pdf] Generating PDF", { token: opts.token.slice(0, 8), baseUrl });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1 });
    await page.emulateMediaType("screen");

    const url = `${baseUrl}/proposal/${encodeURIComponent(opts.token)}?pdf=1`;
    console.log("[proposal-pdf] navigating:", url);
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    // Esperamos un poquito que la SPA cargue + reveal animations terminen
    await page.waitForFunction(
      () => document.querySelector(".proposal-template") !== null,
      { timeout: 15000 },
    ).catch(() => console.warn("[proposal-pdf] proposal-template no apareció, continuando"));
    await page.evaluate(() => (document as any).fonts?.ready);
    await new Promise((r) => setTimeout(r, 1200));

    console.log("[proposal-pdf] generating pdf...");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: false,
    });
    console.log("[proposal-pdf] PDF generated, size:", pdf.length);
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Cleanup utility (cierra el Chrome cacheado) */
export async function closeProposalPdfBrowser() {
  if (cachedBrowser) {
    await cachedBrowser.close().catch(() => {});
    cachedBrowser = null;
  }
}

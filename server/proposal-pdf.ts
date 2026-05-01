import puppeteer, { type Browser } from "puppeteer";

let cachedBrowser: Browser | null = null;

/**
 * Lanza Chrome headless. Cacheamos la instancia a nivel de módulo para evitar
 * el costo de arranque (~1-2s) en cada PDF generado.
 *
 * En producción (Railway), nixpacks.toml instala chromium del sistema y setea
 * PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium. Puppeteer lo respeta
 * automáticamente. En dev local, usa el Chromium que descargó npm install.
 */
async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) return cachedBrowser;
  cachedBrowser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return cachedBrowser;
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
  const internal = `http://127.0.0.1:${port}`;
  const baseUrl = opts.baseUrl || internal;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
    await page.emulateMediaType("screen");

    const url = `${baseUrl}/proposal/${encodeURIComponent(opts.token)}?pdf=1`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

    // Web fonts antes de imprimir
    await page.evaluate(() => (document as any).fonts?.ready);
    // Margen para animaciones / counters
    await new Promise((r) => setTimeout(r, 1500));

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: false,
    });
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

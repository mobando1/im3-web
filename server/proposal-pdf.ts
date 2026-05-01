import puppeteer, { type Browser } from "puppeteer-core";

let cachedBrowser: Browser | null = null;

/**
 * Resuelve el path de Chromium en este orden:
 * 1. PUPPETEER_EXECUTABLE_PATH explícito (si lo seteás en .env / hosting).
 * 2. @sparticuz/chromium (binario auto-contenido, ideal serverless/Docker).
 * 3. Chrome del sistema en macOS / Linux (fallback dev).
 *
 * Esto permite que el mismo código corra en dev local y en producción
 * sin tener que instalar libs de sistema (libnss3, libxss1, etc).
 */
async function resolveLaunchOptions(): Promise<{
  executablePath: string;
  args: string[];
  headless: boolean;
}> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    };
  }

  // En production-like (linux container, serverless): usar @sparticuz/chromium
  if (process.env.NODE_ENV === "production" || process.platform === "linux") {
    try {
      const chromium = (await import("@sparticuz/chromium")).default;
      return {
        executablePath: await chromium.executablePath(),
        args: chromium.args,
        headless: true,
      };
    } catch (e) {
      console.warn("[proposal-pdf] @sparticuz/chromium falló, intentando Chrome del sistema:", (e as Error).message);
    }
  }

  // Fallback dev: Chrome instalado en el sistema
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const fs = await import("fs");
  const found = candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
  if (!found) {
    throw new Error(
      "No se encontró Chromium. Instalá @sparticuz/chromium o setea PUPPETEER_EXECUTABLE_PATH.",
    );
  }
  return {
    executablePath: found,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  };
}

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) return cachedBrowser;
  const opts = await resolveLaunchOptions();
  cachedBrowser = await puppeteer.launch(opts);
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

    // Esperamos a las web fonts antes de imprimir
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

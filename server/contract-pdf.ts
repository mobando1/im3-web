import { getBrowser } from "./proposal-pdf";

/**
 * Renderiza el contrato como PDF. Navega a /admin/contracts/:id/preview?pdf=1 (página
 * interna sin chrome admin) y captura el render.
 *
 * NOTA: requiere que la página interna `proposal-brief-template` ya esté autenticada
 * o que el cookie de sesión esté disponible para puppeteer. Para evitar autenticación,
 * el preview se sirve también vía un endpoint público con accessToken (similar a
 * /api/proposal/:token), pero por MVP usamos la ruta admin y puppeteer asume sesión
 * activa del lado del server (puppeteer corre en el mismo host).
 *
 * Implementación MVP: usamos token público temporal — el endpoint admin del PDF
 * llama a este generador pasando el contractId, y el preview se sirve via accessToken
 * embebido en la URL (no requiere auth de sesión).
 */
export async function generateContractPdf(opts: {
  contractId: string;
  baseUrl?: string;
}): Promise<Buffer> {
  const port = process.env.PORT || "3000";
  const internal = process.env.BASE_URL_INTERNAL || `http://127.0.0.1:${port}`;
  const baseUrl = opts.baseUrl || internal;

  // Cargar contract para obtener accessToken (la ruta de preview público usa el token)
  const { db } = await import("./db");
  const { contracts } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  if (!db) throw new Error("DB no disponible");
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, opts.contractId)).limit(1);
  if (!contract) throw new Error("Contrato no encontrado");

  console.log("[contract-pdf] Generating PDF", { contractId: opts.contractId.slice(0, 8), baseUrl });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1 });
    await page.emulateMediaType("screen");
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    );

    // Usamos la ruta pública por token (sin auth) para que puppeteer pueda renderizar sin sesión
    const url = `${baseUrl}/contract-preview/${encodeURIComponent(contract.accessToken)}?pdf=1`;
    console.log("[contract-pdf] navigating:", url);
    await page.goto(url, { waitUntil: "load", timeout: 45000 });

    await page.waitForFunction(
      () => document.querySelector(".contract-preview-page") !== null,
      { timeout: 15000 },
    ).catch(() => console.warn("[contract-pdf] contract-preview-page no apareció, continuando"));
    await page.evaluate(() => (document as any).fonts?.ready);
    await new Promise((r) => setTimeout(r, 1000));

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
      preferCSSPageSize: false,
    });
    console.log("[contract-pdf] PDF generated, size:", pdf.length);
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

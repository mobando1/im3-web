// Validación de imágenes del CMS — sniff por "magic bytes" (no confiamos en el
// mimetype del cliente). Solo raster (jpeg/png/gif/webp); rechaza SVG (lleva
// <script>) y cualquier otra cosa. Puro y testeable.

import { createHash } from "crypto";

export type SniffResult = { ok: true; contentType: string } | { ok: false; reason: string };

export function sniffImageType(buf: Buffer): SniffResult {
  if (!buf || buf.length < 12) return { ok: false, reason: "Archivo demasiado pequeño o vacío" };

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ok: true, contentType: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { ok: true, contentType: "image/png" };
  }
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { ok: true, contentType: "image/gif" };
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { ok: true, contentType: "image/webp" };
  }

  return { ok: false, reason: "Formato no permitido. Solo JPG, PNG, GIF o WEBP (no SVG)." };
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export const CMS_MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5MB

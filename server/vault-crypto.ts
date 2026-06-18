import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ───────────────────────────────────────────────────────────────
// Cifrado de la Bóveda (Vault) — AES-256-GCM.
// Módulo PURO y testeable: sin dependencias de `db`/`express`. Solo lee
// la llave maestra de `process.env.VAULT_MASTER_KEY` (nunca de la DB).
//
// El secreto de cada item se cifra como un único blob auto-descriptivo
// versionado para permitir rotación futura de llave:
//
//     v1.<iv_b64>.<tag_b64>.<ciphertext_b64>
//
// - iv  = nonce aleatorio de 12 bytes (tamaño recomendado para GCM).
// - tag = auth tag de 16 bytes (integridad/autenticación), leído tras final().
// - base64 estándar nunca contiene '.', así que es separador inequívoco.
//
// La llave NUNCA se loguea, persiste ni se devuelve en respuestas.
// ───────────────────────────────────────────────────────────────

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // nonce GCM recomendado
const KEY_BYTES = 32; // AES-256
const VERSION = "v1";

// Errores tipados para que las rutas distingan misconfig (503) de fallo de
// descifrado (422) sin filtrar detalles internos.
export class VaultConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultConfigError";
  }
}
export class VaultDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultDecryptError";
  }
}

// Cache module-scoped de la llave parseada. Se invalida si cambia el env
// (relevante para tests que setean/quitan VAULT_MASTER_KEY entre casos).
let cachedKey: Buffer | null = null;
let cachedFromRaw: string | null = null;

// Parsea y valida VAULT_MASTER_KEY. Lanza VaultConfigError si falta o es inválida.
function loadKey(): Buffer {
  const raw = process.env.VAULT_MASTER_KEY;
  if (!raw || !raw.trim()) {
    throw new VaultConfigError("VAULT_MASTER_KEY no está configurada");
  }
  const trimmed = raw.trim();
  if (cachedKey && cachedFromRaw === trimmed) return cachedKey;

  let decoded: Buffer;
  try {
    decoded = Buffer.from(trimmed, "base64");
  } catch {
    throw new VaultConfigError("VAULT_MASTER_KEY no es base64 válido");
  }
  if (decoded.length !== KEY_BYTES) {
    throw new VaultConfigError(
      `VAULT_MASTER_KEY debe ser base64 de exactamente ${KEY_BYTES} bytes (usa: openssl rand -base64 32)`,
    );
  }
  // Round-trip: detecta base64 truncado o con caracteres de relleno extraños
  // que Buffer.from acepta silenciosamente.
  if (decoded.toString("base64") !== trimmed) {
    throw new VaultConfigError("VAULT_MASTER_KEY no es un base64 canónico de 32 bytes");
  }

  cachedKey = decoded;
  cachedFromRaw = trimmed;
  return decoded;
}

// True si la bóveda está lista para cifrar/descifrar. NUNCA lanza: las rutas
// la usan para decidir si responder 503.
export function isVaultConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

// Cifra un texto plano y devuelve el blob versionado. Lanza VaultConfigError
// si la llave no está configurada.
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes; leer DESPUÉS de final()
  return `${VERSION}.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

// Descifra un blob versionado. Lanza VaultDecryptError en tamper / llave
// incorrecta / versión desconocida / formato corrupto, y VaultConfigError si
// no hay llave. El mensaje nunca incluye plaintext, llave ni el blob.
export function decryptSecret(blob: string): string {
  const key = loadKey();
  const parts = (blob || "").split(".");
  if (parts.length !== 4) {
    throw new VaultDecryptError("Blob de secreto malformado");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new VaultDecryptError(`Versión de blob no soportada: ${version}`);
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new VaultDecryptError("Blob de secreto malformado");
  }

  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    // GCM verifica el tag dentro de final(): llave incorrecta o byte alterado
    // caen aquí. No relanzamos el error nativo (mencionaría internos de crypto).
    throw new VaultDecryptError("No se pudo descifrar el secreto (clave incorrecta o dato corrupto)");
  }
}

// Nota de seguridad sobre el nonce: un IV aleatorio de 12 bytes es seguro para
// este uso. El límite de cumpleaños de GCM (~2^32 mensajes por llave antes de
// colisión no despreciable) está ~7 órdenes de magnitud sobre el uso real (un
// admin, miles de secretos, cifrados solo al crear/editar). Si algún día el
// volumen se acercara a millones de re-cifrados, migrar a nonce con contador.
//
// Rotación de llave (no implementado, ruta documentada): un script admin con
// old+new key que lea cada fila con secret_ciphertext, descifre con la vieja y
// re-cifre con la nueva. El prefijo de versión permite que un futuro 'v2'
// coexista con 'v1' durante una rotación gradual.

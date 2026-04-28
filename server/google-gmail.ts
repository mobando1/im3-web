import { google, gmail_v1 } from "googleapis";
import { db } from "./db";
import { gmailEmails, gmailSyncState, contacts, sentEmails, activityLog, contactEmails } from "@shared/schema";
import { eq, and, gte, lte, ilike } from "drizzle-orm";
import { log } from "./index";
import { classifyEmailRelevance } from "./agents/email-classifier";
import { runAgent } from "./agents/runner";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) return null;

  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
  });
}

export function isGmailConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_IMPERSONATE
  );
}

const IMPERSONATED_EMAIL = () => process.env.GOOGLE_DRIVE_IMPERSONATE || "info@im3systems.com";
const SYNC_LOOKBACK_DAYS = 90;
const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 1000; // 1s between batches to respect Gmail rate limits

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse email address from a "Name <email>" or plain "email" format.
 */
function parseEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/**
 * Extract header value from Gmail message headers.
 */
function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

/**
 * Recursively extract text/plain and text/html bodies from MIME payload.
 */
function extractBodies(payload: gmail_v1.Schema$MessagePart): { text: string; html: string } {
  let text = "";
  let html = "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = Buffer.from(payload.body.data, "base64url").toString("utf-8");
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    html = Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const sub = extractBodies(part);
      if (sub.text && !text) text = sub.text;
      if (sub.html && !html) html = sub.html;
    }
  }

  return { text, html };
}

/**
 * Check if a MIME payload has attachments.
 */
function hasAttachmentParts(payload: gmail_v1.Schema$MessagePart): boolean {
  if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
    return true;
  }
  if (payload.parts) {
    return payload.parts.some(p => hasAttachmentParts(p));
  }
  return false;
}

/**
 * Result of matching an email address to a CRM contact.
 */
type MatchResult = { contactId: string; matchMethod: "exact" | "associated" | "domain" } | null;

/**
 * Match an email address to a CRM contact.
 * Strategy: 1) exact match on contacts.email, 2) match on contact_emails table,
 * 3) domain fallback — only if exactly 1 contact shares the domain (no ambiguity).
 */
async function matchEmailToContact(emailAddress: string): Promise<MatchResult> {
  if (!db) return null;

  const normalized = emailAddress.toLowerCase().trim();

  // 1. Exact match on primary contact email
  const [directMatch] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, normalized))
    .limit(1);

  if (directMatch) return { contactId: directMatch.id, matchMethod: "exact" };

  // 2. Match on associated emails (contact_emails table)
  const [assocMatch] = await db
    .select({ contactId: contactEmails.contactId })
    .from(contactEmails)
    .where(eq(contactEmails.email, normalized))
    .limit(1);

  if (assocMatch) return { contactId: assocMatch.contactId, matchMethod: "associated" };

  // 3. Domain fallback — only match if exactly 1 contact has this domain (unambiguous)
  const domain = normalized.split("@")[1];
  if (domain && !isGenericDomain(domain)) {
    const domainMatches = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(ilike(contacts.email, `%@${domain}`))
      .limit(2); // fetch up to 2 to detect ambiguity

    if (domainMatches.length === 1) {
      return { contactId: domainMatches[0].id, matchMethod: "domain" };
    }
    // If multiple contacts share the domain, don't auto-match (ambiguous)
  }

  return null;
}

/**
 * Check if a domain is generic (gmail, hotmail, etc.) to avoid false matches.
 */
function isGenericDomain(domain: string): boolean {
  const generic = [
    "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com",
    "yahoo.com", "yahoo.es", "icloud.com", "me.com", "mac.com",
    "aol.com", "protonmail.com", "proton.me", "mail.com",
    "msn.com", "ymail.com", "gmx.com", "zoho.com",
  ];
  return generic.includes(domain.toLowerCase());
}

/**
 * Check if a Gmail outbound email is a duplicate of a Resend-sent email.
 */
async function isDuplicateOfSentEmail(
  subject: string | null,
  contactId: string | null,
  gmailDate: Date
): Promise<boolean> {
  if (!db || !contactId || !subject) return false;

  const fiveMinBefore = new Date(gmailDate.getTime() - 5 * 60 * 1000);
  const fiveMinAfter = new Date(gmailDate.getTime() + 5 * 60 * 1000);

  const [existing] = await db
    .select({ id: sentEmails.id })
    .from(sentEmails)
    .where(
      and(
        eq(sentEmails.contactId, contactId),
        eq(sentEmails.subject, subject),
        gte(sentEmails.sentAt, fiveMinBefore),
        lte(sentEmails.sentAt, fiveMinAfter)
      )
    )
    .limit(1);

  return !!existing;
}

/**
 * Fetch and parse a single Gmail message.
 */
type StoreResult = {
  stored: boolean;
  contactId: string | null;
  matchMethod: "exact" | "associated" | "domain" | null;
  gmailEmailId: string | null;
  subject: string | null;
  bodyText: string | null;
  fromEmail: string | null;
  toEmails: string[];
};

async function fetchAndStoreMessage(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<StoreResult> {
  const empty: StoreResult = { stored: false, contactId: null, matchMethod: null, gmailEmailId: null, subject: null, bodyText: null, fromEmail: null, toEmails: [] };
  if (!db) return empty;

  // Check if already synced
  const [existing] = await db
    .select({ id: gmailEmails.id })
    .from(gmailEmails)
    .where(eq(gmailEmails.gmailMessageId, messageId))
    .limit(1);

  if (existing) return empty;

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const msg = res.data;
  if (!msg.payload?.headers) return empty;

  const headers = msg.payload.headers;
  const fromRaw = getHeader(headers, "From");
  const toRaw = getHeader(headers, "To");
  const subject = getHeader(headers, "Subject");
  const dateStr = getHeader(headers, "Date");

  const fromEmail = parseEmailAddress(fromRaw);
  const toEmails = toRaw.split(",").map(e => parseEmailAddress(e)).filter(Boolean);
  const impersonated = IMPERSONATED_EMAIL().toLowerCase();

  const direction = fromEmail === impersonated ? "outbound" : "inbound";
  const gmailDate = dateStr ? new Date(dateStr) : new Date(Number(msg.internalDate));

  // Match to contact
  let contactId: string | null = null;
  let matchMethod: "exact" | "associated" | "domain" | null = null;
  if (direction === "outbound") {
    // Match against recipients
    for (const to of toEmails) {
      const match = await matchEmailToContact(to);
      if (match) {
        contactId = match.contactId;
        matchMethod = match.matchMethod;
        break;
      }
    }
  } else {
    // Match against sender
    const match = await matchEmailToContact(fromEmail);
    if (match) {
      contactId = match.contactId;
      matchMethod = match.matchMethod;
    }
  }

  // Check for duplicates with Resend-sent emails
  if (direction === "outbound" && contactId) {
    const isDup = await isDuplicateOfSentEmail(subject, contactId, gmailDate);
    if (isDup) return empty;
  }

  // Extract bodies
  const { text, html } = extractBodies(msg.payload);
  const hasAttach = hasAttachmentParts(msg.payload);

  const [inserted] = await db.insert(gmailEmails).values({
    gmailMessageId: messageId,
    gmailThreadId: msg.threadId || null,
    contactId,
    direction,
    fromEmail,
    toEmails,
    subject: subject || null,
    bodyText: text || null,
    bodyHtml: html || null,
    snippet: msg.snippet || null,
    labelIds: msg.labelIds || [],
    hasAttachments: hasAttach,
    gmailDate,
    matchMethod,
  }).returning({ id: gmailEmails.id });

  // Log activity for matched contacts
  if (contactId) {
    try {
      const actType = direction === "inbound" ? "gmail_received" : "gmail_sent";
      const actDesc = `Email ${direction === "inbound" ? "recibido" : "enviado"}: "${(subject || "Sin asunto").substring(0, 80)}"`;
      await db.insert(activityLog).values({
        contactId,
        type: actType,
        description: actDesc,
        metadata: { gmailEmailId: inserted.id, gmailMessageId: messageId },
      });
      await db.update(contacts).set({ lastActivityAt: new Date() }).where(eq(contacts.id, contactId));
    } catch (err: unknown) {
      log(`[Gmail Sync] Error logging activity: ${(err as Error).message}`);
    }
  }

  return { stored: true, contactId, matchMethod, gmailEmailId: inserted.id, subject: subject || null, bodyText: text || null, fromEmail, toEmails };
}

/**
 * Re-match orphaned emails (contactId is null) against current contacts.
 * Runs after each sync to pick up emails that arrived before the contact was created.
 * Skips emails that were manually unlinked (by admin or by the classifier).
 */
async function rematchOrphanedEmails(): Promise<number> {
  if (!db) return 0;

  const { sql } = await import("drizzle-orm");
  const orphans = await db
    .select({
      id: gmailEmails.id,
      fromEmail: gmailEmails.fromEmail,
      toEmails: gmailEmails.toEmails,
      direction: gmailEmails.direction,
      subject: gmailEmails.subject,
      bodyText: gmailEmails.bodyText,
    })
    .from(gmailEmails)
    .where(sql`${gmailEmails.contactId} IS NULL AND ${gmailEmails.manuallyUnlinked} = false`)
    .limit(200);

  let matched = 0;

  for (const orphan of orphans) {
    let matchResult: MatchResult = null;

    if (orphan.direction === "outbound") {
      const tos = (orphan.toEmails as string[]) || [];
      for (const to of tos) {
        matchResult = await matchEmailToContact(to);
        if (matchResult) break;
      }
    } else {
      matchResult = await matchEmailToContact(orphan.fromEmail);
    }

    if (matchResult) {
      await db.update(gmailEmails).set({
        contactId: matchResult.contactId,
        matchMethod: matchResult.matchMethod,
      }).where(eq(gmailEmails.id, orphan.id));
      matched++;

      // Queue for classification if non-exact match
      if (matchResult.matchMethod !== "exact") {
        pendingRematchClassification.push({
          gmailEmailId: orphan.id,
          contactId: matchResult.contactId,
          subject: orphan.subject,
          bodyText: orphan.bodyText,
          fromEmail: orphan.fromEmail,
          toEmails: (orphan.toEmails as string[]) || [],
          matchMethod: matchResult.matchMethod as "associated" | "domain",
        });
      }
    }
  }

  if (matched > 0) {
    log(`[Gmail Sync] Re-matched ${matched} orphaned emails to contacts`);
  }

  return matched;
}

// Temporary storage for rematch emails that need classification
let pendingRematchClassification: Array<{
  gmailEmailId: string;
  contactId: string;
  subject: string | null;
  bodyText: string | null;
  fromEmail: string;
  toEmails: string[];
  matchMethod: "associated" | "domain";
}> = [];

/**
 * Run AI classification on a batch of newly synced emails that were matched
 * via non-exact methods (associated, domain). Auto-unlinks irrelevant emails.
 */
async function classifyNewEmails(
  emailsToClassify: Array<{
    gmailEmailId: string;
    contactId: string;
    subject: string | null;
    bodyText: string | null;
    fromEmail: string;
    toEmails: string[];
    matchMethod: "associated" | "domain";
  }>
): Promise<{ classified: number; unlinked: number }> {
  if (emailsToClassify.length === 0) return { classified: 0, unlinked: 0 };

  let classified = 0;
  let unlinked = 0;

  for (const email of emailsToClassify) {
    try {
      const result = await classifyEmailRelevance(email);
      classified++;
      if (!result.kept) unlinked++;
    } catch (err) {
      log(`[email-classifier] Error classifying email ${email.gmailEmailId}: ${(err as Error).message}`);
    }
  }

  if (classified > 0) {
    log(`[email-classifier] Classified ${classified} emails, unlinked ${unlinked}`);
  }

  return { classified, unlinked };
}

/**
 * Main sync orchestrator. Handles both full and incremental sync.
 */
export async function syncGmailEmails(): Promise<{ newMessages: number; errors: number }> {
  if (!db || !isGmailConfigured()) {
    return { newMessages: 0, errors: 0 };
  }

  const auth = getAuth();
  if (!auth) return { newMessages: 0, errors: 0 };

  const gmail = google.gmail({ version: "v1", auth });
  const mailbox = IMPERSONATED_EMAIL();

  let newMessages = 0;
  let errors = 0;
  const pendingClassification: Array<{
    gmailEmailId: string;
    contactId: string;
    subject: string | null;
    bodyText: string | null;
    fromEmail: string;
    toEmails: string[];
    matchMethod: "associated" | "domain";
  }> = [];

  try {
    // Get current sync state
    const [state] = await db
      .select()
      .from(gmailSyncState)
      .where(eq(gmailSyncState.email, mailbox))
      .limit(1);

    let useIncremental = false;
    let historyId = state?.lastHistoryId;

    if (historyId) {
      // Try incremental sync
      try {
        const historyRes = await gmail.users.history.list({
          userId: "me",
          startHistoryId: historyId,
          historyTypes: ["messageAdded"],
          maxResults: 500,
        });

        const histories = historyRes.data.history || [];
        const messageIds = new Set<string>();

        for (const h of histories) {
          if (h.messagesAdded) {
            for (const added of h.messagesAdded) {
              if (added.message?.id) {
                messageIds.add(added.message.id);
              }
            }
          }
        }

        log(`[Gmail Sync] Incremental: ${messageIds.size} new messages since history ${historyId}`);

        for (const msgId of messageIds) {
          try {
            const result = await fetchAndStoreMessage(gmail, msgId);
            if (result.stored) {
              newMessages++;
              if (result.contactId && result.matchMethod && result.matchMethod !== "exact" && result.gmailEmailId && result.fromEmail) {
                pendingClassification.push({
                  gmailEmailId: result.gmailEmailId,
                  contactId: result.contactId,
                  subject: result.subject,
                  bodyText: result.bodyText,
                  fromEmail: result.fromEmail,
                  toEmails: result.toEmails,
                  matchMethod: result.matchMethod as "associated" | "domain",
                });
              }
            }
          } catch (err: unknown) {
            errors++;
            log(`[Gmail Sync] Error fetching message ${msgId}: ${(err as Error).message}`);
          }
        }

        // Update history ID
        if (historyRes.data.historyId) {
          historyId = historyRes.data.historyId;
        }

        useIncremental = true;
      } catch (err: unknown) {
        const status = (err as { code?: number }).code;
        if (status === 404) {
          log("[Gmail Sync] History expired, falling back to full sync");
          useIncremental = false;
        } else {
          throw err;
        }
      }
    }

    if (!useIncremental) {
      // Full sync — last N days
      const afterDate = new Date();
      afterDate.setDate(afterDate.getDate() - SYNC_LOOKBACK_DAYS);
      const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, "0")}/${String(afterDate.getDate()).padStart(2, "0")}`;

      log(`[Gmail Sync] Full sync: emails after ${afterStr}`);

      let pageToken: string | undefined;
      let totalFetched = 0;

      do {
        const listRes = await gmail.users.messages.list({
          userId: "me",
          q: `after:${afterStr}`,
          maxResults: 100,
          pageToken,
        });

        const messages = listRes.data.messages || [];
        pageToken = listRes.data.nextPageToken || undefined;

        // Process in batches with rate limiting
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
          const batch = messages.slice(i, i + BATCH_SIZE);
          for (const msg of batch) {
            if (!msg.id) continue;
            try {
              const result = await fetchAndStoreMessage(gmail, msg.id);
              if (result.stored) {
                newMessages++;
                if (result.contactId && result.matchMethod && result.matchMethod !== "exact" && result.gmailEmailId && result.fromEmail) {
                  pendingClassification.push({
                    gmailEmailId: result.gmailEmailId,
                    contactId: result.contactId,
                    subject: result.subject,
                    bodyText: result.bodyText,
                    fromEmail: result.fromEmail,
                    toEmails: result.toEmails,
                    matchMethod: result.matchMethod as "associated" | "domain",
                  });
                }
              }
            } catch (err: unknown) {
              errors++;
              log(`[Gmail Sync] Error fetching message ${msg.id}: ${(err as Error).message}`);
            }
          }
          totalFetched += batch.length;
          if (i + BATCH_SIZE < messages.length) {
            await delay(DELAY_BETWEEN_BATCHES_MS);
          }
        }

        log(`[Gmail Sync] Processed ${totalFetched} messages so far...`);
      } while (pageToken);

      // Get latest historyId from profile
      const profile = await gmail.users.getProfile({ userId: "me" });
      historyId = profile.data.historyId || null;
    }

    // Update sync state
    const now = new Date();
    if (state) {
      await db
        .update(gmailSyncState)
        .set({
          lastHistoryId: historyId,
          lastSyncAt: now,
          ...(useIncremental ? {} : { lastFullSyncAt: now }),
        })
        .where(eq(gmailSyncState.id, state.id));
    } else {
      await db.insert(gmailSyncState).values({
        email: mailbox,
        lastHistoryId: historyId,
        lastSyncAt: now,
        lastFullSyncAt: now,
      });
    }

    // Re-match orphaned emails to newly created contacts
    pendingRematchClassification = [];
    await rematchOrphanedEmails().catch(err => log(`[Gmail Sync] Rematch error: ${(err as Error).message}`));

    // Combine all emails needing classification (new + rematched)
    const allToClassify = [...pendingClassification, ...pendingRematchClassification];
    pendingRematchClassification = [];

    // Classify non-exact matched emails with AI (wrapped in runAgent for observability)
    if (allToClassify.length > 0) {
      await runAgent("email-classifier", () => classifyNewEmails(allToClassify))
        .catch(err => log(`[Gmail Sync] Classification error: ${(err as Error).message}`));
    }

    log(`[Gmail Sync] Done: ${newMessages} new, ${errors} errors`);
  } catch (err: unknown) {
    log(`[Gmail Sync] Fatal error: ${(err as Error).message}`);
    errors++;
  }

  return { newMessages, errors };
}

import { db } from "../db";
import { agentRuns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "../index";

type TriggeredBy = "cron" | "manual" | "webhook" | "startup";

type RunResult = {
  recordsProcessed?: number;
  metadata?: Record<string, unknown>;
};

export async function runAgent<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { triggeredBy?: TriggeredBy } = {}
): Promise<T> {
  const triggeredBy = opts.triggeredBy ?? "cron";
  const start = Date.now();

  let runId: string | null = null;
  if (db) {
    try {
      const [inserted] = await db
        .insert(agentRuns)
        .values({ agentName: name, status: "running", triggeredBy })
        .returning({ id: agentRuns.id });
      runId = inserted?.id ?? null;
    } catch (err) {
      log(`[agent-runner] could not insert run for ${name}: ${err}`);
    }
  }

  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const maybeResult = (result ?? {}) as Partial<RunResult>;

    if (db && runId) {
      try {
        await db
          .update(agentRuns)
          .set({
            status: "success",
            completedAt: new Date(),
            durationMs,
            recordsProcessed: maybeResult.recordsProcessed ?? 0,
            metadata: maybeResult.metadata ?? null,
          })
          .where(eq(agentRuns.id, runId));
      } catch (err) {
        log(`[agent-runner] could not update run ${runId} for ${name}: ${err}`);
      }
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err as Error;

    if (db && runId) {
      try {
        await db
          .update(agentRuns)
          .set({
            status: "error",
            completedAt: new Date(),
            durationMs,
            errorMessage: error?.message ?? String(err),
            errorStack: error?.stack ?? null,
          })
          .where(eq(agentRuns.id, runId));
      } catch (updateErr) {
        log(`[agent-runner] could not mark run ${runId} as error for ${name}: ${updateErr}`);
      }
    }

    throw err;
  }
}

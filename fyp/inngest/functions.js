import { inngest } from "./client";
import { db } from "@/configs/db";
import { users, creditLedger, studyRequests, studyMaterials } from "@/configs/schema";
import { eq } from "drizzle-orm";
import { generateStudyMaterial } from "@/configs/AiModels";

/* =========================================
 * Helpers
 * ========================================= */
const MAX_RETRIES = 3;           // total attempts (1 + 2 retries)
const BACKOFF_MS = 5000;         // 5s base backoff

function isTransientError(err) {
  const s = String(err || "");
  return /(?:503|429|overloaded|temporar|timeout|timed\s*out|try again|unavailable|quota)/i.test(s);
}

async function waitBackoff(step, attempt) {
  const ms = BACKOFF_MS * 2 ** (attempt - 1); // 1→5s, 2→10s, 3→20s
  if (step && typeof step.sleep === "function") {
    await step.sleep(`PT${Math.ceil(ms / 1000)}S`);
  } else {
    await new Promise((r) => setTimeout(r, ms));
  }
}

/* =========================================
 * 1) Provision user on sign-up
 * ========================================= */
export const userCreate = inngest.createFunction(
  { id: "user-create-fn", name: "User Create" },
  { event: "user.create" },
  async ({ event }) => {
    const { name, email, clerkId } = event.data || {};
    if (!email || !clerkId) return { ok: false, reason: "missing email/clerkId" };

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    let userId;
    if (existing.length) {
      userId = existing[0].id;
    } else {
      const inserted = await db
        .insert(users)
        .values({
          name: name || email.split("@")[0],
          email,
          clerkId,
        })
        .returning({ id: users.id });

      userId = inserted[0].id;

      await db.insert(creditLedger).values({
        userId,
        delta: +5,
        reason: "welcome.bonus",
      });
    }

    return { ok: true, userId };
  }
);

/* =========================================
 * 2) Study Request Worker with persistence
 *    Trigger: app/study.request
 * ========================================= */
export const studyRequestWorker = inngest.createFunction(
  { id: "study-request-worker", name: "Study Request Worker" },
  { event: "app/study.request" },
  async ({ event, step }) => {
    const { requestId } = event.data || {};
    if (!requestId) return { ok: false, reason: "missing requestId" };

    // Load record
    const [record] = await db
      .select()
      .from(studyRequests)
      .where(eq(studyRequests.id, requestId))
      .limit(1);

    if (!record) return { ok: false, reason: `Request ${requestId} not found` };

    // Move to processing once
    if (record.status === "queued" || record.status === "running") {
      await db
        .update(studyRequests)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(studyRequests.id, requestId));
    }

    // Retry loop
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { model, prompt, output } = await generateStudyMaterial({
          purpose: record.purpose,
          topic: record.topic,
          difficulty: record.difficulty, // "Easy" | "Medium" | "Hard"
        });

        // Normalize difficulty for studymaterials.difficultyLevel (string)
        const difficultyLevel = record.difficulty;

        // Parse output safely (prefer object in courseLayout)
        let layoutJson;
        try {
          layoutJson =
            typeof output === "string" ? JSON.parse(output) : output ?? {};
        } catch (_e) {
          layoutJson = { raw: String(output ?? "") };
        }

        // Insert the studymaterial if not already present for this request
        const existingMat = await db
          .select({ id: studyMaterials.id })
          .from(studyMaterials)
          .where(eq(studyMaterials.requestId, requestId))
          .limit(1);

        if (!existingMat.length) {
          await db.insert(studyMaterials).values({
            courseId: `REQ-${requestId}`,
            topic: record.topic,
            difficultyLevel,
            courseLayout: layoutJson,
            createdBy: String(record.userId),
            requestId,              // link (1:1)
            status: "ready",        // or "completed"
          });
        }

        // Mark the request completed + persist raw strings
        await db
          .update(studyRequests)
          .set({
            status: "completed",
            model,
            prompt: JSON.stringify(prompt),
            output: typeof output === "string" ? output : JSON.stringify(output),
            updatedAt: new Date(),
          })
          .where(eq(studyRequests.id, requestId));

        return { ok: true, requestId, attempt };
      } catch (err) {
        lastErr = err;

        if (!isTransientError(err) || attempt === MAX_RETRIES) {
          await db
            .update(studyRequests)
            .set({
              status: "failed",
              error: String(err),
              updatedAt: new Date(),
            })
            .where(eq(studyRequests.id, requestId));

          return { ok: false, requestId, error: String(err), attempt };
        }

        // transient → wait with backoff and retry
        await waitBackoff(step, attempt);
      }
    }

    // Shouldn’t reach here
    await db
      .update(studyRequests)
      .set({
        status: "failed",
        error: String(lastErr || "Unknown error"),
        updatedAt: new Date(),
      })
      .where(eq(studyRequests.id, requestId));

    return { ok: false, requestId, error: String(lastErr || "Unknown error") };
  }
);

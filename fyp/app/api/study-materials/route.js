export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/configs/db";
import { studyMaterials, users, dashboardItems, creditLedger } from "@/configs/schema";
import { getAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { generateStudyMaterial } from "@/configs/AiModels";

export async function POST(req) {
  try {
    const { userId: clerkUserId } = getAuth(req) ?? {};
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const topic = (body.topic || "").trim();
    const difficulty = body.difficulty || "Easy";
    const purpose = body.purpose || "practice";

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Subscription check
    const now = new Date();
    const hasActiveSub =
      user.subscriptionTier !== "free" &&
      user.subscriptionExpires &&
      new Date(user.subscriptionExpires) > now;

    // Free tier → spend credits
    if (!hasActiveSub) {
      const remaining = (user.credits ?? 0) - (user.usedCredits ?? 0);

      if (remaining <= 0) {
        return NextResponse.json(
          { error: "No credits left", code: "NO_CREDITS" },
          { status: 402 }
        );
      }

      await db
        .update(users)
        .set({ usedCredits: user.usedCredits + 1 })
        .where(eq(users.id, user.id));

      await db.insert(creditLedger).values({
        userId: user.id,
        requestId: null,
        delta: -1,
        reason: "Generate study material",
      });
    }

    // 🔥 Generate rich material using Gemini AI
    const ai = await generateStudyMaterial({ purpose, topic, difficulty });

    const finalMaterial = ai.output; // the parsed JSON

    // Store in DB
    const [insertedMaterial] = await db
      .insert(studyMaterials)
      .values({
        courseId: `crs_${Date.now()}`,
        topic,
        difficultyLevel: difficulty,
        createdBy: String(user.id),
        status: "completed",
        courseLayout: { raw: JSON.stringify(finalMaterial) },
        requestId: null,
      })
      .returning({ id: studyMaterials.id });

    // Add to dashboard
    await db.insert(dashboardItems).values({
      userId: user.id,
      materialId: insertedMaterial.id,
      progress: 0,
      requestId: null,
    });

    return NextResponse.json({ id: insertedMaterial.id });
  } catch (err) {
    console.error("POST /api/study-materials error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", detail: String(err) },
      { status: 500 }
    );
  }
}

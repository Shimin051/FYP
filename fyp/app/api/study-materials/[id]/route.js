export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { db } from "@/configs/db";
import { studyMaterials, users } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function GET(req, ctx) {
  try {
    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { userId: clerkUserId } = getAuth(req) ?? {};
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [mat] = await db
      .select()
      .from(studyMaterials)
      .where(eq(studyMaterials.id, id))
      .limit(1);

    if (!mat) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (Number(mat.createdBy) !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let material = {};
    try {
      const rawLayout =
        typeof mat.courseLayout === "string"
          ? mat.courseLayout
          : mat.courseLayout?.raw;

      if (rawLayout) material = JSON.parse(rawLayout);
    } catch (err) {
      material = {};
    }

    return NextResponse.json({
      id: mat.id,
      topic: mat.topic,
      status: mat.status,
      difficultyLevel: mat.difficultyLevel,
      material,
    });
  } catch (err) {
    console.error("GET /api/study-materials/[id]:", err);
    return NextResponse.json(
      { error: "Internal Server Error", detail: String(err) },
      { status: 500 }
    );
  }
}

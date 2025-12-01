export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { db } from "@/configs/db";
import {
  dashboardItems,
  studyMaterials,
  users,
} from "@/configs/schema";
import { eq, and } from "drizzle-orm";

// ------------------------
// GET → Fetch all dashboard items for user
// ------------------------
export async function GET(req) {
  try {
    const { userId: clerkUserId } = getAuth(req) ?? {};
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get internal user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "User does not exist" },
        { status: 404 }
      );
    }

    // Fetch dashboard items
    const rows = await db
      .select({
        id: dashboardItems.id,
        materialId: dashboardItems.materialId,
        progress: dashboardItems.progress,
        createdAt: dashboardItems.createdAt,
        topic: studyMaterials.topic,
        difficulty: studyMaterials.difficultyLevel,
        status: studyMaterials.status,
      })
      .from(dashboardItems)
      .leftJoin(
        studyMaterials,
        eq(dashboardItems.materialId, studyMaterials.id)
      )
      .where(eq(dashboardItems.userId, user.id));

    return NextResponse.json({ items: rows });
  } catch (err) {
    console.error("GET /api/dashboard-items error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ------------------------
// POST → Add item to dashboard
// ------------------------
export async function POST(req) {
  try {
    const { userId: clerkUserId } = getAuth(req) ?? {};
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { materialId } = body;

    if (!materialId || isNaN(Number(materialId))) {
      return NextResponse.json(
        { error: "Invalid material ID" },
        { status: 400 }
      );
    }

    // Get internal user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Prevent duplicates
    const existing = await db
      .select()
      .from(dashboardItems)
      .where(
        and(
          eq(dashboardItems.userId, user.id),
          eq(dashboardItems.materialId, Number(materialId))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: "Already added",
      });
    }

    await db.insert(dashboardItems).values({
      userId: user.id,
      materialId: Number(materialId),
      progress: 0,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/dashboard-items error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", detail: String(err) },
      { status: 500 }
    );
  }
}

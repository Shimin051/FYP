import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client.js";

export async function POST(req) {
  try {
    const body = await req.json(); // { name, email, clerkId }
    await inngest.send({ name: "user.create", data: body });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ /api/user-create failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

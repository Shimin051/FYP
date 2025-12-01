export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function GET() {
  try {
    if (!API_KEY) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const ai = new GoogleGenerativeAI(API_KEY);

    // Try your best available models in order
    const tryModels = [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash-lite-001",
    ];

    for (const m of tryModels) {
      try {
        const model = ai.getGenerativeModel({ model: m });
        const r = await model.generateContent("Say 'pong'");
        const t = r?.response?.text?.();
        if (t) return NextResponse.json({ ok: true, model: m, text: t });
      } catch {
        // try next
      }
    }

    return NextResponse.json(
      { ok: false, error: "No working model from candidates" },
      { status: 500 }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

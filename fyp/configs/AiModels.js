import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const PREFERRED_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite"
];

// Select model
async function pickModel() {
  const url = "https://generativelanguage.googleapis.com/v1/models?key=" + API_KEY;
  const resp = await fetch(url);
  const data = await resp.json();
  const available = new Set(data.models.map(m => m.name.replace("models/", "")));

  for (const m of PREFERRED_MODELS) {
    if (available.has(m)) return m;
  }
  return [...available][0];
}

// Difficulty settings
function difficultyConfig(level) {
  const d = String(level).toLowerCase();
  if (d === "easy") return { chapters: 3, detail: "introductory" };
  if (d === "hard") return { chapters: 6, detail: "advanced depth" };
  return { chapters: 4, detail: "balanced depth" };
}

// MAIN FUNCTION
export async function generateStudyMaterial({ purpose, topic, difficulty }) {
  if (!API_KEY) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

  const cfg = difficultyConfig(difficulty);
  const modelId = await pickModel();
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: modelId });

  const systemPrompt = `
Return ONLY valid JSON using the EXACT schema below.
Do NOT include anything outside the JSON (no text, no markdown, no comments).

{
  "title": string,
  "summary": string,
  "chapters": [
    {
      "title": string,
      "estimatedTime": string,
      "description": string,
      "bullets": string[]
    }
  ]
}

CONTENT RULES:
- Generate exactly ${cfg.chapters} chapters.
- Each "description" must contain 2–4 detailed paragraphs.
- Each chapter must include one explicit "Example: ..." text.
- Each bullets[] must contain 4–7 detailed bullet points.
- The result MUST be valid JSON. No trailing commas. No invalid characters.
- STRICT JSON ONLY.
`.trim();

  const userPrompt = `
Generate a structured study material for the topic "${topic}".
Difficulty: ${difficulty}
Purpose: ${purpose}
`.trim();

  const result = await model.generateContent({
    contents: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "user", parts: [{ text: userPrompt }] }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 7000,
      responseMimeType: "application/json"   // FORCE STRICT JSON HERE
    }
  });

  const jsonText = result.response.text();
  const parsed = JSON.parse(jsonText); // <-- guaranteed valid JSON now

  return {
    model: modelId,
    prompt: { purpose, topic, difficulty },
    output: parsed
  };
}

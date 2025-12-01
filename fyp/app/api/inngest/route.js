export const runtime = "nodejs";

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { userCreate, studyRequestWorker } from "@/inngest/functions";

const h = serve({
  client: inngest,
  functions: [userCreate, studyRequestWorker],
});

export const GET  = h.GET;
export const POST = h.POST;
export const PUT  = h.PUT;

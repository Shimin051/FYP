"use server";

import { db } from "@/configs/db";
import { users } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function checkOrCreateUser({ name, email, clerkId }) {
  if (!email) return;

  // Check if user exists
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  // Insert if not found
  if (rows.length === 0) {
    await db.insert(users).values({ name, email, clerkId });
  }
}

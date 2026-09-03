import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";

// GET /api/shifts — seeded shift list (Day/Night), ordered for the deployment form.
export const GET = handleRoute(async () => {
  const items = await db.shift.findMany({ orderBy: { sortOrder: "asc" } });
  return { items };
});

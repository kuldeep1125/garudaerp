import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";

// Public: minimal owner names for the demo one-tap login picker.
// Deliberately excludes any credential or contact data.
export const GET = handleRoute(async () => {
  const owners = await db.owner.findMany({
    where: { isActive: true },
    select: { id: true, name: true, username: true },
    orderBy: { name: "asc" },
  });
  return { items: owners };
}, { public: true });

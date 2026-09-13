import { handleRoute } from "@/lib/api-helpers";
import { contractorNames, contractorStats } from "../../_lib/engine";

// GET /api/dashboard/contractors
// Per-contractor commission cards: today + current month, with the employees
// behind each contractor. Only contractors with at least one commissioned
// deployment this month appear (the dashboard hides the section when empty).
export const GET = handleRoute(async () => {
  const [stats, names] = await Promise.all([contractorStats(), contractorNames()]);
  return {
    contractors: stats,
    known: names, // every contractor on the employee master — even with no work this month
  };
});

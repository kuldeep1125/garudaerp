import { handleRoute } from "@/lib/api-helpers";
import { computeNotifications } from "@/app/api/_lib/engine";

// GET /api/notifications — live-computed alert feed honoring dismissals (engine-driven).
export const GET = handleRoute(async () => {
  return computeNotifications();
});

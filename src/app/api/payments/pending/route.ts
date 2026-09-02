import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { loadAllLedgers } from "@/app/api/_lib/engine";

export const GET = handleRoute(async () => {
  const { properties, map } = await loadAllLedgers();
  const items = properties
    .map((p) => {
      const led = map.get(p.id);
      return {
        propertyId: p.id,
        propertyName: p.name,
        outstanding: led?.outstanding ?? 0,
        oldestUnpaidDate: led?.oldestUnpaidDate ?? null,
        unpaidCount: led?.unpaidCount ?? 0,
      };
    })
    .filter((i) => i.outstanding > 0.005)
    .sort((a, b) => b.outstanding - a.outstanding);
  return { items, total: items.length };
});

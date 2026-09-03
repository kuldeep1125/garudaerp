import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";

// GET /api/dashboard/onboarding — setup-progress counters for the first-run
// checklist card (shown on the dashboard until the first property, employee
// and deployment exist).
export const GET = handleRoute(async () => {
  const [properties, employees, deployments, payments] = await Promise.all([
    db.property.count(),
    db.employee.count(),
    db.deployment.count(),
    db.propertyPayment.count(),
  ]);
  return { properties, employees, deployments, payments };
});

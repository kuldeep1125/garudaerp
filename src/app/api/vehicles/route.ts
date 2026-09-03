import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { nextCode, vehicleStatsMap, deriveEmiEndDate, optionalAmount } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  const status = sp.get("status");
  const search = sp.get("search")?.trim();
  if (status) where.status = status.toUpperCase();
  if (search) {
    where.OR = [{ name: { contains: search } }, { registrationNumber: { contains: search } }, { code: { contains: search } }];
  }
  const rows = await db.vehicle.findMany({ where, orderBy: { code: "asc" } });
  const stats = await vehicleStatsMap(rows.map((r) => r.id));
  const items = rows.map((v) => ({
    ...v,
    emiEndDate: deriveEmiEndDate(v),
    stats: stats.get(v.id) ?? {
      monthRevenue: 0, monthExpense: 0, monthEmi: 0, monthNet: 0, revenue: 0, expense: 0, emi: 0, net: 0,
    },
  }));
  return { items };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["name", "registrationNumber"]);
  const code = await nextCode("VEH", "vehicle");
  const vehicle = await db.vehicle.create({
    data: {
      code,
      registrationNumber: String(body.registrationNumber).trim().toUpperCase(),
      name: String(body.name).trim(),
      make: body.make ? String(body.make) : null,
      model: body.model ? String(body.model) : null,
      variant: body.variant ? String(body.variant) : null,
      year: body.year != null && body.year !== "" ? parseInt(String(body.year), 10) || null : null,
      purchaseDate: body.purchaseDate ? parseDate(String(body.purchaseDate)) : null,
      purchasePrice: body.purchasePrice !== undefined && body.purchasePrice !== null && body.purchasePrice !== "" ? optionalAmount(body.purchasePrice) : null,
      status: body.status ? String(body.status).toUpperCase() : "AVAILABLE",
      insuranceCompany: body.insuranceCompany ? String(body.insuranceCompany) : null,
      insuranceNumber: body.insuranceNumber ? String(body.insuranceNumber) : null,
      insuranceExpiry: body.insuranceExpiry ? parseDate(String(body.insuranceExpiry)) : null,
      permitInfo: body.permitInfo ? String(body.permitInfo) : null,
      fitnessExpiry: body.fitnessExpiry ? parseDate(String(body.fitnessExpiry)) : null,
      notes: body.notes ? String(body.notes) : null,
      loanAmount: body.loanAmount !== undefined && body.loanAmount !== null && body.loanAmount !== "" ? optionalAmount(body.loanAmount) : null,
      monthlyEmi: body.monthlyEmi !== undefined && body.monthlyEmi !== null && body.monthlyEmi !== "" ? optionalAmount(body.monthlyEmi) : null,
      emiStartDate: body.emiStartDate ? parseDate(String(body.emiStartDate)) : null,
      emiCount: body.emiCount != null && body.emiCount !== "" ? parseInt(String(body.emiCount), 10) || null : null,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "VEHICLE",
    recordId: vehicle.id,
    recordLabel: `${vehicle.code} — ${vehicle.name} (${vehicle.registrationNumber})`,
    newValue: { name: vehicle.name, registrationNumber: vehicle.registrationNumber },
  });
  return {
    ...vehicle,
    emiEndDate: deriveEmiEndDate(vehicle),
    stats: { monthRevenue: 0, monthExpense: 0, monthEmi: 0, monthNet: 0, revenue: 0, expense: 0, emi: 0, net: 0 },
  };
});

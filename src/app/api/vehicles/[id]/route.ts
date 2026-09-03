import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { vehicleStatsMap, deriveEmiEndDate, optionalAmount } from "@/app/api/_lib/engine";

const EDITABLE_STRINGS = [
  "name", "make", "model", "variant", "insuranceCompany", "insuranceNumber",
  "permitInfo", "notes",
] as const;

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const vehicle = await db.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");
  const [trips, expenses, emis, maintenance, stats] = await Promise.all([
    db.trip.findMany({
      where: { vehicleId: id },
      orderBy: { startAt: "desc" },
      take: 100,
      include: {
        client: { select: { name: true, company: true } },
        vehicle: { select: { name: true, registrationNumber: true } },
      },
    }),
    db.expense.findMany({ where: { vehicleId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100 }),
    db.vehicleEmiPayment.findMany({ where: { vehicleId: id }, orderBy: { dueDate: "asc" } }),
    db.maintenance.findMany({ where: { vehicleId: id }, orderBy: { date: "desc" }, take: 100 }),
    vehicleStatsMap([id]),
  ]);
  const tripItems = trips.map(({ vehicle, ...t }) => ({
    ...t,
    vehicleName: vehicle.name,
    vehicleReg: vehicle.registrationNumber,
    clientName: t.client.name,
  }));
  return {
    vehicle: {
      ...vehicle,
      emiEndDate: deriveEmiEndDate(vehicle),
      stats: stats.get(id) ?? { monthRevenue: 0, monthExpense: 0, monthEmi: 0, monthNet: 0, revenue: 0, expense: 0, emi: 0, net: 0 },
    },
    trips: tripItems,
    expenses,
    emis,
    maintenance,
  };
});

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.vehicle.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Vehicle not found");

  const data: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_STRINGS) {
    if (body[key] !== undefined) {
      data[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
    }
  }
  if (body.registrationNumber !== undefined && body.registrationNumber !== "") {
    data.registrationNumber = String(body.registrationNumber).trim().toUpperCase();
  }
  if (body.year !== undefined) data.year = body.year === null || body.year === "" ? null : parseInt(String(body.year), 10) || null;
  if (body.status !== undefined) data.status = String(body.status).toUpperCase();
  if (body.purchaseDate !== undefined) data.purchaseDate = body.purchaseDate ? parseDate(String(body.purchaseDate)) : null;
  if (body.insuranceExpiry !== undefined) data.insuranceExpiry = body.insuranceExpiry ? parseDate(String(body.insuranceExpiry)) : null;
  if (body.fitnessExpiry !== undefined) data.fitnessExpiry = body.fitnessExpiry ? parseDate(String(body.fitnessExpiry)) : null;
  if (body.purchasePrice !== undefined) data.purchasePrice = body.purchasePrice === null || body.purchasePrice === "" ? null : optionalAmount(body.purchasePrice);
  if (body.loanAmount !== undefined) data.loanAmount = body.loanAmount === null || body.loanAmount === "" ? null : optionalAmount(body.loanAmount);
  if (body.monthlyEmi !== undefined) data.monthlyEmi = body.monthlyEmi === null || body.monthlyEmi === "" ? null : optionalAmount(body.monthlyEmi);
  if (body.emiStartDate !== undefined) data.emiStartDate = body.emiStartDate ? parseDate(String(body.emiStartDate)) : null;
  if (body.emiCount !== undefined) data.emiCount = body.emiCount === null || body.emiCount === "" ? null : parseInt(String(body.emiCount), 10) || null;

  for (const key of Object.keys(data)) {
    previous[key] = (existing as unknown as Record<string, unknown>)[key];
    changes[key] = data[key];
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const vehicle = await db.vehicle.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "VEHICLE",
    recordId: id,
    recordLabel: `${vehicle.code} — ${vehicle.name}`,
    previousValue: previous,
    newValue: changes,
  });
  const stats = await vehicleStatsMap([id]);
  return {
    ...vehicle,
    emiEndDate: deriveEmiEndDate(vehicle),
    stats: stats.get(id) ?? { monthRevenue: 0, monthExpense: 0, monthEmi: 0, monthNet: 0, revenue: 0, expense: 0, emi: 0, net: 0 },
  };
});

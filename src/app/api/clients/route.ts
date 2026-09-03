import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { tripTarget } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const search = sp.get("search")?.trim();
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [{ name: { contains: search } }, { company: { contains: search } }, { phone: { contains: search } }];
  }
  const rows = await db.client.findMany({ where, orderBy: { name: "asc" } });
  const tripAgg = await db.trip.groupBy({
    by: ["clientId"],
    where: { status: { not: "CANCELLED" } },
    _count: true,
    _sum: { agreedAmount: true, extraCharges: true, finalAmount: true },
  });
  const aggById = new Map(tripAgg.map((t) => [t.clientId, t]));
  const items = rows.map((c) => {
    const agg = aggById.get(c.id);
    const totalBusiness = agg
      ? round2(agg._sum.finalAmount ?? (agg._sum.agreedAmount ?? 0) + (agg._sum.extraCharges ?? 0))
      : 0;
    return { ...c, tripCount: agg?._count ?? 0, totalBusiness };
  });
  return { items };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["name"]);
  const client = await db.client.create({
    data: {
      name: String(body.name).trim(),
      company: body.company ? String(body.company) : null,
      phone: body.phone ? String(body.phone) : null,
      whatsapp: body.whatsapp ? String(body.whatsapp) : null,
      email: body.email ? String(body.email) : null,
      address: body.address ? String(body.address) : null,
      billingDetails: body.billingDetails ? String(body.billingDetails) : null,
      notes: body.notes ? String(body.notes) : null,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "CLIENT",
    recordId: client.id,
    recordLabel: client.name,
    newValue: { name: client.name, company: client.company },
  });
  void tripTarget;
  return { ...client, tripCount: 0, totalBusiness: 0 };
});

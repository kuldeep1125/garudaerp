import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { dayKey } from "@/app/api/_lib/engine";

export interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  view: string;
  params: Record<string, string>;
}

// GET /api/search?q=... — global header search across all modules (≤5 hits each, case-insensitive contains).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (q.length < 2) {
    return { employees: [], properties: [], vehicles: [], clients: [], expenses: [], deployments: [] };
  }

  const [employees, properties, vehicles, clients, expenses, deployments] = await Promise.all([
    db.employee.findMany({
      where: { OR: [{ fullName: { contains: q } }, { code: { contains: q } }, { mobile: { contains: q } }] },
      select: { id: true, fullName: true, code: true, designation: true, status: true },
      take: 5,
      orderBy: { fullName: "asc" },
    }),
    db.property.findMany({
      where: { OR: [{ name: { contains: q } }, { brandName: { contains: q } }, { address: { contains: q } }, { contactPerson: { contains: q } }] },
      select: { id: true, name: true, brandName: true, type: true, status: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    db.vehicle.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { registrationNumber: { contains: q } },
          { make: { contains: q } },
          { model: { contains: q } },
          { code: { contains: q } },
        ],
      },
      select: { id: true, name: true, registrationNumber: true, make: true, model: true, status: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      where: { OR: [{ name: { contains: q } }, { company: { contains: q } }, { phone: { contains: q } }] },
      select: { id: true, name: true, company: true, phone: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    db.expense.findMany({
      where: { OR: [{ description: { contains: q } }, { categoryName: { contains: q } }, { notes: { contains: q } }] },
      select: { id: true, date: true, amount: true, categoryName: true, description: true },
      take: 5,
      orderBy: { date: "desc" },
    }),
    db.deployment.findMany({
      where: {
        OR: [{ employee: { fullName: { contains: q } } }, { property: { name: { contains: q } } }, { notes: { contains: q } }],
      },
      select: { id: true, date: true, shift: true, employee: { select: { fullName: true } }, property: { select: { name: true } } },
      take: 5,
      orderBy: { date: "desc" },
    }),
  ]);

  const empItems: SearchItem[] = employees.map((e) => ({
    id: e.id,
    title: e.fullName,
    subtitle: `${e.code}${e.designation ? ` · ${e.designation}` : ""} · ${e.status}`,
    view: "employee-detail",
    params: { id: e.id }, // detail views read params.id (was employeeId — clicking results showed an endless skeleton)
  }));
  const propItems: SearchItem[] = properties.map((p) => ({
    id: p.id,
    title: p.name,
    subtitle: [p.brandName, p.type, p.status].filter(Boolean).join(" · "),
    view: "property-detail",
    params: { id: p.id }, // detail views read params.id (was propertyId)
  }));
  const vehItems: SearchItem[] = vehicles.map((v) => ({
    id: v.id,
    title: v.name,
    subtitle: `${v.registrationNumber}${v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(" ")}` : ""} · ${v.status}`,
    view: "vehicle-detail",
    params: { id: v.id }, // detail views read params.id (was vehicleId)
  }));
  const clientItems: SearchItem[] = clients.map((c) => ({
    id: c.id,
    title: c.name,
    subtitle: [c.company, c.phone].filter(Boolean).join(" · "),
    view: "clients",
    params: { clientId: c.id, search: c.name },
  }));
  const expenseItems: SearchItem[] = expenses.map((e) => ({
    id: e.id,
    title: e.description ?? e.categoryName ?? "Expense",
    subtitle: `${dayKey(e.date)} · ${e.categoryName ?? "Uncategorized"} · ₹${e.amount.toLocaleString("en-IN")}`,
    view: "expenses",
    params: { search: e.description ?? e.categoryName ?? "" },
  }));
  const depItems: SearchItem[] = deployments.map((d) => ({
    id: d.id,
    title: `${d.employee.fullName} @ ${d.property.name}`,
    subtitle: `${dayKey(d.date)} · ${d.shift} shift`,
    view: "deployments",
    params: { date: dayKey(d.date) },
  }));

  return {
    employees: empItems,
    properties: propItems,
    vehicles: vehItems,
    clients: clientItems,
    expenses: expenseItems,
    deployments: depItems,
  };
});

import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange, manpowerCostBreakdown } from "@/app/api/_lib/engine";

// GET /api/reports/manpower-statement?from=&to=&propertyId=&contractor=
// Comprehensive Manpower Operational & Financial Master Statement.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const propertyId = sp.get("propertyId") || undefined;
  const contractor = sp.get("contractor") || undefined;

  const [deps, cost, properties, employees] = await Promise.all([
    db.deployment.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(propertyId ? { propertyId } : {}),
        ...(contractor ? { employee: { contractorName: contractor } } : {}),
      },
      include: {
        property: { select: { id: true, name: true } },
        employee: { select: { id: true, fullName: true, code: true, contractorName: true, designation: true } },
      },
      orderBy: [{ date: "desc" }, { property: { name: "asc" } }],
    }),
    manpowerCostBreakdown(from, to),
    db.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }),
  ]);

  // Aggregate property rollups
  const propertyMap = new Map<string, {
    propertyId: string;
    propertyName: string;
    shifts: number;
    employees: Set<string>;
    billing: number;
    payout: number;
    contractorCut: number;
  }>();

  // Aggregate contractor rollups
  const contractorMap = new Map<string, {
    contractor: string;
    shifts: number;
    employees: Set<string>;
    commission: number;
  }>();

  // Aggregate employee rollups
  const employeeMap = new Map<string, {
    employeeId: string;
    employeeName: string;
    code: string;
    shifts: number;
    payout: number;
    properties: Set<string>;
  }>();

  let totalBilling = 0;
  let totalPayout = 0;
  let totalContractorCut = 0;

  for (const d of deps) {
    const billing = round2(d.billingAmount);
    const payout = round2(d.payoutAmount);
    const contractorCut = round2((d.contractorRateCut ?? 0) * (d.shift === "FULL" ? 2 : 1));

    totalBilling = round2(totalBilling + billing);
    totalPayout = round2(totalPayout + payout);
    totalContractorCut = round2(totalContractorCut + contractorCut);

    // Property rollup
    const prop = propertyMap.get(d.propertyId) ?? {
      propertyId: d.propertyId,
      propertyName: d.property.name,
      shifts: 0,
      employees: new Set<string>(),
      billing: 0,
      payout: 0,
      contractorCut: 0,
    };
    prop.shifts += (d.shift === "FULL" ? 2 : 1);
    prop.employees.add(d.employeeId);
    prop.billing = round2(prop.billing + billing);
    prop.payout = round2(prop.payout + payout);
    prop.contractorCut = round2(prop.contractorCut + contractorCut);
    propertyMap.set(d.propertyId, prop);

    // Contractor rollup
    if (d.employee.contractorName) {
      const cName = d.employee.contractorName;
      const c = contractorMap.get(cName) ?? {
        contractor: cName,
        shifts: 0,
        employees: new Set<string>(),
        commission: 0,
      };
      c.shifts += (d.shift === "FULL" ? 2 : 1);
      c.employees.add(d.employeeId);
      c.commission = round2(c.commission + contractorCut);
      contractorMap.set(cName, c);
    }

    // Employee rollup
    const emp = employeeMap.get(d.employeeId) ?? {
      employeeId: d.employeeId,
      employeeName: d.employee.fullName,
      code: d.employee.code,
      shifts: 0,
      payout: 0,
      properties: new Set<string>(),
    };
    emp.shifts += (d.shift === "FULL" ? 2 : 1);
    emp.payout = round2(emp.payout + payout);
    emp.properties.add(d.property.name);
    employeeMap.set(d.employeeId, emp);
  }

  const propertyBreakdown = Array.from(propertyMap.values()).map((p) => ({
    propertyId: p.propertyId,
    propertyName: p.propertyName,
    shifts: p.shifts,
    headcount: p.employees.size,
    billing: p.billing,
    payout: p.payout,
    contractorCut: p.contractorCut,
    margin: round2(p.billing - p.payout - p.contractorCut),
    marginPct: p.billing > 0 ? Math.round(((p.billing - p.payout - p.contractorCut) / p.billing) * 100) : 0,
  })).sort((a, b) => b.billing - a.billing);

  const contractorBreakdown = Array.from(contractorMap.values()).map((c) => ({
    contractor: c.contractor,
    shifts: c.shifts,
    headcount: c.employees.size,
    commission: c.commission,
  })).sort((a, b) => b.commission - a.commission);

  const employeeBreakdown = Array.from(employeeMap.values()).map((e) => ({
    employeeId: e.employeeId,
    employeeName: e.employeeName,
    code: e.code,
    shifts: e.shifts,
    payout: e.payout,
    properties: Array.from(e.properties).join(", "),
  })).sort((a, b) => b.shifts - a.shifts);

  const grossMargin = round2(totalBilling - totalPayout - totalContractorCut);
  const marginPct = totalBilling > 0 ? Math.round((grossMargin / totalBilling) * 100) : 0;

  // The main table rows reflect the property-level financial performance
  return {
    columns: [
      { key: "propertyName", label: "Property", type: "string" },
      { key: "shifts", label: "Shifts Deployed", type: "number" },
      { key: "headcount", label: "Staff Count", type: "number" },
      { key: "billing", label: "Billing Revenue", type: "money" },
      { key: "payout", label: "Employee Payouts", type: "money" },
      { key: "contractorCut", label: "Contractor Cuts", type: "money" },
      { key: "margin", label: "Gross Margin", type: "money" },
      { key: "marginPct", label: "Margin %", type: "number" },
    ],
    rows: propertyBreakdown,
    totals: {
      shifts: propertyBreakdown.reduce((s, r) => s + r.shifts, 0),
      headcount: new Set(deps.map((d) => d.employeeId)).size,
      billing: totalBilling,
      payout: totalPayout,
      contractorCut: totalContractorCut,
      margin: grossMargin,
      marginPct,
    },
    summary: {
      period: `${dayKey(from)} → ${dayKey(to)}`,
      totalDeployments: deps.length,
      totalBilling,
      totalPayout,
      totalContractorCut,
      grossMargin,
      marginPct,
      rentIncomeAccrued: cost?.rentIncome ?? 0,
      salariedCostAccrued: cost?.salary ?? 0,
      overtimeAccrued: cost?.overtime ?? 0,
    },
    contractors: contractorBreakdown,
    topEmployees: employeeBreakdown.slice(0, 30),
    meta: {
      propertiesCount: propertyBreakdown.length,
      deploymentsCount: deps.length,
      uniqueEmployees: new Set(deps.map((d) => d.employeeId)).size,
    },
    note: "Comprehensive Manpower operational & financial statement aggregating deployments, billings, payouts, and margins across properties and contractors.",
  };
});

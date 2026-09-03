/**
 * BizHub reset — wipes ALL business data for a clean manual-testing start.
 * Keeps: master data (shifts, expense categories, app settings) and a single
 * owner login:  admin / admin123
 *
 * Run:  bun scripts/reset.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  console.log("Resetting BizHub — wiping business data (master data preserved)…");

  // FK-safe wipe order. Master data (shift, appSetting, expenseCategory) is KEPT.
  const tables = [
    "settlementLine", "settlement", "adjustment", "advance", "deployment", "propertyPayment",
    "expense", "recurringExpense", "vehicleEmiPayment", "maintenance", "trip",
    "client", "vehicle", "notificationDismiss", "auditLog", "session", "employee", "property",
    "owner",
  ] as const;
  for (const t of tables) {
    await (db as any)[t].deleteMany();
  }

  // Single owner login for manual testing
  await db.owner.create({
    data: {
      name: "Owner",
      username: "admin",
      passwordHash: hash("admin123"),
      mobile: "9999999999",
    },
  });

  // Master data (only if missing — survives resets)
  const shiftCount = await db.shift.count();
  if (shiftCount === 0) {
    await db.shift.createMany({
      data: [
        { name: "DAY", startTime: "08:00", endTime: "20:00", sortOrder: 1 },
        { name: "NIGHT", startTime: "20:00", endTime: "08:00", sortOrder: 2 },
      ],
    });
  }

  const settingCount = await db.appSetting.count();
  if (settingCount === 0) {
    const settings: Record<string, string> = {
      businessName: "My Business",
      businessAddress: "",
      businessContact: "",
      gstin: "",
      logoText: "MB",
    };
    for (const [key, value] of Object.entries(settings)) {
      await db.appSetting.create({ data: { key, value } });
    }
  }

  const catCount = await db.expenseCategory.count();
  if (catCount === 0) {
    const catDefs: [string, string, string][] = [
      ["Office Rent", "MANPOWER", "EXPENSE"], ["Food & Refreshments", "MANPOWER", "EXPENSE"],
      ["Travel", "MANPOWER", "EXPENSE"], ["Recruitment", "MANPOWER", "EXPENSE"],
      ["Uniforms", "MANPOWER", "EXPENSE"], ["Software", "MANPOWER", "EXPENSE"],
      ["Marketing", "MANPOWER", "EXPENSE"], ["Miscellaneous", "MANPOWER", "EXPENSE"],
      ["Office Rent", "TRANSPORT", "EXPENSE"], ["Fuel", "TRANSPORT", "EXPENSE"],
      ["Service", "TRANSPORT", "EXPENSE"], ["Repairs", "TRANSPORT", "EXPENSE"],
      ["Tyres", "TRANSPORT", "EXPENSE"], ["Insurance", "TRANSPORT", "EXPENSE"],
      ["Permit & Tax", "TRANSPORT", "EXPENSE"], ["Toll & Parking", "TRANSPORT", "EXPENSE"],
      ["Driver Salary", "TRANSPORT", "EXPENSE"], ["Cleaning", "TRANSPORT", "EXPENSE"],
      ["EMI", "TRANSPORT", "FINANCIAL"], ["Loan Interest", "TRANSPORT", "FINANCIAL"],
      ["Bank Charges", "COMMON", "FINANCIAL"],
      ["Owner Withdrawal", "COMMON", "OWNER"], ["Owner Contribution", "COMMON", "OWNER"],
      ["Owner Reimbursement", "COMMON", "OWNER"],
    ];
    for (const [name, business, kind] of catDefs) {
      await db.expenseCategory.create({ data: { name, business, kind } });
    }
  }

  const [owners, employees, properties, vehicles, trips, deployments, expenses, payments] =
    await Promise.all([
      db.owner.count(), db.employee.count(), db.property.count(), db.vehicle.count(),
      db.trip.count(), db.deployment.count(), db.expense.count(), db.propertyPayment.count(),
    ]);
  console.log("Reset complete:", {
    owners, employees, properties, vehicles, trips, deployments, expenses, payments,
  });
  console.log("Login →  username: admin   password: admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

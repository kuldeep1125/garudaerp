// Cleans up all "*Integrity*" / "TestCat-*" test artifacts from the suite runs.
// Order matters for FK relations. Safe: only touches records created by the test suite.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const emps = await db.employee.findMany({ where: { fullName: { contains: "Integrity" } }, select: { id: true, fullName: true } });
  const empIds = emps.map((e) => e.id);
  if (empIds.length) {
    await db.settlementLine.deleteMany({ where: { settlement: { employeeId: { in: empIds } } } });
    await db.settlement.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.deployment.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.advance.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.adjustment.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.employeePayHistory.deleteMany({ where: { employeeId: { in: empIds } } });
    await db.employee.deleteMany({ where: { id: { in: empIds } } });
  }
  console.log(`employees cleaned: ${empIds.length}`);

  const props = await db.property.findMany({ where: { name: "Integrity Site" }, select: { id: true } });
  for (const p of props) {
    await db.propertyPayment.deleteMany({ where: { propertyId: p.id } });
    await db.property.delete({ where: { id: p.id } });
  }
  console.log(`properties cleaned: ${props.length}`);

  const vehs = await db.vehicle.findMany({ where: { name: { contains: "Integrity" } }, select: { id: true } });
  for (const v of vehs) {
    await db.trip.deleteMany({ where: { vehicleId: v.id } });
    await db.vehicleEmiPayment.deleteMany({ where: { vehicleId: v.id } });
    await db.maintenance.deleteMany({ where: { vehicleId: v.id } });
    await db.expense.deleteMany({ where: { vehicleId: v.id } });
    await db.vehicle.delete({ where: { id: v.id } });
  }
  console.log(`vehicles cleaned: ${vehs.length}`);

  await db.trip.deleteMany({ where: { client: { name: "Integrity Client" } } });
  const cli = await db.client.deleteMany({ where: { name: "Integrity Client" } });
  console.log(`clients cleaned: ${cli.count}`);

  await db.expense.deleteMany({ where: { description: { contains: "integrity test" } } });
  const rec = await db.recurringExpense.deleteMany({ where: { name: { contains: "Integrity Recur" } } });
  console.log(`recurring cleaned: ${rec.count}`);
  const cats = await db.expenseCategory.deleteMany({ where: { name: { contains: "TestCat-" } } });
  console.log(`categories cleaned: ${cats.count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

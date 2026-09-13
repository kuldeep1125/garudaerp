// One-time backfill: seeds an "Initial terms" EmployeePayHistory row for every
// employee that has none. Safe to re-run (idempotent — only fills gaps).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const employees = await db.employee.findMany({
    where: { payHistory: { none: {} } },
    select: {
      id: true, joiningDate: true, employmentType: true, standardRate: true,
      monthlySalary: true, overtimeThreshold: true, overtimeRate: true,
      onBusinessRent: true, rentAmount: true, rentMode: true,
      hasContractor: true, contractorName: true, contractorRateCut: true,
    },
  });
  for (const emp of employees) {
    await db.employeePayHistory.create({
      data: {
        employeeId: emp.id,
        effectiveFrom: emp.joiningDate,
        employmentType: emp.employmentType,
        standardRate: emp.standardRate,
        monthlySalary: emp.monthlySalary,
        overtimeThreshold: emp.overtimeThreshold,
        overtimeRate: emp.overtimeRate,
        onBusinessRent: emp.onBusinessRent,
        rentAmount: emp.rentAmount,
        rentMode: emp.rentMode,
        hasContractor: emp.hasContractor,
        contractorName: emp.contractorName,
        contractorRateCut: emp.contractorRateCut,
        reason: "Initial terms",
      },
    });
  }
  console.log(`Backfilled initial pay-history rows for ${employees.length} employee(s).`);
  const remaining = await db.employee.count({ where: { payHistory: { none: {} } } });
  console.log(`Employees without pay history remaining: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

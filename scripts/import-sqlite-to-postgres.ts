import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function toDate(val: any): Date | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 10000000000) return new Date(num);
    return new Date(val);
  }
  return null;
}

function toBool(val: any): boolean {
  return val === 1 || val === true || val === 'true' || val === '1';
}

async function main() {
  const jsonPath = path.join(process.cwd(), 'db', 'sqlite-export.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('File not found:', jsonPath);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  console.log('--- Importing Owners ---');
  for (const r of raw.Owner || []) {
    await prisma.owner.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        name: r.name,
        username: r.username,
        passwordHash: r.passwordHash,
        mobile: r.mobile,
        isActive: toBool(r.isActive),
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }

  console.log('--- Importing AppSettings ---');
  for (const r of raw.AppSetting || []) {
    await prisma.appSetting.upsert({
      where: { key: r.key },
      update: {},
      create: {
        key: r.key,
        value: r.value,
      },
    });
  }

  console.log('--- Importing Shifts ---');
  for (const r of raw.Shift || []) {
    await prisma.shift.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        name: r.name,
        startTime: r.startTime,
        endTime: r.endTime,
        sortOrder: r.sortOrder ?? 0,
      },
    });
  }

  console.log('--- Importing ExpenseCategories ---');
  for (const r of raw.ExpenseCategory || []) {
    await prisma.expenseCategory.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        name: r.name,
        business: r.business || 'MANPOWER',
        kind: r.kind || 'EXPENSE',
        isActive: toBool(r.isActive),
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  console.log('--- Importing Properties ---');
  for (const r of raw.Property || []) {
    await prisma.property.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        name: r.name,
        brandName: r.brandName,
        type: r.type,
        address: r.address,
        contactPerson: r.contactPerson,
        contactNumber: r.contactNumber,
        whatsapp: r.whatsapp,
        email: r.email,
        startDate: toDate(r.startDate),
        billingRate: r.billingRate ?? 0,
        status: r.status || 'ACTIVE',
        notes: r.notes,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }

  console.log('--- Importing Employees ---');
  for (const r of raw.Employee || []) {
    await prisma.employee.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        code: r.code,
        fullName: r.fullName,
        photoUrl: r.photoUrl,
        dob: toDate(r.dob),
        gender: r.gender,
        mobile: r.mobile,
        whatsapp: r.whatsapp,
        address: r.address,
        city: r.city,
        emergencyContact: r.emergencyContact,
        joiningDate: toDate(r.joiningDate) || new Date(),
        designation: r.designation,
        skills: r.skills,
        standardRate: r.standardRate ?? 0,
        rateType: r.rateType || 'PER_SHIFT',
        employmentType: r.employmentType || 'NON_SALARIED',
        monthlySalary: r.monthlySalary ?? 0,
        overtimeThreshold: r.overtimeThreshold ?? 30,
        overtimeRate: r.overtimeRate ?? 0,
        onBusinessRent: toBool(r.onBusinessRent),
        rentAmount: r.rentAmount ?? 0,
        rentMode: r.rentMode || 'MONTH',
        hasContractor: toBool(r.hasContractor),
        contractorName: r.contractorName,
        contractorRateCut: r.contractorRateCut ?? 0,
        status: r.status || 'ACTIVE',
        bankDetails: r.bankDetails,
        upiId: r.upiId,
        preferredPaymentMethod: r.preferredPaymentMethod,
        notes: r.notes,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }

  console.log('--- Importing EmployeePayHistories ---');
  for (const r of raw.EmployeePayHistory || []) {
    await prisma.employeePayHistory.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        employeeId: r.employeeId,
        effectiveFrom: toDate(r.effectiveFrom) || toDate(r.effectiveDate) || new Date(),
        employmentType: r.employmentType || 'NON_SALARIED',
        monthlySalary: r.monthlySalary ?? 0,
        standardRate: r.standardRate ?? 0,
        overtimeThreshold: r.overtimeThreshold ?? 30,
        overtimeRate: r.overtimeRate ?? 0,
        onBusinessRent: toBool(r.onBusinessRent),
        rentAmount: r.rentAmount ?? 0,
        rentMode: r.rentMode || 'MONTH',
        hasContractor: toBool(r.hasContractor),
        contractorName: r.contractorName,
        contractorRateCut: r.contractorRateCut ?? 0,
        changedByName: r.changedByName || r.createdById,
        reason: r.reason,
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  console.log('--- Importing Deployments ---');
  for (const r of raw.Deployment || []) {
    await prisma.deployment.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        date: toDate(r.date) || new Date(),
        propertyId: r.propertyId,
        employeeId: r.employeeId,
        shift: r.shift,
        billingRate: r.billingRate ?? 0,
        payoutRate: r.payoutRate ?? 0,
        billingAmount: r.billingAmount ?? 0,
        payoutAmount: r.payoutAmount ?? 0,
        adjustmentAmount: r.adjustmentAmount ?? 0,
        adjustmentNote: r.adjustmentNote,
        contractorName: r.contractorName,
        contractorRateCut: r.contractorRateCut ?? 0,
        contractorCut: r.contractorCut ?? 0,
        paidAmount: r.paidAmount ?? 0,
        notes: r.notes,
        createdById: r.createdById,
        createdByName: r.createdByName,
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  console.log('--- Importing PropertyPayments ---');
  for (const r of raw.PropertyPayment || []) {
    await prisma.propertyPayment.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        propertyId: r.propertyId,
        date: toDate(r.date) || toDate(r.paymentDate) || new Date(),
        amount: r.amount,
        method: r.method || r.paymentMethod,
        reference: r.reference || r.referenceNumber,
        notes: r.notes,
        receivedById: r.receivedById || r.createdById,
        receivedByName: r.receivedByName,
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  console.log('--- Importing Sessions ---');
  for (const r of raw.Session || []) {
    await prisma.session.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        token: r.token,
        ownerId: r.ownerId,
        expiresAt: toDate(r.expiresAt) || new Date(),
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  console.log('--- Importing AuditLogs ---');
  for (const r of raw.AuditLog || []) {
    await prisma.auditLog.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        module: r.module,
        action: r.action,
        recordId: r.recordId,
        recordLabel: r.recordLabel,
        previousValue: r.previousValue || r.previousState,
        newValue: r.newValue || r.newState,
        ownerId: r.ownerId,
        ownerName: r.ownerName || 'Admin',
        createdAt: toDate(r.createdAt) || new Date(),
      },
    });
  }

  console.log('Done importing all data successfully!');
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

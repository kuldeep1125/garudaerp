/**
 * BizHub seed — realistic demo dataset.
 * Run: bun scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

async function main() {
  console.log("Seeding BizHub…");

  // wipe in FK-safe order
  const tables = [
    "settlementLine", "settlement", "adjustment", "advance", "deployment", "propertyPayment",
    "contract", "expense", "recurringExpense", "vehicleEmiPayment", "maintenance", "trip",
    "client", "vehicle", "expenseCategory", "notificationDismiss", "appSetting", "shift",
    "auditLog", "session", "employee", "property", "owner",
  ] as const;
  for (const t of tables) {
    await (db as any)[t].deleteMany();
  }

  // ---- Owners ----
  const ownerNames = ["Yash", "Saurabh", "Santosh", "Amit", "Vikram", "Rahul", "Priya", "Neha", "Arjun", "Kavita", "Rohit", "Deepak", "Anil", "Meera", "Kunal"];
  const owners = [] as { id: string; name: string }[];
  for (const name of ownerNames) {
    owners.push(
      await db.owner.create({
        data: {
          name,
          username: name.toLowerCase(),
          passwordHash: hash("owner123"),
          mobile: `98${String(10000000 + Math.floor(Math.random() * 8999999)).slice(0, 8)}`,
        },
      })
    );
  }
  const pickOwner = () => owners[Math.floor(Math.random() * owners.length)];

  // ---- Shifts ----
  await db.shift.createMany({
    data: [
      { name: "DAY", startTime: "08:00", endTime: "20:00", sortOrder: 1 },
      { name: "NIGHT", startTime: "20:00", endTime: "08:00", sortOrder: 2 },
    ],
  });

  // ---- Settings ----
  const settings: Record<string, string> = {
    businessName: "BizHub Group",
    businessAddress: "12, MG Road, Pune, Maharashtra 411001",
    businessContact: "+91 98220 00000",
    gstin: "27ABCDE1234F1Z5",
    logoText: "BH",
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.appSetting.create({ data: { key, value } });
  }

  // ---- Expense categories ----
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
  const cats: Record<string, string> = {};
  for (const [name, business, kind] of catDefs) {
    const c = await db.expenseCategory.create({ data: { name, business, kind } });
    cats[`${business}:${name}`] = c.id;
  }

  // ---- Employees ----
  const empDefs: [string, string, number, string][] = [
    ["Rahul Sharma", "Chef", 850, "9811100011"], ["Vikas Patil", "Commis Chef", 700, "9811100012"],
    ["Suresh Kumar", "Head Chef", 1100, "9811100013"], ["Amit Verma", "Waiter", 650, "9811100014"],
    ["Pooja Singh", "Waitress", 650, "9811100015"], ["Ramesh Yadav", "Kitchen Helper", 600, "9811100016"],
    ["Deepak Joshi", "Bartender", 800, "9811100017"], ["Sunita Devi", "Housekeeping", 600, "9811100018"],
    ["Manoj Tiwari", "Waiter", 680, "9811100019"], ["Kiran More", "Chef de Partie", 900, "9811100020"],
    ["Ganesh Sahu", "Kitchen Helper", 620, "9811100021"], ["Pramod Dash", "Steward", 640, "9811100022"],
    ["Lalita Kumari", "Cashier", 750, "9811100023"], ["Harish Kamble", "Waiter", 660, "9811100024"],
    ["Naresh Solanki", "Security", 700, "9811100025"], ["Bhavesh Shah", "Barista", 780, "9811100026"],
    ["Kishor Mane", "Kitchen Helper", 610, "9811100027"], ["Dinesh Pal", "Commis Chef", 720, "9811100028"],
    ["Rekha Nair", "Waitress", 670, "9811100029"], ["Sachin Gaikwad", "Chef", 880, "9811100030"],
    ["Mohan Rao", "Steward", 640, "9811100031"], ["Jyoti Bala", "Housekeeping", 600, "9811100032"],
    ["Vipin Chandra", "Bartender", 820, "9811100033"], ["Ajay Rathod", "Security", 700, "9811100034"],
  ];
  const employees: { id: string; fullName: string; standardRate: number }[] = [];
  for (let i = 0; i < empDefs.length; i++) {
    const [fullName, designation, standardRate, mobile] = empDefs[i];
    employees.push(
      await db.employee.create({
        data: {
          code: `EMP-${String(i + 1).padStart(3, "0")}`,
          fullName, designation, standardRate, mobile,
          whatsapp: mobile,
          gender: /i$|a$|Devi|Kumari|Rekha|Jyoti|Pooja|Sunita|Lalita/.test(fullName) ? "FEMALE" : "MALE",
          city: "Pune",
          address: `Plot ${10 + i}, Sector ${1 + (i % 5)}, Pune`,
          emergencyContact: `98${String(20000000 + i).slice(0, 8)}`,
          joiningDate: day(-400 + i * 12),
          skills: designation,
          status: i >= 22 ? "INACTIVE" : "ACTIVE",
          bankDetails: `HDFC ****${4000 + i}`,
          upiId: `${fullName.split(" ")[0].toLowerCase()}@upi`,
          preferredPaymentMethod: i % 3 === 0 ? "UPI" : "BANK",
        },
      })
    );
  }
  const activeEmployees = employees.filter((_, i) => i < 22);

  // ---- Properties + contracts ----
  const propDefs: [string, string, string, number, number, string][] = [
    ["Spice Garden", "SG Hospitality", "Fine Dining", 1000, 800, "+91 90210 11001"],
    ["Bombay Bistro", "BB Foods", "Casual Dining", 950, 760, "+91 90210 11002"],
    ["Coastal Kitchen", "CK Group", "Seafood", 1100, 880, "+91 90210 11003"],
    ["Tandoor House", "TH Ventures", "North Indian", 900, 720, "+91 90210 11004"],
    ["Urban Cafe", "UC Retail", "Cafe", 850, 680, "+91 90210 11005"],
    ["Royal Orchid", "RO Hotels", "Banquet", 1200, 950, "+91 90210 11006"],
    ["Green Leaf", "GL Restaurants", "Vegetarian", 880, 700, "+91 90210 11007"],
    ["Night Owl Diner", "NOD Pvt Ltd", "Diner", 1000, 820, "+91 90210 11008"],
  ];
  const properties: { id: string; name: string; billingRate: number; payoutRate: number }[] = [];
  for (let i = 0; i < propDefs.length; i++) {
    const [name, brand, type, billingRate, payoutRate, contactNumber] = propDefs[i];
    const p = await db.property.create({
      data: {
        name, brandName: brand, type, contactNumber,
        contactPerson: `Mr. ${["Shah", "Kapoor", "Iyer", "Mehta", "Bose", "Reddy", "Nair", "Sinha"][i]}`,
        email: `ops@${brand.split(" ")[0].toLowerCase()}.com`,
        address: `${20 + i}, Koramangala ${i + 1}st Block, Bengaluru`,
        startDate: day(-500 + i * 15),
        notes: i === 7 ? "Prefers night-shift staff only." : null,
      },
    });
    // older contract (ended) to exercise rate history
    await db.contract.create({
      data: {
        propertyId: p.id, name: `${name} Contract 2024`, startDate: day(-500), endDate: day(-121),
        billingRate: billingRate - 100, payoutRate: payoutRate - 80, status: "ENDED",
        paymentTerms: "Weekly, every Monday", shift: "ALL", maxEmployees: 8,
      },
    });
    await db.contract.create({
      data: {
        propertyId: p.id, name: `${name} Contract — Current`, startDate: day(-120),
        billingRate, payoutRate, status: "ACTIVE", paymentTerms: i % 2 === 0 ? "Weekly, every Monday" : "Monthly, 1st–5th",
        shift: i === 7 ? "NIGHT" : "ALL", maxEmployees: 6, category: type,
      },
    });
    properties.push({ id: p.id, name, billingRate, payoutRate });
  }

  // ---- Deployments (last 40 days) + some today/tomorrow ----
  const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "CONFIRMED", "SCHEDULED"];
  let deploymentCount = 0;
  for (let d = -40; d <= 0; d++) {
    const date = day(d);
    for (const p of properties) {
      const shiftPool = p.name === "Night Owl Diner" ? ["NIGHT"] : d % 7 === 0 ? ["DAY"] : ["DAY", "NIGHT"];
      for (const shift of shiftPool) {
        if (Math.random() < 0.12) continue; // some properties skip some shifts
        const count = 2 + Math.floor(Math.random() * 4); // 2-5 employees
        const shuffled = [...activeEmployees].sort(() => Math.random() - 0.5).slice(0, count);
        const owner = pickOwner();
        for (const emp of shuffled) {
          const status = d <= -2 ? (Math.random() < 0.94 ? "COMPLETED" : Math.random() < 0.5 ? "NO_SHOW" : "CANCELLED")
            : d === -1 ? "COMPLETED" : statuses[Math.floor(Math.random() * statuses.length)];
          if (status === "CANCELLED" || status === "NO_SHOW") {
            deploymentCount++;
            await db.deployment.create({
              data: {
                date, employeeId: emp.id, propertyId: p.id, shift, status,
                billingRate: p.billingRate, payoutRate: p.payoutRate,
                billingAmount: 0, payoutAmount: 0,
                createdById: owner.id, createdByName: owner.name,
                workCategory: "Restaurant service",
              },
            });
            continue;
          }
          const adjustment = Math.random() < 0.08 ? r2(50 + Math.random() * 150) : 0;
          deploymentCount++;
          await db.deployment.create({
            data: {
              date, employeeId: emp.id, propertyId: p.id, shift, status,
              billingRate: p.billingRate, payoutRate: p.payoutRate,
              billingAmount: p.billingRate + adjustment, payoutAmount: p.payoutRate,
              adjustmentAmount: adjustment,
              adjustmentNote: adjustment ? "Festival overtime" : null,
              createdById: owner.id, createdByName: owner.name,
              workCategory: "Restaurant service",
            },
          });
        }
      }
    }
  }
  console.log(`Deployments: ${deploymentCount}`);

  // ---- Payments: pay ~75% of property-day billing FIFO, leave some outstanding ----
  for (const p of properties) {
    const deployments = await db.deployment.findMany({
      where: { propertyId: p.id, status: { in: ["COMPLETED", "CONFIRMED", "PARTIAL"] } },
      orderBy: { date: "asc" },
    });
    const byDay = new Map<string, { date: Date; amount: number }>();
    for (const dep of deployments) {
      const key = dep.date.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { date: dep.date, amount: 0 };
      cur.amount += dep.billingAmount;
      byDay.set(key, cur);
    }
    let days = [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
    // last ~6 days stay largely unpaid; older days ~90% paid
    const payable = days.filter(x => x.date < day(-6));
    for (const dayAmt of payable) {
      if (Math.random() < 0.9) {
        const owner = pickOwner();
        const amount = Math.random() < 0.12 ? r2(dayAmt.amount * 0.5) : dayAmt.amount;
        await db.propertyPayment.create({
          data: {
            propertyId: p.id, date: new Date(dayAmt.date.getTime() + 86400000),
            amount, method: ["UPI", "BANK", "CASH"][Math.floor(Math.random() * 3)],
            reference: `TXN${Math.floor(100000 + Math.random() * 899999)}`,
            receivedById: owner.id, receivedByName: owner.name,
          },
        });
      }
    }
    // weekly recent payments
    days = days.filter(x => x.date >= day(-6));
    if (days.length && Math.random() < 0.6) {
      const owner = pickOwner();
      const amount = r2(days[0].amount);
      await db.propertyPayment.create({
        data: {
          propertyId: p.id, date: day(-1), amount, method: "UPI",
          receivedById: owner.id, receivedByName: owner.name,
        },
      });
    }
  }

  // ---- Advances ----
  for (let i = 0; i < 18; i++) {
    const emp = activeEmployees[Math.floor(Math.random() * activeEmployees.length)];
    const owner = pickOwner();
    await db.advance.create({
      data: {
        employeeId: emp.id, date: day(-Math.floor(Math.random() * 35)),
        amount: [1000, 1500, 2000, 2500, 3000, 5000][Math.floor(Math.random() * 6)],
        reason: ["Family emergency", "Festival", "Rent", "Medical", "Personal"][Math.floor(Math.random() * 5)],
        method: ["UPI", "CASH", "BANK"][Math.floor(Math.random() * 3)],
        givenById: owner.id, givenByName: owner.name,
      },
    });
  }

  // ---- Adjustments ----
  for (let i = 0; i < 12; i++) {
    const emp = activeEmployees[Math.floor(Math.random() * activeEmployees.length)];
    const owner = pickOwner();
    const isBonus = Math.random() < 0.6;
    await db.adjustment.create({
      data: {
        employeeId: emp.id, date: day(-Math.floor(Math.random() * 25)),
        type: isBonus ? (Math.random() < 0.5 ? "BONUS" : "OVERTIME") : (Math.random() < 0.5 ? "DEDUCTION" : "PENALTY"),
        amount: isBonus ? [200, 300, 500, 750][Math.floor(Math.random() * 4)] : [-200, -300, -500][Math.floor(Math.random() * 3)],
        reason: isBonus ? "Extra shift coverage" : "Late attendance",
        createdById: owner.id, createdByName: owner.name,
      },
    });
  }

  // ---- Recurring expenses ----
  await db.recurringExpense.createMany({
    data: [
      { name: "Head Office Rent", business: "MANPOWER", categoryId: cats["MANPOWER:Office Rent"], categoryName: "Office Rent", amount: 25000, startDate: day(-90), lastGeneratedMonth: prevMonthLabel(1) },
      { name: "Internet & Phone", business: "MANPOWER", categoryId: cats["MANPOWER:Software"], categoryName: "Software", amount: 3200, startDate: day(-90), lastGeneratedMonth: prevMonthLabel(1) },
      { name: "Garage Parking", business: "TRANSPORT", categoryId: cats["TRANSPORT:Toll & Parking"], categoryName: "Toll & Parking", amount: 4000, startDate: day(-90), lastGeneratedMonth: prevMonthLabel(1) },
    ],
  });

  // ---- Manpower expenses ----
  const mpCats = ["Food & Refreshments", "Travel", "Recruitment", "Uniforms", "Marketing", "Miscellaneous", "Office Rent"];
  for (let i = 0; i < 55; i++) {
    const owner = pickOwner();
    const catName = mpCats[Math.floor(Math.random() * mpCats.length)];
    await db.expense.create({
      data: {
        date: day(-Math.floor(Math.random() * 38)),
        business: "MANPOWER",
        categoryId: cats[`MANPOWER:${catName}`], categoryName: catName,
        amount: r2(200 + Math.random() * 4800),
        method: ["UPI", "CASH", "BANK"][Math.floor(Math.random() * 3)],
        description: `${catName} expense`,
        spentById: owner.id, spentByName: owner.name,
        createdById: owner.id, createdByName: owner.name,
      },
    });
  }

  // ---- Vehicles ----
  const vehicleDefs: [string, string, string, number, number, number, number][] = [
    ["MH12 AB 1234", "Toyota Innova Crysta", "Toyota", 2022, 1850000, 1400000, 42000],
    ["MH14 CD 5678", "Tempo Traveller 17-Str", "Force", 2021, 1600000, 900000, 28000],
  ];
  const vehicles: { id: string; name: string }[] = [];
  for (let i = 0; i < vehicleDefs.length; i++) {
    const [reg, name, make, year, price, loan, emi] = vehicleDefs[i];
    vehicles.push(
      await db.vehicle.create({
        data: {
          code: `VEH-${String(i + 1).padStart(3, "0")}`, registrationNumber: reg, name, make, year,
          model: name.split(" ").slice(1).join(" "),
          purchaseDate: day(-700 + i * 60), purchasePrice: price,
          status: i === 0 ? "TRIP" : "AVAILABLE",
          insuranceCompany: ["ICICI Lombard", "Bajaj Allianz"][i],
          insuranceNumber: `INS${900000 + i}`,
          insuranceExpiry: day(18 + i * 40),
          fitnessExpiry: day(120 + i * 30),
          permitInfo: "All India Tourist Permit",
          loanAmount: loan, monthlyEmi: emi, emiStartDate: day(-500), emiCount: 48,
        },
      })
    );
  }

  // ---- Clients ----
  const clientDefs: [string, string, string][] = [
    ["Rajesh Gupta", "Gupta Travels", "+91 90310 22001"],
    ["Priyanka Mehta", "Mehta Corp Events", "+91 90310 22002"],
    ["Farhan Ali", "Ali Holidays", "+91 90310 22003"],
    ["Sneha Kulkarni", "Kulkarni Logistics", "+91 90310 22004"],
    ["Tarun Sethi", "Sethi & Sons", "+91 90310 22005"],
    ["Ananya Bose", "Bose Weddings", "+91 90310 22006"],
  ];
  const clients: { id: string; name: string }[] = [];
  for (const [name, company, phone] of clientDefs) {
    clients.push(await db.client.create({ data: { name, company, phone, whatsapp: phone, email: `${name.split(" ")[0].toLowerCase()}@example.com`, address: "Pune" } }));
  }

  // ---- Trips ----
  // Active 3-day rental on vehicle 0
  await db.trip.create({
    data: {
      vehicleId: vehicles[0].id, clientId: clients[0].id,
      startAt: new Date(Date.now() - 86400000), endAt: day(2), tripType: "TRIP", rentalType: "OUTSTATION",
      pickup: "Pune", destination: "Goa", driver: "Salim Khan",
      agreedAmount: 32000, advanceReceived: 15000, paidAmount: 15000,
      status: "ACTIVE", fuelResponsibility: "CLIENT",
      createdByName: pickOwner().name,
    },
  });
  // Completed trips over past month
  for (let i = 0; i < 14; i++) {
    const v = vehicles[i % 2];
    const c = clients[Math.floor(Math.random() * clients.length)];
    const start = day(-2 - Math.floor(Math.random() * 30));
    const duration = 1 + Math.floor(Math.random() * 3);
    const amount = [3500, 5000, 8000, 12000, 15000][Math.floor(Math.random() * 5)];
    const paidFull = Math.random() < 0.75;
    await db.trip.create({
      data: {
        vehicleId: v.id, clientId: c.id, startAt: start, endAt: new Date(start.getTime() + duration * 86400000),
        tripType: Math.random() < 0.5 ? "RENTAL" : "TRIP",
        rentalType: ["DAILY", "OUTSTATION", "LOCAL"][Math.floor(Math.random() * 3)],
        pickup: "Pune", destination: ["Mumbai", "Nashik", "Lonavala", "Local", "Shirdi"][Math.floor(Math.random() * 5)],
        agreedAmount: amount, paidAmount: paidFull ? amount : r2(amount * 0.4),
        paymentStatus: paidFull ? "PAID" : "PARTIAL", status: "COMPLETED",
        fuelResponsibility: Math.random() < 0.5 ? "OWNER" : "CLIENT",
        createdByName: pickOwner().name,
      },
    });
  }
  // Upcoming booking
  await db.trip.create({
    data: {
      vehicleId: vehicles[1].id, clientId: clients[1].id, startAt: day(3), endAt: day(5),
      tripType: "TRIP", rentalType: "OUTSTATION", pickup: "Pune", destination: "Mahabaleshwar",
      agreedAmount: 14000, status: "CONFIRMED", createdByName: pickOwner().name,
    },
  });

  // ---- Vehicle expenses ----
  const trCats = ["Fuel", "Service", "Repairs", "Tyres", "Toll & Parking", "Driver Salary", "Cleaning"];
  for (let i = 0; i < 30; i++) {
    const v = vehicles[i % 2];
    const owner = pickOwner();
    const catName = trCats[Math.floor(Math.random() * trCats.length)];
    await db.expense.create({
      data: {
        date: day(-Math.floor(Math.random() * 35)), business: "TRANSPORT",
        categoryId: cats[`TRANSPORT:${catName}`], categoryName: catName,
        amount: r2(300 + Math.random() * 5500),
        method: ["UPI", "CASH", "CARD"][Math.floor(Math.random() * 3)],
        description: `${catName} — ${v.name}`,
        vehicleId: v.id, vehicleName: v.name,
        spentById: owner.id, spentByName: owner.name,
        createdById: owner.id, createdByName: owner.name,
      },
    });
  }

  // ---- EMI payments (last 3 months paid, current pending) ----
  for (const v of vehicles) {
    for (let m = 3; m >= 0; m--) {
      const base = day(-m * 30);
      const month = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
      const paid = m > 0;
      const emi = await db.vehicleEmiPayment.create({
        data: {
          vehicleId: v.id, month, dueDate: new Date(base.getFullYear(), base.getMonth(), 5),
          amount: v === vehicles[0] ? 42000 : 28000,
          status: paid ? "PAID" : "PENDING", paidDate: paid ? new Date(base.getFullYear(), base.getMonth(), 4) : null,
        },
      });
      if (paid) {
        await db.expense.create({
          data: {
            date: new Date(base.getFullYear(), base.getMonth(), 4), business: "TRANSPORT",
            categoryId: cats["TRANSPORT:EMI"], categoryName: "EMI",
            amount: emi.amount, method: "BANK", description: `EMI ${month} — ${v.name}`,
            vehicleId: v.id, vehicleName: v.name, reference: `EMI-${emi.id}`,
            spentByName: "System", createdByName: "System",
          },
        });
      }
    }
  }

  // ---- Maintenance ----
  await db.maintenance.create({
    data: { vehicleId: vehicles[1].id, date: day(-10), type: "SERVICE", description: "60,000 km scheduled service", cost: 6500, status: "DONE", createdByName: pickOwner().name },
  });
  await db.maintenance.create({
    data: { vehicleId: vehicles[0].id, date: day(4), type: "REPAIR", description: "AC cooling issue — inspection booked", status: "SCHEDULED", createdByName: pickOwner().name },
  });

  console.log("Seed complete.");
  console.log(`  Owners: ${owners.length} (password: owner123)`);
  console.log(`  Employees: ${employees.length}, Properties: ${properties.length}`);
  console.log(`  Vehicles: ${vehicles.length}, Clients: ${clients.length}`);
}

function prevMonthLabel(back: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

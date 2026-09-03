"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ViewProps } from "@/components/view-types";
import {
  LayoutDashboard, Users, UserRound, Building2, ScrollText, CalendarCheck, Wallet, HandCoins,
  ReceiptText, Receipt, Truck, CarFront, Contact2, Route, BarChart3, Crown, History, Bell,
  Settings, FileText, Building, Search,
} from "lucide-react";

// Lazy-loaded view registry — each entry maps a view id to its component.
function load(loader: () => Promise<{ default: ComponentType<ViewProps> }>) {
  return dynamic(loader, {
    loading: () => <ViewSkeleton />,
  });
}

export interface ViewDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "MAIN" | "MANPOWER" | "TRANSPORT" | "SYSTEM";
  description?: string;
  component: ComponentType<ViewProps>;
  /** hidden from navigation menus (detail views) */
  hidden?: boolean;
}

export const VIEWS: ViewDef[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "MAIN", description: "Combined business overview", component: load(() => import("@/components/views/dashboard-view")) },
  { id: "manpower", label: "Manpower", icon: Users, group: "MANPOWER", description: "Staffing business control", component: load(() => import("@/components/views/manpower-dashboard-view")) },
  { id: "employees", label: "Employees", icon: UserRound, group: "MANPOWER", component: load(() => import("@/components/views/employees-view")) },
  { id: "employee-detail", label: "Employee", icon: UserRound, group: "MANPOWER", hidden: true, component: load(() => import("@/components/views/employee-detail-view")) },
  { id: "properties", label: "Properties", icon: Building2, group: "MANPOWER", component: load(() => import("@/components/views/properties-view")) },
  { id: "property-detail", label: "Property", icon: Building, group: "MANPOWER", hidden: true, component: load(() => import("@/components/views/property-detail-view")) },
  { id: "contracts", label: "Contracts & Rates", icon: ScrollText, group: "MANPOWER", component: load(() => import("@/components/views/contracts-view")) },
  { id: "deployments", label: "Deployments", icon: CalendarCheck, group: "MANPOWER", description: "Daily work records & attendance", component: load(() => import("@/components/views/deployments-view")) },
  { id: "payments", label: "Collections", icon: Wallet, group: "MANPOWER", description: "Property payments & receivables", component: load(() => import("@/components/views/payments-view")) },
  { id: "advances", label: "Advances", icon: HandCoins, group: "MANPOWER", component: load(() => import("@/components/views/advances-view")) },
  { id: "settlements", label: "Settlements", icon: ReceiptText, group: "MANPOWER", description: "Monthly payroll & statements", component: load(() => import("@/components/views/settlements-view")) },
  { id: "expenses", label: "Expenses", icon: Receipt, group: "SYSTEM", component: load(() => import("@/components/views/expenses-view")) },
  { id: "transport", label: "Transport", icon: Truck, group: "TRANSPORT", description: "Vehicle business control", component: load(() => import("@/components/views/transport-dashboard-view")) },
  { id: "vehicles", label: "Vehicles", icon: CarFront, group: "TRANSPORT", component: load(() => import("@/components/views/vehicles-view")) },
  { id: "vehicle-detail", label: "Vehicle", icon: CarFront, group: "TRANSPORT", hidden: true, component: load(() => import("@/components/views/vehicle-detail-view")) },
  { id: "clients", label: "Clients", icon: Contact2, group: "TRANSPORT", component: load(() => import("@/components/views/clients-view")) },
  { id: "trips", label: "Trips & Rentals", icon: Route, group: "TRANSPORT", component: load(() => import("@/components/views/trips-view")) },
  { id: "reports", label: "Reports", icon: BarChart3, group: "SYSTEM", component: load(() => import("@/components/views/reports-view")) },
  { id: "owners", label: "Owners", icon: Crown, group: "SYSTEM", component: load(() => import("@/components/views/owners-view")) },
  { id: "audit", label: "Audit Log", icon: History, group: "SYSTEM", component: load(() => import("@/components/views/audit-view")) },
  { id: "notifications", label: "Notifications", icon: Bell, group: "SYSTEM", hidden: true, component: load(() => import("@/components/views/notifications-view")) },
  { id: "search", label: "Search", icon: Search, group: "SYSTEM", hidden: true, component: load(() => import("@/components/views/search-view")) },
  { id: "settings", label: "Settings", icon: Settings, group: "SYSTEM", component: load(() => import("@/components/views/settings-view")) },
  { id: "statement", label: "Statement", icon: FileText, group: "SYSTEM", hidden: true, component: load(() => import("@/components/views/statement-view")) },
];

export function getView(id: string): ViewDef | undefined {
  return VIEWS.find((v) => v.id === id);
}

export function ViewSkeleton() {
  return (
    <div className="space-y-4 p-1" aria-busy="true" aria-label="Loading view">
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

// Money & number formatting helpers — shared client + server. INR focused.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatINR(n: number | null | undefined, opts?: { compact?: boolean; decimals?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "₹0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (opts?.compact) {
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2).replace(/\.00$/, "")}Cr`;
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2).replace(/\.00$/, "")}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  })}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return n.toLocaleString("en-IN");
}

export function parseAmount(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? round2(n) : 0;
}

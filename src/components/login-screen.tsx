"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { Loader2, Lock, LogIn, ShieldCheck, TrendingUp, Truck, Users, Building2 } from "lucide-react";

interface OwnerRow { id: string; name: string; username: string; isActive: boolean }

export function LoginScreen() {
  const { login } = useAuth();
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Demo helper: load owner list for one-tap login (names only, no sensitive data)
    api.get<{ items: OwnerRow[] }>("/api/auth/demo-owners")
      .then((data) => setOwners(data.items))
      .catch(() => {});
  }, []);

  const doLogin = async (u: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(u, p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50 via-background to-background dark:from-emerald-950/30">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-10 lg:flex-row lg:items-center lg:gap-14">
        {/* Brand panel */}
        <section className="mb-10 lg:mb-0 lg:max-w-lg" aria-label="BizHub introduction">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
              <TrendingUp className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">BizHub</h1>
              <p className="text-sm text-muted-foreground">Business Control Center</p>
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            One control center for<br />
            <span className="text-emerald-600 dark:text-emerald-400">both your businesses.</span>
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Enter information once — the system calculates billing, payouts, advances, margins and monthly
            settlements automatically. Owners only review, approve and act.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900"><Users className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden /></div>
              <div>
                <p className="text-sm font-semibold">Manpower</p>
                <p className="text-xs text-muted-foreground">Staff supply to properties</p>
              </div>
            </li>
            <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900"><Truck className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden /></div>
              <div>
                <p className="text-sm font-semibold">Transport</p>
                <p className="text-xs text-muted-foreground">Vehicle rental & trips</p>
              </div>
            </li>
            <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900"><Building2 className="h-5 w-5 text-teal-700 dark:text-teal-300" aria-hidden /></div>
              <div>
                <p className="text-sm font-semibold">Financial separation</p>
                <p className="text-xs text-muted-foreground">Records never mix</p>
              </div>
            </li>
            <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="rounded-lg bg-muted p-2"><ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden /></div>
              <div>
                <p className="text-sm font-semibold">Audited & secure</p>
                <p className="text-xs text-muted-foreground">Every action tracked</p>
              </div>
            </li>
          </ul>
        </section>

        {/* Login card */}
        <section className="w-full max-w-md self-center lg:self-auto" aria-label="Login form">
          <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold">Owner sign in</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">All owners have equal full access.</p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                doLogin(username.trim(), password);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. yash"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  className="h-11 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11 rounded-xl"
                  required
                />
              </div>
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}
              <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-2 h-4 w-4" aria-hidden />}
                Sign in
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden /> Sessions expire automatically after 30 days.
              </p>
            </form>

            {owners.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Demo — one-tap login (password: owner123)</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {owners.slice(0, 8).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => doLogin(o.username, "owner123")}
                      disabled={busy}
                      className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-medium hover:bg-primary/10 hover:text-primary disabled:opacity-50 min-h-[30px]"
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

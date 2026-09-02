"use client";

import { Providers, useAuth, useNav } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { LoginScreen } from "@/components/login-screen";
import { getView } from "@/lib/views";
import { Loader2 } from "lucide-react";

function AppBody() {
  const { owner, loading } = useAuth();
  const { view, params, navigate } = useNav();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading application">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg">
            <span className="text-xl font-bold">B</span>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">Loading BizHub…</p>
        </div>
      </div>
    );
  }

  if (!owner) return <LoginScreen />;

  const viewDef = getView(view) ?? getView("dashboard")!;
  const ViewComponent = viewDef.component;
  return (
    <AppShell>
      {/* keyed by view+params so detail views remount cleanly on navigation */}
      <ViewComponent key={`${view}:${JSON.stringify(params)}`} params={params} navigate={navigate} />
    </AppShell>
  );
}

export default function Page() {
  return (
    <Providers>
      <AppBody />
    </Providers>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth, useNav, useBusiness, type BusinessScope } from "@/components/providers";
import { usePwaInstall } from "@/components/shared/pwa-install";
import { CommandPalette } from "@/components/shared/command-palette";
import { VIEWS, getView } from "@/lib/views";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Bell, Building2, CarFront, Check, ChevronsLeft, Home, Languages, LayoutGrid, LogOut, Moon, Search, Smartphone, Sun,
  Truck, Users, Wallet, ShieldCheck, Boxes, AlertTriangle, AlertCircle, Info,
} from "lucide-react";
import { useLang, t, viewLabel } from "@/lib/i18n";

const GROUP_ICONS: Record<string, React.ReactNode> = {
  MAIN: <Home className="h-3 w-3" />,
  MANPOWER: <Users className="h-3 w-3" />,
  TRANSPORT: <Truck className="h-3 w-3" />,
  SYSTEM: <Boxes className="h-3 w-3" />,
};

const GROUP_ACCENT: Record<string, string> = {
  MAIN: "",
  MANPOWER: "text-emerald-600 dark:text-emerald-400",
  TRANSPORT: "text-amber-600 dark:text-amber-400",
  SYSTEM: "",
};

// Desktop sidebar (collapsible) — also the content of the mobile "More" sheet.
function SideNav({ collapsed, onToggle, onNavigate }: { collapsed?: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const { view, navigate } = useNav();
  const { scope } = useBusiness();
  const { lang } = useLang();

  const groups = useMemo(() => {
    const order = ["MAIN", "MANPOWER", "TRANSPORT", "SYSTEM"] as const;
    return order.map((g) => ({
      key: g,
      items: VIEWS.filter((v) => v.group === g && !v.hidden && !(g === "MAIN" && v.id === "dashboard" && collapsed === undefined) ),
    })).filter((g) => g.items.length > 0);
  }, [collapsed]);

  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 px-3 py-4", collapsed ? "justify-center" : "justify-between")}>
        <button
          className="flex items-center gap-2.5 min-w-0"
          onClick={() => { navigate("dashboard"); onNavigate?.(); }}
          aria-label="Go to dashboard"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow-sm">
            <span className="text-sm">B</span>
          </div>
          {!collapsed && (
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-bold leading-tight">BizHub</p>
              <p className="truncate text-[10px] text-muted-foreground leading-tight">Business Control Center</p>
            </div>
          )}
        </button>
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex h-8 w-8" onClick={onToggle} aria-label="Collapse sidebar">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
      {/* Keyed by view so the nav's internal scroll resets on navigation */}
      <ScrollArea key={view} className="min-h-0 flex-1 px-2 pb-4">
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {!collapsed && (
                <p className={cn("mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", GROUP_ACCENT[group.key])}>
                  {GROUP_ICONS[group.key]}
                  {t(lang, `nav.group.${group.key}`)}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items
                  .filter((v) => scope === "ALL" || v.group === "MAIN" || v.group === "SYSTEM" || v.group === scope)
                  .map((v) => {
                    const active = view === v.id || (v.id === "manpower" && view === "manpower") || (v.id === "transport" && view === "transport");
                    return (
                      <li key={v.id}>
                        <button
                          onClick={() => { navigate(v.id); onNavigate?.(); }}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors min-h-[40px]",
                            collapsed && "justify-center px-0",
                            active
                              ? "bg-primary/12 text-primary font-semibold"
                              : "text-muted-foreground font-medium hover:bg-muted hover:text-foreground"
                          )}
                          title={collapsed ? viewLabel(lang, v.id, v.label) : undefined}
                        >
                          <v.icon className={cn("h-4 w-4 shrink-0", active && GROUP_ACCENT[group.key], !active && "text-muted-foreground")} aria-hidden />
                          {!collapsed && <span className="truncate">{viewLabel(lang, v.id, v.label)}</span>}
                        </button>
                      </li>
                    );
                  })}
              </ul>
              {!collapsed && <Separator className="mt-3" />}
            </div>
          ))}
        </div>
      </ScrollArea>
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

// Live notification shape (subset of the engine payload).
interface AppNotification {
  key: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  view: string;
  params?: Record<string, string>;
}

const SEVERITY_ICON: Record<AppNotification["severity"], React.ReactNode> = {
  CRITICAL: <AlertTriangle className="h-5 w-5 text-red-500" />,
  WARNING: <AlertCircle className="h-5 w-5 text-amber-500" />,
  INFO: <Info className="h-5 w-5 text-sky-500" />,
};

// Sticky top header
function TopBar({ onOpenMore, onOpenPalette }: { onOpenMore: () => void; onOpenPalette: () => void }) {
  const { owner, logout } = useAuth();
  const { navigate } = useNav();
  const { lang, setLang } = useLang();
  const [notifCount, setNotifCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const { canInstall, install } = usePwaInstall();
  const prevKeysRef = useRef<Set<string> | null>(null);
  const firstLoadRef = useRef(true);
  const pulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const items = await import("@/lib/api-client").then(({ api }) =>
          api.get<AppNotification[]>("/api/notifications")
        );
        if (!alive || !Array.isArray(items)) return;
        setNotifCount(items.length);
        const prevKeys = prevKeysRef.current;
        prevKeysRef.current = new Set(items.map((n) => n.key));
        // Announce only genuine arrivals (skip initial load), when the tab is visible.
        if (!firstLoadRef.current && prevKeys && document.visibilityState === "visible") {
          const fresh = items.filter((n) => !prevKeys.has(n.key));
          if (fresh.length > 0) {
            const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
            const headline =
              [...fresh].sort((a, b) => rank[a.severity] - rank[b.severity])[0] ?? fresh[0];
            toast(headline.title, {
              description:
                fresh.length > 1
                  ? `${headline.message} — and ${fresh.length - 1} more new alert${fresh.length === 2 ? "" : "s"}.`
                  : headline.message,
              icon: SEVERITY_ICON[headline.severity] ?? SEVERITY_ICON.INFO,
              action: { label: "View", onClick: () => navigate("notifications") },
            });
            // Bell ripple — brief ping so the eye is drawn to the new alert.
            setPulse(true);
            if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
            pulseTimerRef.current = window.setTimeout(() => setPulse(false), 2400);
          }
        }
        firstLoadRef.current = false;
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60_000);
    // Re-check immediately when the user returns to the tab.
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false; clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, [navigate]);

  const initials = (owner?.name ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:px-5">
        <button className="flex items-center gap-2 md:hidden" onClick={() => navigate("dashboard")} aria-label="BizHub home">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold">
            <span className="text-xs">B</span>
          </div>
          <span className="text-sm font-bold">BizHub</span>
        </button>

        <Button variant="ghost" size="icon" className="hidden lg:inline-flex h-9 w-9 lg:hidden" aria-hidden tabIndex={-1} />

        {/* Global search trigger — opens the command palette (Ctrl K) */}
        <button
          onClick={onOpenPalette}
          className="ml-0 hidden sm:flex h-9 min-w-0 flex-1 max-w-md items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted hover:border-primary/40 transition-colors"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate whitespace-nowrap hidden md:inline">{t(lang, "topbar.search")}</span>
          <span className="md:hidden whitespace-nowrap">{t(lang, "topbar.searchShort")}</span>
          <kbd className="ml-auto hidden md:inline-flex shrink-0 rounded border bg-background px-1.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <Button variant="ghost" size="icon" className="sm:hidden h-10 w-10" onClick={onOpenPalette} aria-label="Open command palette">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 relative" onClick={() => navigate("notifications")} aria-label={`Notifications${notifCount ? `, ${notifCount} active` : ""}`}>
            {pulse && <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" aria-hidden />}
            <Bell className={cn("h-5 w-5 transition-transform", pulse && "scale-110")} />
            {notifCount > 0 && (
              <span
                className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-background"
                aria-hidden
              >
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </Button>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t(lang, "topbar.language")} title={t(lang, "topbar.language")}>
                <Languages className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>{t(lang, "topbar.language")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLang("en")} aria-checked={lang === "en"} role="menuitemradio">
                {lang === "en" ? <Check className="mr-2 h-4 w-4 text-primary" /> : <span className="mr-2 inline-block h-4 w-4" aria-hidden />}
                {t(lang, "lang.en")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLang("hi")} aria-checked={lang === "hi"} role="menuitemradio">
                {lang === "hi" ? <Check className="mr-2 h-4 w-4 text-primary" /> : <span className="mr-2 inline-block h-4 w-4" aria-hidden />}
                {t(lang, "lang.hi")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-0.5 flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Owner menu">
                <Avatar className="h-9 w-9 border">
                  <AvatarFallback className="bg-emerald-100 text-emerald-800 text-xs font-bold dark:bg-emerald-900 dark:text-emerald-200">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <p className="text-sm font-semibold">{owner?.name}</p>
                <p className="text-xs text-muted-foreground">@{owner?.username}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("owners")}>
                <ShieldCheck className="mr-2 h-4 w-4" /> {t(lang, "menu.owners")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("settings")}>
                <Building2 className="mr-2 h-4 w-4" /> {t(lang, "menu.settings")}
              </DropdownMenuItem>
              {canInstall && (
                <DropdownMenuItem
                  onClick={() =>
                    install().then((r) => {
                      if (r === "accepted") toast.success("BizHub installed — find it on your home screen");
                    })
                  }
                >
                  <Smartphone className="mr-2 h-4 w-4" /> {t(lang, "menu.install")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-red-600 dark:text-red-400">
                <LogOut className="mr-2 h-4 w-4" /> {t(lang, "menu.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function BusinessBanner() {
  const { scope, setScope } = useBusiness();
  const { navigate } = useNav();
  const { lang } = useLang();
  const scopeInfo = {
    ALL: { label: t(lang, "scope.badge.ALL"), cls: "bg-muted text-muted-foreground border" },
    MANPOWER: { label: t(lang, "scope.badge.MANPOWER"), cls: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300" },
    TRANSPORT: { label: t(lang, "scope.badge.TRANSPORT"), cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300" },
  }[scope];
  const options: { key: BusinessScope; label: string }[] = [
    { key: "ALL", label: t(lang, "scope.ALL") },
    { key: "MANPOWER", label: t(lang, "scope.MANPOWER") },
    { key: "TRANSPORT", label: t(lang, "scope.TRANSPORT") },
  ];
  return (
    <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 pt-2.5 sm:px-5">
      <div className="flex items-center gap-2 overflow-hidden">
        <Badge variant="outline" className={cn("shrink-0 font-semibold", scopeInfo.cls)}>{scopeInfo.label}</Badge>
        <span className="hidden text-xs text-muted-foreground truncate sm:inline">{t(lang, `scope.hint.${scope}`)}</span>
      </div>
      <div className="flex shrink-0 items-center rounded-full border bg-card p-0.5" role="group" aria-label="Business scope">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => { setScope(o.key); navigate(o.key === "MANPOWER" ? "manpower" : o.key === "TRANSPORT" ? "transport" : "dashboard"); }}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[26px]",
              scope === o.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={scope === o.key}
          >
            {o.key !== "ALL" && (
              <span
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", o.key === "MANPOWER" ? "bg-emerald-500" : "bg-amber-500")}
                aria-hidden
              />
            )}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const { view, navigate } = useNav();
  const { setScope } = useBusiness();
  const { lang } = useLang();
  const items = [
    { key: "dashboard", label: t(lang, "nav.home"), icon: Home, action: () => { setScope("ALL"); navigate("dashboard"); } },
    { key: "manpower", label: viewLabel(lang, "manpower", "Manpower"), icon: Users, action: () => { setScope("MANPOWER"); navigate("manpower"); } },
    { key: "transport", label: viewLabel(lang, "transport", "Transport"), icon: Truck, action: () => { setScope("TRANSPORT"); navigate("transport"); } },
    { key: "payments", label: viewLabel(lang, "payments", "Collections"), icon: Wallet, action: () => navigate("payments") },
  ];
  return (
    <nav aria-label="Bottom navigation" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={item.action}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors active:scale-95",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-all duration-300 ease-out",
                  active ? "-translate-y-px scale-110 drop-shadow-sm" : "scale-100"
                )}
                aria-hidden
              />
              {item.label}
              {/* animated active indicator — grows from center */}
              <span
                className={cn(
                  "h-0.5 rounded-full bg-primary transition-all duration-300 ease-out",
                  active ? "w-7 opacity-100" : "w-0 opacity-0"
                )}
                aria-hidden
              />
            </button>
          );
        })}
        <button
          onClick={onOpenMore}
          className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          aria-label="More menu"
        >
          <LayoutGrid className="h-5 w-5" aria-hidden />
          {t(lang, "nav.more")}
          <span className="h-0.5 w-6 rounded-full bg-transparent" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { navigate, view } = useNav();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentView = getView(view);
  const isWide = ["dashboard", "manpower", "transport"].includes(view);

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r bg-background transition-all md:block", collapsed ? "w-[68px]" : "w-60")}>
        <SideNav collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMore={() => setMoreOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <BusinessBanner />
        <main
          id="main-scroll"
          className={cn("mx-auto w-full max-w-[1600px] flex-1 px-3 pb-24 pt-3 sm:px-5 sm:pt-4 md:pb-10", !isWide && "max-w-[1400px]")}
          aria-label={currentView?.label ?? "Content"}
        >
          {/* Keyed by view → remounts on navigation and plays the enter animation */}
          <div key={view} className="view-enter">
            {children}
          </div>
        </main>
        <footer className="mt-auto hidden border-t bg-background py-3 md:block">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 text-[11px] text-muted-foreground">
            <p>BizHub — one control center for Manpower & Transport businesses.</p>
            <p className="tabular-nums">{new Date().getFullYear()} · All financial actions are audited.</p>
          </div>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav onOpenMore={() => setMoreOpen(true)} />

      {/* Global command palette (Ctrl/Cmd+K, search buttons) */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Mobile "More" sheet with full nav */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className="hidden" aria-hidden />
        <SheetContent side="left" className="w-[280px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>All navigation</SheetTitle>
          </SheetHeader>
          <SideNav onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { api, ApiError } from "@/lib/api-client";
import type { NavContextValue } from "@/components/view-types";

// ---------- Auth ----------

export interface Owner {
  id: string;
  name: string;
  username: string;
  mobile: string | null;
  isActive: boolean;
}

interface AuthContextValue {
  owner: Owner | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  owner: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ---------- Navigation ----------

interface NavState {
  view: string;
  params: Record<string, string>;
}

interface NavContextValueExt extends NavContextValue {
  view: string;
  params: Record<string, string>;
  navigate: (view: string, params?: Record<string, string>) => void;
  back: () => void;
  canGoBack: boolean;
}

const NavContext = createContext<NavContextValueExt>({
  view: "dashboard",
  params: {},
  navigate: () => {},
  back: () => {},
  canGoBack: false,
});

export const useNav = () => useContext(NavContext);

// ---------- Business context (ALL / MANPOWER / TRANSPORT) ----------

export type BusinessScope = "ALL" | "MANPOWER" | "TRANSPORT";

interface BusinessContextValue {
  scope: BusinessScope;
  setScope: (s: BusinessScope) => void;
}

const BusinessContext = createContext<BusinessContextValue>({ scope: "ALL", setScope: () => {} });
export const useBusiness = () => useContext(BusinessContext);

// ---------- Provider ----------

export function Providers({ children }: { children: React.ReactNode }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<NavState[]>([{ view: "dashboard", params: {} }]);
  const [scope, setScope] = useState<BusinessScope>("ALL");

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<Owner>("/api/auth/me");
      setOwner(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setOwner(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const me = await api.post<Owner>("/api/auth/login", { username, password });
      setOwner(me);
      setStack([{ view: "dashboard", params: {} }]);
      setScope("ALL");
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => {});
    setOwner(null);
    setStack([{ view: "dashboard", params: {} }]);
  }, []);

  const current = stack[stack.length - 1];
  const navigate = useCallback((view: string, params?: Record<string, string>) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top.view === view && JSON.stringify(top.params) === JSON.stringify(params ?? {})) return prev;
      return [...prev, { view, params: params ?? {} }];
    });
    // scroll main region to top on navigation
    requestAnimationFrame(() => {
      document.getElementById("main-scroll")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    });
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  useEffect(() => {
    const onPop = () => back();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [back]);

  const authValue = useMemo<AuthContextValue>(() => ({ owner, loading, login, logout, refresh }), [owner, loading, login, logout, refresh]);
  const navValue = useMemo<NavContextValueExt>(
    () => ({ view: current.view, params: current.params, navigate, back, canGoBack: stack.length > 1 }),
    [current, navigate, back, stack.length]
  );
  const businessValue = useMemo(() => ({ scope, setScope }), [scope]);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <AuthContext.Provider value={authValue}>
        <NavContext.Provider value={navValue}>
          <BusinessContext.Provider value={businessValue}>{children}</BusinessContext.Provider>
        </NavContext.Provider>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

"use client";

// Tracks the browser's beforeinstallprompt event so the app can offer a
// one-tap "Install BizHub" action (PWA install) from the owner menu / settings.
// Uses useSyncExternalStore — the canonical pattern for external browser state.
import { useCallback, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function standaloneQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia("(display-mode: standalone)");
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
  standaloneQuery()?.addEventListener("change", () => notify());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function usePwaInstall() {
  const available = useSyncExternalStore(
    subscribe,
    () => deferredPrompt !== null,
    () => false
  );
  const isStandalone = useSyncExternalStore(
    subscribe,
    () => standaloneQuery()?.matches ?? true,
    () => true
  );

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return outcome;
  }, []);

  return { canInstall: available && !isStandalone, isStandalone, install };
}

"use client";

import { useEffect } from "react";

// Registers the PWA service worker (client-only, production-safe).
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW is an enhancement; ignore failures (e.g. dev quirks)
      });
    }
  }, []);
  return null;
}

"use client";

import { useSyncExternalStore } from "react";

// Lightweight i18n scaffolding (SRS Phase 2) — EN + HI.
// Store pattern: module singleton + useSyncExternalStore (same canonical
// pattern as pwa-install.ts) so the persisted language is hydration-safe
// without setState-in-effect. Extend DICT / HI_VIEWS — never hardcode
// translated strings in components.

export type Lang = "en" | "hi";

const STORAGE_KEY = "bizhub-lang";

let current: Lang = "en";
if (typeof window !== "undefined") {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "hi" || saved === "en") current = saved;
  document.documentElement.lang = current === "hi" ? "hi" : "en";
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const langStore = {
  get(): Lang {
    return current;
  },
  set(next: Lang) {
    if (next !== "en" && next !== "hi") return;
    current = next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next === "hi" ? "hi" : "en";
    }
    emit();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** Hydration-safe language hook. */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(langStore.subscribe, langStore.get, () => "en" as Lang);
  return { lang, setLang: langStore.set };
}

// ---------------------------------------------------------------------------
// Dictionaries — flat dot-keys; missing keys fall back to English, then key.
// ---------------------------------------------------------------------------

export const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "nav.group.MAIN": "Overview",
    "nav.group.MANPOWER": "Manpower Business",
    "nav.group.TRANSPORT": "Transport Business",
    "nav.group.SYSTEM": "Manage",
    "nav.more": "More",
    "nav.home": "Home",
    "topbar.search": "Search employees, properties, vehicles…",
    "topbar.searchShort": "Search…",
    "topbar.language": "Language",
    "scope.ALL": "All",
    "scope.MANPOWER": "Manpower",
    "scope.TRANSPORT": "Transport",
    "scope.badge.ALL": "All Businesses",
    "scope.badge.MANPOWER": "Manpower Business",
    "scope.badge.TRANSPORT": "Transport Business",
    "scope.hint.ALL": "You are viewing all businesses — records never mix between businesses.",
    "scope.hint.MANPOWER": "You are viewing the Manpower business — records never mix between businesses.",
    "scope.hint.TRANSPORT": "You are viewing the Transport business — records never mix between businesses.",
    "menu.owners": "Owners",
    "menu.settings": "Business settings",
    "menu.audit": "Audit log",
    "menu.install": "Install app",
    "menu.logout": "Sign out",
    "common.view": "View",
    "common.viewAll": "View all",
    "common.refresh": "Refresh",
    "common.reports": "Reports",
    "dash.monthlySummary": "Monthly business summary",
    "dash.bothBusinesses": "both businesses",
    "dash.trend": "14-day performance",
    "dash.expenseSplit": "Expense split",
    "dash.activity": "Recent activity",
    "dash.collections": "Collections",
    "dash.attention": "Needs attention",
    "dash.quickActions": "Quick actions",
    "settings.language": "Language",
    "settings.languageDesc": "Choose the interface language. More languages and full coverage ship in Phase 2.",
    "lang.en": "English",
    "lang.hi": "हिन्दी",
    "lang.note": "Scaffolding: navigation, dashboard headings and common actions are translated; remaining screens stay English until full coverage lands in Phase 2.",
    "palette.placeholder": "Type a command or search…",
    "palette.goTo": "Go to",
    "palette.actions": "Quick actions",
    "palette.results": "Results",
    "palette.empty": "No matches found.",
    "palette.searchAll": "Open full search view",
    "palette.hint.open": "open",
    "palette.hint.nav": "navigate",
    "palette.hint.close": "close",
    "palette.checkAlerts": "Check alerts",
    "sr.employees": "Employees",
    "sr.properties": "Properties",
    "sr.vehicles": "Vehicles",
    "sr.clients": "Clients",
    "sr.expenses": "Expenses",
    "sr.deployments": "Deployments",
    "page.payments": "Collections",
    "page.payments.sub": "Property payments & receivables",
    "page.settlements": "Settlements",
    "page.settlements.sub": "Month-end payroll, finalize & payout",
    "page.deployments": "Deployments",
    "page.deployments.sub": "Daily work records & attendance",
    "col.date": "Date",
    "col.property": "Property",
    "col.employee": "Employee",
    "col.amount": "Amount",
    "col.method": "Method",
    "col.reference": "Reference",
    "col.receivedBy": "Received by",
    "col.days": "Days",
    "col.shifts": "D/N shifts",
    "col.gross": "Gross",
    "col.additions": "Additions",
    "col.advance": "Advance −",
    "col.net": "Net payable",
    "col.status": "Status",
    "col.shift": "Shift",
    "col.category": "Category",
    "col.billing": "Billing",
    "col.payout": "Payout",
    "col.paid": "Paid",
  },
  hi: {
    "nav.group.MAIN": "अवलोकन",
    "nav.group.MANPOWER": "मैनपावर व्यवसाय",
    "nav.group.TRANSPORT": "परिवहन व्यवसाय",
    "nav.group.SYSTEM": "प्रबंधन",
    "nav.more": "और",
    "nav.home": "होम",
    "topbar.search": "कर्मचारी, प्रॉपर्टी, वाहन खोजें…",
    "topbar.searchShort": "खोजें…",
    "topbar.language": "भाषा",
    "scope.ALL": "सभी",
    "scope.MANPOWER": "मैनपावर",
    "scope.TRANSPORT": "परिवहन",
    "scope.badge.ALL": "सभी व्यवसाय",
    "scope.badge.MANPOWER": "मैनपावर व्यवसाय",
    "scope.badge.TRANSPORT": "परिवहन व्यवसाय",
    "scope.hint.ALL": "आप सभी व्यवसाय देख रहे हैं — रिकॉर्ड कभी मिश्रित नहीं होते।",
    "scope.hint.MANPOWER": "आप मैनपावर व्यवसाय देख रहे हैं — रिकॉर्ड कभी मिश्रित नहीं होते।",
    "scope.hint.TRANSPORT": "आप परिवहन व्यवसाय देख रहे हैं — रिकॉर्ड कभी मिश्रित नहीं होते।",
    "menu.owners": "मालिक",
    "menu.settings": "व्यावसायिक सेटिंग",
    "menu.audit": "ऑडिट लॉग",
    "menu.install": "ऐप इंस्टॉल करें",
    "menu.logout": "साइन आउट",
    "common.view": "देखें",
    "common.viewAll": "सभी देखें",
    "common.refresh": "रिफ्रेश",
    "common.reports": "रिपोर्ट",
    "dash.monthlySummary": "मासिक व्यावसायिक सारांश",
    "dash.bothBusinesses": "दोनों व्यवसाय",
    "dash.trend": "14-दिन का प्रदर्शन",
    "dash.expenseSplit": "खर्च का विभाजन",
    "dash.activity": "हाल की गतिविधि",
    "dash.collections": "वसूली",
    "dash.attention": "ध्यान देने योग्य",
    "dash.quickActions": "त्वरित कार्रवाइयाँ",
    "settings.language": "भाषा",
    "settings.languageDesc": "इंटरफ़ेस की भाषा चुनें। अधिक भाषाएँ और पूर्ण कवरेज फेज़ 2 में।",
    "lang.en": "English",
    "lang.hi": "हिन्दी",
    "lang.note": "स्कैफ़ोल्डिंग: नेविगेशन, डैशबोर्ड शीर्षक और सामान्य कार्रवाइयाँ अनूदित हैं; शेष स्क्रीन फेज़ 2 तक अंग्रेज़ी में रहेंगे।",
    "palette.placeholder": "कमांड लिखें या खोजें…",
    "palette.goTo": "इस पर जाएँ",
    "palette.actions": "त्वरित कार्रवाइयाँ",
    "palette.results": "परिणाम",
    "palette.empty": "कोई मेल नहीं मिला।",
    "palette.searchAll": "पूर्ण खोज दृश्य खोलें",
    "palette.hint.open": "खोलें",
    "palette.hint.nav": "नेविगेट",
    "palette.hint.close": "बंद करें",
    "palette.checkAlerts": "अलर्ट देखें",
    "sr.employees": "कर्मचारी",
    "sr.properties": "प्रॉपर्टी",
    "sr.vehicles": "वाहन",
    "sr.clients": "ग्राहक",
    "sr.expenses": "खर्च",
    "sr.deployments": "तैनाती",
    "page.payments": "वसूली",
    "page.payments.sub": "प्रॉपर्टी भुगतान व प्राप्य",
    "page.settlements": "भुगतान",
    "page.settlements.sub": "मासिक पेरोल, फ़ाइनलाइज़ व वेतन भुगतान",
    "page.deployments": "तैनाती",
    "page.deployments.sub": "दैनिक कार्य रिकॉर्ड व उपस्थिति",
    "col.date": "दिनांक",
    "col.property": "प्रॉपर्टी",
    "col.employee": "कर्मचारी",
    "col.amount": "राशि",
    "col.method": "माध्यम",
    "col.reference": "संदर्भ",
    "col.receivedBy": "प्राप्तकर्ता",
    "col.days": "दिन",
    "col.shifts": "दि/रा शिफ्ट",
    "col.gross": "कुल",
    "col.additions": "अतिरिक्त",
    "col.advance": "अग्रिम −",
    "col.net": "देय शुद्ध",
    "col.status": "स्थिति",
    "col.shift": "शिफ्ट",
    "col.category": "श्रेणी",
    "col.billing": "बिलिंग",
    "col.payout": "वेतन",
    "col.paid": "भुगतान",
  },
};

/** Translate a dot-key with graceful fallback: lang → en → key itself. */
export function t(lang: Lang, key: string): string {
  return DICT[lang]?.[key] ?? DICT.en[key] ?? key;
}

/** Hindi labels for sidebar / bottom-nav view ids. Falls back to the English label. */
export const HI_VIEWS: Record<string, string> = {
  dashboard: "डैशबोर्ड",
  manpower: "मैनपावर",
  employees: "कर्मचारी",
  "employee-detail": "कर्मचारी",
  properties: "प्रॉपर्टी",
  "property-detail": "प्रॉपर्टी",
  contracts: "अनुबंध व दरें",
  deployments: "तैनाती",
  payments: "वसूली",
  advances: "अग्रिम",
  settlements: "भुगतान",
  expenses: "खर्च",
  transport: "परिवहन",
  vehicles: "वाहन",
  "vehicle-detail": "वाहन",
  clients: "ग्राहक",
  trips: "यात्राएँ",
  reports: "रिपोर्ट",
  owners: "मालिक",
  audit: "ऑडिट लॉग",
  notifications: "सूचनाएँ",
  search: "खोज",
  settings: "सेटिंग",
  statement: "विवरण",
};

export function viewLabel(lang: Lang, id: string, enLabel: string): string {
  if (lang !== "hi") return enLabel;
  return HI_VIEWS[id] ?? enLabel;
}

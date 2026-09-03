// Muted notification groups — shared between the notifications view (writer)
// and the TopBar bell (reader). localStorage + a custom event keeps both in
// sync without any server round-trip.

export const NOTIF_MUTED_KEY = "notif-muted-groups";
export const NOTIF_MUTED_EVENT = "bizhub:notif-muted";
/** Fired whenever the live notification set changes locally (dismissals). */
export const NOTIF_CHANGED_EVENT = "bizhub:notif-changed";

export function readMutedGroups(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTIF_MUTED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeMutedGroups(groups: string[]) {
  try {
    window.localStorage.setItem(NOTIF_MUTED_KEY, JSON.stringify(groups));
  } catch {
    // storage unavailable (private mode etc.) — mute just won't persist
  }
  window.dispatchEvent(new CustomEvent(NOTIF_MUTED_EVENT));
}

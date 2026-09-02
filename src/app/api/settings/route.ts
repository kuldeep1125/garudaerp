import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const SETTING_KEYS = {
  name: "businessName",
  address: "businessAddress",
  contact: "businessContact",
  gstin: "businessGstin",
  logoText: "businessLogoText",
} as const;

type SettingField = keyof typeof SETTING_KEYS;

async function loadBusiness() {
  const settings = await db.appSetting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } });
  const map = new Map(settings.map((s) => [s.key, s.value]));
  return {
    business: {
      name: map.get(SETTING_KEYS.name) ?? "BizHub",
      address: map.get(SETTING_KEYS.address) ?? "",
      contact: map.get(SETTING_KEYS.contact) ?? "",
      gstin: map.get(SETTING_KEYS.gstin) ?? "",
      logoText: map.get(SETTING_KEYS.logoText) ?? "",
    },
  };
}

// GET /api/settings — business profile (AppSetting key/value store).
export const GET = handleRoute(async () => {
  return loadBusiness();
});

// PUT /api/settings — partial upsert of business profile fields { name?, address?, contact?, gstin?, logoText? }.
export const PUT = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Partial<Record<SettingField, string>>>(req);
  const provided = (Object.keys(SETTING_KEYS) as SettingField[]).filter((f) => body[f] !== undefined);
  if (!provided.length) {
    throw new HttpError(400, `Nothing to update — provide any of: ${Object.keys(SETTING_KEYS).join(", ")}`);
  }

  const changed: Record<string, string> = {};
  for (const field of provided) {
    const key = SETTING_KEYS[field];
    const value = String(body[field] ?? "").trim();
    await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    changed[field] = value;
  }

  await logAudit({
    owner,
    action: "UPDATE",
    module: "SETTINGS",
    recordId: null,
    recordLabel: "Business settings updated",
    newValue: changed,
  });
  return loadBusiness();
});

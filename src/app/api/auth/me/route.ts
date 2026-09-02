import { handleRoute } from "@/lib/api-helpers";

export const GET = handleRoute(async ({ owner }) => owner);

// Trip serialization shared by /api/trips routes.
export function serializeTrip(t: {
  vehicle: { name: string; registrationNumber: string } | null;
  client: { name: string } | null;
} & Record<string, unknown>) {
  const { vehicle, client, ...rest } = t;
  return {
    ...rest,
    vehicleName: vehicle?.name ?? null,
    vehicleReg: vehicle?.registrationNumber ?? null,
    clientName: client?.name ?? null,
  };
}

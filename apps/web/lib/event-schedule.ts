export function parseUtcDatetime(
  raw: FormDataEntryValue | null,
): Date | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    throw new Error("Enter a valid date and time.");
  }

  const value = new Date(`${raw}:00.000Z`);
  if (
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 16) !== raw
  ) {
    throw new Error("Enter a valid date and time.");
  }
  return value;
}

export function validateWindowOrder(
  opensAt: Date | null,
  closesAt: Date | null,
  label: string,
): string | null {
  return opensAt && closesAt && opensAt >= closesAt
    ? `${label} open must be earlier than close.`
    : null;
}

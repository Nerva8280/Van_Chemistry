import { Prisma } from "@prisma/client";

/**
 * Safely converts a Prisma Decimal (or number/string) to a plain JS number
 * for JSON responses. Money in this app is stored as Decimal(12,0) (whole
 * VND, no fractional units), so Number precision is safe here.
 */
export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value.toString());
}

export default { toNumber };

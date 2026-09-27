import { DogfoodError } from "@dogfood/validation";

export const CERTIFICATE_TIERS = [
  "winner",
  "runner_up",
  "participation",
] as const;

export type CertificateTier = (typeof CERTIFICATE_TIERS)[number];

export const WINNER_MAX_RANK = 1;
export const RUNNER_UP_MAX_RANK = 3;

export function tierForRank(rank: number | null | undefined): CertificateTier {
  if (rank === null || rank === undefined) return "participation";
  if (rank <= WINNER_MAX_RANK) return "winner";
  if (rank <= RUNNER_UP_MAX_RANK) return "runner_up";
  return "participation";
}

export function assertCertificateTier(value: string): CertificateTier {
  if (!CERTIFICATE_TIERS.includes(value as CertificateTier)) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      `[VALIDATION_FAILED] Unknown certificate tier ${value}`,
    );
  }
  return value as CertificateTier;
}

export const CERTIFICATE_TIER_LABEL: Record<CertificateTier, string> = {
  winner: "Winner",
  runner_up: "Runner-up",
  participation: "Participation",
};
import type { CircuitBreakerStatus } from "@/app/generated/prisma/client";

export type CircuitState = {
  id: string;
  status: CircuitBreakerStatus;
  failureCount: number;
  lastFailedAt: Date | null;
  openedAt: Date | null;
  halfOpenAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
};

export type CircuitBreakerConfig = {
  failureThreshold: number;
  cooldownMs: number;
};

import type { PortalWarmSessionStatus, StatefoxPortalSource } from "@prisma/client";

export type WarmSession = {
  id: string;
  source: StatefoxPortalSource;
  cookieHeader: string;
  userAgent: string;
  proxySession?: string;
  status: PortalWarmSessionStatus;
  requestCount: number;
  maxRequests: number;
  expiresAt: Date;
  lastUsedAt?: Date;
  warmedAt: Date;
};

export type WarmSessionPolicy = {
  enabled: boolean;
  requireCdp: boolean;
  ttlMs: number;
  maxRequests: number;
};

export type WarmSessionRequest = {
  source: Exclude<StatefoxPortalSource, "unknown">;
  policy: WarmSessionPolicy;
  headless: boolean;
  brightDataUrl?: string;
  brightDataConnectTimeoutMs?: number;
  captchaSolveEnabled: boolean;
  captchaDetectTimeoutMs: number;
};

export type WarmSessionAcquireResult =
  | {
      status: "ready";
      session: WarmSession;
      warmed: boolean;
    }
  | {
      status: "unavailable";
      reason: string;
    };

export type WarmedCookies = {
  cookieHeader: string;
  userAgent: string;
  proxySession?: string;
};

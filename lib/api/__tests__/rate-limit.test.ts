import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, AUTH_CONFIG } from "@/lib/api/rate-limit";

function makeRequest(ip = "192.168.1.1"): Request {
  return new Request("http://localhost/test", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("checkRateLimit", () => {
  const storeName = "test-" + Date.now();

  it("allows first request", () => {
    const name = storeName + "-first";
    const result = checkRateLimit(makeRequest(), name, AUTH_CONFIG);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(AUTH_CONFIG.maxRequests - 1);
  });

  it("allows up to maxRequests", () => {
    const name = storeName + "-max";
    for (let i = 0; i < AUTH_CONFIG.maxRequests; i++) {
      const result = checkRateLimit(makeRequest("10.0.0.1"), name, AUTH_CONFIG);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks after maxRequests exceeded", () => {
    const name = storeName + "-exceed";
    for (let i = 0; i < AUTH_CONFIG.maxRequests; i++) {
      checkRateLimit(makeRequest("10.0.0.2"), name, AUTH_CONFIG);
    }
    const result = checkRateLimit(makeRequest("10.0.0.2"), name, AUTH_CONFIG);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks different IPs independently", () => {
    const name = storeName + "-ips";
    for (let i = 0; i < AUTH_CONFIG.maxRequests; i++) {
      checkRateLimit(makeRequest("10.0.0.3"), name, AUTH_CONFIG);
    }
    const blockedResult = checkRateLimit(makeRequest("10.0.0.3"), name, AUTH_CONFIG);
    expect(blockedResult.allowed).toBe(false);

    const otherIpResult = checkRateLimit(makeRequest("10.0.0.4"), name, AUTH_CONFIG);
    expect(otherIpResult.allowed).toBe(true);
  });

  it("uses x-real-ip as fallback", () => {
    const name = storeName + "-realip";
    const req = new Request("http://localhost/test", {
      headers: { "x-real-ip": "172.16.0.1" },
    });
    const result = checkRateLimit(req, name, AUTH_CONFIG);
    expect(result.allowed).toBe(true);
  });

  it("returns resetAt in the future", () => {
    const name = storeName + "-reset";
    const result = checkRateLimit(makeRequest("10.0.0.5"), name, AUTH_CONFIG);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

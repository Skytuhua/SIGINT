import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, getClientIp } from "../rateLimit";

afterEach(() => vi.unstubAllEnvs());

describe("trusted ingress identity", () => {
  it("ignores attacker supplied forwarding headers by default", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const request = (ip: string) => new Request("https://sigint.example/", { headers: { "x-forwarded-for": ip, "x-real-ip": ip } });
    expect(limiter(getClientIp(request("8.8.8.8"))).allowed).toBe(true);
    expect(limiter(getClientIp(request("1.1.1.1"))).allowed).toBe(false);
  });
  it("accepts only a configured single IP and canonicalizes IPv6 equivalents", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-ingress-client-ip");
    const request = (ip: string) => new Request("https://sigint.example/", { headers: { "x-ingress-client-ip": ip } });
    expect(getClientIp(request("8.8.8.8"))).toBe("8.8.8.8");
    expect(getClientIp(request("2001:4860:4860:0:0:0:0:8888"))).toBe(getClientIp(request("2001:4860:4860::8888")));
    for (const ip of ["8.8.8.8, 1.1.1.1", "arbitrary", "8.8.8.8:1234"]) expect(getClientIp(request(ip))).toBe("unknown");
  });
});

describe("bounded identity storage", () => {
  it("fails closed at capacity without evicting an active exhausted quota", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000, maxEntries: 2 });
    expect(limiter("a").allowed).toBe(true);
    expect(limiter("b").allowed).toBe(true);
    expect(limiter("c").allowed).toBe(false);
    expect(limiter("a").allowed).toBe(false);
  });
});

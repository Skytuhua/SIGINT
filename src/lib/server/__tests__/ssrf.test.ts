import { afterEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup }));

import { isBlockedHost, isPrivateIp } from "../ssrf";

afterEach(() => vi.resetAllMocks());

describe("private IP classification", () => {
  it.each([
    "::1", "0:0:0:0:0:0:0:0001", "0::1", "::", "0:0:0:0:0:0:0:0",
    "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1",
    "::ffff:10.1.2.3", "::ffff:172.16.0.1", "::ffff:192.168.1.2",
    "::ffff:169.254.169.254", "::ffff:0.0.0.0",
  ])("rejects private IPv6 address %s", (address) => {
    expect(isPrivateIp(address)).toBe(true);
  });

  it.each([
    "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808",
    "fc::1", "fd::1", "fe8::1",
  ])(
    "preserves public IP address %s",
    (address) => expect(isPrivateIp(address)).toBe(false),
  );
});

describe("outbound host validation", () => {
  it.each(["http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/"])(
    "rejects private URL hostname %s when DNS lookup fails",
    async (url) => {
      lookup.mockRejectedValue(new Error("ENOTFOUND"));
      expect(await isBlockedHost(new URL(url).hostname)).toBe(true);
    },
  );

  it("rejects a hostname resolving to an IPv4-mapped private address", async () => {
    lookup.mockResolvedValue([{ address: "::ffff:192.168.1.2", family: 6 }]);
    expect(await isBlockedHost("publisher.example")).toBe(true);
  });

  it("preserves public IPv6 URL hostnames", async () => {
    lookup.mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]);
    expect(await isBlockedHost(new URL("https://[2606:4700:4700::1111]/").hostname)).toBe(false);
  });
});

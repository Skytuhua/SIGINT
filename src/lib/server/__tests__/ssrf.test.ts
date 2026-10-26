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
    "::ffff:100.100.100.200", "::ffff:6440:1", "::7f00:1", "fec0::1", "ff02::1",
    "64:ff9b::7f00:1", "64:ff9b:0:0:0:0:6464:64c8", "64:ff9b::1",
    "64:ff9b:1::", "64:ff9b:1::7f00:1", "64:ff9b:1:abcd:ef01:2345:808:808",
    "0064:ff9b:0001:ffff:ffff:ffff:ffff:ffff",
    "2002:7f00:1::", "2002:a00:1:1234::", "2002:6440:1::",
  ])("rejects private IPv6 address %s", (address) => {
    expect(isPrivateIp(address)).toBe(true);
  });

  it.each([
    "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808",
    "100.63.255.255", "100.128.0.0", "192.0.0.9", "192.0.0.10", "198.17.255.255", "198.20.0.0",
    "64:ff9b::808:808", "2002:808:808::", "2606:4700:4700::7f00:1",
    "fc::1", "fd::1", "fe8::1",
  ])(
    "preserves public IP address %s",
    (address) => expect(isPrivateIp(address)).toBe(false),
  );
});

describe("nonpublic IPv4 destination policy", () => {
  it.each([
    "100.64.0.1", "100.100.100.200", "100.127.255.255", "192.0.0.1", "192.0.0.170",
    "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.19.255.255", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
  ])("rejects special-purpose address %s", (address) => expect(isPrivateIp(address)).toBe(true));
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

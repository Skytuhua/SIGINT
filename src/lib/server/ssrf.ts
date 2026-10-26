/**
 * Shared SSRF (Server-Side Request Forgery) protection utilities.
 *
 * Use `isBlockedHost(hostname)` before making outbound HTTP requests
 * from server-side code to prevent requests to private/internal networks.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

const LOCAL_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "ip6-localhost",
]);

function isIpV4Private(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // Link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isIpV6Private(address: string): boolean {
  // net.isIP has validated the literal. Canonicalize equivalent compressed,
  // expanded and dotted IPv4 forms before comparing address ranges.
  const normalized = new URL(`http://[${address.split("%", 1)[0]}]/`).hostname.slice(1, -1);
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("::ffff:")) {
    const [high, low] = normalized.slice(7).split(":").map((part) => Number.parseInt(part, 16));
    return isIpV4Private([high >> 8, high & 255, low >> 8, low & 255].join("."));
  }
  const first = Number.parseInt(normalized.split(":", 1)[0], 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

export function isPrivateIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isIpV4Private(address);
  if (version === 6) return isIpV6Private(address);
  return false;
}

/**
 * Check if a hostname should be blocked from outbound requests.
 * Rejects localhost, private IPs, and hostnames that resolve to private IPs.
 */
export async function isBlockedHost(hostname: string): Promise<boolean> {
  // WHATWG URL.hostname retains brackets around IPv6 literals; DNS and
  // net.isIP expect the address without them.
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (LOCAL_HOSTS.has(lower) || lower.endsWith(".localhost")) return true;
  if (isPrivateIp(lower)) return true;

  try {
    const resolved = await lookup(lower, { all: true, verbatim: true });
    if (resolved.some((item) => isPrivateIp(item.address))) {
      return true;
    }
  } catch {
    // If DNS fails, fetch will fail naturally.
  }
  return false;
}

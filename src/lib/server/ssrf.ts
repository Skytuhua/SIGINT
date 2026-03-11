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
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  return false;
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
  const lower = hostname.toLowerCase().replace(/\.$/, "");
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

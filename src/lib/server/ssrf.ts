/**
 * Shared SSRF (Server-Side Request Forgery) protection utilities.
 *
 * Untrusted URLs may reach public destinations only. Private, shared, local and
 * special-purpose address ranges are rejected, including known embedded forms.
 * Use `withPublicHttpResponse`: preflight checks alone cannot bind DNS results
 * to the eventual socket.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent, fetch as outboundFetch } from "undici";
import { abortable } from "./fetchWithTimeout";

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
  const [a, b, c, d] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Shared carrier/cloud services
  if (a === 169 && b === 254) return true; // Link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0 && d !== 9 && d !== 10) return true;
  if (a === 192 && b === 0 && c === 2) return true; // Documentation
  if (a === 192 && b === 88 && c === 99) return true; // Deprecated relay
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // Multicast, reserved and broadcast
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
  if (normalized.startsWith("::")) return true; // Deprecated IPv4-compatible addresses
  const [left, right] = normalized.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const words = (right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill("0"), ...end])
    .map((word) => Number.parseInt(word, 16));
  // RFC 8215 reserves this entire /48 for local-use translation. Its suffix is
  // deployment-specific, so it is never a public destination, even with a
  // public-looking embedded tail.
  if (words[0] === 0x64 && words[1] === 0xff9b && words[2] === 1) return true;
  // Known transition prefixes can otherwise encode the same forbidden IPv4
  // destination. Preserve their public embedded IPv4 forms.
  if (words[0] === 0x64 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0)) {
    return isIpV4Private([words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join("."));
  }
  if (words[0] === 0x2002) {
    return isIpV4Private([words[1] >> 8, words[1] & 255, words[2] >> 8, words[2] & 255].join("."));
  }
  const first = Number.parseInt(normalized.split(":", 1)[0], 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00;
}

export function isPrivateIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isIpV4Private(address);
  if (version === 6) return isIpV6Private(address);
  return false;
}

/**
 * Check if a hostname should be blocked from outbound requests.
 * Rejects localhost, nonpublic addresses, and failed or mixed DNS answers.
 */
export async function isBlockedHost(hostname: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await abortable(resolvePublicAddresses(hostname), signal);
    return false;
  } catch {
    return true;
  }
}

async function resolvePublicAddresses(hostname: string) {
  // WHATWG URL.hostname retains brackets around IPv6 literals; DNS and
  // net.isIP expect the address without them.
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (LOCAL_HOSTS.has(lower) || lower.endsWith(".localhost") || isPrivateIp(lower)) {
    throw new Error("Blocked destination");
  }
  const family = net.isIP(lower);
  const resolved = family ? [{ address: lower, family }] : await lookup(lower, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((item) => !net.isIP(item.address) || isPrivateIp(item.address))) {
    throw new Error("Blocked destination");
  }
  return resolved;
}

/**
 * Resolve once, pin those addresses to the connection, and retain the original
 * hostname for the HTTP Host header and TLS identity. Each redirect is a new
 * call so callers must apply their URL policy to every hop.
 * The callback owns body consumption; all paths release the body and connector.
 */
export async function withPublicHttpResponse<T>(
  url: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Blocked destination");
  }
  const addresses = await abortable(resolvePublicAddresses(parsed.hostname), init.signal);
  init.signal?.throwIfAborted();
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (init.signal?.aborted) {
          callback(init.signal.reason, "", 0);
        } else if (options.all) {
          callback(null, addresses);
        } else {
          const address = addresses.find((item) => !options.family || item.family === options.family);
          if (!address) callback(new Error("No validated address for requested family"), "", 0);
          else callback(null, address.address, address.family);
        }
      },
    },
  });
  let response: Response | undefined;
  try {
    // Use the patched npm transport rather than the runtime's bundled parser.
    response = await outboundFetch(parsed.toString(), {
      ...init,
      redirect: "manual",
      dispatcher,
    } as Parameters<typeof outboundFetch>[1]) as unknown as Response;
    return await consume(response);
  } finally {
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined);
    await dispatcher.destroy();
  }
}

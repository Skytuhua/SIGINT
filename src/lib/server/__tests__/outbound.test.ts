import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedOptions {
  connect: { lookup: (host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => void };
}

const { lookup, transport, agents } = vi.hoisted(() => ({
  lookup: vi.fn(), transport: vi.fn(), agents: [] as Array<{ options: CapturedOptions; destroy: ReturnType<typeof vi.fn> }>,
}));
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("undici", () => ({
  fetch: transport,
  Agent: class {
    options: CapturedOptions;
    destroy = vi.fn().mockResolvedValue(undefined);
    constructor(options: CapturedOptions) { this.options = options; agents.push(this); }
  },
}));

import { withPublicHttpResponse } from "../ssrf";
import { readResponseBytes } from "../fetchWithTimeout";

beforeEach(() => {
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  transport.mockResolvedValue(new Response("public article"));
});
afterEach(() => { vi.clearAllMocks(); agents.length = 0; });

describe("connection-bound public HTTP", () => {
  it("pins the validated answers at the connector and preserves the URL identity", async () => {
    await withPublicHttpResponse("https://publisher.example/story", {}, async (response) => response.text());
    expect(lookup).toHaveBeenCalledTimes(1);
    const agent = agents[0];
    const callback = vi.fn();
    agent.options.connect.lookup("publisher.example", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith("https://publisher.example/story", expect.objectContaining({ dispatcher: agent, redirect: "manual" }));
    expect(agent.destroy).toHaveBeenCalled();
  });

  it.each(["http://127.1/", "http://2130706433/", "http://[::ffff:7f00:1]/", "http://localhost./"])(
    "blocks private equivalent URL %s before transport", async (url) => {
      await expect(withPublicHttpResponse(url, {}, async () => undefined)).rejects.toThrow("Blocked destination");
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("fails closed on DNS errors and mixed private answers", async () => {
    lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(withPublicHttpResponse("https://publisher.example/", {}, async () => undefined)).rejects.toThrow();
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }, { address: "10.1.2.3", family: 4 }]);
    await expect(withPublicHttpResponse("https://publisher.example/", {}, async () => undefined)).rejects.toThrow("Blocked destination");
    expect(transport).not.toHaveBeenCalled();
  });

  it("blocks shared cloud-service space from DNS and its mapped IPv6 form", async () => {
    lookup.mockResolvedValueOnce([{ address: "100.100.100.200", family: 4 }]);
    await expect(withPublicHttpResponse("https://publisher.example/", {}, async () => undefined)).rejects.toThrow("Blocked destination");
    await expect(withPublicHttpResponse("http://[::ffff:6464:64c8]/", {}, async () => undefined)).rejects.toThrow("Blocked destination");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["64:ff9b:1::7f00:1", "64:ff9b:1:abcd:ef01:2345:808:808"])(
    "blocks the local-use NAT64 prefix through literal and DNS paths: %s", async (address) => {
      await expect(withPublicHttpResponse(`http://[${address}]/`, {}, async () => undefined)).rejects.toThrow("Blocked destination");
      lookup.mockResolvedValueOnce([{ address, family: 6 }]);
      await expect(withPublicHttpResponse("https://publisher.example/", {}, async () => undefined)).rejects.toThrow("Blocked destination");
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("preserves the well-known NAT64 prefix with a public embedded destination", async () => {
    const url = "http://[64:ff9b::808:808]/";
    expect(await withPublicHttpResponse(url, {}, async (response) => response.text())).toBe("public article");
    expect(transport).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "manual" }));
  });

  it("honors cancellation during DNS without connecting later", async () => {
    let resolve!: (value: unknown) => void;
    lookup.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const controller = new AbortController();
    const pending = withPublicHttpResponse("https://publisher.example/", { signal: controller.signal }, async () => undefined);
    controller.abort();
    await expect(pending).rejects.toThrow();
    resolve([{ address: "93.184.216.34", family: 4 }]);
    await Promise.resolve();
    expect(transport).not.toHaveBeenCalled();
  });

  it("releases the upstream body and agent on a rejected response", async () => {
    const cancel = vi.fn();
    transport.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    await expect(withPublicHttpResponse("https://publisher.example/", {}, async () => { throw new Error("reject"); })).rejects.toThrow("reject");
    expect(cancel).toHaveBeenCalled();
    expect(agents[0].destroy).toHaveBeenCalled();
  });
});

describe("bounded response consumption", () => {
  it("preserves a complete body at the byte limit", async () => {
    expect(await readResponseBytes(new Response(new Uint8Array([1, 2, 3])), 3)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("stops and cancels a chunked oversized body before buffering the rest", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const response = new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(3)); }, cancel,
    }, { highWaterMark: 0 }));
    await expect(readResponseBytes(response, 4)).rejects.toThrow("Response too large");
    expect(pulls).toBe(2);
    expect(cancel).toHaveBeenCalled();
  });
  it("cancels a stalled response when the deadline aborts", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const pending = readResponseBytes(new Response(new ReadableStream({ cancel })), 10, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});

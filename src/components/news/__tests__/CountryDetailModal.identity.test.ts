import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import CountryDetailModal from "../CountryDetailModal";
const mocks = vi.hoisted(() => ({ fetchJsonWithPolicy: vi.fn() }));
vi.mock("../../../lib/runtime/fetchJson", () => ({ ...mocks, isAbortError: () => false }));
vi.mock("react-window", () => ({ List: () => null }));
let renderer: ReactTestRenderer | undefined;
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
it("clears the previous country's profile while the next country loads", async () => {
 vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {}, location: { href: "https://local.test" }, history: { replaceState() {} } });
 mocks.fetchJsonWithPolicy.mockImplementation((url: string) => url.includes("country=US") ? Promise.resolve({ compositeIndex: 83 }) : new Promise(() => {}));
 await act(async () => { renderer = create(createElement(CountryDetailModal, { countryCode: "US", onClose() {} })); });
 expect(renderer!.root.findByProps({ className: "si-country-instability-value" }).children).toEqual(["83"]);
 await act(async () => { renderer!.update(createElement(CountryDetailModal, { countryCode: "CH", onClose() {} })); });
 expect(renderer!.root.findAllByProps({ className: "si-country-instability-value" }).some(node => node.children.includes("83"))).toBe(false);
});

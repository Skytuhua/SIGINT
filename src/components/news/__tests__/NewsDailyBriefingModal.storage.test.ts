import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import NewsDailyBriefingModal from "../NewsDailyBriefingModal";
vi.mock("../../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it.each(["Close", "Escape"])("closes through %s after Turn Off even when browser storage writes are denied", action => {
  const handlers = new Set<(event: { key: string }) => void>();
  const storage = { setItem() { throw new DOMException("Storage denied", "SecurityError"); } };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("document", {
    addEventListener: (_name: string, handler: (event: { key: string }) => void) => handlers.add(handler),
    removeEventListener: (_name: string, handler: (event: { key: string }) => void) => handlers.delete(handler),
  });
  const onClose = vi.fn();
  act(() => { renderer = create(createElement(NewsDailyBriefingModal, { onClose })); });
  act(() => renderer!.root.findByProps({ type: "checkbox" }).props.onChange({ target: { checked: true } }));
  expect(() => act(() => {
    if (action === "Escape") handlers.forEach(handler => handler({ key: "Escape" }));
    else renderer!.root.findByProps({ title: "Close Intelligence Briefing" }).props.onClick();
  })).not.toThrow();
  expect(onClose).toHaveBeenCalledOnce();
});

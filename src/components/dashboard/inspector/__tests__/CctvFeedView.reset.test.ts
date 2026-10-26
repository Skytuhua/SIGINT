import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CctvFeedView from "../CctvFeedView";
import type { CctvCamera } from "../../../../lib/providers/types";

let renderer: ReactTestRenderer | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it.each(["JPEG", "YOUTUBE"] as const)("resets failed %s media on camera or source changes", (streamFormat) => {
  const onError = vi.fn();
  const camera: CctvCamera = {
    id: "first", city: "Test", name: "Test", lat: 0, lon: 0,
    snapshotUrl: "", refreshSeconds: 30, streamFormat,
    streamUrl: streamFormat === "JPEG"
      ? "https://example.test/first.jpg"
      : "https://www.youtube.com/embed/first",
  };
  const render = (next: CctvCamera) => createElement(CctvFeedView, {
    camera: next, onSnapshotError: onError, onStreamError: onError,
  });
  const media = streamFormat === "JPEG" ? "img" : "iframe";
  act(() => { renderer = create(render(camera)); });
  act(() => renderer!.root.findByType(media).props.onError());
  expect(renderer!.root.findAllByType(media)).toHaveLength(0);
  expect(onError).toHaveBeenLastCalledWith("first");

  // A different camera must own fresh player state, even if it shares a URL.
  const next = { ...camera, id: "second" };
  act(() => renderer!.update(render(next)));
  expect(renderer!.root.findAllByType(media)).toHaveLength(1);
  act(() => renderer!.root.findByType(media).props.onError());
  expect(onError).toHaveBeenLastCalledWith("second");

  // Replacing the source of the same camera must also recover.
  const replacement = { ...next, streamUrl: next.streamUrl!.replace("first", "replacement") };
  act(() => renderer!.update(render(replacement)));
  expect(renderer!.root.findByType(media).props.src).toContain("replacement");
  // Ordinary parent renders must not reset an error and re-report it forever.
  act(() => renderer!.root.findByType(media).props.onError());
  act(() => renderer!.update(render(replacement)));
  expect(renderer!.root.findAllByType(media)).toHaveLength(0);
  expect(onError).toHaveBeenCalledTimes(3);
});

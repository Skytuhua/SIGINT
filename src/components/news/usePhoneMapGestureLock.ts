"use client";

import { type RefObject, useEffect, useRef } from "react";

type LockedElementState = {
  element: HTMLElement;
  overflow: string;
  overscrollBehavior: string;
};

function releaseMapGestureLock(): void {
  document.documentElement.classList.remove("si-phone-map-gesture-lock");
  document.body.classList.remove("si-phone-map-gesture-lock");
}

function collectScrollableAncestors(node: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = node.parentElement;

  while (current) {
    const styles = window.getComputedStyle(current);
    const overflowValue = `${styles.overflow} ${styles.overflowY} ${styles.overflowX}`;
    const isScrollable =
      /(auto|scroll|overlay)/.test(overflowValue) &&
      (current.scrollHeight > current.clientHeight + 1 || current.scrollWidth > current.clientWidth + 1);
    if (isScrollable) {
      ancestors.push(current);
    }
    current = current.parentElement;
  }

  return ancestors;
}

export default function usePhoneMapGestureLock(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const gestureActiveRef = useRef(false);
  const lockedElementsRef = useRef<LockedElementState[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const node = ref.current;
    if (!node) return;

    const restoreLockedElements = () => {
      for (const locked of lockedElementsRef.current) {
        locked.element.style.overflow = locked.overflow;
        locked.element.style.overscrollBehavior = locked.overscrollBehavior;
      }
      lockedElementsRef.current = [];
    };

    const beginGesture = () => {
      if (gestureActiveRef.current) return;
      gestureActiveRef.current = true;
      document.documentElement.classList.add("si-phone-map-gesture-lock");
      document.body.classList.add("si-phone-map-gesture-lock");

      const elementsToLock = [
        document.documentElement,
        document.body,
        ...collectScrollableAncestors(node),
      ];

      lockedElementsRef.current = elementsToLock.map((element) => ({
        element,
        overflow: element.style.overflow,
        overscrollBehavior: element.style.overscrollBehavior,
      }));

      for (const element of elementsToLock) {
        element.style.overflow = "hidden";
        element.style.overscrollBehavior = "none";
      }
    };

    const endGesture = () => {
      if (!gestureActiveRef.current) return;
      gestureActiveRef.current = false;
      restoreLockedElements();
      releaseMapGestureLock();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        endGesture();
        return;
      }
      beginGesture();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!gestureActiveRef.current) return;
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchend", endGesture, { passive: true });
    node.addEventListener("touchcancel", endGesture, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchend", endGesture, {
      passive: true,
      capture: true,
    });
    window.addEventListener("touchcancel", endGesture, {
      passive: true,
      capture: true,
    });

    return () => {
      endGesture();
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchend", endGesture);
      node.removeEventListener("touchcancel", endGesture);
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", endGesture, true);
      window.removeEventListener("touchcancel", endGesture, true);
    };
  }, [enabled, ref]);
}

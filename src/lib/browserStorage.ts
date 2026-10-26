/** Browser preferences remain optional when storage is blocked or full. */
export function readBrowserPreference(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeBrowserPreference(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // Keep the current preference in component state for this session.
  }
}

"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { EMPTY_READING_LIST, newsReadingListStore, type NewsReadingListStore } from "../lib/news/readingList";
const getServerSnapshot = () => EMPTY_READING_LIST;

export function useNewsReadingList(store: NewsReadingListStore = newsReadingListStore) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  useEffect(() => store.hydrate(), [store]);
  const savedIds = useMemo(() => new Set(snapshot.entries.map(entry => entry.id)), [snapshot.entries]);
  return { ...snapshot, savedIds, toggle: store.toggle, remove: store.remove, reconcile: store.reconcile };
}

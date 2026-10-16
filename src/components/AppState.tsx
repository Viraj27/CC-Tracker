"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import type { Catalog } from "@/lib/catalog/schema";
import { localToday } from "@/lib/domain/dates";
import type { UserData } from "@/lib/domain/types";

interface AppState {
  catalog: Catalog;
  data: UserData;
  today: string;
  pending: boolean;
  error: string | null;
  clearError: () => void;
  /**
   * Apply `optimistic` immediately, then run the server action and replace
   * state with its result (or roll back on failure). Everything derived from
   * `data` — dashboard, ROI, utilization, needs-attention — recomputes at once.
   */
  mutate: (optimistic: ((d: UserData) => UserData) | null, action: () => Promise<UserData>) => Promise<boolean>;
  replaceData: (d: UserData) => void;
}

const Ctx = createContext<AppState | null>(null);

let tempCounter = 0;
export const tempId = () => `tmp-${Date.now()}-${tempCounter++}`;
/** True for an optimistic row the server hasn't saved yet (it can't be deleted until then). */
export const isTemp = (id: string) => id.startsWith("tmp-");

export function AppProvider({
  catalog,
  initialData,
  serverToday,
  children,
}: {
  catalog: Catalog;
  initialData: UserData;
  serverToday: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initialData);
  const [today, setToday] = useState(serverToday);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Use the browser's local date (and roll over at midnight).
  useEffect(() => {
    const tick = () => setToday(localToday());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const mutate = useCallback<AppState["mutate"]>(async (optimistic, action) => {
    let before: UserData | null = null;
    if (optimistic) {
      setData((d) => {
        before = d;
        return optimistic(d);
      });
    }
    try {
      const next = await action();
      startTransition(() => setData(next));
      setError(null);
      return true;
    } catch (e) {
      if (before) setData(before);
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      catalog,
      data,
      today,
      pending,
      error,
      clearError: () => setError(null),
      mutate,
      replaceData: setData,
    }),
    [catalog, data, today, pending, error, mutate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

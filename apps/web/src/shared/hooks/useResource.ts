/**
 * useResource / useMutation / useResourceItem
 *
 * Generic primitives that eliminate the copy-paste of loading/error state
 * across every feature hook. Built on plain React state; swap for React Query
 * in production without touching consumers.
 *
 * Design goals:
 *   - Cancellation-safe (no state updates after unmount)
 *   - Stable identity of returned object (useMemo)
 *   - Optimistic update + rollback helpers
 *   - Same mental model across all features
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequestSequence } from "./request-sequence";

// ─────────────────────────────────────────────────────────────
// useResource — list/collection fetching
// ─────────────────────────────────────────────────────────────
export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface ResourceHandle<T> extends ResourceState<T> {
  refresh: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): ResourceHandle<T> {
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });
  const requests = useRef(new RequestSequence());

  const load = useCallback(async () => {
    const request = requests.current.begin();
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (requests.current.isCurrent(request)) setState({ data, loading: false, error: null });
    } catch (e) {
      const message = (e as { message?: string }).message ?? "Error";
      if (requests.current.isCurrent(request)) setState(s => ({ ...s, loading: false, error: message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
    return () => { requests.current.invalidate(); };
  }, [load]);

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setState(s => ({ ...s, data: typeof updater === "function" ? (updater as (p: T | null) => T)(s.data) : updater }));
  }, []);

  return useMemo(() => ({ ...state, refresh: load, setData }), [state, load, setData]);
}

// ─────────────────────────────────────────────────────────────
// useMutation — create/update/delete with loading + error state
// ─────────────────────────────────────────────────────────────
export interface MutationState {
  loading: boolean;
  error: string | null;
}
export interface MutationHandle<Args extends unknown[], R> extends MutationState {
  mutate: (...args: Args) => Promise<R>;
  reset:  () => void;
}

export function useMutation<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>
): MutationHandle<Args, R> {
  const [state, setState] = useState<MutationState>({ loading: false, error: null });
  const aliveRef = useRef(true);

  useEffect(() => () => { aliveRef.current = false; }, []);

  const mutate = useCallback(async (...args: Args): Promise<R> => {
    setState({ loading: true, error: null });
    try {
      const result = await fn(...args);
      if (aliveRef.current) setState({ loading: false, error: null });
      return result;
    } catch (e) {
      const message = (e as { message?: string }).message ?? "Error";
      if (aliveRef.current) setState({ loading: false, error: message });
      throw e;
    }
  }, [fn]);

  const reset = useCallback(() => setState({ loading: false, error: null }), []);
  return useMemo(() => ({ ...state, mutate, reset }), [state, mutate, reset]);
}

// ─────────────────────────────────────────────────────────────
// withOptimistic — helper for optimistic updates with rollback
// ─────────────────────────────────────────────────────────────
export async function withOptimistic<T>(
  current: T,
  optimistic: T,
  setter: (value: T) => void,
  commit: () => Promise<T>,
): Promise<T> {
  setter(optimistic);
  try {
    const server = await commit();
    setter(server);
    return server;
  } catch (e) {
    setter(current); // rollback
    throw e;
  }
}

/**
 * Audit feature — paginated log browser for admins.
 * Supports action filter, userId filter, date range.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiClient } from "@/shared/lib/api-client";

export interface AuditEntryDTO {
  id: string; action: string; userId: number; userName: string;
  details: Record<string, unknown>;
  timestamp: string; ip: string; userAgent: string;
}

export interface AuditPage {
  items: AuditEntryDTO[]; total: number; page: number; limit: number; pages: number;
}

export interface AuditQuery {
  page?: number; limit?: number;
  action?: string | null; userId?: number | null;
  from?: string | null; to?: string | null;
}

export class AuditApi {
  constructor(private readonly http: ApiClient) {}
  query(q: AuditQuery = {}): Promise<AuditPage> {
    const params = new URLSearchParams();
    if (q.page   != null) params.set("page",   String(q.page));
    if (q.limit  != null) params.set("limit",  String(q.limit));
    if (q.action)         params.set("action", q.action);
    if (q.userId != null) params.set("userId", String(q.userId));
    if (q.from)           params.set("from",   q.from);
    if (q.to)             params.set("to",     q.to);
    return this.http.get(`/audit?${params.toString()}`);
  }
}

export function useAuditLog(api: AuditApi, initialQuery: AuditQuery = {}) {
  const [query, setQuery]     = useState<AuditQuery>({ page: 0, limit: 50, ...initialQuery });
  const [page, setPage]       = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchPage = useCallback(async (q: AuditQuery) => {
    setLoading(true); setError(null);
    try { setPage(await api.query(q)); }
    catch (e) { setError((e as { message?: string }).message ?? "Error"); }
    finally   { setLoading(false); }
  }, [api]);

  useEffect(() => { fetchPage(query); }, [query, fetchPage]);

  const setFilter = useCallback((patch: Partial<AuditQuery>) => {
    setQuery(q => ({ ...q, ...patch, page: 0 })); // reset to first page on filter change
  }, []);

  const nextPage = useCallback(() => setQuery(q => ({ ...q, page: (q.page ?? 0) + 1 })), []);
  const prevPage = useCallback(() => setQuery(q => ({ ...q, page: Math.max(0, (q.page ?? 0) - 1) })), []);

  return { page, loading, error, query, setFilter, nextPage, prevPage };
}

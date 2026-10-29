"use client";
import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";

export function useResource<T>(url: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    revision: number;
    data: T | null;
    error: RequestError | null;
  }>({ key: "", revision: -1, data: null, error: null });
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    window.addEventListener("vanlog:refresh", reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("vanlog:refresh", reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  useEffect(() => {
    if (!url) return;
    let active = true;
    api<T>(url)
      .then((data) => {
        if (active) setState({ key: url, revision, data, error: null });
      })
      .catch((error) => {
        if (active)
          setState((previous) => ({
            key: url,
            revision,
            data: previous.key === url ? previous.data : null,
            error,
          }));
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  const current = state.key === url && state.revision === revision;
  const data = state.key === url ? state.data : null;
  return {
    data,
    error: current ? state.error : null,
    loading: !!url && !current && !data,
    refreshing: !!url && !current,
    reload,
  };
}
export function refreshResources() {
  window.dispatchEvent(new Event("vanlog:refresh"));
}
export function notify(message: string) {
  window.dispatchEvent(new CustomEvent("vanlog:notice", { detail: message }));
}

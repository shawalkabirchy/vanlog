"use client";
import { useRef, useState } from "react";
import { RequestError, send } from "@/lib/api";
import { notify } from "./use-resource";

export function useMutation(onSaved: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{
    path: string;
    method: string;
    data: unknown;
  } | null>(null);
  async function run(path: string, method: string, data: unknown) {
    if (pending) return;
    attempt.current = { path, method, data };
    setPending(true);
    setError(null);
    notify("");
    try {
      await send(path, method, data);
      setUncertain(false);
      attempt.current = null;
      notify(
        path.endsWith("/services")
          ? "Service recorded."
          : path.endsWith("/readings")
            ? "Meter reading saved."
            : "Changes saved.",
      );
      onSaved();
    } catch (error) {
      setError(error as Error);
      const unknown =
        !(error instanceof RequestError) ||
        error.status === 0 ||
        error.status >= 500;
      setUncertain(unknown);
      if (!unknown) attempt.current = null;
    } finally {
      setPending(false);
    }
  }
  const retry = () => {
    if (attempt.current) {
      const { path, method, data } = attempt.current;
      void run(path, method, data);
    }
  };
  const stale =
    error instanceof RequestError &&
    ["STALE_VERSION", "REQUEST_ALREADY_RECORDED"].includes(error.code);
  return {
    run,
    retry,
    pending,
    error,
    uncertain,
    stale,
    fields: error instanceof RequestError ? error.fields : {},
    setError,
    clear: () => {
      setError(null);
      setUncertain(false);
      attempt.current = null;
    },
  };
}

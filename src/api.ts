import { useEffect, useState } from "react";
import type { PublicConfig } from "./domain";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("You appear to be offline. Check your connection and try again.", 0);
  }
  const body = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!r.ok)
    throw new ApiError(
      body.error || (r.status >= 500 ? "The service is temporarily unavailable. Please try again shortly." : "Something went wrong."),
      r.status,
      body.code,
    );
  return body as T;
}
export const post = <T = { ok: boolean }>(path: string, body: unknown = {}, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });

let configPromise: Promise<PublicConfig> | null = null;
export function loadPublicConfig() {
  configPromise ??= api<PublicConfig>("/config").catch((e) => {
    configPromise = null;
    throw e;
  });
  return configPromise;
}
export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadPublicConfig()
      .then((c) => live && setConfig(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return config;
}
export const money = (n: number | null) =>
  n === null
    ? "Value not published"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(n);
export const date = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Not established";
export const dateTime = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      })
    : "Not established";
/** "in 12 days" / "3 days ago" relative to now, in whole days. */
export function relativeDays(s: string | null | undefined, now = Date.now()) {
  if (!s) return null;
  const days = Math.round((new Date(s).getTime() - now) / 86400000);
  if (days === 0) return "today";
  return days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : `${-days} day${days === -1 ? "" : "s"} ago`;
}

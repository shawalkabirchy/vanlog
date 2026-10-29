import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { schemas } from "./validation";

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  APP_ORIGIN: string;
  BUSINESS_TIME_ZONE: string;
  BUSINESS_CURRENCY: string;
  DEMO_MODE: string;
  RATE_LIMIT_SECRET: string;
  DEMO_OWNER_EMAIL: string;
  DEMO_OWNER_PASSWORD: string;
  DEMO_STAFF_EMAIL: string;
  DEMO_STAFF_PASSWORD: string;
};
const cookieName = "__Host-vanlog_session";
const localCookieName = "vanlog_session_local";
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
    public retryAfter?: number,
  ) {
    super(message);
  }
}
const knownErrors: Record<string, [number, string]> = {
  UNAUTHENTICATED: [401, "Sign in to continue."],
  FORBIDDEN: [403, "Your role cannot perform this action."],
  NOT_FOUND: [404, "This record could not be found."],
  STALE_VERSION: [
    409,
    "This record changed. Refresh it and confirm your values again.",
  ],
  IDEMPOTENCY_CONFLICT: [
    409,
    "This request was already used with different values.",
  ],
  REQUEST_ALREADY_RECORDED: [
    409,
    "This request is already recorded. Reload the record to see the result.",
  ],
  EQUIPMENT_ARCHIVED: [409, "Archived equipment cannot receive new records."],
  TASK_ARCHIVED: [409, "This maintenance task is archived."],
  DEMO_CAPACITY_REACHED: [
    409,
    "The shared demo is full. The operator needs to reset its sample data.",
  ],
  EQUIPMENT_CAPACITY_REACHED: [
    409,
    "The equipment limit of 100 has been reached.",
  ],
  TASK_CAPACITY_REACHED: [409, "This equipment has reached its 20-task limit."],
  METER_BELOW_CURRENT: [
    422,
    "Cumulative hours cannot be below the current reading.",
  ],
  INVALID_BASELINE: [
    422,
    "The baseline must not be in the future or above the current meter.",
  ],
  INTERVAL_REQUIRED: [422, "Keep at least one maintenance interval."],
  VALIDATION_ERROR: [422, "Check the values and try again."],
};
export async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function database(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SECRET_KEY">,
) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(12000) }),
    },
  });
}
export async function rpc<T = Record<string, unknown>>(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SECRET_KEY">,
  operation: string,
  input: Record<string, unknown> = {},
  sessionDigest: string | null = null,
): Promise<T> {
  const { data, error } = await database(env).rpc("vanlog_api", {
    p_operation: operation,
    p_session_digest: sessionDigest,
    p_input: input,
  });
  if (error) {
    const entry = knownErrors[error.message];
    if (entry) {
      const fields: Record<string, string> =
        error.message === "METER_BELOW_CURRENT"
          ? { meterMinutes: entry[1] }
          : error.message === "INVALID_BASELINE"
            ? { baselineOn: entry[1], baselineMeterMinutes: entry[1] }
            : error.message === "INTERVAL_REQUIRED"
              ? { intervalDays: entry[1], intervalMinutes: entry[1] }
              : {};
      throw new ApiError(error.message, entry[0], entry[1], fields);
    }
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "The service is unavailable. Your changes have not been cleared.",
    );
  }
  return data as T;
}
export function checkEnv(env: Env) {
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "APP_ORIGIN",
    "BUSINESS_TIME_ZONE",
    "BUSINESS_CURRENCY",
    "DEMO_MODE",
    "RATE_LIMIT_SECRET",
  ] as const) {
    if (!env[key])
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        503,
        "Service configuration is incomplete.",
      );
  }
  const origin = new URL(env.APP_ORIGIN);
  if (
    origin.origin !== env.APP_ORIGIN ||
    (!isLocal(origin) && origin.protocol !== "https:") ||
    !["USD", "BDT"].includes(env.BUSINESS_CURRENCY) ||
    !["true", "false"].includes(env.DEMO_MODE) ||
    env.RATE_LIMIT_SECRET.length < 32
  )
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "Service configuration is invalid.",
    );
  new Intl.DateTimeFormat("en-US", { timeZone: env.BUSINESS_TIME_ZONE });
}
function isLocal(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
export function validateOrigin(request: Request, env: Env) {
  const url = new URL(request.url);
  const configured = new URL(env.APP_ORIGIN);
  const preview =
    env.DEMO_MODE === "true" &&
    configured.hostname.endsWith(".pages.dev") &&
    url.protocol === "https:" &&
    url.hostname.endsWith("." + configured.hostname) &&
    /^[a-z0-9-]+$/.test(url.hostname.slice(0, -configured.hostname.length - 1));
  if (
    request.headers.get("Origin") !== url.origin ||
    (!preview && url.origin !== configured.origin)
  )
    throw new ApiError(
      "FORBIDDEN",
      403,
      "This request must come from the application.",
    );
  if (
    request.method !== "DELETE" &&
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") || "",
    )
  )
    throw new ApiError("VALIDATION_ERROR", 422, "Send JSON data.");
}
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("Content-Length")) > 65536)
    throw new ApiError("BODY_TOO_LARGE", 413, "The request is too large.");
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new ApiError("BODY_TOO_LARGE", 413, "The request is too large.");
      }
      chunks.push(part.value);
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422, "Send valid JSON data.");
  }
}
function getToken(request: Request) {
  const name = isLocal(new URL(request.url)) ? localCookieName : cookieName;
  const value = request.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function cookie(request: Request, token: string, expire = false) {
  const local = isLocal(new URL(request.url));
  return `${local ? localCookieName : cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expire ? 0 : 28800}${local ? "" : "; Secure"}`;
}
async function limit(
  env: Env,
  scope: string,
  maximum: number,
  seconds: number,
) {
  const { data, error } = await database(env).rpc("vanlog_rate", {
    p_scope: scope,
    p_limit: maximum,
    p_seconds: seconds,
  });
  if (error)
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "The service is unavailable. Try again shortly.",
    );
  if (!data.allowed)
    throw new ApiError(
      "RATE_LIMITED",
      429,
      "Too many requests. Try again shortly.",
      {},
      data.retryAfter,
    );
}
async function loginScope(request: Request, env: Env) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    (isLocal(new URL(request.url)) ? "local-development" : null);
  if (!ip)
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      503,
      "The service could not verify this connection.",
    );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.RATE_LIMIT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(new Date().toISOString().slice(0, 10) + ":" + ip),
  );
  return (
    "login:" +
    Array.from(new Uint8Array(signature), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
function encodeCursor(value: unknown) {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export async function pageInput(
  operation: string,
  query: Record<string, unknown>,
) {
  const { cursor, ...filters } = query;
  const fingerprint = await digest(JSON.stringify({ operation, ...filters }));
  let after: unknown;
  if (cursor)
    try {
      const raw = String(cursor).replaceAll("-", "+").replaceAll("_", "/");
      const parsed = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)),
        ),
      );
      if (parsed.v !== 1 || parsed.f !== fingerprint) throw new Error("cursor");
      const key =
        operation === "equipment_list"
          ? z.tuple([z.string().max(80), z.uuid()])
          : operation === "tasks_list"
            ? z.tuple([
                z.number().int().min(1).max(4),
                z.string().max(80),
                z.uuid(),
              ])
            : z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);
      after = key.parse(parsed.k);
    } catch {
      throw new ApiError(
        "VALIDATION_ERROR",
        422,
        "This page cursor is invalid. Reload the list.",
      );
    }
  return { input: { ...filters, ...(after ? { after } : {}) }, fingerprint };
}
function pageOutput(
  data: { items: (Record<string, unknown> & { _sortKey?: unknown })[] },
  size: number,
  fingerprint: string,
) {
  const more = data.items.length > size;
  const selected = data.items.slice(0, size);
  const nextCursor = more
    ? encodeCursor({ v: 1, f: fingerprint, k: selected.at(-1)?._sortKey })
    : null;
  return {
    items: selected.map((row) => {
      const { _sortKey, ...item } = row;
      void _sortKey;
      return item;
    }),
    nextCursor,
  };
}
const routes = [
  ["GET", /^\/api\/equipment\/?$/, "equipment_list", null],
  [
    "POST",
    /^\/api\/equipment\/?$/,
    "equipment_create",
    schemas.equipmentCreate,
  ],
  ["GET", /^\/api\/equipment\/([^/]+)\/?$/, "equipment_get", null],
  [
    "PATCH",
    /^\/api\/equipment\/([^/]+)\/?$/,
    "equipment_update",
    schemas.equipmentUpdate,
  ],
  [
    "POST",
    /^\/api\/equipment\/([^/]+)\/tasks\/?$/,
    "task_create",
    schemas.taskCreate,
  ],
  [
    "POST",
    /^\/api\/equipment\/([^/]+)\/readings\/?$/,
    "reading_create",
    schemas.reading,
  ],
  ["GET", /^\/api\/equipment\/([^/]+)\/history\/?$/, "equipment_history", null],
  ["PATCH", /^\/api\/tasks\/([^/]+)\/?$/, "task_update", schemas.taskUpdate],
  [
    "POST",
    /^\/api\/tasks\/([^/]+)\/services\/?$/,
    "service_create",
    schemas.service,
  ],
  ["GET", /^\/api\/tasks\/?$/, "tasks_list", null],
  ["GET", /^\/api\/history\/?$/, "history_list", null],
  ["GET", /^\/api\/dashboard\/?$/, "dashboard", null],
  ["GET", /^\/api\/reports\/costs\/?$/, "costs", schemas.report],
] as const;

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let routeName = "/api/unknown";
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  });
  const respond = (data: unknown, status = 200) => {
    console.log(
      JSON.stringify({
        requestId,
        route: routeName,
        result: status,
        duration: Math.round(performance.now() - started),
      }),
    );
    return new Response(status === 204 ? null : JSON.stringify(data), {
      status,
      headers,
    });
  };
  try {
    checkEnv(env);
    const url = new URL(request.url);
    const method = request.method;
    if (method === "GET" && url.pathname === "/api/config") {
      const businessDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: env.BUSINESS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      return respond({
        currency: env.BUSINESS_CURRENCY,
        timeZone: env.BUSINESS_TIME_ZONE,
        businessDate,
        demoMode: env.DEMO_MODE === "true",
      });
    }
    if (method === "GET" && url.pathname === "/api/health")
      return respond(
        await rpc(env, "readiness", {
          currency: env.BUSINESS_CURRENCY,
          timeZone: env.BUSINESS_TIME_ZONE,
          demoMode: env.DEMO_MODE === "true",
        }),
      );
    if (!["GET", "HEAD"].includes(method)) validateOrigin(request, env);
    const token = getToken(request);
    const sessionDigest = token ? await digest(token) : null;
    if (/^\/api\/auth\/(session|demo)\/?$/.test(url.pathname)) {
      routeName = "/api/auth/session";
      if (
        method === "DELETE" &&
        url.pathname.replace(/\/$/, "").endsWith("session")
      ) {
        if (sessionDigest) await rpc(env, "session_delete", {}, sessionDigest);
        headers.set("Set-Cookie", cookie(request, "", true));
        return respond(null, 204);
      }
      if (
        method === "GET" &&
        url.pathname.replace(/\/$/, "").endsWith("session")
      )
        return respond(await rpc(env, "session_get", {}, sessionDigest));
      if (method !== "POST")
        throw new ApiError(
          "METHOD_NOT_ALLOWED",
          405,
          "This method is not supported.",
        );
      await limit(env, await loginScope(request, env), 10, 900);
      const input = await readJson(request);
      let email: string;
      let password: string;
      if (url.pathname.replace(/\/$/, "").endsWith("demo")) {
        if (env.DEMO_MODE !== "true")
          throw new ApiError("NOT_FOUND", 404, "This page could not be found.");
        const role = schemas.demo.parse(input).role;
        email = role === "owner" ? env.DEMO_OWNER_EMAIL : env.DEMO_STAFF_EMAIL;
        password =
          role === "owner" ? env.DEMO_OWNER_PASSWORD : env.DEMO_STAFF_PASSWORD;
        if (!email || !password)
          throw new ApiError(
            "SERVICE_UNAVAILABLE",
            503,
            "The demo is not configured yet.",
          );
      } else ({ email, password } = schemas.login.parse(input));
      const auth = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const { data, error } = await auth.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user)
        throw new ApiError(
          "UNAUTHENTICATED",
          401,
          "The email or password is incorrect.",
        );
      try {
        const sessionToken = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        const user = await rpc(env, "session_create", {
          authUserId: data.user.id,
          tokenDigest: await digest(sessionToken),
        });
        if (sessionDigest) await rpc(env, "session_delete", {}, sessionDigest);
        headers.set("Set-Cookie", cookie(request, sessionToken));
        return respond(user);
      } finally {
        await auth.auth.signOut({ scope: "local" });
      }
    }
    const route = routes.find(
      ([verb, pattern]) => verb === method && pattern.test(url.pathname),
    );
    if (!route)
      throw new ApiError(
        "NOT_FOUND",
        404,
        "This API route could not be found.",
      );
    const [, pattern, operation, schema] = route;
    routeName = operation;
    const match = pattern.exec(url.pathname)!;
    const id = match[1] ? z.uuid().parse(match[1]) : undefined;
    let input: Record<string, unknown> = {};
    let fingerprint: string | undefined;
    let size = 25;
    if (method === "GET") {
      if (
        new Set(url.searchParams.keys()).size !==
        Array.from(url.searchParams.keys()).length
      )
        throw new ApiError(
          "VALIDATION_ERROR",
          422,
          "Query parameters must not repeat.",
        );
      const query = Object.fromEntries(url.searchParams);
      if (operation === "costs") input = schemas.report.parse(query);
      else if (operation !== "dashboard" && operation !== "equipment_get") {
        const parsed = schemas.page.parse(query);
        size = parsed.limit;
        const page = await pageInput(operation, {
          ...parsed,
          ...(id ? { id } : {}),
        });
        input = page.input;
        fingerprint = page.fingerprint;
        if (input.archived !== undefined)
          input.archived = input.archived === "true";
        if (input.equipmentId) {
          input.id = input.equipmentId;
          delete input.equipmentId;
        }
      }
    } else {
      const session = await rpc<{ user: { id: string } }>(
        env,
        "session_get",
        {},
        sessionDigest,
      );
      await limit(env, "write:" + session.user.id, 60, 60);
      input = schema!.parse(await readJson(request)) as Record<string, unknown>;
    }
    if (id) input.id = id;
    const data = await rpc(env, operation, input, sessionDigest);
    return respond(
      fingerprint
        ? pageOutput(
            data as { items: Record<string, unknown>[] },
            size,
            fingerprint,
          )
        : data,
      method === "POST" ? 201 : 200,
    );
  } catch (error) {
    let failure =
      error instanceof ApiError
        ? error
        : new ApiError(
            "SERVICE_UNAVAILABLE",
            503,
            "The service is unavailable. Your changes have not been cleared.",
          );
    if (error instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues)
        fields[issue.path.join(".") || "form"] = issue.message;
      failure = new ApiError(
        "VALIDATION_ERROR",
        422,
        "Check the highlighted values.",
        fields,
      );
    }
    if (failure.retryAfter)
      headers.set("Retry-After", String(failure.retryAfter));
    return respond(
      {
        error: {
          code: failure.code,
          message: failure.message,
          fieldErrors: failure.fields,
          requestId,
        },
      },
      failure.status,
    );
  }
}

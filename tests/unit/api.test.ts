import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  digest,
  pageInput,
  readJson,
  validateOrigin,
  handleApi,
  type Env,
} from "../../src/server/api";

const env = {
  APP_ORIGIN: "https://vanlog.pages.dev",
  DEMO_MODE: "true",
} as Env;
afterEach(() => vi.unstubAllGlobals());
describe("API request boundaries", () => {
  it.each([
    [503, "SERVICE_UNAVAILABLE"],
    [429, "RATE_LIMITED"],
    [400, "UNAUTHENTICATED"],
  ])(
    "preserves the Auth provider failure category for HTTP %i",
    async (status, code) => {
      const fetchMock = vi.fn(async (url: string | URL | Request) =>
        String(url).includes("/rest/v1/rpc/vanlog_rate")
          ? new Response(JSON.stringify({ allowed: true }), {
              headers: { "Content-Type": "application/json" },
            })
          : new Response(
              JSON.stringify({
                code:
                  status === 400 ? "invalid_credentials" : "unexpected_failure",
                msg: "private upstream detail",
              }),
              {
                status: status as number,
                headers: { "Content-Type": "application/json" },
              },
            ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const response = await handleApi(
        new Request("https://vanlog.pages.dev/api/auth/session", {
          method: "POST",
          headers: {
            Origin: env.APP_ORIGIN,
            "Content-Type": "application/json",
            "CF-Connecting-IP": "192.0.2.1",
          },
          body: JSON.stringify({
            email: "qa@example.test",
            password: "test-only-password",
          }),
        }),
        {
          ...env,
          SUPABASE_URL: "https://supabase.example.test",
          SUPABASE_PUBLISHABLE_KEY: "test-public-key",
          SUPABASE_SECRET_KEY: "test-private-key",
          RATE_LIMIT_SECRET: "test-only-".repeat(4),
          BUSINESS_CURRENCY: "USD",
          BUSINESS_TIME_ZONE: "UTC",
        },
      );
      const body = (await response.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe(code);
      expect(body.error.message).not.toContain("upstream");
      expect(response.status).toBe(status === 400 ? 401 : status);
      if (status === 429)
        expect(response.headers.get("retry-after")).toBe("60");
    },
  );
  it("requires the exact request origin, including on previews", () => {
    expect(() =>
      validateOrigin(
        new Request("https://vanlog.pages.dev/api/equipment", {
          method: "POST",
          headers: {
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
        }),
        env,
      ),
    ).toThrow(ApiError);
    expect(() =>
      validateOrigin(
        new Request("https://abc.vanlog.pages.dev/api/equipment", {
          method: "POST",
          headers: {
            Origin: "https://abc.vanlog.pages.dev",
            "Content-Type": "application/json",
          },
        }),
        env,
      ),
    ).not.toThrow();
    expect(() =>
      validateOrigin(
        new Request("https://evil.example/api/equipment", {
          method: "POST",
          headers: {
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
        }),
        env,
      ),
    ).toThrow();
  });
  it("enforces the actual streamed body limit and rejects malformed JSON", async () => {
    await expect(
      readJson(
        new Request("https://vanlog.pages.dev/api/x", {
          method: "POST",
          body: '{"x":"' + "a".repeat(65536) + '"}',
        }),
      ),
    ).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
    await expect(
      readJson(
        new Request("https://vanlog.pages.dev/api/x", {
          method: "POST",
          body: "not json",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await readJson(
        new Request("https://vanlog.pages.dev/api/x", {
          method: "POST",
          body: '{"x":1}',
        }),
      ),
    ).toEqual({ x: 1 });
  });
  it("rejects malformed cursors instead of silently restarting", async () => {
    await expect(
      pageInput("equipment_list", { limit: 25, cursor: "garbage" }),
    ).rejects.toMatchObject({ status: 422 });
    const f = await digest(
      JSON.stringify({ operation: "equipment_list", limit: 25, q: "one" }),
    );
    const cursor = Buffer.from(
      JSON.stringify({ v: 1, f, k: ["one", crypto.randomUUID()] }),
    ).toString("base64url");
    await expect(
      pageInput("equipment_list", { limit: 25, q: "two", cursor }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (await pageInput("equipment_list", { limit: 25, q: "one", cursor }))
        .input,
    ).toHaveProperty("after");
  });
});

import { describe, expect, it } from "vitest";
import {
  ApiError,
  digest,
  pageInput,
  readJson,
  validateOrigin,
  type Env,
} from "../../src/server/api";

const env = {
  APP_ORIGIN: "https://vanlog.pages.dev",
  DEMO_MODE: "true",
} as Env;
describe("API request boundaries", () => {
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

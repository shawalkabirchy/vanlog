"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand, Failure, TextField } from "./common";
import { DemoButtons } from "./demo-buttons";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { send, RequestError } from "@/lib/api";
import { safeReturn } from "@/lib/domain";
import type { User } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const result = await send<{ user: User }>("/api/auth/session", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      const next = safeReturn(params.get("next"));
      router.replace(
        next === "/dashboard/" && result.user.role === "staff"
          ? "/equipment/"
          : next,
      );
    } catch (error) {
      setError(error as Error);
      setPending(false);
    }
  }
  const fields = error instanceof RequestError ? error.fields : {};
  const next = safeReturn(params.get("next"));
  return (
    <main id="main" className="login-page">
      <Brand />
      <section className="login-panel">
        <h1>Welcome back.</h1>
        <p>Sign in to your team’s maintenance workspace.</p>
        <form method="post" onSubmit={submit}>
          <FieldGroup>
            <TextField
              label="Email address"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              error={fields.email}
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              error={fields.password}
            />
            <Failure error={error} />
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </FieldGroup>
        </form>
        <p className="login-help">
          Accounts are provisioned by your operator. Contact them for access or
          password recovery.
        </p>
        <div className="login-demo">
          <h2>Just exploring?</h2>
          <DemoButtons returnTo={next === "/dashboard/" ? undefined : next} />
        </div>
      </section>
      <Link className="text-link" href="/">
        Back to VanLog
      </Link>
    </main>
  );
}

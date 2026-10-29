"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Failure } from "./common";
import { send } from "@/lib/api";
import type { Role } from "@/lib/types";

export function DemoButtons({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<Error | null>(null);
  async function enter(role: Role) {
    setPending(role);
    setError(null);
    try {
      await send("/api/auth/demo", "POST", { role });
      router.push(
        returnTo || (role === "owner" ? "/dashboard/" : "/equipment/"),
      );
    } catch (error) {
      setError(error as Error);
      setPending(null);
    }
  }
  return (
    <div>
      <div className="demo-actions">
        <Button size="lg" disabled={!!pending} onClick={() => enter("owner")}>
          {pending === "owner" ? (
            <LoaderCircle className="spinner" data-icon="inline-start" />
          ) : null}
          Try as owner
          <ArrowRight data-icon="inline-end" />
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={!!pending}
          onClick={() => enter("staff")}
        >
          {pending === "staff" ? (
            <LoaderCircle className="spinner" data-icon="inline-start" />
          ) : null}
          Try as staff
        </Button>
      </div>
      <Failure error={error} />
    </div>
  );
}

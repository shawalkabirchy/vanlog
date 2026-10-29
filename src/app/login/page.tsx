import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { Loading } from "@/components/common";
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}

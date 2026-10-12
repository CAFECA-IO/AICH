import { Suspense } from "react";
import { AuthForm } from "@/components/auth_form";

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}

import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

const Page = () => (
  <Suspense fallback={<p className="text-center">Getting ready…</p>}>
    <AuthForm signup />
  </Suspense>
);

export default Page;

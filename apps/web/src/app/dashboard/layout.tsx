import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/helpers";
import { ReviewWorkspace } from "@/features/review/components/review-workspace";

const AccountWorkspace = async ({ children }: { children: ReactNode }) => {
  const { user, session } = await getCurrentUser();
  if (!user || !session || !user.emailVerified)
    redirect("/login?redirect=%2Fdashboard");

  return (
    <ReviewWorkspace
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
    >
      {children}
    </ReviewWorkspace>
  );
};

const DashboardLayout = ({ children }: { children: ReactNode }) => (
  <Suspense
    fallback={<p className="p-8 text-center">Loading your workspace…</p>}
  >
    <AccountWorkspace>{children}</AccountWorkspace>
  </Suspense>
);

export default DashboardLayout;

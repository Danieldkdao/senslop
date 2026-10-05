import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/helpers";
import { ConnectionChecklist } from "@/features/connection/components/connection-checklist";

const AccountDashboard = async () => {
  const currentUser = await getCurrentUser();

  if (
    !currentUser.user ||
    !currentUser.session ||
    !currentUser.user.emailVerified
  )
    redirect("/login?redirect=%2Fdashboard");

  return <ConnectionChecklist name={currentUser.user.name} />;
};

const Dashboard = () => (
  <Suspense fallback={<p className="p-8 text-center">Loading your account…</p>}>
    <AccountDashboard />
  </Suspense>
);

export default Dashboard;

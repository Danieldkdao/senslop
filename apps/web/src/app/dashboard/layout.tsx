import type { ReactNode } from "react";
import { LivePreviewProvider } from "@/features/review/components/live-preview-provider";
import { ReviewWorkspace } from "@/features/review/components/review-workspace";

const DashboardLayout = ({ children }: { children: ReactNode }) => (
  <LivePreviewProvider>
    <ReviewWorkspace>{children}</ReviewWorkspace>
  </LivePreviewProvider>
);

export default DashboardLayout;

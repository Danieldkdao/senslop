import { LivePreviewProvider } from "@/features/review/components/live-preview-provider";
import { ReviewWorkspace } from "@/features/review/components/review-workspace";

const Workspace = () => (
  <LivePreviewProvider>
    <ReviewWorkspace>
      <section className="p-8">
        <h1 className="text-2xl">Your local workspace is running</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Choose changes to inspect in your terminal. Keep it open while
          reviewing; Ctrl+C stops this app.
        </p>
        <p className="mt-3 text-base text-muted-foreground">
          Your code stays on this computer. No account connection is required.
        </p>
      </section>
    </ReviewWorkspace>
  </LivePreviewProvider>
);

export default Workspace;

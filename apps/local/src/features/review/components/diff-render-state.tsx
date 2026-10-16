import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const DiffRenderState = ({
  error,
  onRetry,
}: {
  error: boolean;
  onRetry: () => void;
}) =>
  error ? (
    <div role="alert" className="flex flex-col gap-3 p-4 text-base">
      <p className="text-destructive">
        Couldn’t load syntax highlighting. Retry to open this diff.
      </p>
      <Button
        variant="outline"
        className="self-start text-base"
        onClick={onRetry}
      >
        Retry loading diff
      </Button>
    </div>
  ) : (
    <div
      role="status"
      aria-label="Loading diff"
      className="flex flex-col gap-3 p-4 text-base text-muted-foreground"
    >
      <p>Loading diff…</p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-3/4 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full motion-reduce:animate-none" />
        <Skeleton className="h-5 w-2/3 motion-reduce:animate-none" />
      </div>
    </div>
  );

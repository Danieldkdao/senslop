import { cn } from "@/lib/utils";

export const Buddy = ({ className = "" }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 160 160"
      role="img"
      aria-label="Senslop's cheerful review buddy"
      className={cn("buddy", className)}
    >
      <ellipse cx="80" cy="142" rx="43" ry="6" className="fill-foreground/10" />
      <path
        d="M47 58C32 25 53 15 74 43C90 11 116 23 109 57"
        className="fill-secondary stroke-primary"
        strokeWidth="3"
      />
      <path
        d="M34 83C34 49 126 49 126 83L121 117C115 145 45 145 39 117Z"
        className="fill-accent stroke-primary"
        strokeWidth="3"
      />
      <ellipse cx="62" cy="87" rx="5" ry="7" className="fill-foreground" />
      <ellipse cx="98" cy="87" rx="5" ry="7" className="fill-foreground" />
      <path
        d="M69 105Q80 116 91 105"
        fill="none"
        className="stroke-primary"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="48" cy="102" r="7" className="fill-primary/15" />
      <circle cx="112" cy="102" r="7" className="fill-primary/15" />
    </svg>
  );
};

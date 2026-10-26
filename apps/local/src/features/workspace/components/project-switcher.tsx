"use client";
import { useState } from "react";
import {
  FolderGit2,
  ExternalLink,
  Check,
  History,
  GitBranch,
} from "lucide-react";
import { savedReviewSchema } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { CopyButton } from "../../../components/copy-button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { SavedReviewSummary } from "../types";
import { ChangeInspector } from "../../workflow/components/change-inspector";
import { useProjects } from "../hooks/use-projects";
import { formatProjectStatus } from "../lib/formatters";
import { useWorkspaceMetadata } from "../hooks/use-workspace-metadata";

export const ProjectSwitcher = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const projects = useProjects(open);
  const workspace = useWorkspaceMetadata();
  const [archived, setArchived] = useState<ReturnType<
    typeof savedReviewSchema.parse
  > | null>(null);
  const [history, setHistory] = useState<SavedReviewSummary[]>([]);
  const [archiveRoot, setArchiveRoot] = useState("");
  const navigate = async (root: string, newTab: boolean) => {
    const tab = newTab ? window.open("about:blank", "_blank") : null;
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (newTab) {
        if (!tab) throw new Error("Allow popups to open this project.");
        tab.opener = null;
        tab.location.href = data.url;
      } else window.location.assign(data.url);
    } catch (error) {
      tab?.close();
      toast.error((error as Error).message);
    }
  };
  return (
    <>
      <div className="flex min-w-0 shrink-0 items-center border-b px-3 h-14">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                className="w-full min-w-0 justify-start text-base"
                aria-label="Switch project"
              />
            }
          >
            <FolderGit2 aria-hidden="true" className="size-5 shrink-0" />
            <span className="min-w-0 truncate font-mono">
              {workspace.data?.root?.split(/[\\/]/).at(-1) ?? "Projects"}
            </span>
          </PopoverTrigger>
          <PopoverContent className="flex w-auto max-w-lg flex-col gap-0 p-0 text-base">
            <PopoverTitle className="px-4 py-3">
              Projects & worktrees
            </PopoverTitle>
            <Input
              variant="search"
              aria-label="Search projects"
              placeholder="Search projects…"
              className="h-10 w-full px-4 text-base"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex max-h-96 scroll-fade-y flex-col overflow-y-auto p-2">
              {projects.data
                ?.filter((project) =>
                  `${project.name} ${project.root}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((project) => {
                  const status = formatProjectStatus(project.status);
                  return (
                    <div
                      key={project.root}
                      className="flex min-w-0 flex-col gap-2 border-b py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <TooltipWrapper content={status.label}>
                          <span tabIndex={0}>
                            <status.Icon
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                            />
                          </span>
                        </TooltipWrapper>
                        <button
                          type="button"
                          className="min-w-0 flex-1 wrap-break-word text-left font-mono text-base"
                          onClick={() => {
                            if (project.status === "running")
                              void navigate(project.root, false);
                          }}
                        >
                          {project.root}
                        </button>
                        {project.current && (
                          <Check
                            aria-label="Current project"
                            className="size-4 text-primary"
                          />
                        )}
                        {project.status === "running" && (
                          <TooltipWrapper content="Open project in new tab">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Open project in new tab"
                              onClick={() => void navigate(project.root, true)}
                            >
                              <ExternalLink
                                aria-hidden="true"
                                className="size-4"
                              />
                            </Button>
                          </TooltipWrapper>
                        )}
                        {!!project.reviewCount && (
                          <TooltipWrapper content="Open latest saved evidence">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Open latest saved evidence"
                              onClick={async () => {
                                try {
                                  const response = await fetch(
                                    `/api/projects?root=${encodeURIComponent(project.root)}`,
                                  );
                                  if (!response.ok)
                                    throw new Error(
                                      "Saved reviews unavailable.",
                                    );
                                  const reviews: SavedReviewSummary[] =
                                    await response.json();
                                  setHistory(reviews);
                                  setArchiveRoot(project.root);
                                  const saved = await fetch(
                                    `/api/projects?root=${encodeURIComponent(project.root)}&reviewId=${encodeURIComponent(reviews[0].id)}`,
                                  );
                                  if (!saved.ok)
                                    throw new Error(
                                      "Saved evidence unavailable.",
                                    );
                                  setArchived(
                                    savedReviewSchema.parse(await saved.json()),
                                  );
                                } catch (error) {
                                  toast.error((error as Error).message);
                                }
                              }}
                            >
                              <History aria-hidden="true" className="size-4" />
                            </Button>
                          </TooltipWrapper>
                        )}
                      </div>
                      <div className="flex min-w-0 items-center gap-2 font-mono text-base text-muted-foreground">
                        <GitBranch
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        <span className="min-w-0 truncate">
                          {project.branch ??
                            (project.head
                              ? `Detached ${project.head.slice(0, 8)}`
                              : "Saved project")}
                        </span>
                        <TooltipWrapper
                          content={
                            project.commonDirectory
                              ? `Shared Git repository: ${project.commonDirectory}`
                              : "Original worktree unavailable"
                          }
                        >
                          <FolderGit2
                            aria-label="Repository identity"
                            className="size-4 shrink-0"
                          />
                        </TooltipWrapper>
                      </div>
                      {project.status === "stopped" && (
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="min-w-0 flex-1 wrap-break-word text-base">
                            senslop app start --repo {project.root}
                          </code>
                          <CopyButton
                            text={`senslop app start --repo '${project.root.replaceAll("'", "'\\''")}'`}
                            label="Copy project start command"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            {projects.error && (
              <span role="alert" className="text-destructive">
                {projects.error.message}
              </span>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {archived && (
        <ChangeInspector
          open
          onOpenChange={(value) => !value && setArchived(null)}
          title={archived.title}
          description="Saved source evidence remains available independently of its original worktree."
          files={archived.files}
        >
          <Select
            value={archived.id}
            onValueChange={async (value) => {
              if (!value) return;
              try {
                const response = await fetch(
                  `/api/projects?root=${encodeURIComponent(archiveRoot)}&reviewId=${encodeURIComponent(value)}`,
                );
                if (!response.ok)
                  throw new Error("Saved evidence unavailable.");
                setArchived(savedReviewSchema.parse(await response.json()));
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <SelectTrigger
              className="h-10 w-full px-4 text-base"
              aria-label="Saved project review"
            >
              <SelectValue>{archived.title}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {history.map((review) => (
                <SelectItem
                  key={review.id}
                  value={review.id}
                  className="text-base"
                >
                  {review.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ChangeInspector>
      )}
    </>
  );
};

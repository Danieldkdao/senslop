"use client";

import { useConfirm } from "@/hooks/use-confirm";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDown, ArrowUp, Check, Merge, Plus, Scissors } from "lucide-react";
import type {
  OrganizationActionSchema,
  OrganizationSchema,
  ReviewUnitSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { LoadingSwap } from "@/components/ui/loading-swap";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const flowNameSchema = z.object({
  title: z.string().trim().min(1, "Enter a flow name.").max(200),
});
export type FlowNameSchema = z.infer<typeof flowNameSchema>;
const splitRegionSchema = z.object({
  line: z.coerce.number().int().positive(),
});
export type SplitRegionSchema = z.infer<typeof splitRegionSchema>;

const SplitRegion = ({
  unit,
  onAction,
}: {
  unit: ReviewUnitSchema;
  onAction: (operation: OrganizationActionSchema) => Promise<unknown>;
}) => {
  const range = unit.ranges.find((item) => item.end > item.start);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof splitRegionSchema>, unknown, SplitRegionSchema>({
    resolver: zodResolver(splitRegionSchema),
    defaultValues: { line: range ? range.start + 1 : 1 },
  });
  if (!range) return null;
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={handleSubmit(async ({ line }) => {
        try {
          await onAction({
            action: "split-unit",
            unitId: unit.id,
            side: range.side,
            line,
          });
        } catch {}
      })}
    >
      <label className="text-base">
        Split {range.side} before line
        <Input
          {...register("line")}
          type="number"
          className="w-full text-base"
          aria-invalid={!!errors.line}
        />
      </label>
      {errors.line && <p role="alert">{errors.line.message}</p>}
      <Button type="submit" variant="outline" disabled={isSubmitting}>
        <LoadingSwap isLoading={isSubmitting}>
          <Scissors className="size-4" />
          Split region
        </LoadingSwap>
      </Button>
    </form>
  );
};

export const OrganizationEditor = ({
  organization,
  onAction,
  onClose,
}: {
  organization: OrganizationSchema;
  onAction: (operation: OrganizationActionSchema) => Promise<unknown>;
  onClose: () => void;
}) => {
  const resetConfirmation = useConfirm(
    "Reset manual organization?",
    "Rebuilds the original changed regions and default reading flow. Only fully reviewed regions keep completion. You can then generate a new organization with Regroup changes.",
  );
  const [flowId, setFlowId] = useState(organization.flows[0]?.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [splitting, setSplitting] = useState<string>();
  const [busy, setBusy] = useState(false);
  const flow =
    organization.flows.find((item) => item.id === flowId) ??
    organization.flows[0];
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FlowNameSchema>({
    resolver: zodResolver(flowNameSchema),
    values: { title: flow?.title ?? "Changes" },
  });
  const act = async (operation: OrganizationActionSchema) => {
    setBusy(true);
    try {
      await onAction(operation);
      setSelected([]);
      setSplitting(undefined);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const flowIndex = organization.flows.findIndex(
    (item) => item.id === flow?.id,
  );
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-4 overflow-auto text-base sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Organize regions</DialogTitle>
            <DialogDescription>
              Manual organization stays with unchanged source. Each changed
              region has one home.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={flow?.id ?? null}
            onValueChange={(value) => {
              if (value) setFlowId(value);
            }}
          >
            <SelectTrigger
              className="w-full text-base"
              aria-label="Flow to edit"
            >
              <SelectValue>{flow?.title}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {organization.flows.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {flow && (
            <>
              {organization.manual && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (await resetConfirmation.confirm())
                      await act({ action: "reset-organization" });
                  }}
                >
                  Reset manual organization
                </Button>
              )}
              <form
                noValidate
                className="flex flex-col gap-2"
                onSubmit={handleSubmit(({ title }) =>
                  act({ action: "rename-flow", flowId: flow.id, title }),
                )}
              >
                <label className="flex flex-col gap-1">
                  Flow name
                  <Input
                    {...register("title")}
                    className="w-full text-base"
                    aria-invalid={!!errors.title}
                  />
                </label>
                {errors.title && <p role="alert">{errors.title.message}</p>}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={busy || isSubmitting}
                >
                  <LoadingSwap isLoading={isSubmitting}>Save name</LoadingSwap>
                </Button>
              </form>
              <div className="flex gap-2">
                <TooltipWrapper content="Move flow up">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move flow up"
                    disabled={busy || flowIndex === 0}
                    onClick={() =>
                      void act({
                        action: "move-flow",
                        flowId: flow.id,
                        direction: -1,
                      })
                    }
                  >
                    <ArrowUp />
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper content="Move flow down">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move flow down"
                    disabled={
                      busy || flowIndex === organization.flows.length - 1
                    }
                    onClick={() =>
                      void act({
                        action: "move-flow",
                        flowId: flow.id,
                        direction: 1,
                      })
                    }
                  >
                    <ArrowDown />
                  </Button>
                </TooltipWrapper>
                <Button
                  variant="outline"
                  disabled={busy || !organization.flows[flowIndex + 1]}
                  onClick={() =>
                    void act({
                      action: "combine-flows",
                      flowIds: [flow.id, organization.flows[flowIndex + 1]!.id],
                    })
                  }
                >
                  <Merge className="size-4" />
                  Combine with next
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {flow.unitIds.map((id, index) => {
                  const unit = organization.units.find(
                    (item) => item.id === id,
                  )!;
                  return (
                    <div
                      key={id}
                      className="flex flex-col gap-2 rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          variant={
                            selected.includes(id) ? "secondary" : "ghost"
                          }
                          size="icon"
                          aria-label={`Select ${unit.label}`}
                          aria-pressed={selected.includes(id)}
                          onClick={() =>
                            setSelected((current) =>
                              current.includes(id)
                                ? current.filter((item) => item !== id)
                                : [...current, id],
                            )
                          }
                        >
                          <Check className="size-4" />
                        </Button>
                        <span className="min-w-0 flex-1 break-all font-mono">
                          {unit.path}
                          <span className="block font-sans text-muted-foreground">
                            {unit.label}
                          </span>
                        </span>
                        <TooltipWrapper content="Move region up">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move region up"
                            disabled={busy || index === 0}
                            onClick={() =>
                              void act({
                                action: "move-unit",
                                unitId: id,
                                flowId: flow.id,
                                index: index - 1,
                              })
                            }
                          >
                            <ArrowUp />
                          </Button>
                        </TooltipWrapper>
                        <TooltipWrapper content="Move region down">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move region down"
                            disabled={busy || index === flow.unitIds.length - 1}
                            onClick={() =>
                              void act({
                                action: "move-unit",
                                unitId: id,
                                flowId: flow.id,
                                index: index + 1,
                              })
                            }
                          >
                            <ArrowDown />
                          </Button>
                        </TooltipWrapper>
                        <TooltipWrapper content="Split region">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Split region"
                            disabled={
                              busy ||
                              !unit.ranges.some(
                                (range) => range.end > range.start,
                              )
                            }
                            onClick={() =>
                              setSplitting(splitting === id ? undefined : id)
                            }
                          >
                            <Scissors />
                          </Button>
                        </TooltipWrapper>
                      </div>
                      <Select
                        value={flow.id}
                        onValueChange={(value) => {
                          if (value && value !== flow.id)
                            void act({
                              action: "move-unit",
                              unitId: id,
                              flowId: value,
                              index:
                                organization.flows.find(
                                  (item) => item.id === value,
                                )?.unitIds.length ?? 0,
                            });
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Move ${unit.label} to flow`}
                          className="w-full text-base"
                        >
                          <SelectValue>{flow.title}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {organization.flows.map((item) => (
                            <SelectItem value={item.id} key={item.id}>
                              {item.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {splitting === id && (
                        <SplitRegion unit={unit} onAction={onAction} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || !selected.length}
                  onClick={() =>
                    void act({
                      action: "create-flow",
                      title: "New flow",
                      unitIds: selected,
                    })
                  }
                >
                  <Plus className="size-4" />
                  New flow from selection
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || selected.length < 2}
                  onClick={() =>
                    void act({ action: "combine-units", unitIds: selected })
                  }
                >
                  <Merge className="size-4" />
                  Combine selected regions
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {resetConfirmation.ConfirmationDialog}
    </>
  );
};

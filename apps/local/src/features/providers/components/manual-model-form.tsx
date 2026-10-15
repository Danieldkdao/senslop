"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { PublicConnectionSchema } from "@senslop/contracts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  manualModelSchema,
  type ManualModelSchema,
  type ModelSelection,
} from "../model-schemas";
import { formatConnectionLabel, formatModelName } from "../lib/formatters";

type ManualModelFormProps = {
  connections: PublicConnectionSchema[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: ModelSelection) => void;
};

export const ManualModelForm = ({
  connections,
  open,
  onOpenChange,
  onSelect,
}: ManualModelFormProps) => {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualModelSchema>({
    resolver: zodResolver(manualModelSchema),
    defaultValues: { connectionId: connections[0]?.id ?? "", modelId: "" },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-base">
        <DialogHeader>
          <DialogTitle>Enter model ID</DialogTitle>
          <DialogDescription>
            Use the exact ID expected by your configured server.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => {
            if (
              !connections.some(
                (connection) => connection.id === values.connectionId,
              )
            )
              return;
            onSelect({
              ...values,
              name: formatModelName(values.modelId),
              manual: true,
            });
            onOpenChange(false);
          })}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="manual-connection">Connection</label>
            <Controller
              name="connectionId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="manual-connection"
                    className="w-full text-base"
                    aria-invalid={!!errors.connectionId}
                  >
                    <SelectValue>
                      {(value: string) => {
                        const connection = connections.find(
                          (entry) => entry.id === value,
                        );
                        return connection
                          ? formatConnectionLabel(connection)
                          : "Choose a connection";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((connection) => (
                      <SelectItem
                        key={connection.id}
                        value={connection.id}
                        className="text-base"
                      >
                        {formatConnectionLabel(connection)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.connectionId && (
              <p role="alert" className="text-destructive">
                {errors.connectionId.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="manual-model">Model ID</label>
            <Input
              id="manual-model"
              className="text-base"
              {...register("modelId")}
              aria-invalid={!!errors.modelId}
              aria-describedby={
                errors.modelId ? "manual-model-error" : undefined
              }
            />
            {errors.modelId && (
              <p
                id="manual-model-error"
                role="alert"
                className="text-destructive"
              >
                {errors.modelId.message}
              </p>
            )}
          </div>
          <Button type="submit">Use model</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

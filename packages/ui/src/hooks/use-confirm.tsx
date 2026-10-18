"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

export const useConfirm = (title: string, description: string) => {
  const [promise, setPromise] = useState<{
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = async () => {
    return new Promise<boolean>((resolve) => {
      setPromise({ resolve });
    });
  };

  const close = () => {
    setPromise(null);
  };

  const handleConfirm = () => {
    promise?.resolve(true);
    close();
  };

  const handleCancel = () => {
    promise?.resolve(false);
    close();
  };

  const ConfirmationDialog = (
    <Dialog
      open={!!promise}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
      }}
    >
      <DialogContent overlayProps={{ forceRender: true }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col md:flex-row items-center gap-2 justify-end w-full">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="w-full md:w-auto"
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="w-full md:w-auto">
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { confirm, ConfirmationDialog };
};

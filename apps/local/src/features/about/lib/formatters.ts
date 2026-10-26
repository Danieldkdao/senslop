import { CircleCheck, PackagePlus, PackageX, CloudOff } from "lucide-react";
import type { UpdateStatus } from "@senslop/contracts";

export const formatUpdateStatus = (status: UpdateStatus) => {
  switch (status) {
    case "current":
      return { label: "Up to date", Icon: CircleCheck };
    case "available":
      return { label: "Update available", Icon: PackagePlus };
    case "unpublished":
      return { label: "No published release yet", Icon: PackageX };
    case "unavailable":
      return { label: "Update check unavailable", Icon: CloudOff };
  }
};

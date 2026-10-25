import {
  CircleCheck,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Timer,
  CloudCheck,
} from "lucide-react";
import type { SettingsSaveStatus } from "../types";

export const formatSettingsSaveStatus = (status: SettingsSaveStatus) => {
  switch (status) {
    case "idle":
      return {
        label: "Auto-save on",
        Icon: CloudCheck,
        className: "text-muted-foreground",
        iconClassName: "",
      };
    case "waiting":
      return {
        label: "Saving soon…",
        Icon: Timer,
        className: "text-muted-foreground",
        iconClassName: "",
      };
    case "saving":
      return {
        label: "Saving…",
        Icon: LoaderCircle,
        className: "text-muted-foreground",
        iconClassName: "animate-spin motion-reduce:animate-none",
      };
    case "saved":
      return {
        label: "All changes saved",
        Icon: CircleCheck,
        className: "text-muted-foreground",
        iconClassName: "",
      };
    case "invalid":
      return {
        label: "Check settings",
        Icon: CircleAlert,
        className: "text-muted-foreground",
        iconClassName: "",
      };
    case "error":
      return {
        label: "Couldn’t save",
        Icon: CircleX,
        className: "text-destructive",
        iconClassName: "",
      };
  }
};

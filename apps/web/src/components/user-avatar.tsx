"use client";

import type { UserProfile } from "@/lib/types";
import { formatUserInitials } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type UserAvatarProps = Pick<UserProfile, "name" | "image"> & {
  className?: string;
};

export const UserAvatar = ({ name, image, className }: UserAvatarProps) => (
  <Avatar
    role="img"
    aria-label={`${name || "User"} avatar`}
    className={cn("size-9", className)}
  >
    {image && (
      <AvatarImage
        src={image}
        alt=""
        keepMounted
        className="data-loading:hidden data-error:hidden"
      />
    )}
    <AvatarFallback className="text-base">
      {formatUserInitials(name)}
    </AvatarFallback>
  </Avatar>
);

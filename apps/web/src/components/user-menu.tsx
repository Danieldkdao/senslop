"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { authClient } from "@/lib/auth/auth-client";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type UserMenuProps = { user: UserProfile };

export const UserMenu = ({ user }: UserMenuProps) => {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        toast.error("Sign-out failed. Please retry.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Sign-out failed. Please retry.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              variant="ghost"
              className="h-11 min-w-0 max-w-full gap-3 text-base"
              aria-label="Open account menu"
              disabled={signingOut}
            />
          }
        >
          <UserAvatar name={user.name} image={user.image} />
          <span className="truncate">{user.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 max-w-(--available-width)"
        >
          <div className="space-y-1 px-3 py-3">
            <p className="break-words text-base font-medium">{user.name}</p>
            <p className="break-all text-base text-muted-foreground">
              {user.email}
            </p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="gap-3 py-2 text-base"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings aria-hidden="true" className="size-4" />
              Settings
            </DropdownMenuItem>
            <ThemeToggle />
            <DropdownMenuItem
              variant="destructive"
              className="gap-3 py-2 text-base"
              disabled={signingOut}
              onClick={signOut}
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="text-base" finalFocus={triggerRef}>
          <DialogHeader>
            <DialogTitle className="font-sans text-2xl">Settings</DialogTitle>
            <DialogDescription className="text-base">
              Your account details. More preferences will be added as the review
              workspace grows.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar
              name={user.name}
              image={user.image}
              className="size-12"
            />
            <div className="min-w-0">
              <p className="break-words font-medium">{user.name}</p>
              <p className="break-all text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

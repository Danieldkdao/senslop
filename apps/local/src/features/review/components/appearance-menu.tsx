"use client";

import { Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const AppearanceMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="ghost"
          aria-label="Appearance"
          className="gap-2 text-base"
        />
      }
    >
      <Palette aria-hidden="true" className="size-5" />
      Appearance
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto!">
      <DropdownMenuGroup>
        <ThemeToggle />
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

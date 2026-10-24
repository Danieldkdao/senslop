"use client";

import { ChevronDown, Plus } from "lucide-react";
import { ProviderIcon } from "../../../components/provider-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export const AddProviderMenu = ({ onSelect }: { onSelect: () => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="outline"
          className="text-base"
          aria-label="Add provider"
        />
      }
    >
      <Plus aria-hidden="true" />
      Add provider
      <ChevronDown aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-base">
          Compatible APIs
        </DropdownMenuLabel>
        <DropdownMenuItem className="text-base" onClick={onSelect}>
          <ProviderIcon name="OpenAI" size={20} aria-hidden="true" />
          OpenAI
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

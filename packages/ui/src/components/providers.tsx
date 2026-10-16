"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "./ui/tooltip";
import { Toaster } from "./ui/toast";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  lightApplicationThemes,
  darkApplicationThemes,
} from "../lib/constants";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute={["class", "data-theme"]}
        themes={[...lightApplicationThemes, ...darkApplicationThemes]}
        enableColorScheme={false}
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

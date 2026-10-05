import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Fraunces, Outfit, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "../global.css";

const headings = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

const interfaceFont = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const codeFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Senslop",
  description:
    "A gentler path through AI-generated code. Connect your local changes, follow the dependencies, and review with understanding.",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        headings.variable,
        interfaceFont.variable,
        codeFont.variable,
      )}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
};

export default RootLayout;

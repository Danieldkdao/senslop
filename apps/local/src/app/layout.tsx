import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import {
  Fira_Code,
  Fraunces,
  Geist_Mono,
  IBM_Plex_Mono,
  JetBrains_Mono,
  Outfit,
} from "next/font/google";
import localFont from "next/font/local";
import { LocalPreferences } from "../features/settings/components/local-preferences";
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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const cascadiaCode = localFont({
  src: "./fonts/cascadia-code.woff2",
  variable: "--font-cascadia-code",
  weight: "200 700",
  display: "swap",
  // Local loading bypasses Google's missing Cascadia fallback metrics.
  adjustFontFallback: false,
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
        geistMono.variable,
        firaCode.variable,
        ibmPlexMono.variable,
        cascadiaCode.variable,
      )}
    >
      <body>
        <Providers>
          <LocalPreferences>{children}</LocalPreferences>
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;

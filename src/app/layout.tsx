import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { TRPCProvider } from "@/trpc/provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  // Google Fonts ships Space Grotesk at 300-700 only. The visual
  // identity references "weight 800-900" on headlines but those
  // are browser-synthesized (faux-bold from 700) — confirmed via
  // Google Fonts API. If real 800/900 glyphs are wanted, swap to
  // a variable font (Inter, etc.) — out of scope for F5.
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Officehours",
  description:
    "A small scheduler for office-hours-style drop-ins. One host, one visitor, one booking.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // next-intl: resolve the active locale + load its messages once at the
  // root layout. NextIntlClientProvider wraps the tree so client
  // components can call `useTranslations()` without re-fetching. The
  // <html lang> attribute mirrors the resolved locale so screen readers
  // and search engines see the right language.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // Page transitions are handled per-surface by motion (AnimatePresence
    // + key={pathname} in OhDashboardLayout for the dashboard, shared-
    // layout morphs inside HandleModal for the visitor booking flow).
    // Native View Transitions API is intentionally NOT mounted here —
    // the previous always-on `<ViewTransitions>` wrapper caused the
    // dashboard top-bar / sidebar to cross-fade on every internal route
    // change because their named VT groups were captured + sequenced
    // even when their visual state was identical between routes. Motion
    // animates only the panel content slot now, leaving the chrome
    // visually static.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TRPCProvider>{children}</TRPCProvider>
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

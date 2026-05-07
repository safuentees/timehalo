import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { TRPCProvider } from "@/trpc/provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ViewTransitionsShell } from "./view-transitions-shell";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
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
    // ViewTransitionsShell keeps the native View Transitions API on the
    // dashboard chrome, but opts the public visitor booking surfaces out so
    // Motion can own their shared-layout modal morphs without a root snapshot.
    <ViewTransitionsShell>
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
    </ViewTransitionsShell>
  );
}

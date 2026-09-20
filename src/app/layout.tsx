import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { dirOf } from "@/i18n/config";
import { getStoredLocale } from "@/i18n/request";

export const metadata: Metadata = {
  title: "StreamPull",
  description: "Download YouTube videos and playlists to your computer with yt-dlp.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getStoredLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={dirOf(locale)} className={`${GeistSans.variable} h-full`}>
      <body className="min-h-full antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

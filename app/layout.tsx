import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/app/components/ServiceWorkerRegistration";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "RootLoot Farm Management",
  description: "AI-powered farm management system for multi-block almond farms.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RootLoot",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const isRTL = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`${spaceGrotesk.variable} ${geistMono.variable} ${isRTL ? notoSansArabic.variable : ''} h-full antialiased`}
    >
      <body className="flex h-dvh overflow-hidden bg-slate-50 dark:bg-[#0F1923]">
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

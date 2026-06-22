import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ar', 'tr'],
  defaultLocale: 'en',
});

export type Locale = (typeof routing.locales)[number];
export const LOCALE_COOKIE = 'ROOTLOOT_LOCALE';

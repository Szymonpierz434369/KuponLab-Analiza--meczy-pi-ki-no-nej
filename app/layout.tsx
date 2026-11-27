import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CouponProvider } from '@/components/CouponProvider';
import { LangProvider, LangSwitch } from '@/components/LangProvider';
import { LogoMark } from '@/components/Logo';
import NavLinks from '@/components/NavLinks';
import { getLang } from '@/lib/i18n-server';
import { makeT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await getLang());
  return { title: 'Kursor', description: t('Statystyki z ostatnich meczów, model szans i asystent AI do budowania kuponu.') };
}

export const viewport: Viewport = { themeColor: '#141414' };

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const t = makeT(lang);
  return (
    <html lang={lang}>
      <body>
        <LangProvider lang={lang}>
          <CouponProvider>
            <header className="topbar">
              <div className="wrap">
                <a href="/" className="brand" aria-label={t('Kursor – strona główna')}>
                  <LogoMark size={30} className="brand-mark" />
                  <span className="brand-name">Kursor</span>
                </a>
                <NavLinks />
                <LangSwitch />
              </div>
            </header>
            <main className="wrap">{children}</main>
            <footer className="foot">
              <div className="wrap">
                {t(
                  'Prawdopodobieństwa to szacunki modelu na podstawie historii – nie gwarantują wyniku. Graj tylko u legalnych bukmacherów, za kwoty, które możesz stracić. Zakłady wyłącznie dla osób 18+.',
                )}
              </div>
            </footer>
          </CouponProvider>
        </LangProvider>
      </body>
    </html>
  );
}

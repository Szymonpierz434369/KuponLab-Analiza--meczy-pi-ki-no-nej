import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CouponProvider } from '@/components/CouponProvider';
import { LogoMark } from '@/components/Logo';
import NavLinks from '@/components/NavLinks';

export const metadata: Metadata = {
  title: 'Kursor',
  description: 'Statystyki z ostatnich meczów, model szans i asystent AI do budowania kuponu.',
};

export const viewport: Viewport = { themeColor: '#0b0f0d' };

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <CouponProvider>
          <header className="topbar">
            <div className="wrap">
              <a href="/" className="brand" aria-label="Kursor – strona główna">
                <LogoMark size={30} className="brand-mark" />
                <span className="brand-name">Kursor</span>
              </a>
              <NavLinks />
            </div>
          </header>
          <main className="wrap">{children}</main>
          <footer className="foot">
            <div className="wrap">
              Prawdopodobieństwa to szacunki modelu na podstawie historii – nie gwarantują wyniku. Graj tylko u legalnych
              bukmacherów, za kwoty, które możesz stracić. Zakłady wyłącznie dla osób 18+.
            </div>
          </footer>
        </CouponProvider>
      </body>
    </html>
  );
}

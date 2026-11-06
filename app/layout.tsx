import type { Metadata } from 'next';
import './globals.css';
import { CouponNavLink, CouponProvider } from '@/components/CouponProvider';

export const metadata: Metadata = {
  title: 'KuponLab',
  description: 'Statystyki z 10 ostatnich meczów, model szans i asystent AI do budowania kuponu.',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <CouponProvider>
          <header className="topbar">
            <div className="wrap">
              <a href="/" className="brand">
                <span className="brand-mark" aria-hidden />
                KuponLab
              </a>
              <nav className="nav">
                <a href="/">Mecze</a>
                <CouponNavLink />
              </nav>
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

'use client';

import { usePathname } from 'next/navigation';
import { CouponNavLink } from './CouponProvider';

const LINKS = [
  { href: '/', label: 'Mecze' },
  { href: '/skutecznosc', label: 'Skuteczność' },
  { href: '/dziennik', label: 'Dziennik' },
];

/** Menu z podświetleniem bieżącej strony. */
export default function NavLinks() {
  const path = usePathname() ?? '/';
  const on = (href: string) => (href === '/' ? path === '/' || path.startsWith('/mecz') : path.startsWith(href));
  return (
    <nav className="nav" aria-label="Menu">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} className={on(l.href) ? 'active' : undefined} aria-current={on(l.href) ? 'page' : undefined}>
          {l.label}
        </a>
      ))}
      <CouponNavLink className={path.startsWith('/kupon') ? 'active' : undefined} />
    </nav>
  );
}

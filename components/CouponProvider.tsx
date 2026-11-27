'use client';

import { useT } from './LangProvider';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface CouponItem {
  fixtureId: number;
  match: string;
  kickoff: string;
  marketId: string;
  label: string;
  p: number;
  hit: number | null;
  odds: number | null;
}

interface CouponCtx {
  items: CouponItem[];
  add: (item: CouponItem) => void;
  remove: (fixtureId: number, marketId: string) => void;
  setOdds: (fixtureId: number, marketId: string, odds: number | null) => void;
  clear: () => void;
  has: (fixtureId: number, marketId: string) => boolean;
}

const Ctx = createContext<CouponCtx | null>(null);
const KEY = 'kuponlab-kupon-v1';

export function CouponProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CouponItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
  }, [items, loaded]);

  const add = useCallback((item: CouponItem) => {
    setItems((cur) => [...cur.filter((x) => !(x.fixtureId === item.fixtureId && x.marketId === item.marketId)), item]);
  }, []);
  const remove = useCallback((fixtureId: number, marketId: string) => {
    setItems((cur) => cur.filter((x) => !(x.fixtureId === fixtureId && x.marketId === marketId)));
  }, []);
  const setOdds = useCallback((fixtureId: number, marketId: string, odds: number | null) => {
    setItems((cur) => cur.map((x) => (x.fixtureId === fixtureId && x.marketId === marketId ? { ...x, odds } : x)));
  }, []);
  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((f: number, m: string) => items.some((x) => x.fixtureId === f && x.marketId === m), [items]);

  const value = useMemo(() => ({ items, add, remove, setOdds, clear, has }), [items, add, remove, setOdds, clear, has]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCoupon() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCoupon poza CouponProvider');
  return c;
}

export function CouponNavLink({ className }: { className?: string }) {
  const { items } = useCoupon();
  const t = useT();
  return (
    <a href="/kupon" className={className}>
      {t('Kupon')}{items.length > 0 && <span key={items.length} className="badge">{items.length}</span>}
    </a>
  );
}

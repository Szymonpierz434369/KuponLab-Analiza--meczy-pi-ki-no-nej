'use client';

import { createContext, useContext, useMemo } from 'react';
import { LANG_COOKIE, makeT, type Lang } from '@/lib/i18n';

const Ctx = createContext<Lang>('pl');

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useT() {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}

/** Przełącznik języka w menu: zapisuje wybór w ciasteczku i przeładowuje stronę. */
export function LangSwitch() {
  const lang = useLang();
  const set = (l: Lang) => {
    if (l === lang) return;
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  };
  return (
    <div className="lang" role="group" aria-label={lang === 'es' ? 'Idioma' : 'Język'}>
      {(['pl', 'es'] as const).map((l) => (
        <button key={l} type="button" className={l === lang ? 'on' : ''} aria-pressed={l === lang} onClick={() => set(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

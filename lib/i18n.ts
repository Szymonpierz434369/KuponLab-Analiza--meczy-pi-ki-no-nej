// Tłumaczenia interfejsu. Kluczem jest polski tekst, więc kod czyta się jak dotąd,
// a hiszpańskie wersje są w lib/i18n-es.ts. Zmienne w tekście: {nazwa}.
import { ES } from './i18n-es';

export type Lang = 'pl' | 'es';
export const LANGS: Lang[] = ['pl', 'es'];
export const LANG_COOKIE = 'kursor-lang';

export const localeOf = (lang: Lang) => (lang === 'es' ? 'es-ES' : 'pl-PL');
export const parseLang = (v: string | undefined | null): Lang => (v === 'es' ? 'es' : 'pl');

type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// Teksty składane w kodzie (nazwy zdarzeń z modelu, komunikaty serwera) – tłumaczone wzorcami.
const PATTERNS: [RegExp, string][] = [
  [/^Wygrana (.+)$/, 'Victoria de $1'],
  [/^(.+) lub remis \((1X|X2)\)$/, '$1 o empate ($2)'],
  [/^Powyżej (\S+) gola$/, 'Más de $1 goles'],
  [/^Poniżej (\S+) gola$/, 'Menos de $1 goles'],
  [/^1\. połowa powyżej (\S+) gola$/, '1.ª parte: más de $1 goles'],
  [/^(.+) powyżej (\S+) gola$/, '$1: más de $2 goles'],
  [/^Rożne powyżej (\S+)$/, 'Córners: más de $1'],
  [/^Rożne poniżej (\S+)$/, 'Córners: menos de $1'],
  [/^(.+): rożne powyżej (\S+)$/, '$1: córners, más de $2'],
  [/^Żółte kartki powyżej (\S+)$/, 'Tarjetas amarillas: más de $1'],
  [/^Żółte kartki poniżej (\S+)$/, 'Tarjetas amarillas: menos de $1'],
  [/^(.+): żółte powyżej (\S+)$/, '$1: amarillas, más de $2'],
  [/^Strzały celne powyżej (\S+)$/, 'Tiros a puerta: más de $1'],
  [/^(.+): celne powyżej (\S+)$/, '$1: tiros a puerta, más de $2'],
  [/^Faule łącznie powyżej (\S+)$/, 'Faltas totales: más de $1'],
  [/^Faule łącznie poniżej (\S+)$/, 'Faltas totales: menos de $1'],
  [/^(.+): faule powyżej (\S+)$/, '$1: faltas, más de $2'],
  [/^Strzały łącznie powyżej (\S+)$/, 'Tiros totales: más de $1'],
  [/^Szukam ostatnich meczów: (.+) i (.+)$/, 'Busco los últimos partidos: $1 y $2'],
  [/^Pobieram statystyki meczów \((.+)\)$/, 'Descargo las estadísticas de los partidos ($1)'],
  [/^Mało danych: jedna z drużyn ma tylko (\d+) rozegranych meczów w bazie\.$/, 'Pocos datos: uno de los equipos solo tiene $1 partidos jugados en la base.'],
  [/^Szczegółowe statystyki są tylko z (\d+) meczów jednej z drużyn\.$/, 'Las estadísticas detalladas son solo de $1 partidos de uno de los equipos.'],
  [/^Nie udało się pobrać terminarza drużyny \(ESPN, id (\d+)\)\.$/, 'No se pudo descargar el calendario del equipo (ESPN, id $1).'],
  [/^ESPN odpowiedziało błędem (\d+) dla (.+)\.$/, 'ESPN respondió con el error $1 para $2.'],
  [/^Nie udało się połączyć z ESPN \((.+)\)\. Sprawdź internet\.$/, 'No se pudo conectar con ESPN ($1). Comprueba internet.'],
  [/^Nie udało się pobrać meczów: (.+)$/, 'No se pudieron descargar los partidos: $1'],
  [/^Analiza nie powiodła się: (.+)$/, 'El análisis falló: $1'],
];

export type T = ((s: string, vars?: Vars) => string) & { lang: Lang; locale: string };

/** Funkcja tłumacząca dla języka: t('Tekst po polsku', { zmienne }). */
export function makeT(lang: Lang): T {
  const t = ((s: string, vars?: Vars) => {
    if (lang === 'pl' || !s) return fill(s, vars);
    const hit = ES[s];
    if (hit !== undefined) return fill(hit, vars);
    for (const [re, rep] of PATTERNS) if (re.test(s)) return fill(s.replace(re, rep), vars);
    return fill(s, vars);
  }) as T;
  t.lang = lang;
  t.locale = localeOf(lang);
  return t;
}

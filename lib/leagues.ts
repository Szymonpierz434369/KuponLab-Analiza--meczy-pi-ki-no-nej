// Ligi według identyfikatorów (slugów) ESPN. Kolejność = kolejność na liście meczów.
// ESPN nie udostępnia Ekstraklasy ani I ligi.
// Dodanie ligi: znajdź jej slug w adresie strony ligi na espn.com (np. .../league/_/name/eng.1) i dopisz tutaj.

export interface League {
  slug: string;
  name: string;
  country: string;
}

/** Ligi pokazywane domyślnie */
export const LEAGUES: League[] = [
  { slug: 'uefa.champions', name: 'Liga Mistrzów', country: 'Europa' },
  { slug: 'uefa.europa', name: 'Liga Europy', country: 'Europa' },
  { slug: 'uefa.europa.conf', name: 'Liga Konferencji', country: 'Europa' },
  { slug: 'eng.1', name: 'Premier League', country: 'Anglia' },
  { slug: 'esp.1', name: 'La Liga', country: 'Hiszpania' },
  { slug: 'ita.1', name: 'Serie A', country: 'Włochy' },
  { slug: 'ger.1', name: 'Bundesliga', country: 'Niemcy' },
  { slug: 'fra.1', name: 'Ligue 1', country: 'Francja' },
  { slug: 'ned.1', name: 'Eredivisie', country: 'Holandia' },
  { slug: 'por.1', name: 'Primeira Liga', country: 'Portugalia' },
  { slug: 'eng.2', name: 'Championship', country: 'Anglia' },
  { slug: 'tur.1', name: 'Süper Lig', country: 'Turcja' },
  { slug: 'bel.1', name: 'Pro League', country: 'Belgia' },
  { slug: 'sco.1', name: 'Premiership', country: 'Szkocja' },
];

/** Dodatkowe ligi i puchary pod przyciskiem „Wszystkie” */
export const EXTRA_LEAGUES: League[] = [
  { slug: 'eng.fa', name: 'Puchar Anglii', country: 'Anglia' },
  { slug: 'eng.league_cup', name: 'Puchar Ligi', country: 'Anglia' },
  { slug: 'esp.copa_del_rey', name: 'Puchar Króla', country: 'Hiszpania' },
  { slug: 'ita.coppa_italia', name: 'Puchar Włoch', country: 'Włochy' },
  { slug: 'ger.dfb_pokal', name: 'Puchar Niemiec', country: 'Niemcy' },
  { slug: 'fra.coupe_de_france', name: 'Puchar Francji', country: 'Francja' },
  { slug: 'eng.3', name: 'League One', country: 'Anglia' },
  { slug: 'esp.2', name: 'La Liga 2', country: 'Hiszpania' },
  { slug: 'ita.2', name: 'Serie B', country: 'Włochy' },
  { slug: 'ger.2', name: '2. Bundesliga', country: 'Niemcy' },
  { slug: 'fra.2', name: 'Ligue 2', country: 'Francja' },
  { slug: 'aut.1', name: 'Bundesliga', country: 'Austria' },
  { slug: 'sui.1', name: 'Super League', country: 'Szwajcaria' },
  { slug: 'den.1', name: 'Superliga', country: 'Dania' },
  { slug: 'nor.1', name: 'Eliteserien', country: 'Norwegia' },
  { slug: 'swe.1', name: 'Allsvenskan', country: 'Szwecja' },
  { slug: 'gre.1', name: 'Super League', country: 'Grecja' },
  { slug: 'usa.1', name: 'MLS', country: 'USA' },
  { slug: 'mex.1', name: 'Liga MX', country: 'Meksyk' },
  { slug: 'bra.1', name: 'Série A', country: 'Brazylia' },
  { slug: 'arg.1', name: 'Liga Profesional', country: 'Argentyna' },
  { slug: 'ksa.1', name: 'Saudi Pro League', country: 'Arabia Saudyjska' },
  { slug: 'jpn.1', name: 'J1 League', country: 'Japonia' },
];

const ALL = [...LEAGUES, ...EXTRA_LEAGUES];
export const LEAGUE_ORDER = new Map(ALL.map((l, i) => [l.slug, i]));
export const LEAGUE_BY_SLUG = new Map(ALL.map((l) => [l.slug, l]));

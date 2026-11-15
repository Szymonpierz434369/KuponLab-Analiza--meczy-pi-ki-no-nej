# Kursor (dawniej KuponLab)

Aplikacja do analizy meczów piłkarskich i budowania kuponu. Pokazuje nadchodzące mecze, zbiera statystyki z 10 ostatnich spotkań obu drużyn (bramki, strzały, strzały celne, rożne, żółte i czerwone kartki, faule, posiadanie, xG), liczy szanse modelem Poissona i podpowiada typy. Wbudowany asystent AI (Claude) pomaga w analizie i układaniu kuponu.

Aplikacja nie przyjmuje zakładów. Kupon to lista typów, którą przepisujesz u wybranego bukmachera.

Wygląd: ciemny motyw „Grafit” (ciemnoszary, biały tekst, zielony akcent), font Geist (pliki w `public/fonts`, licencja SIL OFL), logo w `public/brand` i `components/Logo.tsx`. Znak to litera K, której ramiona wychodzą z piłki.

## Czego potrzebujesz

1. **Node.js 20 lub nowszy**: https://nodejs.org (wersja LTS). Sprawdzisz w terminalu: `node -v`.
2. **Internet**: dane meczowe pochodzą z publicznego API ESPN, bez klucza i bez limitu zapytań.
3. **Klucz Claude API** (asystent AI, opcjonalnie): https://console.anthropic.com → *API Keys*. API jest płatne za użycie; jedna pełna analiza meczu to zwykle kilka groszy. Bez tego klucza działa wszystko poza czatem.

## Uruchomienie

W terminalu (PowerShell), w folderze projektu:

```bash
npm install
npm install-scripts approve better-sqlite3
npm rebuild better-sqlite3
```

Skopiuj plik `.env.example` jako `.env.local` i wpisz klucz Claude (jeśli go masz):

```
ANTHROPIC_API_KEY=twój_klucz
ANTHROPIC_MODEL=claude-sonnet-5-5
```

Start:

```bash
npm run dev
```

Otwórz http://localhost:3000.

Na Windowsie możesz też kliknąć dwa razy plik `KuponLab.bat` (albo jego kopię na Pulpicie): uruchomi aplikację i otworzy przeglądarkę.

## Jak korzystać

- **Mecze**: wybierz dzień i kliknij mecz. Domyślnie widać główne ligi i puchary europejskie (lista w `lib/leagues.ts`); przycisk „Wszystkie” dokłada puchary krajowe i inne ligi.
- **Analiza meczu**: szanse 1X2, oczekiwane gole, rożne, kartki i strzały celne, typy z najwyższą zgodnością, średnie obu drużyn, tabela 10 ostatnich meczów ze wszystkimi statystykami, mecze bezpośrednie i lista wszystkich zdarzeń.
- **Kurs bukmachera**: wpisz go przy zdarzeniu. Aplikacja pokaże wartość (`szansa × kurs − 1`). Wartość dodatnia oznacza, że kurs jest wyższy niż wynika z modelu.
- **Kupon**: dodawaj zdarzenia przyciskiem „+ Kupon”. Strona kuponu liczy łączną szansę, kurs fair, wartość i wypłatę z polskim podatkiem (12% od stawki, 10% od wygranej powyżej 2280 zł). Panel „Podpowiedzi” pokazuje minimalny kurs każdego zdarzenia, przy którym kupon jest na plus, ocenia cały kupon, sugeruje stawkę (¼ Kelly, maks. 5% budżetu) i ostrzega przed typowymi błędami: zdarzenia z jednego meczu, za niskie kursy, zbyt długi kupon, mecze, które już się zaczęły.
- **Skuteczność**: zakładka z marginesem błędu (95%) przy każdej trafności, która sprawdza na rozegranych meczach z ostatnich 7–30 dni, ile „Typów z najwyższą zgodnością” weszło. Możesz filtrować po minimalnym kursie fair i rodzaju zdarzenia, a tabele pokazują skuteczność według rodzaju, typu, ligi i szansy z modelu (kalibrację). Pierwsze przeliczenie trwa 2–5 minut, potem liczone są tylko nowe mecze.
- **Kursy rynkowe**: na stronie meczu karta z kursami DraftKings (1X2 i linia goli, z ESPN) porównuje szanse rynku bez marży z modelem. Duża różnica (8 pkt proc. i więcej) jest zaznaczona na czerwono.
- **Dziennik**: na stronie Kupon przycisk „Zapisz do dziennika” zapisuje kupon z kursami, które dostałeś. Po meczach aplikacja sama rozlicza zdarzenia i pokazuje wynik, zwrot oraz trafność zdarzeń na tle tego, co zakładał model. Dla 1X2 i linii goli dopisuje kurs zamknięcia DraftKings i Twoją przewagę nad nim.
- **Asystent AI**: na stronie meczu analizuje ten mecz; na stronie kuponu widzi Twój kupon i wszystkie nadchodzące mecze, które otworzyłeś w aplikacji, więc może z nich ułożyć kupon.

## Skąd są dane

Dane pochodzą z publicznego, nieoficjalnego API ESPN. Nie wymaga ono klucza, ale ESPN może je zmienić bez ostrzeżenia. Wtedy trzeba poprawić plik `lib/espn.ts`. To źródło nadaje się tylko do użytku prywatnego.

- Dostępne: Liga Mistrzów, Liga Europy, Liga Konferencji, top 5 lig, Eredivisie, Primeira Liga, Championship, Süper Lig, liga belgijska i szkocka, a pod przyciskiem „Wszystkie” także puchary krajowe i kilkanaście innych lig.
- Niedostępne: Ekstraklasa i I liga (ESPN ich nie obsługuje) oraz xG.
- Ostatnie 10 meczów drużyny obejmuje wszystkie rozgrywki poza sparingami (liga, puchary, Europa). Nie każde rozgrywki mają w ESPN szczegółowe statystyki; mecze bez nich liczą się tylko do bramek.

Pobrane dane są zapisywane w lokalnej bazie `data/kuponlab.db`. Pierwsza analiza meczu to ok. 25 zapytań i trwa kilka–kilkanaście sekund, ponowne otwarcie jest natychmiastowe. Zakończone mecze są zapisywane na stałe.

## Jak działa model

- **Średnie ważone**: nowsze mecze ważą więcej (każdy starszy mecz ma wagę ×0,9), a średnie są ściągane w stronę średniej ligowej (siła ściągania odpowiada 8 meczom), żeby przy małej próbie nie przesadzać. Tabele w aplikacji pokazują zwykłe średnie, model korzysta z ważonych.
- **Siła rywali**: gole strzelone i stracone są korygowane o poziom rywali z ostatnich 10 meczów (2 gole z mocnym rywalem znaczą więcej niż 2 ze słabym).
- **Bramki**: oczekiwana liczba goli gospodarzy to średnia z ich ataku (gole strzelone) i obrony rywala (gole stracone). Forma u siebie / na wyjeździe waży 40%, gdy drużyna ma co najmniej 3 takie mecze. Szanse wyników wynikają z rozkładu Poissona.
- **Rożne, kartki, strzały**: średnia liczba z „za” i „przeciw” obu drużyn. Rożne i strzały celne mają większy rozrzut niż zakłada rozkład Poissona, więc dla nich model używa rozkładu ujemnego dwumianowego (parametry w `MODEL_CFG` w `lib/model.ts`, dobrane testem wstecznym). Kartki i wszystkie strzały liczone są rozkładem Poissona.
- **Faule**: zdarzenia „faule łącznie powyżej/poniżej” i faule każdej drużyny (rozkład ujemny dwumianowy).
- **Sędzia**: ESPN nie podaje sędziów, więc na stronie meczu można ręcznie wpisać średnią żółtych kartek i fauli sędziego na mecz. Kartki i faule liczone są wtedy pół na pół z drużyn i z sędziego (waga 50% to założenie, nieprzetestowane).
- **Historia**: przy każdym zdarzeniu widać, ile razy wystąpiło w ostatnich meczach gospodarzy i gości, z perspektywy tego meczu (np. dla „wygranej gospodarzy” liczą się zwycięstwa gospodarzy i porażki gości).
- **Typy z najwyższą zgodnością**: szansa z modelu 65–88% i co najmniej 60% trafień w historii obu drużyn. Z każdego rodzaju zdarzenia wybierana jest jedna linia, ta z szansą najbliżej 76%, a kolejność ustala w 40% model i w 60% historia. Te progi dobrał test na 1355 meczach z 1.08–8.11.2026 (trafność typów z kursem fair od 1,25: 79,2% → 80,3% przy tym samym średnim kursie).
- **Powiązane zdarzenia**: dla par zdarzeń z jednego meczu aplikacja zna z tych samych meczów, o ile częściej lub rzadziej wchodzą razem (np. „obie strzelą” i „powyżej 2.5 gola” o ok. 34% częściej). Podpowiedzi kuponu poprawiają wtedy szansę kuponu (`lib/correlation.ts`).

Sprawdzone testem wstecznym i odrzucone (zostają jako przełączniki w `MODEL_CFG` i `SummaryOpts`): poprawka Dixona-Colesa, mieszanie z kursami rynku, kalibracja Platta (także tylko dla fauli, kartek i rożnych), wyłączenie filtru historii, średnie lig zamiast jednej wspólnej, średnie u siebie / na wyjeździe dla rożnych, kartek i strzałów, korekta rożnych i strzałów na siłę rywali, 12–20 meczów zamiast 10, model mnożący (atak × obrona), wagi czasowe w historii trafień i dni odpoczynku. Żadna nie dała wyraźnej poprawy „Typów z najwyższą zgodnością”: obniżały trafność albo zmieniały ją o mniej niż 0,3 pkt proc., czyli w granicach przypadku. Zakłady „z przewagą” modelu na 1X2 i linii goli przeciw kursom DraftKings dawały w teście około −16% zwrotu, więc na wynik i gole rynek jest dokładniejszy; mocne strony modelu to faule, kartki, rożne i strzały celne.

Model nie zna składów, kontuzji, motywacji ani pogody. Traktuj go jako punkt wyjścia do własnej oceny.

Test logiki modelu na przykładowych danych: `npm run test:model`.

## Struktura

```
app/                 strony i API (Next.js)
  page.tsx           lista meczów
  mecz/[id]/         analiza meczu
  kupon/             kupon
  skutecznosc/       skuteczność typów (test wsteczny)
  dziennik/          dziennik zapisanych kuponów
  api/analysis/[id]  przygotowanie analizy (strumień postępu)
  api/ai             asystent AI (Claude)
components/          widoki: analiza, czat AI, kupon
lib/
  espn.ts            klient ESPN i mapowanie danych
  data.ts            pobieranie meczów i statystyk
  stats.ts           agregacja statystyk z 10 meczów
  model.ts           model (Poisson i ujemny dwumianowy), zdarzenia, typy
  settle.ts          rozliczanie zdarzeń na faktycznym wyniku
  backtest.ts        test wsteczny dla zakładki Skuteczność
  analysis.ts        składanie pełnej analizy
  market.ts          kursy rynkowe (DraftKings z ESPN)
  journal.ts         dziennik kuponów i ich rozliczanie
  db.ts              lokalna baza SQLite
  leagues.ts         lista lig
```

## Dalszy rozwój

Gdy aplikacja ma trafić do innych osób: licencjonowane źródło danych (np. API-Football w planie płatnym, które obejmuje też Ekstraklasę i xG), baza w Supabase (zamiast pliku SQLite, wystarczy przepisać `lib/db.ts`), cykliczne pobieranie danych w tle, konta użytkowników i hosting na Vercel.

Graj odpowiedzialnie, tylko u legalnych bukmacherów i za kwoty, które możesz stracić. 18+.

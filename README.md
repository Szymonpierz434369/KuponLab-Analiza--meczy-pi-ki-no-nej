# KuponLab

Aplikacja do analizy meczów piłkarskich i budowania kuponu. Pokazuje nadchodzące mecze, zbiera statystyki z 10 ostatnich spotkań obu drużyn (bramki, strzały, strzały celne, rożne, żółte i czerwone kartki, faule, posiadanie, xG), liczy szanse modelem Poissona i podpowiada typy. Wbudowany asystent AI (Claude) pomaga w analizie i układaniu kuponu.

Aplikacja nie przyjmuje zakładów. Kupon to lista typów, którą przepisujesz u wybranego bukmachera.

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
- **Kupon**: dodawaj zdarzenia przyciskiem „+ Kupon”. Strona kuponu liczy łączną szansę, kurs fair, wartość i wypłatę z polskim podatkiem (12% od stawki, 10% od wygranej powyżej 2280 zł).
- **Skuteczność**: zakładka, która sprawdza na rozegranych meczach z ostatnich 7–30 dni, ile „Typów z najwyższą zgodnością” weszło. Możesz filtrować po minimalnym kursie fair i rodzaju zdarzenia, a tabele pokazują skuteczność według rodzaju, typu, ligi i szansy z modelu (kalibrację). Pierwsze przeliczenie trwa 2–5 minut, potem liczone są tylko nowe mecze.
- **Asystent AI**: na stronie meczu analizuje ten mecz; na stronie kuponu widzi Twój kupon i wszystkie nadchodzące mecze, które otworzyłeś w aplikacji, więc może z nich ułożyć kupon.

## Skąd są dane

Dane pochodzą z publicznego, nieoficjalnego API ESPN. Nie wymaga ono klucza, ale ESPN może je zmienić bez ostrzeżenia. Wtedy trzeba poprawić plik `lib/espn.ts`. To źródło nadaje się tylko do użytku prywatnego.

- Dostępne: Liga Mistrzów, Liga Europy, Liga Konferencji, top 5 lig, Eredivisie, Primeira Liga, Championship, Süper Lig, liga belgijska i szkocka, a pod przyciskiem „Wszystkie” także puchary krajowe i kilkanaście innych lig.
- Niedostępne: Ekstraklasa i I liga (ESPN ich nie obsługuje) oraz xG.
- Ostatnie 10 meczów drużyny obejmuje wszystkie rozgrywki poza sparingami (liga, puchary, Europa). Nie każde rozgrywki mają w ESPN szczegółowe statystyki; mecze bez nich liczą się tylko do bramek.

Pobrane dane są zapisywane w lokalnej bazie `data/kuponlab.db`. Pierwsza analiza meczu to ok. 25 zapytań i trwa kilka–kilkanaście sekund, ponowne otwarcie jest natychmiastowe. Zakończone mecze są zapisywane na stałe.

## Jak działa model

- **Bramki**: oczekiwana liczba goli gospodarzy to średnia z ich ataku (gole strzelone) i obrony rywala (gole stracone). Forma u siebie / na wyjeździe waży 40%, gdy drużyna ma co najmniej 3 takie mecze. Szanse wyników wynikają z rozkładu Poissona.
- **Rożne, kartki, strzały**: średnia liczba z „za” i „przeciw” obu drużyn. Rożne i strzały celne mają większy rozrzut niż zakłada rozkład Poissona, więc dla nich model używa rozkładu ujemnego dwumianowego (parametry w `MODEL_CFG` w `lib/model.ts`, dobrane testem wstecznym). Kartki i wszystkie strzały liczone są rozkładem Poissona.
- **Historia**: przy każdym zdarzeniu widać, ile razy wystąpiło w ostatnich meczach gospodarzy i gości, z perspektywy tego meczu (np. dla „wygranej gospodarzy” liczą się zwycięstwa gospodarzy i porażki gości).
- **Typy z najwyższą zgodnością**: szansa z modelu 60–92% i co najmniej 60% trafień w historii obu drużyn.

Model nie zna składów, kontuzji, motywacji ani pogody. Traktuj go jako punkt wyjścia do własnej oceny.

Test logiki modelu na przykładowych danych: `npm run test:model`.

## Struktura

```
app/                 strony i API (Next.js)
  page.tsx           lista meczów
  mecz/[id]/         analiza meczu
  kupon/             kupon
  skutecznosc/       skuteczność typów (test wsteczny)
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
  db.ts              lokalna baza SQLite
  leagues.ts         lista lig
```

## Dalszy rozwój

Gdy aplikacja ma trafić do innych osób: licencjonowane źródło danych (np. API-Football w planie płatnym, które obejmuje też Ekstraklasę i xG), baza w Supabase (zamiast pliku SQLite, wystarczy przepisać `lib/db.ts`), cykliczne pobieranie danych w tle, konta użytkowników i hosting na Vercel.

Graj odpowiedzialnie, tylko u legalnych bukmacherów i za kwoty, które możesz stracić. 18+.

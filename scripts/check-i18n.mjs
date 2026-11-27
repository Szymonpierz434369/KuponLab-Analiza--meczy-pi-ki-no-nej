// Sprawdza, czy każdy tekst przekazany do t('...') / tr('...') ma hiszpańską wersję w lib/i18n-es.ts.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.next', 'data', '.git'].includes(f.name)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(f.name) && !p.includes('i18n')) files.push(p);
  }
};
walk(root);

// teksty, które trafiają do t() pośrednio (nazwy lig, statystyk, grup, statusów, kroków)
const extra = [];
const leagues = fs.readFileSync(path.join(root, 'lib/leagues.ts'), 'utf8');
for (const m of leagues.matchAll(/name: '([^']+)', country: '([^']+)'/g)) extra.push(m[1], m[2]);
const stats = fs.readFileSync(path.join(root, 'lib/stats.ts'), 'utf8');
for (const m of stats.slice(stats.indexOf('STAT_LABELS'), stats.indexOf('};', stats.indexOf('STAT_LABELS'))).matchAll(/: '([^']+)'/g)) extra.push(m[1]);
extra.push('Wynik', 'Bramki', 'Rożne', 'Kartki', 'Strzały celne', 'Strzały', 'Faule', 'Remis', 'Ktoś wygra (12)', 'Obie drużyny strzelą', 'Obie drużyny strzelą: NIE', 'Gol w 1. połowie', 'Czerwona kartka w meczu');
extra.push('wygrany', 'przegrany', 'w toku', 'zwrot', 'Łączę się', 'Pobieram dane meczu', 'Sprawdzam siłę rywali z ostatnich meczów', 'Liczę model', 'Pobieram listy meczów', 'Liczę typy dla nowych meczów', 'Gotowe');
// t() z warunkiem (dwa warianty tekstu) i etykiety menu
extra.push(
  'Mecze', 'Skuteczność', 'Dziennik', 'Kupon',
  'Jeden mecz już się zaczął albo zakończył ({list}). Usuń go z kuponu.',
  '{n} mecze już się zaczęły albo zakończyły ({list}). Usuń je z kuponu.',
  '{a} i {b} z jednego meczu wchodzą razem o {n}% częściej, niż wynika z mnożenia szans. Bukmacher zwykle to wie i w kreatorze zakładów obniża za to kurs.',
  '{a} i {b} z jednego meczu wchodzą razem o {n}% rzadziej, niż wynika z mnożenia szans. Te zdarzenia sobie przeszkadzają.',
);
extra.push('Brak szczegółowych statystyk (rożne, kartki, strzały) dla tych drużyn – model liczy tylko bramki.', 'Nie udało się pobrać meczów z ESPN. Sprawdź połączenie z internetem.', 'Podaj stawkę większą od zera.', 'Kupon jest pusty.');

const { ES } = await import(path.join(root, 'lib/i18n-es.ts')).catch(() => ({ ES: null }));
let es = ES;
if (!es) {
  const src = fs.readFileSync(path.join(root, 'lib/i18n-es.ts'), 'utf8');
  es = Function(`return ${src.slice(src.indexOf('{', src.indexOf('ES')), src.lastIndexOf('}') + 1)}`)();
}
const keys = new Set(extra);
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt[r]?\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
}
const missing = [...keys].filter((k) => !(k in es) && /[a-ząćęłńóśźż]/i.test(k));
if (process.argv.includes('--list')) console.log(JSON.stringify(missing, null, 1));
console.log(`Teksty: ${keys.size}, bez tłumaczenia: ${missing.length}`);
process.exit(missing.length ? 1 : 0);

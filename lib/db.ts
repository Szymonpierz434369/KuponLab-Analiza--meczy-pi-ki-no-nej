import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Lokalna baza SQLite w folderze ./data. Trzyma odpowiedzi API (cache),
// żeby nie zużywać dziennego limitu zapytań, oraz streszczenia analiz.
// Później można ją podmienić na Supabase/Postgres – reszta kodu korzysta
// tylko z funkcji poniżej.

const dir = path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });

const g = globalThis as unknown as { __kuponlabDb?: Database.Database };

function open(): Database.Database {
  const db = new Database(path.join(dir, 'kuponlab.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    create table if not exists api_cache (
      key text primary key,
      body text not null,
      fetched_at integer not null
    );
    create table if not exists meta (
      key text primary key,
      value text not null
    );
    create table if not exists analyses (
      fixture_id integer primary key,
      kickoff text not null,
      summary text not null,
      updated_at integer not null
    );
  `);
  return db;
}

export const db: Database.Database = g.__kuponlabDb ?? (g.__kuponlabDb = open());

export function cacheGet<T>(key: string, maxAgeMs: number, allowStale = false): T | undefined {
  const row = db.prepare('select body, fetched_at from api_cache where key = ?').get(key) as
    | { body: string; fetched_at: number }
    | undefined;
  if (!row) return undefined;
  if (!allowStale && Date.now() - row.fetched_at > maxAgeMs) return undefined;
  return JSON.parse(row.body) as T;
}

export function cacheSet(key: string, value: unknown) {
  db.prepare(
    'insert into api_cache (key, body, fetched_at) values (?, ?, ?) on conflict(key) do update set body = excluded.body, fetched_at = excluded.fetched_at',
  ).run(key, JSON.stringify(value), Date.now());
}

export function metaGet(key: string): string | undefined {
  const row = db.prepare('select value from meta where key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function metaSet(key: string, value: string) {
  db.prepare('insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value').run(
    key,
    value,
  );
}

export function saveAnalysisSummary(fixtureId: number, kickoff: string, summary: unknown) {
  db.prepare(
    'insert into analyses (fixture_id, kickoff, summary, updated_at) values (?, ?, ?, ?) on conflict(fixture_id) do update set kickoff = excluded.kickoff, summary = excluded.summary, updated_at = excluded.updated_at',
  ).run(fixtureId, kickoff, JSON.stringify(summary), Date.now());
}

export function upcomingAnalysisSummaries(): unknown[] {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const rows = db
    .prepare('select summary from analyses where kickoff >= ? order by kickoff asc limit 40')
    .all(since) as { summary: string }[];
  return rows.map((r) => JSON.parse(r.summary));
}

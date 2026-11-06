// Wewnętrzny format meczu. Dane z ESPN są mapowane do tego kształtu w lib/espn.ts.

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
  winner?: boolean | null;
}

export interface ApiStatBlock {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
}

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    referee?: string | null;
    venue?: { name?: string | null; city?: string | null };
    status: { short: string; long: string; elapsed?: number | null };
  };
  league: {
    /** slug ligi w ESPN, np. eng.1 */
    id: string;
    name: string;
    country: string;
    logo: string;
    flag?: string | null;
    season: number;
    round?: string;
  };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
  statistics?: ApiStatBlock[];
}

export const FINISHED = new Set(['FT', 'AET', 'PEN']);
export const NOT_STARTED = new Set(['NS', 'TBD', 'PST', 'CANC']);

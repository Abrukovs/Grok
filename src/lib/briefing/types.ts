export const SPORTS = [
  "football",
  "hockey",
  "basketball",
  "tennis",
  "american_football",
  "baseball",
  "mma",
] as const;

export type Sport = (typeof SPORTS)[number];

export type MatchState = "pre" | "in" | "post";

export type Risk = "low" | "medium" | "high";

export type Side = {
  name: string;
  short: string;
  form?: string;
  record?: string;
  logo?: string;
};

export type MatchEvent = {
  id: string;
  sport: Sport;
  league: string;
  leagueShort: string;
  name: string;
  shortName: string;
  home: Side;
  away: Side;
  date: string;
  state: MatchState;
  statusText: string;
  homeScore?: string;
  awayScore?: string;
  winner?: "home" | "away";
};

export type Tip = {
  id: string;
  eventId: string;
  sport: Sport;
  league: string;
  leagueShort: string;
  home: Side;
  away: Side;
  kickoff: string;
  state: MatchState;
  statusText: string;
  homeScore?: string;
  awayScore?: string;
  market: string;
  pick: string;
  oddsHint: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  risk: Risk;
};

export type BriefingStats = {
  matchCount: number;
  upcomingCount: number;
  liveCount: number;
  tipCount: number;
  avgConfidence: number;
  bySport: { key: string; label: string; count: number }[];
  byRisk: { key: Risk; label: string; count: number }[];
  byMarket: { label: string; count: number }[];
};

export type IdeaSnapshot = {
  tipId: string;
  match: string;
  market: string;
  pick: string;
  rationale: string;
  oddsHint?: string;
  confidence?: 1 | 2 | 3 | 4 | 5;
  risk?: Risk;
};

export type SavedIdea = {
  date: string;
  sport: Sport;
  match: string;
  league: string;
  market: string;
  pick: string;
  verdict?: JournalVerdict;
  score?: string;
};

export type Briefing = {
  date: string;
  timezone: string;
  intro: string;
  tips: Tip[];
  calm?: Tip[];
  live: MatchEvent[];
  matchCount: number;
  stats: BriefingStats;
  generatedAt: string;
  closed: Settlement[];
  theses: IdeaSnapshot[];
  savedIdeas?: SavedIdea[];
};

export type AnalystReply = {
  text: string;
};

export type JournalVerdict = "hit" | "miss" | "void";

export type JournalEntry = {
  id: string;
  tipId: string;
  match: string;
  market: string;
  pick: string;
  sport: Sport;
  leagueShort: string;
  verdict: JournalVerdict;
  settledAt: string;
  briefingDate: string;
  source: "auto" | "manual";
  score?: string;
  rationale?: string;
  oddsHint?: string;
  confidence?: 1 | 2 | 3 | 4 | 5;
  risk?: Risk;
  missNote?: string;
};

export type SlimTip = {
  id: string;
  eventId: string;
  sport: Sport;
  league: string;
  leagueShort: string;
  home: { name: string; short: string; logo?: string };
  away: { name: string; short: string; logo?: string };
  kickoff: string;
  market: string;
  pick: string;
  oddsHint: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  risk: Risk;
  briefingDate: string;
  verdict?: JournalVerdict;
  score?: string;
};

export type Settlement = {
  tipId: string;
  briefingDate: string;
  match: string;
  market: string;
  pick: string;
  sport: Sport;
  leagueShort: string;
  verdict: JournalVerdict;
  score: string;
  rationale?: string;
  oddsHint?: string;
  confidence?: 1 | 2 | 3 | 4 | 5;
  risk?: Risk;
};

export type DailyStat = {
  date: string;
  hits: number;
  misses: number;
  voids: number;
  pending: number;
  rate: number | null;
};

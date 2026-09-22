export type Position = "GKP" | "DEF" | "MID" | "FWD";

export type GameweekPoint = {
  gw: number;
  points: number;
  fixture: string;
  estimated: boolean;
};

export type Player = {
  id: number;
  code: number;
  name: string;
  team: string;
  teamShort: string;
  teamCode: number;
  position: Position;
  status: string;
  news: string;
  nextGwPoints: number;
  totals: number[];
  gameweeks: GameweekPoint[];
};

export type Waiver = {
  id: string;
  add: Player;
  drop: Player;
  gain: number;
  horizon: number;
};

export type AnalysisResponse = {
  entry: { id: number; name: string };
  league: { id: number; name: string };
  nextGameweek: number;
  availableGameweeks: number[];
  projectionUpdatedFor: number | null;
  projectionUpdatedAt: string | null;
  refreshedAt: string;
  squad: Player[];
  waiversByHorizon: Record<string, Waiver[]>;
};

import "server-only";

import { unstable_cache } from "next/cache";
import type { Player, Position, Waiver } from "./types";

const DRAFT_API = "https://draft.premierleague.com/api";
const FFP_URL = "https://www.fantasyfootballpundit.com/fpl-points-predictor/";
const POSITION: Record<number, Position> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

type FfpRecord = {
  gw: number;
  player_code: number;
  web_name?: string;
  first_name?: string;
  second_name?: string;
  team_name?: string;
  team_short?: string;
  element_type?: number;
  predicted_points?: number | string | null;
  predicted_points_start?: number | string | null;
  opponent_abbr?: string | null;
  is_home?: boolean | null;
  source?: string;
};

type BootstrapElement = {
  id: number;
  code: number;
  web_name: string;
  team: number;
  element_type: number;
  status: string;
  news?: string;
};

type Bootstrap = {
  elements: BootstrapElement[];
  teams: { id: number; code: number; name: string; short_name: string }[];
  events: { current: number; next: number };
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function requestJson<T>(path: string, cache: RequestCache = "no-store"): Promise<T> {
  const response = await fetch(`${DRAFT_API}/${path}`, {
    cache,
    headers: { "user-agent": "draftedge/1.0" },
  });
  if (!response.ok) throw new Error(`FPL Draft returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

function decodeFlightPayloads(html: string): string[] {
  const payloads: string[] = [];
  const marker = "self.__next_f.push(";
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf(marker, cursor);
    if (start === -1) break;
    const bracket = html.indexOf("[", start);
    const comma = bracket === -1 ? -1 : html.indexOf(",", bracket);
    const quoteStart = comma === -1 ? -1 : html.indexOf('"', comma);
    if (quoteStart === -1) {
      cursor = start + marker.length;
      continue;
    }

    let index = quoteStart + 1;
    while (index < html.length) {
      if (html[index] === "\\") index += 2;
      else if (html[index] === '"') break;
      else index += 1;
    }

    const literal = html.slice(quoteStart, index + 1);
    cursor = index + 1;
    try {
      payloads.push(JSON.parse(literal));
    } catch {
      // Ignore unrelated or malformed flight chunks.
    }
  }
  return payloads;
}

function parseFfp(html: string) {
  const records: FfpRecord[] = [];
  const seen = new Set<string>();
  const pattern = /\{\s*"gw"\s*:\s*\d+\s*,\s*"player_code"\s*:\s*\d+\s*,[^{}]*\}/g;

  for (const payload of decodeFlightPayloads(html)) {
    for (const raw of payload.match(pattern) ?? []) {
      try {
        const record = JSON.parse(raw) as FfpRecord;
        const key = `${record.player_code}:${record.gw}`;
        if (!seen.has(key)) {
          seen.add(key);
          records.push(record);
        }
      } catch {
        // Keep scanning the remaining records.
      }
    }
  }

  if (records.length < 300) {
    throw new Error("The FFP projection page changed shape; fewer than 300 player rows were found.");
  }

  const updatedFor = Number(html.match(/Updated for GW(\d+)/i)?.[1]) || null;
  const updatedAt = html.match(/UpdatedStamp[^>]*>[\s\S]*?<time[^>]*dateTime="([^"]+)"/i)?.[1] ?? null;
  return { records, updatedFor, updatedAt };
}

async function loadDailyData() {
  const [bootstrap, ffpResponse] = await Promise.all([
    requestJson<Bootstrap>("bootstrap-static", "no-store"),
    fetch(FFP_URL, {
      cache: "no-store",
      headers: { "user-agent": "draftedge/1.0 (personal fantasy analysis)" },
    }),
  ]);
  if (!ffpResponse.ok) throw new Error(`FFP returned ${ffpResponse.status}`);
  const ffp = parseFfp(await ffpResponse.text());
  return { bootstrap, ffp, refreshedAt: new Date().toISOString() };
}

export const getDailyData = unstable_cache(loadDailyData, ["draftedge-daily-v1"], {
  revalidate: 86_400,
  tags: ["draftedge-daily"],
});

function makePlayers(bootstrap: Bootstrap, projections: FfpRecord[], gameweeks: number[]): Player[] {
  const teamById = new Map(bootstrap.teams.map((team) => [team.id, team]));
  const projectionsByCode = new Map<number, FfpRecord[]>();
  for (const projection of projections) {
    if (!gameweeks.includes(Number(projection.gw))) continue;
    const current = projectionsByCode.get(Number(projection.player_code)) ?? [];
    current.push(projection);
    projectionsByCode.set(Number(projection.player_code), current);
  }

  return bootstrap.elements.map((element) => {
    const team = teamById.get(element.team);
    const byGw = new Map((projectionsByCode.get(element.code) ?? []).map((row) => [Number(row.gw), row]));
    const points = gameweeks.map((gw) => {
      const row = byGw.get(gw);
      const raw = row?.predicted_points_start ?? row?.predicted_points ?? 0;
      return round(Number(raw) || 0);
    });
    const totals = points.map((_, index) => round(points.slice(0, index + 1).reduce((sum, value) => sum + value, 0)));
    const gameweekPoints = gameweeks.map((gw, index) => {
      const row = byGw.get(gw);
      const venue = row?.is_home === true ? "H" : row?.is_home === false ? "A" : "";
      return {
        gw,
        points: points[index],
        fixture: row?.opponent_abbr ? `${row.opponent_abbr} (${venue})` : "—",
        estimated: row?.source === "estimated",
      };
    });

    return {
      id: element.id,
      code: element.code,
      name: element.web_name,
      team: team?.name ?? "Unknown",
      teamShort: team?.short_name ?? "—",
      teamCode: team?.code ?? 0,
      position: POSITION[element.element_type],
      status: element.status,
      news: element.news ?? "",
      nextGwPoints: points[0] ?? 0,
      totals,
      gameweeks: gameweekPoints,
    };
  });
}

function buildWaivers(squad: Player[], freeAgents: Player[], horizon: number): Waiver[] {
  const index = horizon - 1;
  const all: Waiver[] = [];

  for (const position of ["GKP", "DEF", "MID", "FWD"] as Position[]) {
    const mine = squad.filter((player) => player.position === position);
    const theirs = freeAgents.filter((player) => player.position === position);
    for (const add of theirs) {
      for (const drop of mine) {
        const gain = round((add.totals[index] ?? 0) - (drop.totals[index] ?? 0));
        if (gain > 0) all.push({ id: `${horizon}:${add.id}:${drop.id}`, add, drop, gain, horizon });
      }
    }
  }

  all.sort((left, right) => right.gain - left.gain);
  const usedAdds = new Set<number>();
  const usedDrops = new Set<number>();
  const result: Waiver[] = [];
  for (const waiver of all) {
    if (usedAdds.has(waiver.add.id) || usedDrops.has(waiver.drop.id)) continue;
    usedAdds.add(waiver.add.id);
    usedDrops.add(waiver.drop.id);
    result.push(waiver);
    if (result.length === 20) break;
  }
  return result;
}

export async function analyseTeam(teamId: number) {
  const entryData = await requestJson<{ entry: { id: number; name: string; league_set: number[] } }>(`entry/${teamId}/public`);
  const entry = entryData.entry;
  if (!entry?.league_set?.length) throw new Error("This team is not in a Draft league.");

  const leagueId = entry.league_set[0];
  const [daily, leagueData, ownershipData] = await Promise.all([
    getDailyData(),
    requestJson<{ league: { id: number; name: string } }>(`league/${leagueId}/details`),
    requestJson<{ element_status: { element: number; owner: number | null }[] }>(`league/${leagueId}/element-status`),
  ]);

  const nextGameweek = daily.bootstrap.events.next;
  const allProjectionGws = [...new Set(daily.ffp.records.map((row) => Number(row.gw)))].sort((a, b) => a - b);
  const availableGameweeks = allProjectionGws.filter((gw) => gw >= nextGameweek).slice(0, 5);
  if (!availableGameweeks.length) throw new Error("FFP has no projections for the next gameweek yet.");

  const players = makePlayers(daily.bootstrap, daily.ffp.records, availableGameweeks);
  const playerById = new Map(players.map((player) => [player.id, player]));
  const squad = ownershipData.element_status
    .filter((row) => Number(row.owner) === teamId)
    .map((row) => playerById.get(row.element))
    .filter((player): player is Player => Boolean(player));
  const freeAgents = ownershipData.element_status
    .filter((row) => row.owner === null)
    .map((row) => playerById.get(row.element))
    .filter((player): player is Player => Boolean(player));
  if (!squad.length) throw new Error("No current squad was found for that team ID.");

  const waiversByHorizon: Record<string, Waiver[]> = {};
  for (let horizon = 1; horizon <= availableGameweeks.length; horizon += 1) {
    waiversByHorizon[String(horizon)] = buildWaivers(squad, freeAgents, horizon);
  }

  return {
    entry: { id: entry.id, name: entry.name },
    league: leagueData.league,
    nextGameweek,
    availableGameweeks,
    projectionUpdatedFor: daily.ffp.updatedFor,
    projectionUpdatedAt: daily.ffp.updatedAt,
    refreshedAt: daily.refreshedAt,
    squad,
    waiversByHorizon,
  };
}

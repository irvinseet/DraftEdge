"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { AnalysisResponse, Player, Position, Waiver } from "@/lib/fpl/types";

const FORMATIONS: [number, number, number][] = [
  [3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2],
  [4, 5, 1], [5, 2, 3], [5, 3, 2], [5, 4, 1],
];

function formatPoints(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function applyWaivers(squad: Player[], waivers: Waiver[]) {
  const dropped = new Set(waivers.map((waiver) => waiver.drop.id));
  return [...squad.filter((player) => !dropped.has(player.id)), ...waivers.map((waiver) => waiver.add)];
}

function optimiseLineup(squad: Player[]) {
  const byPosition = (position: Position) =>
    squad.filter((player) => player.position === position).sort((a, b) => b.nextGwPoints - a.nextGwPoints);
  const goalkeepers = byPosition("GKP");
  const defenders = byPosition("DEF");
  const midfielders = byPosition("MID");
  const forwards = byPosition("FWD");
  let best: Player[] = [];
  let formation = "—";
  let bestScore = -Infinity;

  for (const [def, mid, fwd] of FORMATIONS) {
    if (!goalkeepers[0] || defenders.length < def || midfielders.length < mid || forwards.length < fwd) continue;
    const starters = [goalkeepers[0], ...defenders.slice(0, def), ...midfielders.slice(0, mid), ...forwards.slice(0, fwd)];
    const score = starters.reduce((sum, player) => sum + player.nextGwPoints, 0);
    if (score > bestScore) {
      best = starters;
      bestScore = score;
      formation = `${def}-${mid}-${fwd}`;
    }
  }

  const starterIds = new Set(best.map((player) => player.id));
  const bench = squad
    .filter((player) => !starterIds.has(player.id))
    .sort((a, b) => (a.position === "GKP" ? 0 : 1) - (b.position === "GKP" ? 0 : 1) || b.nextGwPoints - a.nextGwPoints);
  return { starters: best, bench, formation, score: Math.max(0, bestScore) };
}

function PlayerTile({ player }: { player: Player }) {
  const shirtUrl = player.teamCode
    ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${player.teamCode}${player.position === "GKP" ? "_1" : ""}-66.png`
    : "";
  const nextFixture = player.gameweeks[0]?.fixture ?? "—";

  return (
    <div className="player-card min-w-0 text-center">
      <div className="jersey-wrap" style={{ "--team-colour": `var(--team-${player.teamShort.toLowerCase()}, #7c8b84)` } as CSSProperties}>
        {shirtUrl ? <img className="jersey" src={shirtUrl} alt={`${player.team} ${player.position === "GKP" ? "goalkeeper" : "outfield"} shirt`} /> : <span className={`jersey-fallback ${player.position === "GKP" ? "jersey-fallback-gk" : ""}`} aria-hidden="true" />}
      </div>
      <p className="player-name truncate">{player.name}</p>
      <div className="player-meta">
        <p>{formatPoints(player.nextGwPoints)} xP</p>
        <p className="player-fixture truncate">{nextFixture}</p>
      </div>
    </div>
  );
}

function Lineup({ squad, title, note }: { squad: Player[]; title: string; note: string }) {
  const lineup = useMemo(() => optimiseLineup(squad), [squad]);
  const row = (position: Position) => lineup.starters.filter((player) => player.position === position);

  return (
    <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-white/45">{note}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-[#b6f23a]">{lineup.formation}</p>
          <p className="text-xs text-white/45">{formatPoints(lineup.score)} xP</p>
        </div>
      </div>

      <div className="pitch relative mx-auto overflow-hidden rounded-2xl border border-white/10 p-3 sm:p-4">
        <span className="pitch-halfway" aria-hidden="true" />
        <span className="pitch-centre" aria-hidden="true" />
        <span className="pitch-box pitch-box-top" aria-hidden="true" />
        <span className="pitch-box pitch-box-bottom" aria-hidden="true" />
        <div className="relative z-10 grid h-full grid-rows-4 gap-2 py-3 sm:gap-3 sm:py-5">
          {(["GKP", "DEF", "MID", "FWD"] as Position[]).map((position) => (
            <div key={position} className="flex min-w-0 items-center justify-evenly gap-1 sm:gap-2">
              {row(position).map((player) => <PlayerTile key={player.id} player={player} />)}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-white/40">Bench order</p>
        <div className="grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-4">
          {lineup.bench.map((player, index) => (
            <div key={player.id} className="min-w-0">
              <PlayerTile player={player} />
              <p className="mt-1 text-center text-xs font-medium text-white/45">{player.position === "GKP" ? "GK" : index}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [teamId, setTeamId] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [horizon, setHorizon] = useState(1);
  const [minGain, setMinGain] = useState(0.75);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const currentWaivers = analysis?.waiversByHorizon[String(horizon)] ?? [];
  const shownWaivers = currentWaivers.filter((waiver) => waiver.gain >= minGain);
  const selectedWaivers = currentWaivers.filter((waiver) => selectedIds.has(waiver.id) && waiver.gain >= minGain);
  const projectedSquad = analysis ? applyWaivers(analysis.squad, selectedWaivers) : [];
  const horizonStart = analysis?.availableGameweeks[0];
  const horizonEnd = analysis?.availableGameweeks[Math.max(0, horizon - 1)];
  const horizonLabel = horizonStart && horizonEnd
    ? horizonStart === horizonEnd ? `GW${horizonStart}` : `GW${horizonStart}–GW${horizonEnd}`
    : `${horizon} GW${horizon > 1 ? "s" : ""}`;

  async function runAnalysis(rawTeamId: string) {
    if (!rawTeamId.trim()) throw new Error("Enter a valid numeric FPL Draft team ID.");
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/analyse?teamId=${encodeURIComponent(rawTeamId.trim())}`, { cache: "no-store" });
      const payload = await response.json() as AnalysisResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not analyse that team.");
      setAnalysis(payload);
      setTeamId(rawTeamId.trim());
      setHorizon(1);
      setSelectedIds(new Set());
      return payload as AnalysisResponse;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not analyse that team.");
      throw caught;
    } finally {
      setLoading(false);
    }
  }

  async function analyse(event: FormEvent) {
    event.preventDefault();
    try {
      await runAnalysis(teamId);
    } catch {
      // The visible error state is set by runAnalysis.
    }
  }

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool({
      name: "analyse_draft_team",
      title: "Analyse FPL Draft team",
      description: "Load an FPL Draft team, detect its league, and show its waiver board and next-gameweek lineup.",
      inputSchema: {
        type: "object",
        properties: { teamId: { type: "integer", minimum: 1 } },
        required: ["teamId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: unknown) => {
        const team = (input as { teamId?: unknown })?.teamId;
        if (!Number.isInteger(team) || Number(team) <= 0) throw new Error("teamId must be a positive integer.");
        const result = await runAnalysis(String(team));
        return { teamId: result.entry.id, team: result.entry.name, league: result.league.name, nextGameweek: result.nextGameweek };
      },
    }, { signal: lifecycle.signal });
    Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
    // Register once; the action only depends on stable React state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleWaiver(waiver: Waiver, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(waiver.id);
      else next.delete(waiver.id);
      return next;
    });
  }

  function reset() {
    setAnalysis(null);
    setError("");
    setSelectedIds(new Set());
  }

  return (
    <main className="min-h-screen bg-[#07140f] text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <button className="flex items-center gap-3 text-left" onClick={reset} aria-label="Return to team entry">
          <span className="grid size-10 place-items-center rounded-xl bg-[#b6f23a] text-[#07140f]">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold tracking-[-0.02em]">DraftEdge</span>
            <span className="block text-xs text-white/50">FPL Draft waiver planner</span>
          </span>
        </button>
        {analysis && (
          <Button variant="ghost" className="text-white/60 hover:bg-white/10 hover:text-white" onClick={reset}>
            Change team
          </Button>
        )}
      </header>

      {!analysis ? (
        <section className="mx-auto grid min-h-[calc(100vh-96px)] max-w-7xl place-items-center px-5 pb-24 sm:px-8">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/20 sm:p-10">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-[#b6f23a]">Start with your team</p>
            <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Find the waivers that actually improve your squad.</h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-white/60">Enter your FPL Draft team ID. Your league and every unavailable player are handled automatically.</p>
            <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={analyse}>
              <Input
                aria-label="FPL Draft team ID"
                aria-invalid={Boolean(error)}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 250408"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value.replace(/\D/g, ""))}
                className="h-12 border-white/10 bg-black/20 px-4 text-base text-white placeholder:text-white/30"
              />
              <Button className="h-12 bg-[#b6f23a] px-6 font-semibold text-[#07140f] hover:bg-[#c6ff4b]" type="submit" disabled={loading || !teamId}>
                {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
                {loading ? "Loading league" : "Analyse team"}
              </Button>
            </form>
            {error ? (
              <p className="mt-4 flex items-start gap-2 text-sm text-[#ff9d9d]" role="alert"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</p>
            ) : (
              <p className="mt-4 text-sm text-white/40">Find it in the number at the end of your Draft team URL.</p>
            )}
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-5 pb-16 pt-5 sm:px-8 sm:pt-8">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-[#b6f23a]">{analysis.league.name}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{analysis.entry.name}</h1>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">GW{analysis.nextGameweek} next</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">15-player squad</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">League auto-detected</span>
            </div>
          </div>

          <section className="mb-5 grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end sm:p-6">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="font-medium" htmlFor="horizon">Waiver horizon</label>
                <span className="rounded-lg bg-[#b6f23a]/10 px-2.5 py-1 text-sm font-semibold text-[#b6f23a]">{horizonLabel}</span>
              </div>
              <Slider id="horizon" aria-label="Waiver horizon in gameweeks" min={1} max={Math.min(5, analysis.availableGameweeks.length)} step={1} value={[horizon]} onValueChange={([value]) => { setHorizon(value); setSelectedIds(new Set()); }} />
              <div className="mt-2 flex justify-between text-xs text-white/35"><span>GW{analysis.availableGameweeks[0]}</span><span>GW{analysis.availableGameweeks[Math.min(4, analysis.availableGameweeks.length - 1)]}</span></div>
              <p className="mt-2 text-xs text-white/40">Compares cumulative xP across {horizonLabel}.</p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="font-medium" htmlFor="min-gain">Minimum gain</label>
                <div className="flex items-center gap-2">
                  <Input id="min-gain" aria-label="Minimum expected-points gain" type="number" min={0} max={50} step={0.25} value={minGain} onChange={(event) => setMinGain(Math.max(0, Number(event.target.value) || 0))} className="h-8 w-20 border-white/10 bg-black/20 text-right text-sm" />
                  <span className="text-sm text-white/45">xP</span>
                </div>
              </div>
              <Slider aria-label="Minimum expected-points gain slider" min={0} max={15} step={0.25} value={[Math.min(minGain, 15)]} onValueChange={([value]) => setMinGain(value)} />
              <div className="mt-2 flex justify-between text-xs text-white/35"><span>Any gain</span><span>15+</span></div>
              <p className="mt-2 text-xs text-white/40">Only show swaps gaining at least {formatPoints(minGain)} xP.</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm">
              <p className="font-semibold text-white">{shownWaivers.length} upgrades</p>
              <p className="mt-0.5 text-white/40">{selectedWaivers.length} selected</p>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
            <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Waiver priority</h2>
                  <p className="mt-1 text-sm text-white/45">Select claims to preview the resulting lineup.</p>
                </div>
                <Sparkles className="size-5 text-[#b6f23a]" aria-hidden="true" />
              </div>

              <div className="space-y-3">
                {shownWaivers.length ? shownWaivers.map((waiver, index) => {
                  const checked = selectedIds.has(waiver.id);
                  return (
                    <label key={waiver.id} className={`block cursor-pointer rounded-2xl border p-4 transition ${checked ? "border-[#b6f23a]/55 bg-[#b6f23a]/[0.08]" : "border-white/10 bg-black/15 hover:border-white/20"}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox className="mt-1" checked={checked} onCheckedChange={(value) => toggleWaiver(waiver, value === true)} aria-label={`Select ${waiver.add.name} for ${waiver.drop.name}`} />
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-sm font-semibold text-white/55">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold"><span className="mr-2 text-xs font-medium text-[#b6f23a]">ADD</span>{waiver.add.name}</p>
                              <p className="mt-1 truncate text-sm text-white/45">{waiver.add.team} · {waiver.add.position}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-semibold text-[#b6f23a]">+{formatPoints(waiver.gain)}</p>
                              <p className="text-xs text-white/35">xP gain</p>
                            </div>
                          </div>
                          <div className="my-2 flex items-center gap-2 text-white/25"><ArrowDown className="size-3.5" /><span className="h-px flex-1 bg-white/10" /></div>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <p className="truncate"><span className="mr-2 text-xs font-medium text-[#ff9d9d]">DROP</span>{waiver.drop.name}</p>
                            <p className="shrink-0 text-white/40">{formatPoints(waiver.add.totals[horizon - 1])} vs {formatPoints(waiver.drop.totals[horizon - 1])}</p>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center">
                    <Check className="mx-auto size-6 text-[#b6f23a]" />
                    <p className="mt-3 font-medium">No waiver clears this threshold</p>
                    <p className="mt-1 text-sm text-white/45">Lower the minimum gain or stand pat.</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3 px-1">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">GW{analysis.nextGameweek} lineup</h2>
                  <p className="mt-1 text-sm text-white/45">Optimised on next-week expected points only.</p>
                </div>
                <CalendarDays className="size-5 text-[#b6f23a]" aria-hidden="true" />
              </div>
              <Lineup
                squad={projectedSquad}
                title={`GW${analysis.nextGameweek} squad`}
                note={selectedWaivers.length ? `${selectedWaivers.length} selected change${selectedWaivers.length > 1 ? "s" : ""} applied` : "Select waivers to preview changes"}
              />
            </section>
          </div>

          <footer className="mt-6 flex flex-col justify-between gap-3 border-t border-white/10 px-1 pt-5 text-sm text-white/40 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2"><RefreshCw className="size-4" />Projections refresh daily at 12:00am Singapore time.</p>
            <p>FFP updated for GW{analysis.projectionUpdatedFor ?? "—"}{analysis.projectionUpdatedAt ? ` · ${new Date(analysis.projectionUpdatedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
          </footer>
        </section>
      )}
    </main>
  );
}

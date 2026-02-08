import { createEmptyGrid, parseAmericanOdds, type DraftKingsSquaresOdds, type SquaresGrid } from "./squares-analysis";

const ANY_QUARTER_PAGE_URL =
  "https://sportsbook.draftkings.com/leagues/football/nfl?category=squares&subcategory=squares---any-quarter";
const FINAL_RESULT_PAGE_URL =
  "https://sportsbook.draftkings.com/leagues/football/nfl?category=squares&subcategory=squares---final-result";

const ANY_QUARTER_API_URL =
  "https://sportsbook-nash.draftkings.com/sites/US-SB/api/sportscontent/controldata/league/leagueSubcategory/v1/markets?isBatchable=false&templateVars=88808%2C16729&eventsQuery=%24filter%3DleagueId%20eq%20%2788808%27%20AND%20clientMetadata%2FSubcategories%2Fany%28s%3A%20s%2FId%20eq%20%2716729%27%29&marketsQuery=%24filter%3DclientMetadata%2FsubCategoryId%20eq%20%2716729%27%20AND%20tags%2Fall%28t%3A%20t%20ne%20%27SportcastBetBuilder%27%29&include=Events&entity=events";
const FINAL_RESULT_API_URL =
  "https://sportsbook-nash.draftkings.com/sites/US-SB/api/sportscontent/controldata/league/leagueSubcategory/v1/markets?isBatchable=false&templateVars=88808%2C16730&eventsQuery=%24filter%3DleagueId%20eq%20%2788808%27%20AND%20clientMetadata%2FSubcategories%2Fany%28s%3A%20s%2FId%20eq%20%2716730%27%29&marketsQuery=%24filter%3DclientMetadata%2FsubCategoryId%20eq%20%2716730%27%20AND%20tags%2Fall%28t%3A%20t%20ne%20%27SportcastBetBuilder%27%29&include=Events&entity=events";

interface DraftKingsParticipant {
  name?: string;
  venueRole?: string;
}

interface DraftKingsEvent {
  id?: string;
  name?: string;
  startEventDate?: string;
  participants?: DraftKingsParticipant[];
}

interface DraftKingsSelection {
  label?: string;
  displayOdds?: {
    american?: string | number;
  };
}

interface DraftKingsPayload {
  events?: DraftKingsEvent[];
  selections?: DraftKingsSelection[];
}

interface ParsedMarket {
  oddsGrid: SquaresGrid;
  homeTeam: string;
  awayTeam: string;
  eventId: string;
  eventName: string;
  startEventDate: string;
}

function assertFilledGrid(grid: SquaresGrid, marketLabel: string): void {
  const missing: string[] = [];

  for (let away = 0; away < 10; away += 1) {
    for (let home = 0; home < 10; home += 1) {
      if (!Number.isFinite(grid[away]?.[home])) {
        missing.push(`${away}-${home}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`${marketLabel}: missing ${missing.length} digit combos (${missing.slice(0, 8).join(", ")})`);
  }
}

function parseDigitsFromSelectionLabel(label: string): { homeDigit: number; awayDigit: number } | null {
  const match = label.match(/(\d)\s*-\s*(\d)/);
  if (!match) {
    return null;
  }

  const homeDigit = Number(match[1]);
  const awayDigit = Number(match[2]);

  if (!Number.isInteger(homeDigit) || !Number.isInteger(awayDigit)) {
    return null;
  }

  if (homeDigit < 0 || homeDigit > 9 || awayDigit < 0 || awayDigit > 9) {
    return null;
  }

  return { homeDigit, awayDigit };
}

function parseMarket(payload: DraftKingsPayload, marketLabel: string): ParsedMarket {
  const event = payload.events?.[0];
  if (!event) {
    throw new Error(`${marketLabel}: no event returned by DraftKings.`);
  }

  const homeTeam = event.participants?.find((participant) => participant.venueRole === "Home")?.name ?? "Home Team";
  const awayTeam = event.participants?.find((participant) => participant.venueRole === "Away")?.name ?? "Away Team";

  const oddsGrid = createEmptyGrid();
  const selections = payload.selections ?? [];

  for (const selection of selections) {
    const label = selection.label ?? "";
    const digits = parseDigitsFromSelectionLabel(label);
    if (!digits) {
      continue;
    }

    const american = parseAmericanOdds(selection.displayOdds?.american);
    if (american == null) {
      continue;
    }

    oddsGrid[digits.awayDigit][digits.homeDigit] = american;
  }

  assertFilledGrid(oddsGrid, marketLabel);

  return {
    oddsGrid,
    homeTeam,
    awayTeam,
    eventId: event.id ?? "",
    eventName: event.name ?? "",
    startEventDate: event.startEventDate ?? "",
  };
}

async function fetchDraftKingsPayload(url: string, referer: string): Promise<DraftKingsPayload> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: referer,
    },
  });

  if (!response.ok) {
    throw new Error(`DraftKings API request failed (${response.status})`);
  }

  return (await response.json()) as DraftKingsPayload;
}

export async function fetchDraftKingsSquaresOdds(): Promise<DraftKingsSquaresOdds> {
  const [anyQuarterPayload, finalResultPayload] = await Promise.all([
    fetchDraftKingsPayload(ANY_QUARTER_API_URL, ANY_QUARTER_PAGE_URL),
    fetchDraftKingsPayload(FINAL_RESULT_API_URL, FINAL_RESULT_PAGE_URL),
  ]);

  const anyQuarter = parseMarket(anyQuarterPayload, "Any Quarter");
  const finalResult = parseMarket(finalResultPayload, "Final Result");

  return {
    eventId: finalResult.eventId || anyQuarter.eventId,
    eventName: finalResult.eventName || anyQuarter.eventName,
    startEventDate: finalResult.startEventDate || anyQuarter.startEventDate,
    homeTeam: finalResult.homeTeam || anyQuarter.homeTeam,
    awayTeam: finalResult.awayTeam || anyQuarter.awayTeam,
    fetchedAt: new Date().toISOString(),
    anyQuarterOdds: anyQuarter.oddsGrid,
    finalResultOdds: finalResult.oddsGrid,
    sourceUrls: {
      anyQuarter: ANY_QUARTER_PAGE_URL,
      finalResult: FINAL_RESULT_PAGE_URL,
    },
  };
}

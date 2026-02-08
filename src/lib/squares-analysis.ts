export type SquaresGrid = number[][];

export interface SquaresBoard {
  homeTeam: string;
  awayTeam: string;
  homeDigits: number[];
  awayDigits: number[];
  owners: string[][]; // [row=awayDigitOrder][col=homeDigitOrder]
}

export interface DraftKingsSquaresOdds {
  eventId: string;
  eventName: string;
  startEventDate: string;
  homeTeam: string;
  awayTeam: string;
  fetchedAt: string;
  anyQuarterOdds: SquaresGrid; // [awayDigit][homeDigit] American odds
  finalResultOdds: SquaresGrid; // [awayDigit][homeDigit] American odds
  sourceUrls: {
    anyQuarter: string;
    finalResult: string;
  };
}

export interface OwnerStat {
  owner: string;
  numSquares: number;
  totalEv: number;
  evPerSquare: number;
  bestSquareEv: number;
}

export interface TopSquare {
  owner: string;
  homeDigit: number;
  awayDigit: number;
  ev: number;
  probability: number;
}

export interface SquaresAnalysis {
  totalPot: number;
  sumEv: number;
  evByDigit: SquaresGrid; // [awayDigit][homeDigit]
  combinedProbability: SquaresGrid; // [awayDigit][homeDigit]
  boardEv: number[][]; // [row order][column order]
  ownerStats: OwnerStat[];
  topSquares: TopSquare[];
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function parseAmericanOdds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

export function americanToRawProbability(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  }

  if (american < 0) {
    const abs = Math.abs(american);
    return abs / (abs + 100);
  }

  throw new Error("American odds cannot be 0");
}

export function createEmptyGrid(fill = Number.NaN): SquaresGrid {
  return DIGITS.map(() => DIGITS.map(() => fill));
}

export function isValidDigitArray(digits: number[]): boolean {
  if (digits.length !== 10) {
    return false;
  }

  return new Set(digits).size === 10 && digits.every((n) => Number.isInteger(n) && n >= 0 && n <= 9);
}

export function computeSquaresAnalysis(
  board: SquaresBoard,
  odds: DraftKingsSquaresOdds,
  squarePrice = 3,
  finalResultWeight = 0.8,
  anyQuarterWeight = 0.2,
): SquaresAnalysis {
  if (!isValidDigitArray(board.homeDigits)) {
    throw new Error("Home digits must contain each digit 0-9 exactly once.");
  }

  if (!isValidDigitArray(board.awayDigits)) {
    throw new Error("Away digits must contain each digit 0-9 exactly once.");
  }

  if (board.owners.length !== 10 || board.owners.some((row) => row.length !== 10)) {
    throw new Error("Board ownership grid must be 10x10.");
  }

  const rawFinal = createEmptyGrid();
  const rawAnyQuarter = createEmptyGrid();
  const combinedRaw = createEmptyGrid(0);

  for (const awayDigit of DIGITS) {
    for (const homeDigit of DIGITS) {
      const finalOdds = odds.finalResultOdds[awayDigit]?.[homeDigit];
      const anyQuarterOdds = odds.anyQuarterOdds[awayDigit]?.[homeDigit];

      if (!Number.isFinite(finalOdds) || !Number.isFinite(anyQuarterOdds)) {
        throw new Error(`Missing odds for away=${awayDigit}, home=${homeDigit}`);
      }

      rawFinal[awayDigit][homeDigit] = americanToRawProbability(finalOdds);
      rawAnyQuarter[awayDigit][homeDigit] = americanToRawProbability(anyQuarterOdds);
      combinedRaw[awayDigit][homeDigit] =
        finalResultWeight * rawFinal[awayDigit][homeDigit] +
        anyQuarterWeight * rawAnyQuarter[awayDigit][homeDigit];
    }
  }

  const totalCombinedRaw = combinedRaw.flat().reduce((sum, value) => sum + value, 0);
  if (totalCombinedRaw <= 0) {
    throw new Error("Unable to compute probabilities from odds.");
  }

  const totalPot = squarePrice * 100;
  const combinedProbability = createEmptyGrid(0);
  const evByDigit = createEmptyGrid(0);

  for (const awayDigit of DIGITS) {
    for (const homeDigit of DIGITS) {
      const probability = combinedRaw[awayDigit][homeDigit] / totalCombinedRaw;
      combinedProbability[awayDigit][homeDigit] = probability;
      evByDigit[awayDigit][homeDigit] = probability * totalPot;
    }
  }

  const boardEv = board.owners.map(() => new Array<number>(10).fill(0));
  const ownerTotals = new Map<string, { totalEv: number; numSquares: number; bestSquareEv: number }>();
  const topSquares: TopSquare[] = [];

  for (let row = 0; row < 10; row += 1) {
    const awayDigit = board.awayDigits[row];

    for (let col = 0; col < 10; col += 1) {
      const homeDigit = board.homeDigits[col];
      const owner = board.owners[row][col].trim();
      const ev = evByDigit[awayDigit][homeDigit];
      const probability = combinedProbability[awayDigit][homeDigit];

      boardEv[row][col] = ev;

      if (!owner) {
        continue;
      }

      const current = ownerTotals.get(owner) ?? { totalEv: 0, numSquares: 0, bestSquareEv: Number.NEGATIVE_INFINITY };
      current.totalEv += ev;
      current.numSquares += 1;
      current.bestSquareEv = Math.max(current.bestSquareEv, ev);
      ownerTotals.set(owner, current);

      topSquares.push({ owner, homeDigit, awayDigit, ev, probability });
    }
  }

  const ownerStats: OwnerStat[] = [...ownerTotals.entries()]
    .map(([owner, values]) => ({
      owner,
      numSquares: values.numSquares,
      totalEv: values.totalEv,
      evPerSquare: values.totalEv / values.numSquares,
      bestSquareEv: values.bestSquareEv,
    }))
    .sort((a, b) => b.totalEv - a.totalEv);

  topSquares.sort((a, b) => b.ev - a.ev);

  const sumEv = boardEv.flat().reduce((sum, value) => sum + value, 0);

  return {
    totalPot,
    sumEv,
    evByDigit,
    combinedProbability,
    boardEv,
    ownerStats,
    topSquares,
  };
}

export function defaultDigits(): number[] {
  return [...DIGITS];
}

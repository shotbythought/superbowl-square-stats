import { defaultDigits, isValidDigitArray, type SquaresBoard } from "./squares-analysis";

function normalizeCell(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function maybeDigit(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9) {
    return null;
  }

  return parsed;
}

function extractDigitsFromRow(cells: string[]): { startCol: number; digits: number[] } | null {
  for (let start = 0; start <= cells.length - 10; start += 1) {
    const candidate = cells.slice(start, start + 10).map(maybeDigit);
    if (candidate.some((d) => d == null)) {
      continue;
    }

    const digits = candidate as number[];
    if (isValidDigitArray(digits)) {
      return { startCol: start, digits };
    }
  }

  return null;
}

function parseRows(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split("\t").map(normalizeCell))
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function parseSquaresFromPastedText(text: string): SquaresBoard {
  const rows = parseRows(text);
  if (rows.length < 10) {
    throw new Error("Expected at least 10 rows from pasted Excel data.");
  }

  let headerRowIndex = -1;
  let startCol = 0;
  let homeDigits = defaultDigits();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const found = extractDigitsFromRow(rows[rowIndex]);
    if (found) {
      headerRowIndex = rowIndex;
      startCol = found.startCol;
      homeDigits = found.digits;
      break;
    }
  }

  const ownersStartRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

  const ownerRows: string[][] = [];
  const awayDigitsRaw: Array<number | null> = [];

  for (let rowIndex = ownersStartRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row.length < startCol + 10) {
      continue;
    }

    const ownerSlice = row.slice(startCol, startCol + 10);
    if (ownerSlice.every((cell) => cell.length === 0)) {
      continue;
    }

    ownerRows.push(ownerSlice);

    const awayDigitFromLeft = startCol > 0 ? maybeDigit(row[startCol - 1] ?? "") : null;
    awayDigitsRaw.push(awayDigitFromLeft);

    if (ownerRows.length === 10) {
      break;
    }
  }

  if (ownerRows.length !== 10) {
    throw new Error("Could not parse a full 10x10 owner grid from pasted text.");
  }

  let awayDigits = awayDigitsRaw.map((digit, index) => (digit == null ? index : digit));
  if (!isValidDigitArray(awayDigits)) {
    awayDigits = defaultDigits();
  }

  let homeTeam = "Home Team";
  if (headerRowIndex > 0) {
    const candidate = rows[headerRowIndex - 1]?.[startCol] ?? "";
    if (candidate && maybeDigit(candidate) == null) {
      homeTeam = candidate;
    }
  }

  let awayTeam = "Away Team";
  if (ownersStartRow < rows.length && startCol > 1) {
    const candidate = rows[ownersStartRow]?.[startCol - 2] ?? "";
    if (candidate && maybeDigit(candidate) == null) {
      awayTeam = candidate;
    }
  }

  return {
    homeTeam,
    awayTeam,
    homeDigits,
    awayDigits,
    owners: ownerRows,
  };
}

import { defaultDigits, isValidDigitArray, type SquaresBoard } from "./squares-analysis";

function normalizeCell(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function parseCsvLine(line: string, delimiter = ","): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function unwrapTextBlock(text: string): string {
  const trimmed = text.trim();

  const wrappers: Array<[string, string]> = [
    ["```", "```"],
    ["“", "”"],
    ["\"", "\""],
    ["'", "'"],
    ["`", "`"],
    ["(", ")"],
  ];

  for (const [start, end] of wrappers) {
    if (trimmed.startsWith(start) && trimmed.endsWith(end) && trimmed.length > start.length + end.length) {
      return trimmed.slice(start.length, trimmed.length - end.length).trim();
    }
  }

  // Preserve leading tabs/spaces from the first data line (important for TSV top-left blank cell).
  // Only strip surrounding blank lines when no wrapper was applied.
  return text.replace(/^\s*\n+/, "").replace(/\n+\s*$/, "");
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
  const cleanedText = unwrapTextBlock(text)
    .replace(/[\u00A0]/g, " ")
    .replace(/[，]/g, ",")
    .replace(/\r/g, "")
    .replace(/```/g, "");

  // Preserve leading tabs/spaces so empty top-left header cells stay aligned in pasted Excel TSV.
  const lines = cleanedText
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.some((line) => line.includes("\t"))) {
    return lines
      .map((line) => line.split("\t").map(normalizeCell))
      .filter((row) => row.some((cell) => cell.length > 0));
  }

  const commaLines = lines.filter((line) => line.includes(",")).length;
  const semicolonLines = lines.filter((line) => line.includes(";")).length;

  if (commaLines === 0 && semicolonLines === 0) {
    return lines.map((line) => [normalizeCell(line)]).filter((row) => row.some((cell) => cell.length > 0));
  }

  const delimiter = commaLines >= semicolonLines ? "," : ";";
  const csvRows = lines
    .map((line) => parseCsvLine(line, delimiter).map(normalizeCell))
    .filter((row) => row.some((cell) => cell.length > 0));

  const targetColumns = Math.max(
    1,
    ...csvRows.map((row) => row.length),
  );

  const mergedRows: string[][] = [];
  let pending: string[] | null = null;

  for (const row of csvRows) {
    if (row.length === targetColumns) {
      if (pending) {
        mergedRows.push(pending);
        pending = null;
      }
      mergedRows.push(row);
      continue;
    }

    if (!pending) {
      pending = [...row];
    } else if (pending.length < targetColumns && row.length < targetColumns) {
      pending = [...pending, ...row];
    } else {
      mergedRows.push(pending);
      pending = [...row];
    }

    if (pending.length >= targetColumns) {
      mergedRows.push(pending.slice(0, targetColumns));
      pending = pending.length > targetColumns ? pending.slice(targetColumns) : null;
    }
  }

  if (pending && pending.some((cell) => cell.length > 0)) {
    mergedRows.push(pending);
  }

  return mergedRows.filter((row) => row.some((cell) => cell.length > 0));
}

function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function normalizeOwnerName(value: string): string {
  const cleaned = normalizeCell(value);
  if (!cleaned) {
    return cleaned;
  }

  const lettersOnly = cleaned.toLowerCase().replace(/[^a-z]/g, "");
  if (!lettersOnly) {
    return cleaned;
  }

  const stevenVariants = new Set(["steven", "steve", "stevie", "stevo", "seven", "tseven"]);
  if (stevenVariants.has(lettersOnly)) {
    return "Steven";
  }

  if ((lettersOnly.startsWith("stev") || lettersOnly.endsWith("seven")) && lettersOnly.length <= 8) {
    return "Steven";
  }

  if (lettersOnly.length >= 5 && lettersOnly.length <= 8 && editDistance(lettersOnly, "steven") <= 2) {
    return "Steven";
  }

  return cleaned;
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

    ownerRows.push(ownerSlice.map(normalizeOwnerName));

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

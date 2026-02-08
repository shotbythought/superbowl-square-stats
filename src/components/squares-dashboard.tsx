"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeSquaresAnalysis,
  defaultDigits,
  type DraftKingsSquaresOdds,
  type SquaresBoard,
} from "@/lib/squares-analysis";
import { parseSquaresFromPastedText } from "@/lib/squares-parse";
import styles from "./squares-dashboard.module.css";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

type SortDirection = "asc" | "desc";
type LeaderboardSortKey = "owner" | "numSquares" | "totalEv" | "evPerSquare" | "bestSquareEv";
type TopSquaresSortKey = "owner" | "homeDigit" | "awayDigit" | "probability" | "ev";
type LeaderboardSort = { key: LeaderboardSortKey; direction: SortDirection };
type TopSquaresSort = { key: TopSquaresSortKey; direction: SortDirection };

function formatDateTime(value: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function normalizeTeam(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function heatColor(value: number, min: number, max: number): string {
  const range = Math.max(max - min, 0.000001);
  const t = (value - min) / range;
  const hue = 14 + t * 126;
  const lightness = 94 - t * 38;
  return `hsl(${hue.toFixed(0)} 76% ${lightness.toFixed(0)}%)`;
}

export function SquaresDashboard() {
  const [odds, setOdds] = useState<DraftKingsSquaresOdds | null>(null);
  const [oddsError, setOddsError] = useState<string>("");
  const [loadingOdds, setLoadingOdds] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [board, setBoard] = useState<SquaresBoard | null>(null);
  const [boardError, setBoardError] = useState<string>("");

  const [squarePrice, setSquarePrice] = useState(3);
  const [showSetup, setShowSetup] = useState(true);
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>({
    key: "totalEv",
    direction: "desc",
  });
  const [topSquaresSort, setTopSquaresSort] = useState<TopSquaresSort>({
    key: "ev",
    direction: "desc",
  });
  const [topSquaresOwnerFilter, setTopSquaresOwnerFilter] = useState("ALL");

  const loadOdds = async () => {
    setLoadingOdds(true);
    setOddsError("");

    try {
      const response = await fetch("/api/draftkings-squares", { cache: "no-store" });
      const payload = (await response.json()) as DraftKingsSquaresOdds | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : `Request failed (${response.status})`);
      }

      setOdds(payload);

      setBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          homeTeam: currentBoard.homeTeam === "Home Team" ? payload.homeTeam : currentBoard.homeTeam,
          awayTeam: currentBoard.awayTeam === "Away Team" ? payload.awayTeam : currentBoard.awayTeam,
        };
      });
    } catch (error) {
      setOddsError(error instanceof Error ? error.message : "Failed to load DraftKings odds");
    } finally {
      setLoadingOdds(false);
    }
  };

  useEffect(() => {
    void loadOdds();
  }, []);

  const parseFromText = () => {
    setBoardError("");

    try {
      const parsed = parseSquaresFromPastedText(pasteText);
      setBoard({
        ...parsed,
        homeTeam: parsed.homeTeam === "Home Team" && odds ? odds.homeTeam : parsed.homeTeam,
        awayTeam: parsed.awayTeam === "Away Team" && odds ? odds.awayTeam : parsed.awayTeam,
      });
      setShowSetup(false);
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : "Failed to parse pasted squares");
    }
  };

  const analysisResult = useMemo(() => {
    if (!board || !odds) {
      return { analysis: null, error: "" };
    }

    try {
      return {
        analysis: computeSquaresAnalysis(board, odds, squarePrice, 0.2, 0.8),
        error: "",
      };
    } catch (error) {
      return {
        analysis: null,
        error: error instanceof Error ? error.message : "Unable to compute EV",
      };
    }
  }, [board, odds, squarePrice]);

  const analysis = analysisResult.analysis;
  const combinedBoardError = boardError || analysisResult.error;

  const ownerOptions = useMemo(() => {
    if (!analysis) {
      return [];
    }

    return analysis.ownerStats.map((stat) => stat.owner).sort((a, b) => a.localeCompare(b));
  }, [analysis]);

  useEffect(() => {
    if (!analysis) {
      return;
    }

    if (topSquaresOwnerFilter !== "ALL" && !ownerOptions.includes(topSquaresOwnerFilter)) {
      setTopSquaresOwnerFilter("ALL");
    }
  }, [analysis, ownerOptions, topSquaresOwnerFilter]);

  const sortedOwnerStats = useMemo(() => {
    if (!analysis) {
      return [];
    }

    const sorted = [...analysis.ownerStats];
    sorted.sort((left, right) => {
      switch (leaderboardSort.key) {
        case "owner":
          return left.owner.localeCompare(right.owner);
        case "numSquares":
          return left.numSquares - right.numSquares;
        case "totalEv":
          return left.totalEv - right.totalEv;
        case "evPerSquare":
          return left.evPerSquare - right.evPerSquare;
        case "bestSquareEv":
          return left.bestSquareEv - right.bestSquareEv;
        default:
          return 0;
      }
    });

    return leaderboardSort.direction === "asc" ? sorted : sorted.reverse();
  }, [analysis, leaderboardSort]);

  const filteredAndSortedTopSquares = useMemo(() => {
    if (!analysis) {
      return [];
    }

    let squares = analysis.topSquares;
    if (topSquaresOwnerFilter !== "ALL") {
      squares = squares.filter((square) => square.owner === topSquaresOwnerFilter);
    }

    const sorted = [...squares];
    sorted.sort((left, right) => {
      switch (topSquaresSort.key) {
        case "owner":
          return left.owner.localeCompare(right.owner);
        case "homeDigit":
          return left.homeDigit - right.homeDigit;
        case "awayDigit":
          return left.awayDigit - right.awayDigit;
        case "probability":
          return left.probability - right.probability;
        case "ev":
          return left.ev - right.ev;
        default:
          return 0;
      }
    });

    return topSquaresSort.direction === "asc" ? sorted : sorted.reverse();
  }, [analysis, topSquaresOwnerFilter, topSquaresSort]);

  const setLeaderboardSortFor = (key: LeaderboardSortKey) => {
    setLeaderboardSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: key === "owner" ? "asc" : "desc",
      };
    });
  };

  const setTopSquaresSortFor = (key: TopSquaresSortKey) => {
    setTopSquaresSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: key === "owner" ? "asc" : "desc",
      };
    });
  };

  const sortMarker = (key: LeaderboardSortKey | TopSquaresSortKey, sort: { key: string; direction: SortDirection }) => {
    if (sort.key !== key) {
      return "";
    }

    return sort.direction === "asc" ? " ▲" : " ▼";
  };

  const teamMismatch = useMemo(() => {
    if (!board || !odds) {
      return false;
    }

    const boardHome = normalizeTeam(board.homeTeam);
    const boardAway = normalizeTeam(board.awayTeam);
    const oddsHome = normalizeTeam(odds.homeTeam);
    const oddsAway = normalizeTeam(odds.awayTeam);

    if (!boardHome || !boardAway || !oddsHome || !oddsAway) {
      return false;
    }

    const homeMatch = boardHome.includes(oddsHome) || oddsHome.includes(boardHome);
    const awayMatch = boardAway.includes(oddsAway) || oddsAway.includes(boardAway);

    return !(homeMatch && awayMatch);
  }, [board, odds]);

  const boardRange = useMemo(() => {
    if (!analysis) {
      return { min: 0, max: 0 };
    }

    const values = analysis.boardEv.flat();
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [analysis]);

  return (
    <div className={styles.page}>
      <div className={styles.bgGlowOne} />
      <div className={styles.bgGlowTwo} />

      <main className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Super Bowl Squares EV</p>
          <h1>Live DraftKings Squares Analyzer</h1>
          <p>
            Paste your squares board from Excel. This app pulls live DraftKings odds for <strong>Squares - Final Result</strong> and{" "}
            <strong>Squares - Any Quarter</strong>, then computes EV using the methodology:
            <strong> 80% any quarter + 20% final result</strong>.
          </p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Live Odds Feed</h2>
            <button onClick={() => void loadOdds()} disabled={loadingOdds} className={styles.primaryButton}>
              {loadingOdds ? "Refreshing..." : "Refresh Odds"}
            </button>
          </div>

          {oddsError ? <p className={styles.errorText}>{oddsError}</p> : null}

          {odds ? (
            <div className={styles.metaGrid}>
              <div>
                <span>Event</span>
                <strong>{odds.eventName || `${odds.awayTeam} @ ${odds.homeTeam}`}</strong>
              </div>
              <div>
                <span>Kickoff</span>
                <strong>{formatDateTime(odds.startEventDate)}</strong>
              </div>
              <div>
                <span>Last Refreshed</span>
                <strong>{formatDateTime(odds.fetchedAt)}</strong>
              </div>
              <div>
                <span>Sources</span>
                <strong>
                  <a href={odds.sourceUrls.anyQuarter} target="_blank" rel="noreferrer">
                    Any Quarter
                  </a>{" "}
                  |{" "}
                  <a href={odds.sourceUrls.finalResult} target="_blank" rel="noreferrer">
                    Final Result
                  </a>
                </strong>
              </div>
            </div>
          ) : (
            <p className={styles.muted}>Loading DraftKings odds...</p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.setupHeader}>
            <div className={styles.setupHeaderText}>
              <h2>Board Setup</h2>
              <p>
                {showSetup
                  ? "Paste your board and set square price."
                  : board
                    ? `Setup hidden · ${money.format(squarePrice)} per square`
                    : "Setup hidden"}
              </p>
            </div>
            <button
              className={styles.setupToggle}
              onClick={() => setShowSetup((current) => !current)}
              aria-expanded={showSetup}
              aria-controls="board-setup-content"
            >
              {showSetup ? "Collapse" : "Expand"}
              <span className={`${styles.setupChevron} ${showSetup ? styles.setupChevronUp : ""}`} aria-hidden>
                v
              </span>
            </button>
          </div>
          {showSetup ? (
            <div className={styles.setupCard} id="board-setup-content">
              <p className={styles.setupHint}>
                Paste from Excel (10x10 owners, with optional header digits).
              </p>
              <textarea
                className={styles.textarea}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="Paste Excel cells here..."
              />
              <label className={styles.priceLabel}>
                Price Per Square ($)
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={squarePrice}
                  onChange={(event) => setSquarePrice(Number(event.target.value) || 0)}
                />
              </label>
              <div className={styles.setupActions}>
                <button className={`${styles.primaryButton} ${styles.calcButton}`} onClick={parseFromText}>
                  Calculate statistics
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {combinedBoardError ? <p className={styles.errorText}>{combinedBoardError}</p> : null}

        {teamMismatch ? (
          <div className={styles.warning}>
            Your uploaded board team labels do not appear to match the current DraftKings matchup.
          </div>
        ) : null}

        {analysis && board ? (
          <>
            <section className={styles.gridSection}>
              <div className={styles.panel}>
                <h2>Owner EV Leaderboard</h2>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <button className={styles.sortButton} onClick={() => setLeaderboardSortFor("owner")}>
                            Owner{sortMarker("owner", leaderboardSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setLeaderboardSortFor("numSquares")}>
                            Squares{sortMarker("numSquares", leaderboardSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setLeaderboardSortFor("totalEv")}>
                            Total EV{sortMarker("totalEv", leaderboardSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setLeaderboardSortFor("evPerSquare")}>
                            EV / Square{sortMarker("evPerSquare", leaderboardSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setLeaderboardSortFor("bestSquareEv")}>
                            Best Square{sortMarker("bestSquareEv", leaderboardSort)}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOwnerStats.map((stat) => (
                        <tr key={stat.owner}>
                          <td>{stat.owner}</td>
                          <td>{stat.numSquares}</td>
                          <td>{money.format(stat.totalEv)}</td>
                          <td>{money.format(stat.evPerSquare)}</td>
                          <td>{money.format(stat.bestSquareEv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.topSquaresHeader}>
                  <h2>Top Squares</h2>
                  <label className={styles.ownerFilter}>
                    Owner
                    <select value={topSquaresOwnerFilter} onChange={(event) => setTopSquaresOwnerFilter(event.target.value)}>
                      <option value="ALL">All Owners</option>
                      {ownerOptions.map((owner) => (
                        <option value={owner} key={owner}>
                          {owner}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <button className={styles.sortButton} onClick={() => setTopSquaresSortFor("owner")}>
                            Owner{sortMarker("owner", topSquaresSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setTopSquaresSortFor("homeDigit")}>
                            Home Digit{sortMarker("homeDigit", topSquaresSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setTopSquaresSortFor("awayDigit")}>
                            Away Digit{sortMarker("awayDigit", topSquaresSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setTopSquaresSortFor("probability")}>
                            Probability{sortMarker("probability", topSquaresSort)}
                          </button>
                        </th>
                        <th>
                          <button className={styles.sortButton} onClick={() => setTopSquaresSortFor("ev")}>
                            EV{sortMarker("ev", topSquaresSort)}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedTopSquares.slice(0, 12).map((square, index) => (
                        <tr key={`${square.owner}-${square.homeDigit}-${square.awayDigit}-${index}`}>
                          <td>{square.owner}</td>
                          <td>{square.homeDigit}</td>
                          <td>{square.awayDigit}</td>
                          <td>{pct.format(square.probability)}</td>
                          <td>{money.format(square.ev)}</td>
                        </tr>
                      ))}
                      {filteredAndSortedTopSquares.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No squares for this owner filter.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <h2>
                EV Heatmap ({board.awayTeam} rows vs {board.homeTeam} columns)
              </h2>
              <div className={styles.tableWrap}>
                <table className={styles.heatmap}>
                  <thead>
                    <tr>
                      <th className={styles.heatmapTopCorner} colSpan={2} />
                      <th className={styles.heatmapTopTeam} colSpan={10}>
                        <span className={styles.heatmapTopTeamText}>{board.homeTeam}</span>
                      </th>
                    </tr>
                    <tr>
                      <th className={styles.heatmapLeftSpacer} />
                      <th className={styles.heatmapAxisLabel}>Digit</th>
                      {board.homeDigits.map((digit) => (
                        <th key={`home-${digit}`} className={styles.heatmapDigitHeader}>
                          {digit}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {defaultDigits().map((_, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {rowIndex === 0 ? (
                          <th className={styles.heatmapLeftTeam} rowSpan={10}>
                            <span className={styles.heatmapLeftTeamText}>{board.awayTeam}</span>
                          </th>
                        ) : null}
                        <th className={styles.heatmapRowDigit}>{board.awayDigits[rowIndex]}</th>
                        {defaultDigits().map((__, colIndex) => {
                          const ev = analysis.boardEv[rowIndex][colIndex];
                          const owner = board.owners[rowIndex][colIndex] || "-";

                          return (
                            <td
                              key={`cell-${rowIndex}-${colIndex}`}
                              style={{ backgroundColor: heatColor(ev, boardRange.min, boardRange.max) }}
                              title={`${owner} | EV ${money.format(ev)}`}
                            >
                              <div className={styles.cellOwner}>{owner}</div>
                              <div className={styles.cellEv}>{money.format(ev)}</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className={styles.panel}>
            <p className={styles.muted}>Paste your board to generate EV analytics.</p>
          </section>
        )}
      </main>
    </div>
  );
}

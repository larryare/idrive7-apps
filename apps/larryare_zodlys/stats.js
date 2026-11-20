'use strict';
/**
 * Žodlys' statistics, ported verbatim from zodlys' src/helpers/statistics.ts (tested in
 * tests/zodlys.test.js). A Statistic is one finished game:
 *   { date: ISO string, tries: guesses for a win (1-6), 0 for a loss, won: bool }
 */

/** Everything the statistics page shows, computed from the finished games. */
function computeStatistics(statistics) {
    const sorted = [...statistics].sort((a, b) => a.date.localeCompare(b.date));

    const played = sorted.length;
    const wins = sorted.filter((s) => s.won);
    const winRate = played === 0 ? 0 : Math.round((wins.length / played) * 100);

    let currentStreak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (!sorted[i].won) break;
        currentStreak++;
    }

    let maxStreak = 0;
    let run = 0;
    for (const s of sorted) {
        if (s.won) {
            run++;
            maxStreak = Math.max(maxStreak, run);
        } else {
            run = 0;
        }
    }

    const distribution = [0, 0, 0, 0, 0, 0];
    for (const s of wins) {
        if (s.tries >= 1 && s.tries <= 6) distribution[s.tries - 1]++;
    }

    const triesList = wins.map((s) => s.tries);
    const avgTries = triesList.length
        ? triesList.reduce((sum, t) => sum + t, 0) / triesList.length
        : 0;
    const bestTries = triesList.length ? Math.min(...triesList) : 0;

    const lastWin = [...wins].pop();

    return {
        played,
        wins: wins.length,
        winRate,
        currentStreak,
        maxStreak,
        distribution,
        avgTries,
        bestTries,
        lastWinTries: lastWin ? lastWin.tries : null,
        recent: sorted.slice(-10),
    };
}

module.exports = { computeStatistics };

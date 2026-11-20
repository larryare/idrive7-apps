'use strict';
/** Žodlys' rules (apps/larryare_zodlys/model.js): node tests/zodlys.test.js */
const assert = require('assert');
const M = require('../apps/larryare_zodlys/model');
const words = require('../apps/larryare_zodlys/words.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ---------- daily word ---------- */

test('day of year: Jan 1 -> 1 (wordList[0] is never the daily word, as on the website)', () => {
    assert.strictEqual(M.getDayOfYear(new Date(2026, 0, 1, 12)), 1);
    assert.strictEqual(M.getDayOfYear(new Date(2026, 0, 2)), 2);
    assert.strictEqual(M.getDayOfYear(new Date(2026, 11, 31)), 365);    // 2026, not a leap year
    assert.strictEqual(M.getDayOfYear(new Date(2028, 11, 31)), 366);    // 2028, a leap year
});

test('daily word is wordList[day of year], local time', () => {
    const d = new Date(2026, 5, 15);
    assert.strictEqual(M.dailyWord(words.wordList, d), words.wordList[M.getDayOfYear(d)]);
});

test('word lists: 1094 solutions, every solution accepted, no duplicates', () => {
    assert.strictEqual(words.wordList.length, 1094);
    assert.strictEqual(words.wordListAll.length, 3927);
    for (const s of words.wordList) assert.ok(words.wordListAll.includes(s), 'solution not accepted: ' + s);
    assert.strictEqual(new Set(words.wordList).size, words.wordList.length);
    assert.strictEqual(new Set(words.wordListAll).size, words.wordListAll.length);
});

/* ---------- evaluateGuess: two-pass, duplicate letters ---------- */

test('exact positions first', () => {
    assert.deepStrictEqual(M.evaluateGuess('pilis', 'pilis'), ['correct', 'correct', 'correct', 'correct', 'correct']);
    assert.deepStrictEqual(M.evaluateGuess('pilix', 'pilis'), ['correct', 'correct', 'correct', 'correct', 'absent']);
});

test('duplicate letters: one yellow A for one A in the solution', () => {
    // kotas has one A (position 3): the green A consumes it, the other A's are absent
    assert.deepStrictEqual(M.evaluateGuess('aaaaa', 'kotas'),
        ['absent', 'absent', 'absent', 'correct', 'absent']);
});

test('duplicate letters: two A\'s for two A\'s in the solution', () => {
    // baras has A at 1 and 3: both greens, the other A's absent
    assert.deepStrictEqual(M.evaluateGuess('aaaaa', 'baras'),
        ['absent', 'correct', 'absent', 'correct', 'absent']);
});

test('duplicate letters: green consumes the solution\'s copy first', () => {
    // kotas has one A (position 3): the green A there consumes it, the yellow A at 0 is absent
    assert.deepStrictEqual(M.evaluateGuess('a__a_', 'kotas'),
        ['absent', 'absent', 'absent', 'correct', 'absent']);
});

test('duplicate letters: two yellow A\'s when both copies are free', () => {
    // baras has A at 1 and 3, the guess has none of them green: two yellows
    assert.deepStrictEqual(M.evaluateGuess('a_a_a', 'baras'),
        ['present', 'absent', 'present', 'absent', 'absent']);
});

/* ---------- hard mode ---------- */

test('hard mode: correct letters must stay at their positions', () => {
    // pieta vs pilis: green P at 0 and green I at 1
    assert.strictEqual(M.hardModeViolation(['pieta'], 'linas', 'pilis'),
        'Raidė „P" turi likti 1 vietoje');
    assert.strictEqual(M.hardModeViolation(['pieta'], 'piene', 'pilis'), null);
});

test('hard mode: present letters must appear (count-aware)', () => {
    // takas vs kanas: green A at 1 and 3, green S at 4, yellow K at 2 -> the new guess needs a K
    assert.strictEqual(M.hardModeViolation(['takas'], 'lapas', 'kanas'),
        'Naudokite atskleistą raidę „K"');
    assert.strictEqual(M.hardModeViolation(['takas'], 'lakas', 'kanas'), null);
});

test('hard mode: two yellow A\'s need two A\'s in the new guess', () => {
    // a_a_a vs baras: two yellow A's (positions 0 and 2)
    assert.strictEqual(M.hardModeViolation(['a_a_a'], 'b____', 'baras'),
        'Naudokite atskleistą raidę „A"');
    assert.strictEqual(M.hardModeViolation(['a_a_a'], 'ba___', 'baras'),
        'Naudokite atskleistą raidę „A"');   // one A is not enough
    assert.strictEqual(M.hardModeViolation(['a_a_a'], 'baa__', 'baras'), null);
});

test('hard mode: messages are in Lithuanian', () => {
    const v = M.hardModeViolation(['pieta'], 'linas', 'pilis');
    assert.ok(v.startsWith('Raidė „'));
    const w = M.hardModeViolation(['a_a_a'], 'b____', 'baras');
    assert.ok(w.startsWith('Naudokite atskleistą raidę „'));
});

/* ---------- key state ---------- */

test('key state: best across guesses, correct > present > absent', () => {
    const sol = 'pilis';
    assert.strictEqual(M.keyState([], sol, 'p'), 'idle');
    // pieta vs pilis: P and I green, E T A absent
    assert.strictEqual(M.keyState(['pieta'], sol, 'p'), 'correct');
    assert.strictEqual(M.keyState(['pieta'], sol, 'i'), 'correct');
    assert.strictEqual(M.keyState(['pieta'], sol, 'e'), 'absent');
    assert.strictEqual(M.keyState(['pieta'], sol, 't'), 'absent');
    // linas vs pilis: L yellow (solution's L is at 2), I green, N absent, S green
    assert.strictEqual(M.keyState(['linas'], sol, 'l'), 'present');
    assert.strictEqual(M.keyState(['linas'], sol, 'n'), 'absent');
    // best across guesses: the letters of both guesses, best state wins
    assert.strictEqual(M.keyState(['linas'], sol, 'p'), 'idle');
    assert.strictEqual(M.keyState(['linas', 'pieta'], sol, 'i'), 'correct');
    assert.strictEqual(M.keyState(['linas', 'pieta'], sol, 'l'), 'present');
});

/* ---------- the game ---------- */

const game = (o) => new M.Game(Object.assign({ solution: 'pilis', words: words.wordListAll }, o));

test('typing fills the current row, backspace drops the last typed letter', () => {
    const g = game();
    'kanas'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.current, 'kanas');
    g.type('a');   // row is full: ignored
    assert.strictEqual(g.current, 'kanas');
    g.backspace();
    assert.strictEqual(g.current, 'kana');
    g.backspace();
    g.backspace();
    assert.strictEqual(g.current, 'ka');
});

test('submit: a wrong but accepted word moves to the next row', () => {
    const g = game();
    'kanas'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);
    assert.strictEqual(g.currentGuess, 1);
    assert.strictEqual(g.guesses[0], 'kanas');
    assert.strictEqual(g.current, '');
});

test('submit: not five letters -> Neįrašei žodžio', () => {
    const g = game();
    'žva'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), 'Neįrašei žodžio');
    assert.strictEqual(g.currentGuess, 0);
});

test('submit: not a word -> Nėra žodžio', () => {
    const g = game();
    'zzzzz'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), 'Nėra žodžio');
    assert.strictEqual(g.currentGuess, 0);
});

test('submit: the day\'s word is always accepted (the upstream bug fix)', () => {
    // pekla is a solution missing from the upstream wordListAll
    const g = game({ solution: 'pekla' });
    'pekla'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);
    assert.strictEqual(g.won, true);
});

test('submit: a win ends the game', () => {
    const g = game();
    'pilis'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);
    assert.strictEqual(g.won, true);
    assert.strictEqual(g.over, true);
});

test('six wrong guesses end the game', () => {
    const g = game();
    for (let i = 0; i < 6; i++) {
        'kanas'.split('').forEach((l) => g.type(l));
        g.submit();
    }
    assert.strictEqual(g.currentGuess, 6);
    assert.strictEqual(g.over, true);
    assert.strictEqual(g.won, false);
});

test('the game is over: typing and submitting do nothing', () => {
    const g = game({ guesses: ['pilis', '', '', '', '', ''] });
    g.won = true;
    'kanas'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.guesses[0], 'pilis');  // the typed letters went nowhere
    assert.strictEqual(g.submit(), null);
    assert.strictEqual(g.currentGuess, 1);      // the first empty row, as a restored game starts at
});

test('hard mode on: a violated guess is rejected with the message', () => {
    const g = game({ hardMode: true });
    'pieta'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);       // green P at 0, green I at 1
    'linas'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), 'Raidė „P" turi likti 1 vietoje');
    assert.strictEqual(g.currentGuess, 1);      // still row 1
});

test('hard mode on: an obeying guess is accepted', () => {
    const g = game({ hardMode: true });
    'pieta'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);       // green P at 0 and green I at 1
    'pinas'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);       // P at 0, I at 1 kept
    assert.strictEqual(g.currentGuess, 2);
});

/* ---------- restore (a game saved in the car's data folder plays on) ---------- */

test('a game restored from saved guesses plays on', () => {
    const g = game({ guesses: ['kanas', 'baras'] });
    assert.strictEqual(g.currentGuess, 2);
    assert.strictEqual(g.keyState('s'), 'correct');   // kanas: S green at 4
    assert.strictEqual(g.keyState('k'), 'absent');    // kanas: K absent
    assert.strictEqual(g.keyState('a'), 'absent');    // kanas: A absent
    'linas'.split('').forEach((l) => g.type(l));
    assert.strictEqual(g.submit(), null);
    assert.strictEqual(g.currentGuess, 3);
});

/* ---------- statistics (stats.js, ported from zodlys' helpers/statistics.ts) ---------- */

const S = require('../apps/larryare_zodlys/stats');
const stat = (date, tries, won) => ({ date, tries, won });

test('statistics: no games yet', () => {
    const s = S.computeStatistics([]);
    assert.strictEqual(s.played, 0);
    assert.strictEqual(s.winRate, 0);
    assert.strictEqual(s.currentStreak, 0);
    assert.strictEqual(s.maxStreak, 0);
    assert.deepStrictEqual(s.distribution, [0, 0, 0, 0, 0, 0]);
    assert.strictEqual(s.avgTries, 0);
    assert.strictEqual(s.bestTries, 0);
    assert.strictEqual(s.lastWinTries, null);
    assert.deepStrictEqual(s.recent, []);
});

test('statistics: played, win rate and counts', () => {
    const s = S.computeStatistics([
        stat('2026-01-01T10:00:00Z', 3, true),
        stat('2026-01-02T10:00:00Z', 0, false),
        stat('2026-01-03T10:00:00Z', 5, true),
    ]);
    assert.strictEqual(s.played, 3);
    assert.strictEqual(s.wins, 2);
    assert.strictEqual(s.winRate, 67);                   // round(2/3 * 100)
});

test('statistics: current streak counts from the end and stops at a loss', () => {
    assert.strictEqual(S.computeStatistics([stat('a', 2, true), stat('b', 3, true), stat('c', 4, true)]).currentStreak, 3);
    assert.strictEqual(S.computeStatistics([stat('a', 2, true), stat('b', 0, false), stat('c', 4, true)]).currentStreak, 1);
    assert.strictEqual(S.computeStatistics([stat('a', 0, false), stat('b', 0, false)]).currentStreak, 0);
});

test('statistics: max streak is the longest run of wins', () => {
    assert.strictEqual(S.computeStatistics([stat('a', 2, true), stat('b', 0, false), stat('c', 1, true), stat('d', 1, true), stat('e', 1, true)]).maxStreak, 3);
    assert.strictEqual(S.computeStatistics([stat('a', 0, false)]).maxStreak, 0);
});

test('statistics: distribution counts wins by guess count', () => {
    const s = S.computeStatistics([
        stat('a', 1, true), stat('b', 3, true), stat('c', 3, true),
        stat('d', 0, false),                                // a loss is not in the distribution
        stat('e', 6, true),
    ]);
    assert.deepStrictEqual(s.distribution, [1, 0, 2, 0, 0, 1]);
});

test('statistics: average and best tries across wins', () => {
    const s = S.computeStatistics([stat('a', 2, true), stat('b', 5, true), stat('c', 3, true)]);
    assert.strictEqual(s.avgTries, 10 / 3);
    assert.strictEqual(s.bestTries, 2);
    assert.strictEqual(S.computeStatistics([stat('a', 0, false)]).avgTries, 0);
    assert.strictEqual(S.computeStatistics([stat('a', 0, false)]).bestTries, 0);
});

test('statistics: lastWinTries highlights the newest win; recent keeps the last 10', () => {
    const many = [];
    for (let i = 0; i < 15; i++) many.push(stat('2026-01-01T00:00:' + String(i).padStart(2, '0') + 'Z', (i % 6) + 1, true));
    const s = S.computeStatistics(many);
    assert.strictEqual(s.lastWinTries, 3);               // the newest win: i=14 -> 14%6+1
    assert.strictEqual(s.recent.length, 10);
    assert.strictEqual(s.recent[0].date, '2026-01-01T00:00:05Z');
    assert.strictEqual(s.recent[9].date, '2026-01-01T00:00:14Z');
    // unsorted input is sorted by date first
    const shuffled = [stat('2026-01-03T10:00:00Z', 2, true), stat('2026-01-01T10:00:00Z', 3, true)];
    assert.deepStrictEqual(S.computeStatistics(shuffled).recent.map((g) => g.date), ['2026-01-01T10:00:00Z', '2026-01-03T10:00:00Z']);
});

/* ---------- run ---------- */

let failed = 0;
for (const t of tests) {
    try {
        t.fn();
        console.log('  ok  ' + t.name);
    } catch (e) {
        failed++;
        console.log('FAIL  ' + t.name + '\n      ' + (e && e.message || e));
    }
}
console.log(failed ? failed + ' of ' + tests.length + ' tests FAILED' : tests.length + ' tests passed');
process.exit(failed ? 1 : 0);

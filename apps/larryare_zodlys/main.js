'use strict';
/**
 * Žodlys - the Lithuanian daily word game (gitlab.com/larryare/zodlys), on the iDrive.
 *
 * Guess the five-letter word of the day in six tries. The board is on the left, the keyboard on
 * the right. The keyboard is tapped on the touchscreen (the kit routes touch); Enter and Backspace
 * are also on the bar buttons under the picture. The day's word is picked exactly as on the
 * website (wordList[day of year], local time), so the car and the website show the same word.
 *
 * State is saved per date in the app's data folder: a half-finished game survives a reboot and
 * carries on; a new day starts a new game. The rules are in model.js (tests/zodlys.test.js).
 *
 * Palettes are zodlys' (light + dark); dark is the default - a car's cabin is usually dark.
 */
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const M = require('./model');
const S = require('./stats');
const WORDS = require('./words');

const W = 1600, H = 520;

/* ---------- layout ---------- */
const TOP = 44;                                           // below the tab bar (the kit's G.TOP)
const TILE = 70, GAP = 10;
const BOARD_X = 130, BOARD_Y = TOP;
const BOARD_W = 5 * TILE + 4 * GAP;                       // 390
const KB_X = 620, KB_W = 900, KB_GAP = 8, KEY_H = 70, ROW_GAP = 12;
const KB_Y = TOP + Math.round((H - TOP - (3 * KEY_H + 2 * ROW_GAP)) / 2);
const KB_ROWS = [
    ['E', 'Ę', 'Ė', 'R', 'T', 'Y', 'U', 'Ų', 'Ū', 'I', 'Į', 'O', 'P'],
    ['A', 'Ą', 'S', 'Š', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Enter', 'Z', 'Ž', 'C', 'Č', 'V', 'B', 'N', 'M', 'Del'],
];
// every key's rect, computed once: letters one unit wide, Enter/Del one and a half
const KEYS = [];
KB_ROWS.forEach((row, r) => {
    const y = KB_Y + r * (KEY_H + ROW_GAP);
    const flex = row.map((k) => (k === 'Enter' || k === 'Del') ? 1.5 : 1);
    const total = flex.reduce((a, b) => a + b, 0);
    const unit = (KB_W - (row.length - 1) * KB_GAP) / total;
    let x = KB_X;
    row.forEach((k, i) => {
        const w = Math.round(unit * flex[i]);
        KEYS.push({ k: k, x: x, y: y, w: w, h: KEY_H });
        x += w + KB_GAP;
    });
});

/* ---------- palette (zodlys' light + dark, kit-local hex) ---------- */
const PAL = {
    light: {
        bg: '#ffffff', text: '#000000', dim: '#6b7280', sel: '#1d4ed8',
        tile: {
            win:     { bg: '#15803d', text: '#000000' },
            correct: { bg: '#1d4ed8', text: '#000000' },
            present: { bg: '#facc15', text: '#000000' },
            absent:  { bg: '#9ca3af', text: '#000000' },
            empty:   { bg: '#ffffff', text: '#000000', border: '#e5e7eb' },
        },
        typedBorder: '#4b5563',
        key: {
            idle:    { bg: '#e5e7eb', text: '#000000' },
            correct: { bg: '#1d4ed8', text: '#ffffff' },
            present: { bg: '#facc15', text: '#000000' },
            absent:  { bg: '#4b5563', text: '#ffffff' },
        },
        alert: '#dc2626', alertBg: '#fee2e2',
        overlay: '#ffffff', overlayLine: '#e5e7eb',
    },
    dark: {
        bg: '#18181b', text: '#f4f4f5', dim: '#a1a1aa', sel: '#3b82f6',
        tile: {
            win:     { bg: '#6ee7b7', text: '#18181b' },
            correct: { bg: '#93c5fd', text: '#18181b' },
            present: { bg: '#fde68a', text: '#18181b' },
            absent:  { bg: '#52525b', text: '#f4f4f5' },
            empty:   { bg: '#27272a', text: '#f4f4f5', border: '#52525b' },
        },
        typedBorder: '#71717a',
        key: {
            idle:    { bg: '#52525b', text: '#f4f4f5' },
            correct: { bg: '#93c5fd', text: '#18181b' },
            present: { bg: '#fde68a', text: '#18181b' },
            absent:  { bg: '#3f3f46', text: '#a1a1aa' },
        },
        alert: '#f87171', alertBg: '#450a0a',
        overlay: '#27272a', overlayLine: '#3f3f46',
    },
};

mgu.run({
    async start(ctx) {
        const { ui, settings, log, dataDir } = ctx;

        /* ---------- the day and its word (as the website picks it) ---------- */
        const dayKey = (d) => d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        let day = dayKey(new Date());
        let solution = M.dailyWord(WORDS.wordList);
        log.info('Žodlys ' + day + ': ' + solution);

        /* ---------- state, saved per date ---------- */
        const FILE = path.join(dataDir, 'zodlys.json');
        let game = load();

        function load() {
            try {
                const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
                if (s.day === day) {
                    log.info('carrying on: ' + s.guesses.filter((g) => g).length + ' guesses in');
                    return new M.Game({ solution: solution, hardMode: !!settings.get('hardMode'), guesses: s.guesses, words: WORDS.wordListAll });
                }
            } catch (e) { /* first start or a new day */ }
            return new M.Game({ solution: solution, hardMode: !!settings.get('hardMode'), words: WORDS.wordListAll });
        }
        function save() {
            try {
                fs.writeFileSync(FILE, JSON.stringify({ day: day, guesses: game.guesses, won: game.won }));
            } catch (e) { log.warn('save: ' + e); }
        }

        /* ---------- statistics: one entry per finished game, as the website keeps them ---------- */
        const STATS_FILE = path.join(dataDir, 'stats.json');
        let statistics = [];
        try {
            const s = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            if (Array.isArray(s.stats)) statistics = s.stats;
        } catch (e) { /* none yet */ }
        function saveStats() {
            try {
                fs.writeFileSync(STATS_FILE, JSON.stringify({ stats: statistics }));
            } catch (e) { log.warn('saveStats: ' + e); }
        }
        function addStatistic(stat) {
            statistics.push(stat);
            saveStats();
        }

        /* ---------- drawing ---------- */
        function drawBoard(cv, t) {
            for (let r = 0; r < 6; r++) {
                const guess = game.guesses[r] || '';
                const revealed = r < game.currentGuess || (game.won && r === game.currentGuess);
                for (let c = 0; c < 5; c++) {
                    const x = BOARD_X + c * (TILE + GAP), y = BOARD_Y + r * (TILE + GAP);
                    const letter = guess[c] ? guess[c].toUpperCase() : '';
                    let tone = 'empty';
                    if (revealed) {
                        const states = M.evaluateGuess(guess, solution);
                        tone = guess === solution ? 'win' : states[c];
                    } else if (r === game.currentGuess && !game.won && letter) {
                        tone = 'empty';                          // typed: the empty tile + typed border
                    }
                    const st = t.tile[tone];
                    cv.roundRect(x, y, TILE, TILE, 6, st.bg);
                    if (st.border) cv.strokeRoundRect(x, y, TILE, TILE, 6, 2, st.border);
                    else if (letter && !revealed) cv.strokeRoundRect(x, y, TILE, TILE, 6, 2, t.typedBorder);
                    if (letter) cv.text(letter, x + TILE / 2, y + TILE / 2 + 13, 34, st.text, { font: 'bold', align: 'center' });
                }
            }
        }

        function drawKeyboard(cv, t) {
            KEYS.forEach((key) => {
                const st = t.key[game.keyState(key.k)];
                const label = key.k === 'Enter' ? 'ĮRAŠYTI' : key.k === 'Del' ? 'DEL' : key.k;
                const size = key.k === 'Enter' || key.k === 'Del' ? 20 : 26;
                cv.roundRect(key.x, key.y, key.w, key.h, 5, st.bg);
                cv.text(label, key.x + key.w / 2, key.y + key.h / 2 + size * 0.36, size, st.text, { font: 'bold', align: 'center' });
                // a focusable target: the wheel controller reaches the keyboard, press presses the key
                // (the kit draws the focus ring and the press flash over the target)
                cv.target(key.x, key.y, key.w, key.h, () => press(key.k), 'key:' + key.k);
            });
        }

        function drawAlert(cv, t) {
            const msg = game.alert;
            const w = cv.textWidth(msg, 26, { font: 'bold' }) + 40;
            const x = BOARD_X + BOARD_W / 2 - w / 2, y = BOARD_Y + 6 * (TILE + GAP) - GAP - 52;
            cv.roundRect(x, y, w, 46, 10, t.alertBg);
            cv.text(msg, x + w / 2, y + 31, 26, t.alert, { font: 'bold', align: 'center' });
        }

        function drawResult(cv, t) {
            const w = 420, h = 170, x = BOARD_X + BOARD_W / 2 - w / 2, y = BOARD_Y + (6 * (TILE + GAP) - GAP - h) / 2;
            cv.roundRect(x, y, w, h, 12, t.overlay);
            cv.strokeRoundRect(x, y, w, h, 12, 2, t.overlayLine);
            const title = game.won ? 'Laimėjai!' : 'Ne laimėjai';
            const sub = game.won ? (game.currentGuess + 1) + ' iš 6' : 'Žodis buvo „' + solution.toUpperCase() + '"';
            cv.text(title, x + w / 2, y + 72, 40, t.text, { font: 'bold', align: 'center' });
            cv.text(sub, x + w / 2, y + 118, 24, t.dim, { font: 'label', align: 'center' });
            cv.text('Kitas žodis po ' + untilMidnight(), x + w / 2, y + 152, 20, t.dim, { font: 'label', align: 'center' });
        }

        function untilMidnight() {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const s = Math.max(0, Math.floor((midnight - now) / 1000));
            const p = (n) => String(n).padStart(2, '0');
            return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60);
        }

        async function render() {
            // midnight rollover: the day's word changes, a new game starts
            const today = dayKey(new Date());
            if (today !== day) {
                day = today;
                solution = M.dailyWord(WORDS.wordList);
                game = new M.Game({ solution: solution, hardMode: !!settings.get('hardMode'), words: WORDS.wordListAll });
                log.info('new day ' + day + ': ' + solution);
            }
            const t = PAL[settings.get('theme') === 'light' ? 'light' : 'dark'];
            const cv = ctx.canvas(W, H).clear(t.bg);
            // the header's tabs: the game and the statistics, as pages (the kit draws the strip itself)
            G.frame(cv, t, ['Žodlys', 'Statistika'], page, []);
            if (page === 0) {
                drawBoard(cv, t);
                drawKeyboard(cv, t);
                if (game.alert) drawAlert(cv, t);
                if (game.over) drawResult(cv, t);
            } else {
                drawStats(cv, t);
            }
            await ui.image('GAME_GFX', cv);
        }

        /* ---------- actions ---------- */
        let page = 0;                                          // 0: the game, 1: the statistics
        let alertTimer = null;
        function alert(msg) {
            game.alert = msg;
            if (alertTimer) clearTimeout(alertTimer);
            alertTimer = setTimeout(() => { game.alert = null; render(); }, 2500);
        }

        function press(k) {
            if (page !== 0) return;                            // the game's keys only work on the game page
            if (k === 'Enter') {
                const a = game.submit();
                if (a) alert(a);
                else {
                    // a finished game goes into the statistics: a win as its guess count, a loss on
                    // the sixth guess as tries 0 (as the website records it)
                    if (game.won) addStatistic({ date: new Date().toISOString(), tries: game.currentGuess + 1, won: true });
                    else if (game.currentGuess >= 6) addStatistic({ date: new Date().toISOString(), tries: 0, won: false });
                    save();
                    if (game.over) resultTick();
                }
            } else if (k === 'Del') {
                game.backspace();
            } else {
                game.type(k);
            }
            render();
        }

        // the result's countdown ticks every second while the game is over (the stats page's too)
        let resultTimer = null;
        function resultTick() {
            if (resultTimer) return;
            resultTimer = setInterval(() => {
                if (!game.over && page !== 1) { clearInterval(resultTimer); resultTimer = null; return; }
                render();
            }, 1000);
        }

        /* ---------- input: touch on the keyboard, bar buttons as fallback ---------- */
        let pressed = null;
        const keyAt = (x, y) => KEYS.find((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) || null;
        ctx.onTouch((phase, x, y) => {
            if (page !== 0) return false;                      // the stats page: the keyboard is not there
            if (phase === 1) {
                pressed = keyAt(x, y);
                return !!pressed;                    // a keyboard tile: the gesture is this app's
            }
            if (phase === 2) {
                if (pressed && keyAt(x, y) !== pressed) { pressed = null; render(); }
                return !!pressed;
            }
            if (pressed && keyAt(x, y) === pressed) { const key = pressed; pressed = null; press(key.k); }
            else { pressed = null; render(); }
            return true;
        });
        ui.onClick('BTN_ENTER', () => press('Enter'));
        ui.onClick('BTN_DEL', () => press('Del'));

        // the header's tabs switch the pages (the kit claims taps on the tabs itself)
        ctx.onTab((i) => {
            if (i === page) return;
            page = i;
            if (page === 1) resultTick();                      // the countdown ticks on the stats page too
            render();
        });

        /* ---------- the statistics page (a page of its own, like the website's) ---------- */
        function drawStats(cv, t) {
            const stats = S.computeStatistics(statistics);
            const tile = (x, y, w, h, value, label) => {
                cv.roundRect(x, y, w, h, 14, withAlpha('#ffffff', 0.06));
                cv.text(String(value), x + w / 2, y + h / 2 - 8, 46, t.tile.correct.bg, { align: 'center', font: 'bold' });
                cv.text(label, x + w / 2, y + h / 2 + 32, 18, t.dim, { align: 'center', font: 'label', spacing: 1.5 });
            };
            const X = 60, Y = 76, TW = 330, TH = 120, TG = 20;
            tile(X, Y, TW, TH, stats.played, 'ŽAISTA');
            tile(X + (TW + TG), Y, TW, TH, stats.winRate + '%', 'LAIMĖTA %');
            tile(X + 2 * (TW + TG), Y, TW, TH, stats.currentStreak, 'SERIJA');
            tile(X + 3 * (TW + TG), Y, TW, TH, stats.maxStreak, 'ILGIAUSIA SERIJA');

            // distribution of wins by guess count: the bar's width is the count's share
            cv.text('PASISKIRSTYMAS PAGAL BANDYMUS', X, Y + TH + 48, 20, t.dim, { font: 'bold', spacing: 1.5 });
            const barsY = Y + TH + 64, barH = 34, barGap = 8, maxBar = Math.max(...stats.distribution, 1);
            for (let i = 0; i < 6; i++) {
                const y = barsY + i * (barH + barGap);
                cv.text(String(i + 1), X + 14, y + barH / 2 + 8, 22, t.dim, { align: 'center', font: 'bold' });
                const w = stats.distribution[i] === 0 ? 60 : Math.round((stats.distribution[i] / maxBar) * 900);
                const hl = stats.lastWinTries === i + 1;
                cv.roundRect(X + 40, y, w, barH, 8, hl ? t.tile.win.bg : withAlpha('#ffffff', 0.12));
                cv.text(String(stats.distribution[i]), X + 40 + w - 14, y + barH / 2 + 8, 22, hl ? '#000000' : t.text, { align: 'center', font: 'bold' });
            }

            // average and best, right of the bars
            const RX = 1050, RW = 490;
            tile(RX, barsY, RW / 2 - 10, TH, stats.avgTries ? stats.avgTries.toFixed(1) : '—', 'VIDUTINIŠKAI BANDYMŲ');
            tile(RX + RW / 2 + 10, barsY, RW / 2 - 10, TH, stats.bestTries || '—', 'GERIAUSIAS REZULTATAS');

            // the last games: won as its try count, lost as X
            if (stats.recent.length) {
                cv.text('PASKUTINIAI ŽAIDIMAI', RX, barsY + TH + 48, 20, t.dim, { font: 'bold', spacing: 1.5 });
                stats.recent.forEach((g, i) => {
                    const sq = 52, sx = RX + i * (sq + 10), sy = barsY + TH + 64;
                    cv.roundRect(sx, sy, sq, sq, 10, g.won ? t.tile.win.bg : withAlpha('#ffffff', 0.12));
                    cv.text(g.won ? String(g.tries) : 'X', sx + sq / 2, sy + sq / 2 + 9, 24, g.won ? '#000000' : t.text, { align: 'center', font: 'bold' });
                });
            }

            cv.text('Kitas žodis po ' + untilMidnight(), W / 2, 486, 22, t.dim, { align: 'center', font: 'label' });
        }

        settings.onChange((k) => {
            if (k === 'hardMode') game.hardMode = !!settings.get('hardMode');
            if (k === 'hardMode' || k === 'theme') render();
        });
        ctx.onLayout(render);

        render().then(() => log.info('first frame done'));
    },
});

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
const M = require('./model');
const WORDS = require('./words');

const W = 1600, H = 520;

/* ---------- layout ---------- */
const TILE = 70, GAP = 10;
const BOARD_X = 130, BOARD_Y = 25;
const BOARD_W = 5 * TILE + 4 * GAP;                       // 390
const KB_X = 620, KB_W = 900, KB_GAP = 8, KEY_H = 70, ROW_GAP = 12;
const KB_Y = Math.round((H - (3 * KEY_H + 2 * ROW_GAP)) / 2);
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
        bg: '#ffffff', text: '#000000', dim: '#6b7280',
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
        bg: '#18181b', text: '#f4f4f5', dim: '#a1a1aa',
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
                    return new M.Game({ solution: solution, hardMode: !!settings.get('hardMode'), guesses: s.guesses });
                }
            } catch (e) { /* first start or a new day */ }
            return new M.Game({ solution: solution, hardMode: !!settings.get('hardMode') });
        }
        function save() {
            try {
                fs.writeFileSync(FILE, JSON.stringify({ day: day, guesses: game.guesses, won: game.won }));
            } catch (e) { log.warn('save: ' + e); }
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
                game = new M.Game({ solution: solution, hardMode: !!settings.get('hardMode') });
                log.info('new day ' + day + ': ' + solution);
            }
            const t = PAL[settings.get('theme') === 'light' ? 'light' : 'dark'];
            const cv = ctx.canvas(W, H).clear(t.bg);
            drawBoard(cv, t);
            drawKeyboard(cv, t);
            if (game.alert) drawAlert(cv, t);
            if (game.over) drawResult(cv, t);
            await ui.image('GAME_GFX', cv);
        }

        /* ---------- actions ---------- */
        let alertTimer = null;
        function alert(msg) {
            game.alert = msg;
            if (alertTimer) clearTimeout(alertTimer);
            alertTimer = setTimeout(() => { game.alert = null; render(); }, 2500);
        }

        function press(k) {
            if (k === 'Enter') {
                const a = game.submit();
                if (a) alert(a);
                else { save(); if (game.over) resultTick(); }
            } else if (k === 'Del') {
                game.backspace();
            } else {
                game.type(k);
            }
            render();
        }

        // the result's countdown ticks every second while the game is over
        let resultTimer = null;
        function resultTick() {
            if (resultTimer) return;
            resultTimer = setInterval(() => {
                if (!game.over) { clearInterval(resultTimer); resultTimer = null; return; }
                render();
            }, 1000);
        }

        /* ---------- input: touch on the keyboard, bar buttons as fallback ---------- */
        let pressed = null;
        const keyAt = (x, y) => KEYS.find((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) || null;
        ctx.onTouch((phase, x, y) => {
            if (phase === 1) {
                pressed = keyAt(x, y);
                return !!pressed;                    // a keyboard tile: the gesture is this app's
            }
            if (phase === 2) {
                if (pressed && keyAt(x, y) !== pressed) { pressed = null; render(); }
                return !!pressed;
            }
            if (pressed && keyAt(x, y) === pressed) { pressed = null; press(pressed.k); }
            else { pressed = null; render(); }
            return true;
        });
        ui.onClick('BTN_ENTER', () => press('Enter'));
        ui.onClick('BTN_DEL', () => press('Del'));

        settings.onChange((k) => {
            if (k === 'hardMode') game.hardMode = !!settings.get('hardMode');
            if (k === 'hardMode' || k === 'theme') render();
        });
        ctx.onLayout(render);

        render().then(() => log.info('first frame done'));
    },
});

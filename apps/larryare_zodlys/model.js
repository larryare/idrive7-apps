'use strict';
/**
 * Žodlys' rules, without drawing or the car (tested in tests/zodlys.test.js).
 *
 * Ported verbatim from zodlys (gitlab.com:larryare/zodlys):
 *   src/app/page.tsx            daily word, win/lose, alerts
 *   src/helpers/evaluateGuess   two-pass Wordle evaluation
 *   src/helpers/hardMode.ts     hard mode: every revealed hint reused
 *   src/helpers/getKeyBgColor   keyboard key state, best across guesses
 *
 *   const g = new Game({ solution, words });
 *   g.type(letter)              type a letter into the current row
 *   g.backspace()               drop the last typed letter
 *   g.submit()                  -> { ok, alert } ('Neįrašei žodžio', 'Nėra žodžio', a hard-mode
 *                                  message, or null when the guess was accepted)
 *   g.guesses / g.currentGuess  the board
 *   g.won / g.over              a win ends the game; six guesses end it either way
 *   g.keyState(letter)          'correct' | 'present' | 'absent' | 'idle'
 */

/** The day's word, exactly as the website picks it: wordList[day of year], local time.
 *  getDayOfYear is 1-based (Jan 1 -> 1), so wordList[0] is never the daily word. */
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

function dailyWord(wordList, date) {
    return wordList[getDayOfYear(date || new Date())];
}

/** Two-pass Wordle evaluation: correct positions first (consuming the solution's letters),
 *  then present only while there are leftover copies, absent otherwise. */
function evaluateGuess(guess, solution) {
    const states = new Array(guess.length).fill('absent');
    const remaining = {};
    for (const letter of solution) remaining[letter] = (remaining[letter] || 0) + 1;
    for (let i = 0; i < guess.length; i++) {
        if (guess[i] === solution[i]) {
            states[i] = 'correct';
            remaining[guess[i]] -= 1;
        }
    }
    for (let i = 0; i < guess.length; i++) {
        if (states[i] === 'correct') continue;
        if ((remaining[guess[i]] || 0) > 0) {
            states[i] = 'present';
            remaining[guess[i]] -= 1;
        }
    }
    return states;
}

/** Hard mode: every hint revealed so far must be reused. Correct letters stay at their exact
 *  positions; present letters appear somewhere in the new guess (count-aware). A Lithuanian
 *  message, or null when the guess is legal. */
function hardModeViolation(previousGuesses, newGuess, solution) {
    const requiredPositions = new Array(newGuess.length).fill(null);
    const requiredLetters = [];
    for (const prev of previousGuesses) {
        const states = evaluateGuess(prev, solution);
        for (let i = 0; i < prev.length; i++) {
            if (states[i] === 'correct') requiredPositions[i] = prev[i];
            else if (states[i] === 'present') requiredLetters.push(prev[i]);
        }
    }
    for (let i = 0; i < newGuess.length; i++) {
        if (requiredPositions[i] && newGuess[i] !== requiredPositions[i]) {
            return 'Raidė „' + requiredPositions[i].toUpperCase() + '" turi likti ' + (i + 1) + ' vietoje';
        }
    }
    const available = newGuess.split('');
    for (const letter of requiredLetters) {
        const idx = available.indexOf(letter);
        if (idx === -1) return 'Naudokite atskleistą raidę „' + letter.toUpperCase() + '"';
        available.splice(idx, 1);
    }
    return null;
}

const PRECEDENCE = { correct: 3, present: 2, absent: 1 };

/** Best-known state of a keyboard key across all guesses: correct > present > absent, else idle. */
function keyState(guesses, solution, key) {
    const letter = key.toLowerCase();
    let best = null;
    for (const guess of guesses) {
        if (!guess) continue;
        const states = evaluateGuess(guess, solution);
        for (let i = 0; i < guess.length; i++) {
            if (guess[i] !== letter) continue;
            if (best === null || PRECEDENCE[states[i]] > PRECEDENCE[best]) best = states[i];
        }
    }
    return best || 'idle';
}

class Game {
    constructor(o) {
        o = o || {};
        this.solution = o.solution;
        this.words = o.words || [];
        this.hardMode = !!o.hardMode;
        this.reset(o.guesses || null);
    }

    reset(guesses) {
        // a restored game (saved in the car's data folder) plays on from the first empty row;
        // fewer than six rows are padded out
        this.guesses = [];
        for (let i = 0; i < 6; i++) this.guesses.push((guesses && guesses[i]) || '');
        let currentGuess = 0;
        while (currentGuess < 6 && this.guesses[currentGuess]) currentGuess += 1;
        this.currentGuess = currentGuess;
        this.won = false;
        this.alert = null;
    }

    get over() { return this.won || this.currentGuess >= 6; }
    get current() { return this.guesses[this.currentGuess] || ''; }

    /** A letter from the keyboard; ignored when the game is over or the row is full. */
    type(letter) {
        if (this.over) return;
        if (this.guesses[this.currentGuess].length > 4) return;
        this.guesses[this.currentGuess] += letter.toLowerCase();
    }

    backspace() {
        if (this.over) return;
        const row = this.guesses[this.currentGuess];
        this.guesses[this.currentGuess] = row.substring(0, row.length - 1);
    }

    /** Try the current row: an alert (Lithuanian, as the website) when rejected, null when accepted.
     *  The game is over after an accepted winning guess, or once six guesses are in. */
    submit() {
        if (this.over) return null;
        const guess = this.guesses[this.currentGuess];
        if (guess.length !== 5) return this.alert = 'Neįrašei žodžio';
        if (this.words.indexOf(guess) === -1) return this.alert = 'Nėra žodžio';
        if (this.hardMode) {
            const v = hardModeViolation(this.guesses.slice(0, this.currentGuess), guess, this.solution);
            if (v) return this.alert = v;
        }
        this.alert = null;
        if (guess === this.solution) {
            this.won = true;
        } else {
            this.currentGuess += 1;
        }
        return null;
    }

    keyState(letter) {
        return keyState(this.guesses.slice(0, this.currentGuess + (this.over ? 1 : 0)), this.solution, letter);
    }
}

module.exports = { Game, getDayOfYear, dailyWord, evaluateGuess, hardModeViolation, keyState };

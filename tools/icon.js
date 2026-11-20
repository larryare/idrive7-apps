'use strict';
/**
 * icon.js - Žodlys' app tile icon (140x140, in the HMI's style): a row of five
 * letter tiles like the game's board, Ž O D L Y (the first five letters of the
 * game's name), two revealed (correct + present) and the rest not yet.
 *
 *   node tools/icon.js            -> apps/larryare_zodlys/icon.png
 */
const fs = require('fs');
const path = require('path');
const { Canvas } = require(path.join(__dirname, '..', 'kit', 'runtime', 'canvas'));

const W = 140, H = 140;
const c = new Canvas(W, H);

const T = 24, G = 4, N = 5;
const x0 = Math.round((W - (N * T + (N - 1) * G)) / 2), y = 58;
const GREEN = '#15803d', GREEN_T = '#ffffff';
const YELLOW = '#facc15', YELLOW_T = '#000000';
const GRAY = '#e5e7eb', GRAY_T = '#000000';

const tiles = [
    { ch: 'Ž', bg: GREEN, fg: GREEN_T },
    { ch: 'O', bg: YELLOW, fg: YELLOW_T },
    { ch: 'D', bg: GRAY, fg: GRAY_T, border: '#9ca3af' },
    { ch: 'L', bg: GRAY, fg: GRAY_T, border: '#9ca3af' },
    { ch: 'Y', bg: GRAY, fg: GRAY_T, border: '#9ca3af' },
];
tiles.forEach((tl, i) => {
    const x = x0 + i * (T + G);
    c.roundRect(x, y, T, T, 4, tl.bg);
    if (tl.border) c.strokeRoundRect(x, y, T, T, 4, 2, tl.border);
    c.text(tl.ch, x + T / 2, y + T / 2 + 8, 17, tl.fg, { font: 'bold', align: 'center' });
});

const out = process.argv[2] || path.join(__dirname, '..', 'apps', 'larryare_zodlys', 'icon.png');
fs.writeFileSync(out, c.png(9));
console.log('icon written to ' + out);

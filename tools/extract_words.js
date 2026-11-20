#!/usr/bin/env node
'use strict';
// Extract wordList (solutions) and wordListAll (solutions + extra accepted words)
// from zodlys' src/app/wordList.tsx into words.json for the iDrive7 app.
// Usage: node tools/extract_words.js /Users/lkere/code/zodlys/src/app/wordList.tsx words.json
const fs = require('fs');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/extract_words.js <wordList.tsx> <words.json>');
  process.exit(1);
}
const text = fs.readFileSync(src, 'utf8');

function grabList(name) {
  const start = text.indexOf('export const ' + name);
  if (start < 0) throw new Error(name + ' not found');
  const open = text.indexOf('[', start);
  const close = text.indexOf('];', open);
  if (open < 0 || close < 0) throw new Error(name + ' brackets not found');
  const body = text.slice(open + 1, close);
  const words = body
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^"|"$/g, ''));
  // "ką gi", "t. y.", "ne ką", "po to" contain spaces / dots; unreachable as
  // guesses (the keyboard has no such keys) but kept verbatim for fidelity.
  for (const w of words) {
    if (!/^[ąčęėįšųūžĄČĘĖĮŠŲŪŽa-z]+$/u.test(w)) console.warn('odd entry kept: ' + w);
    if (w.length !== 5) throw new Error('not 5 chars: ' + w);
  }
  return words;
}

const wordList = grabList('wordList');
const wordListAll = grabList('wordListAll');
// Upstream bug: 155 of the 1094 solutions are missing from wordListAll, so on those days the
// website answers "Nėra žodžio" to the day's own word and the game is unwinnable. The app
// accepts the union, so every solution is always a legal guess.
const missing = wordList.filter((w) => wordListAll.indexOf(w) === -1);
if (missing.length) console.log('solutions missing from wordListAll (added): ' + missing.length);
const accepted = wordListAll.concat(missing);
// wordListAll has ~179 duplicate entries in the source; dedupe, keep first occurrence and order
// (the app only tests membership).
const seen = new Set();
const wordListAllUnique = accepted.filter((w) => (seen.has(w) ? false : seen.add(w)));
if (wordListAllUnique.length !== accepted.length) {
  console.log('deduped wordListAll: ' + accepted.length + ' -> ' + wordListAllUnique.length);
}

const out = { wordList, wordListAll: wordListAllUnique };
fs.writeFileSync(process.argv[3] || 'words.json', JSON.stringify(out, null, 1) + '\n');
console.log('solutions: ' + wordList.length + ', all: ' + wordListAllUnique.length);

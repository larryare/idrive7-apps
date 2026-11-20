# Žodlys on the iDrive

The Lithuanian daily word game ([zodlys](https://gitlab.com/larryare/zodlys)) as a custom app for the BMW MGU head unit (iDrive 7), built with the [idrive7-apps kit](https://github.com/cauliflowermossgrape/idrive7-apps).

Guess the five-letter word of the day in six tries, on the car's touchscreen (the iDrive controller works too). The daily word matches the website — `wordList[day of year]`, local time. Hard mode included; stats live on the website.

## Install

**From the Store (mgu-store):** add `Larryare BMW Apps` as a source (a Releases source pointing at this repository), then install Žodlys from the car's Store UI.

**Manually over SSH:** download `larryare_zodlys@<version>.tgz` from [Releases](../../releases), then on the head unit:

```
/var/opt/mgu-deploy/mgu-deploy.sh install --artifact larryare_zodlys@1.0.0.tgz --yes
```

## Build from source

The kit and the OAP SDK are vendored. Words are extracted from the upstream game:

```
node tools/extract_words.js /path/to/zodlys/src/app/wordList.tsx apps/larryare_zodlys/words.js
python3 kit/tools/build.py larryare_zodlys   # -> dist/larryare_zodlys@1.0.0.tgz
node tests/zodlys.test.js                    # the game rules
node kit/tools/preview.js dist/larryare_zodlys preview   # PNG previews on the PC
node kit/tools/emu.js dist/larryare_zodlys   # live emulator in the browser
```

To release: copy the built `dist/*.tgz` into `packages/` and push — the workflow drafts a release, which the Store reads.

## Layout

- `apps/larryare_zodlys/model.js` — the game rules, pure and testable (ported verbatim from zodlys)
- `apps/larryare_zodlys/main.js` — the canvas UI: board, keyboard, touch and controller input
- `apps/larryare_zodlys/words.js` — the word lists (generated; the upstream bug where 155 solutions were missing from the accepted list is fixed here)
- `kit/` — the idrive7-apps kit, with fonts re-baked to include the Lithuanian diacritics `ąčęėįšųūž`

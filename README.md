# Larryare's iDrive apps

Custom apps for the BMW MGU head unit (iDrive 7), built with the [idrive7-apps kit](https://github.com/cauliflowermossgrape/idrive7-apps) — vendored here as `kit/` with the OAP SDK (`oap-sdk/`). Apps live in `apps/<id>/`, each with `app.json` (manifest), `main.js` (the UI), the game/app logic in its own module, and tests in `tests/`.

## Apps

| App | id | What it is |
|---|---|---|
| **Žodlys** | `larryare_zodlys` | The Lithuanian daily word game ([zodlys](https://gitlab.com/larryare/zodlys)) on the iDrive: guess the five-letter word of the day in six tries, on the car's touchscreen (the iDrive controller works too). The daily word matches the website — `wordList[day of year]`, local time. Hard mode and statistics included. |

## Install

**From the Store (mgu-store):** add `Larryare BMW Apps` as a source (a Releases source pointing at this repository), then install from the car's Store UI.

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
node kit/tools/emu.js larryare_zodlys        # live emulator in the browser
```

## Adding an app

Create `apps/<id>/` with an `app.json` (the kit's build.py turns it into the RHMI layout — see the upstream kit's apps for examples), `main.js` (plain JS, Node 8, `require('./kit/mgu')`), and logic in its own module tested in `tests/`. The Lithuanian glyph set is baked into `kit/runtime/fonts/`, so Lithuanian text renders everywhere; extend `kit/tools/bake_fonts.py` for more.

## Release

Copy the built `dist/*.tgz` into `packages/` and push — the workflow drafts a release, which the Store reads (see `.github/workflows/create-draft-release.yml`). `tools/prepare_release.py` regenerates `catalog.json` and `mgu-store.json`.

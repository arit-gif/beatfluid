# How to install the beat-sync upgrade (5 minutes, no new packages)

Your original code is untouched in your Drive. This folder (`fluid-upgraded`)
is a full copy + the upgrade. Pick either path:

## Option A — use this folder directly (easiest)
1. Copy this whole `fluid-upgraded` folder to your machine (or `git init` + push it).
2. `npm install`
3. `npm run dev` — open it, press Music ▶, and you'll see the new beat panel:
   BPM slider, TAP button, spectrum bars, 🎙 Mic beat, 📁 Local MP3.
4. Deploy the same way you do now (`npm run build` → Netlify).

## Option B — patch your existing project
So many files changed now that the easiest patch is: copy the **whole
`src/` folder + `index.html`** from here into your repo (overwrite all),
then `npm run build` to verify (it passes ✅).

Changed/added since your Drive version:
- NEW: `shared/beat.ts`, `shared/blast.ts`, `shared/festivals.ts`,
  `shared/daynight.ts`, `shared/likes.ts`, `shared/history.ts`,
  `shared/voice.ts`, `shared/pip.ts`
- NEW: `music/BeatControls.tsx`, `music/beat-controls.css`,
  `music/SearchPanel.tsx`, `music/search-panel.css`,
  `music/SleepTimer.tsx`, `music/PianoPads.tsx`, `music/piano-pads.css`
- NEW: `ui/FunPanel.tsx`, `ui/fun-panel.css`, `ui/BeatPet.tsx`,
  `ui/beat-pet.css`, `ui/TapBattle.tsx`, `ui/tap-battle.css`
- MODIFIED: `App.tsx`, `music/MusicPlayer.tsx`, `music/music-player.css`,
  `music/useYouTubePlayer.ts`, `music/youtube-api.ts`,
  `music/playlists.ts`, `shared/energy.ts`,
  `fluid/simulation.ts`, `fluid/pointer-input.ts`, `index.html`

## How to demo the beat effect
1. Open the app → hamburger menu → **Music** → press ▶.
2. The dot pulses at the playlist BPM and the fluid breathes with it.
3. **TAP** the TAP button 4–6 times in time with the song — the fluid locks on.
4. Click **🎙 Mic beat** → Allow microphone → turn volume up: kicks now fire
   dye bursts in the fluid. This is the real beat.
5. Or pick a **📁 Local MP3** (pause YouTube first) for the most accurate tracking.

## If something looks off
- **Mic hears nothing:** check the browser mic permission + speaker volume; raise
  Sensitivity slider; on Windows check mic privacy settings.
- **Fluid doesn't pulse:** make sure music is *playing* (clock only runs while
  playing) and BPM roughly matches the song.
- **Old playlists stuck:** localStorage from the old version still loads fine
  (`bpm` is optional) — press "Reset to defaults" in the + menu if needed.

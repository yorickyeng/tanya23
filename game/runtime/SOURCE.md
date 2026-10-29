# Boxedwine runtime

The browser runtime is built from Boxedwine revision `8790ff20428c22daa64368af9553417e4f499c94` (GPL-2.0-or-later). Complete corresponding source, including the small audio changes, is included in `source/boxedwine-8790ff2-pogonya.tar.gz`. The upstream repository is https://github.com/danoon2/Boxedwine.

Build with the official Emscripten SDK 6.0.13. Extract the source archive into a new directory, activate the SDK, and run from the extracted directory:

```sh
make -C project/emscripten -j8 jit OPTIMIZATION_FLAGS=-O3 \
  'GCC_EXTRA_FLAGS=-DBOXEDWINE_WEB_AUDIO_QUEUE_MS=100 -DBOXEDWINE_WEB_AUDIO_RESERVE_MS=70'
```

Copy `project/emscripten/Build/Jit/boxedwine.js` and `.wasm` into `runtime/jit/`.

The audio changes add configurable queue/reserve durations to `include/kdspaudio_math.h`, configurable initial PCM priming to `project/emscripten/boxedwine-audio-worklet.js`, and remove a hardcoded duration from the audio log message in `platform/sdl/kdspaudio.cpp`. Defaults retain upstream behavior; this build selects a fixed 100 ms queue plus a 70 ms reserve. The host selects 70 ms priming. Queue geometry stays fixed for Wine's lifetime.

`platform/sdl/knativescreenSDL.cpp` also applies the requested frame limit to browser software presentation before conversion/upload. Guest timing and input continue normally.

The `jit` target translates guest x86 blocks to WebAssembly and uses SIMD. A current browser is required (Chrome/Edge 137+, Firefox 131+, Safari 18.4+). AudioWorklet uses a shared PCM ring with a resampler on the dedicated audio thread. `coi-worker.js` adds COOP/COEP only within the game's scope on static hosting; it does not cache or send game files elsewhere.

Wine 6 is the unmodified official compact filesystem from https://www.boxedwine.org/v/26R1/wine6/st/boxedwine.zip. See `LICENSE-Wine.txt`. The original game executable, levels, graphics, and sound bank are unchanged. Video files are omitted from the fast package. The original full package remains recoverable in repository history.

Runtime and source hashes are recorded in `BUILD.json`; archive part hashes are in their manifests.

The host module `../buffered-audio.js` supplies a scheduled Web Audio output backend on HTTP or without shared worklet memory. It uses the same fixed guest buffer geometry and native-clock queue accounting, with independently scheduled audio packets; it does not call the emulator from an audio callback. `audioBackend=buffer` forces this path for validation.

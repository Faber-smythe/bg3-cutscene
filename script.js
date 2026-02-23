/** ========================
 * Script.js (game engine)
 * ======================= */

// --- Animation settings ---
const animSettings = {
  enabled: true,
  speed: 1,
  dialogueGrowthDuration: 500,
  nodeFadeOutDuration: 2000,
  nodeFadeOutOffsetY: 12,
  nodeFadeInDuration: 1000,
  nodeFadeInOffsetY: 12,
  backgroundFadeDuration: 2000,
  backgroundSlideDistance: 40,
  backgroundEasing: "ease",
  portraitFadeDuration: 500,
  portraitOffsetY: 18,
  portraitEasing: "ease",
  predialogueParagraphStaggerDelay: 500,
  paragraphFadeDuration: 1000,
  paragraphOffsetY: 12,
  paragraphStaggerDelay: 2500,
  choiceFadeDuration: 330,
  choiceOffsetY: 10,
  choiceStaggerDelay: 150,
  continueFadeDuration: 260,
  pauseAfterPredialogue: 1500,
  pauseAfterText: 50,
  pauseBeforeAutonext: 1000,
  allowSkipAnimation: true,
};

// --- Animation helpers ---
function scaled(ms) {
  return Math.round(ms * animSettings.speed);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let renderToken = 0;
let skipRequested = false;

function fadeOutElement(el, { duration = 300, offsetY = 10 } = {}) {
  return new Promise((resolve) => {
    el.style.transition = `opacity ${duration}ms, transform ${duration}ms, height ${duration}ms`;
    el.style.opacity = 0;
    el.style.transform = `translateY(${offsetY}px)`;
    el.style.height = "0px";
    setTimeout(() => {
      el.style.display = "none";
      resolve();
    }, duration);
  });
}

function fadeInElement(el, { duration = 300, offsetY = 10 } = {}) {
  el.style.display = "";
  el.style.opacity = 0;
  el.style.transform = `translateY(${offsetY}px)`;
  // force reflow
  void el.offsetWidth;
  el.style.transition = `opacity ${duration}ms, transform ${duration}ms, height ${duration}ms`;
  el.style.height = "auto";
  el.style.opacity = 1;
  el.style.transform = `translateY(0)`;
  return sleep(duration);
}

async function revealElementsStaggered(
  elements,
  { delay = 100, duration = 300, offsetY = 10, token },
) {
  for (let i = 0; i < elements.length; ++i) {
    if (token !== renderToken) return;
    const el = elements[i];
    el.style.opacity = 0;
    el.style.transform = `translateY(${offsetY}px)`;
    el.style.transition = "none";
    el.style.display = "";
  }
  await sleep(10); // allow DOM update
  for (let i = 0; i < elements.length; ++i) {
    if (token !== renderToken) return;
    const el = elements[i];
    el.style.transition = `opacity ${duration}ms, transform ${duration}ms`;
    el.style.opacity = 1;
    el.style.transform = `translateY(0)`;
    if (skipRequested) {
      // Instantly reveal all
      for (let j = i + 1; j < elements.length; ++j) {
        elements[j].style.transition = "none";
        elements[j].style.opacity = 1;
        elements[j].style.transform = `translateY(0)`;
      }
      break;
    }
    await sleep(delay);
  }
  await sleep(duration);
}

function setupSkipHandler(token) {
  function skip() {
    if (token !== renderToken) return;
    skipRequested = true;
  }
  if (animSettings.allowSkipAnimation) {
    document.addEventListener("click", skip, { once: true });
    document.addEventListener("keydown", onKey, { once: true });
  }
  function onKey(e) {
    if (e.code === "Space" || e.key === " ") skip();
  }
}

// Game engine for BG3 cutscene
(function () {
  const bg = document.getElementById("background");
  const vignette = document.getElementById("vignette");
  const speakerEl = document.getElementById("speaker");
  const predialogueEl = document.getElementById("predialogue");
  const textEl = document.getElementById("text");
  const choicesEl = document.getElementById("choices");
  const continueWrap = document.getElementById("continue");
  const continueBtn = document.getElementById("continue-btn");
  const resetBtn = document.getElementById("reset-btn");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const historyToggle = document.getElementById("history-btn");
  const historyPanel = document.getElementById("history-panel");
  const historyClose = document.getElementById("close-history");
  const historyEntries = document.getElementById("history-entries");
  const portraitLeft = document.getElementById("portrait-left");
  const portraitRight = document.getElementById("portrait-right");

  const alwaysCallForContinue = false;

  const { portraitFadeDuration, portraitEasing, dialogueGrowthDuration } =
    animSettings;
  portraitLeft.style.transition = `opacity ${portraitFadeDuration}ms ${portraitEasing}, translate ${portraitFadeDuration}ms ${portraitEasing}`;
  portraitRight.style.transition = `opacity ${portraitFadeDuration}ms ${portraitEasing}, translate ${portraitFadeDuration}ms ${portraitEasing}`;
  predialogueEl.style.transition = `height ${dialogueGrowthDuration}ms ease`;
  speakerEl.style.transition = `height ${dialogueGrowthDuration}ms ease`;
  textEl.style.transition = `height ${dialogueGrowthDuration}ms ease`;
  choicesEl.style.transition = `height ${dialogueGrowthDuration}ms ease`;
  continueWrap.style.transition = `height ${dialogueGrowthDuration}ms ease`;

  let gameFile = null;
  const premiseFlags = {};
  let GameState = {
    currentNodeId: null,
    flags: {},
    history: [],
  };
  let pathArray = [];
  const currentPortraits = {
    left: null,
    right: null,
  };
  let versionWarningShown = false;

  let currentAudio = null;
  let isFullscreen = false;

  // --- URL param helpers ---
  function parseUrlParams() {
    const params = new URLSearchParams(location.search);
    return {
      node: params.get("node"),
      path: params.get("path"),
      flags: params.get("flags"),
      version: params.get("version"),
    };
  }

  function parseFlagsParam(str) {
    if (!str) return {};
    const obj = {};
    str.split(",").forEach((pair) => {
      const [k, v] = pair.split("-");
      if (!k) return;
      if (v === "true") obj[k] = true;
      else if (v === "false") obj[k] = false;
      else if (!isNaN(Number(v))) obj[k] = Number(v);
      else obj[k] = v;
    });
    return obj;
  }

  function serializeFlagsParam(flags) {
    return Object.entries(flags)
      .map(([k, v]) => `${k}-${v}`)
      .join(",");
  }

  function parsePathParam(str) {
    if (!str) return [];
    const arr = [];
    for (let i = 0; i < str.length; ++i) {
      const c = str[i];
      if (c === "X" || c === "x") arr.push("X");
      else if (c >= "0" && c <= "9") arr.push(Number(c));
      // ignore other chars
    }
    return arr;
  }

  function serializePathParam(pathArr) {
    return pathArr.map((t) => (t === "X" ? "X" : String(t))).join("");
  }

  function parseBooleanParam(val) {
    if (val == null) return null;
    const v = String(val).toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  }

  function updateUrl() {
    try {
      const params = new URLSearchParams();
      if (GameState.currentNodeId) params.set("node", GameState.currentNodeId);
      if (pathArray.length) params.set("path", serializePathParam(pathArray));
      if (gameFile?.meta?.version) params.set("version", gameFile.meta.version);
      const newUrl = location.pathname + "?" + params.toString();
      history.replaceState(null, "", newUrl);
    } catch (e) {
      console.warn("Failed to update URL", e);
    }
  }

  function safeFetchJSON(path) {
    return fetch(path).then((r) => r.json());
  }

  function matchesCondition(condition, flags) {
    if (condition == null) return true;
    return Object.keys(condition).every((k) => {
      const expected = condition[k];
      const actual = flags[k];
      if (typeof expected === "boolean") {
        // undefined flag behaves as false
        return (actual === undefined ? false : actual) === expected;
      }
      return actual === expected;
    });
  }

  function resolveContentText(node) {
    if (node.textVariants && Array.isArray(node.textVariants)) {
      for (const v of node.textVariants) {
        if (matchesCondition(v.if, GameState.flags)) return v.text;
      }
      const elseV = node.textVariants.find((v) => v.else);
      if (elseV) return elseV.text;
    }
    return node.text || "";
  }

  function asArray(t) {
    if (t == null) return [];
    return Array.isArray(t) ? t : [t];
  }

  function setBackground(key, options = {}) {
    if (!gameFile.assets?.backgrounds) return;
    const map = gameFile.assets.backgrounds;
    const path = map[key];
    if (!path) {
      console.warn("background asset missing for", key);
      return;
    }
    if (bg.style.backgroundImage.includes(path)) return;
    if (options.instant) {
      bg.style.transition = "none";
      bg.style.opacity = "1";
      bg.style.backgroundImage = `url("${path}")`;
    } else {
      const img = new Image();
      const { backgroundFadeDuration, backgroundEasing } = animSettings;
      img.onload = () => {
        // bg.style.transition = `opacity ${backgroundFadeDuration / 1000}s ${backgroundEasing}`; // requires double layer
        bg.style.transition = `opacity .3s ${backgroundEasing}`;
        bg.style.opacity = "0";
        setTimeout(() => {
          bg.style.backgroundImage = `url("${path}")`;
          bg.style.opacity = "1";
        }, 260);
      };
      img.src = path;
    }
  }

  function setPortrait(side, key, options = {}) {
    if (!gameFile.assets?.portraits) return;
    // skip if portrait stays the same
    if (currentPortraits[side] == key) return;

    const map = gameFile.assets.portraits;
    const path = map[key];
    const el = side === "left" ? portraitLeft : portraitRight;

    if (!path) {
      el.style.opacity = 0;
      el.style.translate = `0px ${animSettings.portraitOffsetY}px`;
      el.src = "";
      return;
    }
    el.src = path;
    currentPortraits[side] = key;
    el.style.opacity = 1;
    el.style.translate = "0px 0px";
  }

  function stopAudio(options = {}) {
    if (currentAudio) {
      if (options.instant) {
        currentAudio.pause();
        currentAudio = null;
      } else {
        const fadeOut = setInterval(() => {
          if (currentAudio && currentAudio.volume > 0.05)
            currentAudio.volume = Math.max(0, currentAudio.volume - 0.06);
          else if (currentAudio) {
            currentAudio.pause();
            clearInterval(fadeOut);
            currentAudio = null;
          }
        }, 120);
      }
    }
  }

  function crossfadeAudio(key, options = {}) {
    if (!gameFile.assets?.soundtracks) return;
    const map = gameFile.assets.soundtracks;
    const path = map[key];
    if (!path) {
      console.warn("soundtrack missing", key);
      return;
    }
    try {
      const next = new Audio(path);
      next.loop = true;
      if (options.instant) {
        if (currentAudio) {
          currentAudio.pause();
        }
        next.volume = 0.8;
        next.play().catch(() => {});
        currentAudio = next;
      } else {
        next.volume = 0;
        next.play().catch(() => {});
        // fade in/out
        const fadeIn = setInterval(() => {
          if (next.volume < 0.8)
            next.volume = Math.min(0.8, next.volume + 0.05);
          else clearInterval(fadeIn);
        }, 150);
        if (currentAudio) {
          const old = currentAudio;
          const fadeOut = setInterval(() => {
            if (old.volume > 0.05) old.volume = Math.max(0, old.volume - 0.06);
            else {
              old.pause();
              clearInterval(fadeOut);
            }
          }, 120);
        }
        currentAudio = next;
      }
    } catch (e) {
      console.warn("audio error", e);
    }
  }
  // --- Play sound effect helper ---
  function playSoundEffect(spec, options = {}) {
    if (!gameFile.assets?.soundEffects) return;
    let sfxKey,
      volume = 1;
    if (typeof spec === "string") {
      sfxKey = spec;
    } else if (spec && typeof spec === "object") {
      sfxKey = spec.src;
      if (typeof spec.volume === "number") {
        volume = Math.max(0, Math.min(1, spec.volume));
      }
    } else {
      return;
    }
    const path = gameFile.assets.soundEffects[sfxKey];
    if (!path) {
      console.warn("soundEffect missing", sfxKey);
      return;
    }
    try {
      const audio = new Audio(path);
      audio.volume = volume;
      audio.loop = false;
      const cleanup = () => {
        audio.removeEventListener("ended", cleanup);
        audio.removeEventListener("error", cleanup);
      };
      audio.addEventListener("ended", cleanup);
      audio.addEventListener("error", cleanup);
      audio.play().catch(() => {});
    } catch (e) {
      // fail gracefully
    }
  }

  // --- Centralized effects handler ---
  function applyEffects(effectsArray, options = {}) {
    if (!Array.isArray(effectsArray)) return;
    const { timing = "nodeStart" } = options;
    const resolvedEffects = effectsArray.filter((effect) => {
      if (!matchesCondition(effect.if, GameState.flags)) return false;
      if (timing == "nodeStart" && !effect.timing) return true;
      return effect.timing == timing;
    });
    for (const effect of resolvedEffects) {
      const { instant = false } = options;
      if (effect.background) setBackground(effect.background, { instant });
      if (effect.soundtrack) crossfadeAudio(effect.soundtrack, { instant });
      if (effect.soundEffect && !instant) {
        if (Array.isArray(effect.soundEffect)) {
          effect.soundEffect.forEach((sfx) => playSoundEffect(sfx, options));
        } else {
          playSoundEffect(effect.soundEffect, options);
        }
      }
      if (effect.stopSoundtrack) stopAudio({ instant });
      if (effect.portraitLeft)
        setPortrait("left", effect.portraitLeft, { instant });
      if (effect.portraitRight)
        setPortrait("right", effect.portraitRight, { instant });
      if (effect.vignetteDarkFactor !== undefined)
        setVignette(effect.vignetteDarkFactor);
    }
  }

  function appendHistory(nodeId, resolvedText, speaker, addSeparator = false) {
    const entry = { nodeId, text: resolvedText, speaker };
    GameState.history.push(entry);
    const div = document.createElement("div");
    div.className = "history-entry";

    // Show speaker if any
    if (speaker) {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = speaker;
      div.appendChild(meta);
    }

    // Display text as separate <p> elements if array, otherwise as single p
    const entryText = document.createElement("div");
    resolvedText.forEach((p) => {
      const pEl = document.createElement("p");
      if (!speaker) entryText.classList.add("narrative");
      pEl.textContent = speaker ? '"' + p + '"' : p;
      entryText.appendChild(pEl);
    });
    div.appendChild(entryText);
    if (addSeparator) {
      const separator = document.createElement("hr");
      separator.classList.add("history-separator");
      if (GameState.history.length > 1) {
        historyEntries.append(separator);
      }
    }
    historyEntries.append(div);
  }

  function setVignette(darkFactor) {
    const opacity = Math.max(0, Math.min(1, darkFactor)) ?? 0.5;
    const intensity = 0.5;
    vignette.style.background = `radial-gradient(
			60% 60% at 50% 80%,
			rgba(0, 0, 0, 0) 0%,
			rgba(0, 0, 0, ${opacity * intensity}) 40%,
			rgba(0, 0, 0, ${opacity}) 100%
		)`;
  }

  function clearPortraitsVisuals(node) {
    let clearLeft = true;
    let clearRight = true;
    // same portraits as previous node should not be cleared
    (node.effects || []).forEach((effect) => {
      if (!matchesCondition(effect.if, GameState.flags)) return;
      if (effect.portraitLeft && effect.portraitLeft == currentPortraits.left) {
        clearLeft = false;
      }
      if (
        effect.portraitRight &&
        effect.portraitRight == currentPortraits.right
      ) {
        clearRight = false;
      }
    });
    // hide portraits
    if (clearLeft) {
      portraitLeft.style.opacity = 0;
      portraitLeft.style.translate = `0px ${animSettings.portraitOffsetY}px`;
      currentPortraits.left = null;
    }
    if (clearRight) {
      portraitRight.style.opacity = 0;
      portraitRight.style.translate = `0px ${animSettings.portraitOffsetY}px`;
      currentPortraits.right = null;
    }
  }

  async function renderNode(nodeId, options = {}) {
    const { silent = false, addToHistory = true } = options;
    const node = gameFile.nodes[nodeId];
    if (!node) return console.error("Node not found", nodeId);
    if (!silent) console.log(GameState);
    GameState.currentNodeId = nodeId;
    renderToken++;
    const myToken = renderToken;
    skipRequested = false;
    if (!silent) updateUrl();
    if (!silent) clearPortraitsVisuals(node);

    // early setting node flags (late setting is at the end of the function)
    if (node.earlySet?.length) {
      node.earlySet.forEach((flag) => {
        Object.assign(GameState.flags, flag);
      });
    }

    // apply effects with default timing
    if (node.effects?.length) {
      applyEffects(node.effects, { timing: "nodeStart", instant: silent });
    }

    const resolved = resolveContentText(node);
    const contentTextAsArray = asArray(resolved);

    // PHASE 0: Fade out previous UI (if not silent)
    if (!silent && animSettings.enabled) {
      const fadeEls = [
        predialogueEl,
        speakerEl,
        textEl,
        choicesEl,
        continueWrap,
      ];
      await Promise.all(
        fadeEls.map((el) =>
          fadeOutElement(el, {
            duration: scaled(animSettings.nodeFadeOutDuration),
            offsetY: animSettings.nodeFadeOutOffsetY,
          }),
        ),
      );
    }

    // PHASE 1: Predialogue
    let predialogueParagraphs = [];
    const predialogueTextAsArray = [];
    if (
      node.predialogue &&
      matchesCondition(node.predialogue.if, GameState.flags)
    ) {
      predialogueEl.innerHTML = "";
      asArray(node.predialogue.text).forEach((string) => {
        predialogueTextAsArray.push(string);
        const p = document.createElement("p");
        p.textContent = string;
        p.style.opacity = 0;
        predialogueEl.appendChild(p);
        predialogueParagraphs.push(p);
      });
      predialogueEl.style.display = "block";
    } else {
      predialogueEl.style.display = "none";
    }

    // PHASE 2: Speaker + Text
    if (node.type === "dialogue" && node.speaker) {
      speakerEl.textContent = node.speaker;
      speakerEl.classList.remove("hidden");
    } else {
      speakerEl.textContent = "";
    }
    if (node.type === "narration") {
      textEl.classList.add("narration");
    } else {
      textEl.classList.remove("narration");
    }
    textEl.innerHTML = "";
    const textParagraphs = [];
    contentTextAsArray.forEach((p) => {
      const pEl = document.createElement("p");
      pEl.style.opacity = 0;
      pEl.textContent = node.type == "narration" ? p : '"' + p + '"';
      textEl.appendChild(pEl);
      textParagraphs.push(pEl);
    });

    // PHASE 3: Choices/Continue
    choicesEl.innerHTML = "";
    continueWrap.classList.add("hidden");
    let resolvedChoices = [];
    if (node.choices) {
      resolvedChoices = node.choices.filter((choice) =>
        matchesCondition(choice.if, GameState.flags),
      );
    }
    const choiceButtons = [];
    if (resolvedChoices.length) {
      if (resolvedChoices.length == 1) {
        choicesEl.classList.add("single-option");
      } else {
        choicesEl.classList.remove("single-option");
      }
      resolvedChoices.forEach((ch, i) => {
        const btn = document.createElement("button");
        btn.style.opacity = 0;
        if (ch.narrative) btn.classList.add("narrative");
        const correctedText = ch.text
          .replace(" ?", "&nbsp;?")
          .replace(" !", "&nbsp;!")
          .replace(" :", "&nbsp;:")
          .replace(" ;", "&nbsp;;")
          .replace(" - ", "&nbsp;-&nbsp;");
        btn.innerHTML =
          (resolvedChoices.length > 1 ? `${i + 1}. ` : "") +
          (ch.context ? `<span class="context">[${ch.context}]</span> ` : "") +
          (ch.narrative
            ? `<span>${correctedText}</span>`
            : `<span>"${correctedText}"</span>`);
        btn.addEventListener("click", () => {
          if (ch.set) Object.assign(GameState.flags, ch.set);
          pathArray.push(i); // Record choice index (number)
          renderNode(ch.next);
        });
        choicesEl.appendChild(btn);
        choiceButtons.push(btn);
      });
    } else if (
      (alwaysCallForContinue || node.callForContinue) &&
      !resolvedChoices.length
    ) {
      continueBtn.onclick = () => {
        if (node.autoNext) {
          pathArray.push("X"); // Mark continue/autonext in path
          renderNode(node.autoNext);
        } else {
          console.warn("No autoNext for this node.");
        }
      };
    }

    // late setting node flags (early setting is at the start of the function)
    if (node.lateSet?.length) {
      node.lateSet.forEach((flag) => {
        Object.assign(GameState.flags, flag);
      });
    }

    if (silent || !animSettings.enabled) {
      // Instantly show everything, no animation, no skip
      predialogueParagraphs.forEach((p) => {
        p.style.opacity = 1;
        p.style.transform = "none";
      });
      textParagraphs.forEach((p) => {
        p.style.opacity = 1;
        p.style.transform = "none";
      });
      choiceButtons.forEach((btn) => {
        btn.style.opacity = 1;
        btn.style.transform = "none";
      });
      continueWrap.style.opacity = 1;
      continueWrap.style.transform = "none";
      if (nodeId != "start" && addToHistory) {
        appendHistory(nodeId, predialogueTextAsArray, null, true);
        appendHistory(nodeId, contentTextAsArray, node.speaker);
      }
      // not displaying through animation when silent=true, so return early
      return;
    }

    // Animation phase: reveal with stagger and allow skip
    setupSkipHandler(myToken);
    try {
      // PREDIALOGUE
      if (predialogueParagraphs.length) {
        // effects on target timing
        applyEffects(node.effects, {
          timing: "predialogueStart",
          instant: silent,
        });
        predialogueEl.style.display = "block";
        predialogueEl.style.opacity = 1;
        predialogueEl.style.height = "auto";
        predialogueEl.style.transform = "none";
        await revealElementsStaggered(predialogueParagraphs, {
          delay: scaled(animSettings.predialogueParagraphStaggerDelay),
          duration: scaled(animSettings.paragraphFadeDuration),
          offsetY: animSettings.paragraphOffsetY,
          token: myToken,
        });
        // effects on target timing
        applyEffects(node.effects, {
          timing: "predialogueEnd",
          instant: silent,
        });
        if (myToken !== renderToken) return;
        if (nodeId != "start")
          await sleep(scaled(animSettings.pauseAfterPredialogue));
      }
      // SPEAKER (no stagger)
      if (speakerEl.textContent) {
        fadeInElement(speakerEl, {
          duration: scaled(animSettings.nodeFadeInDuration),
          offsetY: animSettings.nodeFadeInOffsetY,
        });
        if (myToken !== renderToken) return;
      }
      // TEXT
      if (textParagraphs.length) {
        // effects on target timing
        applyEffects(node.effects, {
          timing: "textStart",
          instant: silent,
        });
        textEl.style.display = "";
        textEl.style.opacity = 1;
        textEl.style.height = "auto";
        textEl.style.transform = "none";
        await revealElementsStaggered(textParagraphs, {
          delay: scaled(animSettings.paragraphStaggerDelay),
          duration: scaled(animSettings.paragraphFadeDuration),
          offsetY: animSettings.paragraphOffsetY,
          token: myToken,
        });
        // effects on target timing
        applyEffects(node.effects, {
          timing: "textEnd",
          instant: silent,
        });
        if (myToken !== renderToken) return;
        if (nodeId != "start") await sleep(scaled(animSettings.pauseAfterText));
      }
      // CHOICES
      if (choiceButtons.length) {
        // effects on target timing
        applyEffects(node.effects, {
          timing: "choicesStart",
          instant: silent,
        });
        choicesEl.style.display = "";
        choicesEl.style.opacity = 1;
        choicesEl.style.height = "auto";
        choicesEl.style.transform = "none";
        await revealElementsStaggered(choiceButtons, {
          delay: scaled(animSettings.choiceStaggerDelay),
          duration: scaled(animSettings.choiceFadeDuration),
          offsetY: animSettings.choiceOffsetY,
          token: myToken,
        });
      } else if (
        node.callForContinue &&
        continueWrap.classList.contains("hidden")
      ) {
        continueWrap.classList.remove("hidden");
        await fadeInElement(continueWrap, {
          duration: scaled(animSettings.continueFadeDuration),
          offsetY: animSettings.choiceOffsetY,
        });
      } else if (!node.callForContinue && node.autoNext) {
        // auto-transition if no call for continue
        if (nodeId != "start" && addToHistory) {
          appendHistory(nodeId, predialogueTextAsArray, null, true);
          appendHistory(nodeId, contentTextAsArray, node.speaker);
        }
        await sleep(animSettings.pauseBeforeAutonext);
        pathArray.push("X");
        renderNode(node.autoNext);
        return;
      }
    } catch (e) {
      console.error(e);
    }
    if (myToken !== renderToken) return;

    if (nodeId != "start" && addToHistory) {
      appendHistory(nodeId, predialogueTextAsArray, null, true);
      appendHistory(nodeId, contentTextAsArray, node.speaker);
    }
  }

  // --- Story reconstruction from path ---
  async function reconstructStoryFromPath(pathArr) {
    // Reset state
    GameState.currentNodeId = gameFile.start;
    if (historyEntries) historyEntries.innerHTML = "";
    GameState.history = [];
    GameState.flags = { ...premiseFlags };
    let nodeId = gameFile.start;
    let lastRenderedNodeId = nodeId;
    let pathIdx = 0;
    let error = false;
    let stepCount = 0;
    while (stepCount < 256) {
      stepCount++;
      const node = gameFile.nodes[nodeId];
      if (!node) {
        pathArray = pathArray.slice(0, pathIdx);
        error = true;
        break;
      }
      // Render node in silent mode
      await renderNode(nodeId, { silent: true });
      lastRenderedNodeId = nodeId;
      // Resolve choices
      let resolvedChoices = [];
      if (node.choices) {
        resolvedChoices = node.choices.filter((choice) =>
          matchesCondition(choice.if, GameState.flags),
        );
      }
      if (resolvedChoices.length) {
        if (pathIdx >= pathArr.length) break; // No more path, stop here
        const token = pathArr[pathIdx++];
        if (
          typeof token !== "number" ||
          token < 0 ||
          token >= resolvedChoices.length
        ) {
          pathArray = pathArray.slice(0, pathIdx);
          error = true;
          break;
        }
        const ch = resolvedChoices[token];
        if (ch.set) Object.assign(GameState.flags, ch.set);
        nodeId = ch.next;
      } else if (node.autoNext) {
        if (pathIdx >= pathArr.length) break;
        const token = pathArr[pathIdx++];
        if (token !== "X") {
          pathArray = pathArray.slice(0, pathIdx - 1);
          error = true;
          break;
        }
        nodeId = node.autoNext;
      } else {
        break; // End reached
      }
    }
    // After reconstruction, set currentNodeId to last valid node
    GameState.currentNodeId = lastRenderedNodeId;
    return { error, finalNodeId: lastRenderedNodeId };
  }

  function resetExperience() {
    // Reset flags
    pathArray = [];
    GameState.flags = {};
    GameState.flags.partyIsRevealed = false;
    // Reset history
    GameState.history = [];
    // clean history panel
    if (historyEntries) historyEntries.innerHTML = "";
    // Reset node
    GameState.currentNodeId = gameFile.start;
    // Reset UI effects (background, music, portraits)
    if (gameFile.assets?.backgrounds?.default) {
      bg.style.backgroundImage = `url("${gameFile.assets.backgrounds.intro}")`;
    }
    // Stop audio
    stopAudio();
    // Hide portraits
    portraitLeft.style.opacity = 0;
    portraitRight.style.opacity = 0;
    // Render start node
    renderNode(GameState.currentNodeId);
  }

  function setFullscreenMode(toggleValue) {
    isFullscreen = toggleValue;
    if (toggleValue) {
      document.body.classList.add("fullscreen-mode");
      pausedForFullscreen = true;
    } else {
      document.body.classList.remove("fullscreen-mode");
      pausedForFullscreen = false;
      // Resume auto-transition if needed (handled in renderNode)
    }
  }

  /*
   * Set listeners on UI buttons
   */
  historyToggle.addEventListener("click", () => {
    historyPanel.classList.toggle("show");
  });
  historyClose?.addEventListener("click", () =>
    historyPanel.classList.remove("show"),
  );
  if (resetBtn) {
    resetBtn.addEventListener("click", resetExperience);
  }
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      setFullscreenMode(!isFullscreen);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      if (isFullscreen) setFullscreenMode(false);
      historyPanel.classList.remove("show");
    }
  });

  // init
  safeFetchJSON("story.json")
    .then(async (data) => {
      gameFile = data;

      // VALIDATION
      const validation = validateGameFile(gameFile);
      console.groupCollapsed("GameFile validation");
      validation.errors.forEach((e) => console.error(e));
      validation.warnings.forEach((w) => console.warn(w));
      console.groupEnd();
      if (validation.errors.length > 0) {
        alert("GameFile validation failed. Check console for details.");
        throw new Error("GameFile validation failed");
      }

      // Parse URL params
      const params = parseUrlParams();
      // Parse flags param (premise flags)
      if (params.flags) {
        Object.assign(premiseFlags, parseFlagsParam(params.flags));
      }
      // Parse path param
      pathArray = params.path ? parsePathParam(params.path) : [];

      // Version check
      if (params.version && params.version !== gameFile.meta.version) {
        console.warn(
          "Version mismatch: URL version ",
          params.version,
          " != story version ",
          gameFile.meta.version,
        );
        if (!versionWarningShown) {
          setTimeout(() => {
            alert(
              "Warning: The story version in the URL does not match the current game version. Progress may not be accurate.",
            );
          }, 100);
          versionWarningShown = true;
        }
      }

      // Preload background default if any
      if (gameFile.assets?.backgrounds?.intro) {
        bg.style.backgroundImage = `url("${gameFile.assets.backgrounds.intro}")`;
      }

      // Story reconstruction logic
      let startNode = gameFile.start;
      if (pathArray.length) {
        // reconstruct story from path
        const { error, finalNodeId } =
          await reconstructStoryFromPath(pathArray);
        // After reconstruction, render final node normally
        await renderNode(finalNodeId, { addToHistory: false });
      } else if (params.node && gameFile.nodes && gameFile.nodes[params.node]) {
        startNode = params.node;
        GameState.currentNodeId = startNode;
        renderNode(GameState.currentNodeId);
      } else {
        GameState.currentNodeId = startNode;
        renderNode(GameState.currentNodeId);
      }
    })
    .catch((e) => {
      console.error("Failed to load story.json", e);
      textEl.textContent = "Failed to load story.json";
    });
})();

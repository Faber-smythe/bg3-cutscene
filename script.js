// Game renderer for "En chasse de soi-même"
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

  const alwaysCallForContinue = true;

  let gameFile = null;
  let GameState = {
    currentNodeId: null,
    flags: {},
    history: [],
  };

  let currentAudio = null;
  let pausedForFullscreen = false;
  let isFullscreen = false;

  // --- URL param helpers ---
  function parseUrlParams() {
    const params = new URLSearchParams(location.search);
    return {
      node: params.get("node"),
      partyIsRevealed: params.get("partyIsRevealed"),
    };
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
      const party = GameState.flags?.partyIsRevealed === true;
      params.set("partyIsRevealed", party ? "true" : "false");
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

  function resolveText(node) {
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

  function setBackground(key) {
    if (!gameFile.assets?.backgrounds) return;
    const map = gameFile.assets.backgrounds;
    const path = map[key];
    if (!path) {
      console.warn("background asset missing for", key);
      return;
    }

    // return if the background is unchanged
    if (bg.style.backgroundImage.includes(path)) return;

    const img = new Image();
    img.onload = () => {
      bg.style.transition = "opacity .6s ease";
      bg.style.opacity = "0";
      setTimeout(() => {
        bg.style.backgroundImage = `url("${path}")`;
        bg.style.opacity = "1";
      }, 260);
    };
    img.src = path;
  }

  function setPortrait(side, key) {
    console.log("check");
    if (!gameFile.assets?.portraits) return;
    const map = gameFile.assets.portraits;
    const path = map[key];
    const el = side === "left" ? portraitLeft : portraitRight;
    if (!path) {
      el.style.opacity = 0;
      el.src = "";
      return;
    }
    el.src = path;
    el.style.opacity = 1;
  }

  function stopAudio() {
    if (currentAudio) {
      const fadeOut = setInterval(() => {
        if (currentAudio.volume > 0.05)
          currentAudio.volume = Math.max(0, currentAudio.volume - 0.06);
        else {
          currentAudio.pause();
          clearInterval(fadeOut);
        }
      }, 120);
    }
  }

  function crossfadeAudio(key) {
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
      next.volume = 0;
      next.play().catch(() => {});
      // fade in/out
      const fadeIn = setInterval(() => {
        if (next.volume < 0.8) next.volume = Math.min(0.8, next.volume + 0.05);
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
    } catch (e) {
      console.warn("audio error", e);
    }
  }

  function appendHistory(nodeId, resolvedText, speaker) {
    const entry = { nodeId, text: resolvedText, speaker };
    GameState.history.push(entry);
    const div = document.createElement("div");
    div.className = "history-entry";

    // Only show speaker if not "Narrator"
    if (speaker && speaker !== "Narrator") {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = speaker;
      div.appendChild(meta);
    }

    // Display text as separate <p> elements if array, otherwise as single p
    const entryText = document.createElement("div");
    resolvedText.forEach((p) => {
      const pEl = document.createElement("p");
      pEl.textContent = p;
      entryText.appendChild(pEl);
    });
    div.appendChild(entryText);
    const separator = document.createElement("hr");
    separator.classList.add("history-separator");
    if (GameState.history.length > 1) {
      historyEntries.append(separator);
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

  function clearNodeVisuals() {
    // keep bg/audio unless new effects
    // hide portraits
    portraitLeft.style.opacity = 0;
    portraitRight.style.opacity = 0;
  }

  function renderNode(nodeId) {
    const node = gameFile.nodes[nodeId];
    if (!node) return console.error("Node not found", nodeId);
    GameState.currentNodeId = nodeId;
    updateUrl();
    clearNodeVisuals();

    // early setting node flags (late setting is at the end of the function)
    if (node.earlySet?.length) {
      node.earlySet.forEach((flag) => {
        Object.assign(GameState.flags, flag);
      });
    }

    // apply effects
    if (node.effects?.length) {
      const filteredEffects = node.effects.filter((effect) =>
        matchesCondition(effect.if, GameState.flags),
      );
      filteredEffects.forEach((effect) => {
        if (effect.background) setBackground(effect.background);
        if (effect.soundtrack) crossfadeAudio(effect.soundtrack);
        if (effect.stopSoundtrack) stopAudio();
        if (effect.portraitLeft) setPortrait("left", effect.portraitLeft);
        if (effect.portraitRight) setPortrait("right", effect.portraitRight);
        if (effect.vignetteDarkFactor !== undefined)
          setVignette(effect.vignetteDarkFactor);
      });
    }

    const resolved = resolveText(node);
    const textAsArray = asArray(resolved);

    // predialogue
    if (
      node.predialogue &&
      matchesCondition(node.predialogue.if, GameState.flags)
    ) {
      predialogueEl.innerHTML = "";
      asArray(node.predialogue.text).forEach((string) => {
        predialogueEl.innerHTML += `<p>${string}</p>`;
      });
      predialogueEl.style.display = "block";
    } else {
      predialogueEl.style.display = "none";
    }

    // speaker
    if (node.type === "dialogue" && node.speaker) {
      speakerEl.textContent = node.speaker;
      speakerEl.classList.remove("hidden");
    } else {
      speakerEl.textContent = "";
    }

    // narration
    if (
      node.type === "narration" ||
      (node.speaker && node.speaker === "Narrator")
    ) {
      textEl.classList.add("narration");
    } else {
      textEl.classList.remove("narration");
    }

    // text (no stagger, no animation, just plain rendering)
    textEl.innerHTML = "";
    textAsArray.forEach((p) => {
      const pEl = document.createElement("p");
      pEl.textContent =
        node.speaker && node.speaker != "Narrator" ? '"' + p + '"' : p;
      textEl.appendChild(pEl);
    });

    // append history entry
    if (nodeId != "start") appendHistory(nodeId, textAsArray, node.speaker);

    // choices or continue
    choicesEl.innerHTML = "";
    continueWrap.classList.add("hidden");
    let resolvedChoices = [];
    if (node.choices) {
      resolvedChoices = node.choices.filter((choice) =>
        matchesCondition(choice.if, GameState.flags),
      );
    }
    if (resolvedChoices.length) {
      if (resolvedChoices.length == 1) {
        choicesEl.classList.add("single-option");
      } else {
        choicesEl.classList.remove("single-option");
      }
      resolvedChoices.forEach((ch, i) => {
        const btn = document.createElement("button");
        if (ch.narrative) btn.classList.add("narrative");
        btn.textContent =
          resolvedChoices.length > 1
            ? `${i + 1}. "${ch.text}"`
            : '"' + ch.text + '"';
        btn.addEventListener("click", () => {
          if (ch.set) Object.assign(GameState.flags, ch.set);
          renderNode(ch.next);
        });
        choicesEl.appendChild(btn);
      });
    } else if (
      (alwaysCallForContinue || node.callForContinue) &&
      !resolvedChoices.length
    ) {
      // Show continue button if alwaysCallForContinue or node.callForContinue
      continueWrap.classList.remove("hidden");
      continueBtn.textContent = "Continuer";
      continueBtn.onclick = () => {
        if (node.autoNext) {
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
    console.log(GameState);
  }

  function resetExperience() {
    // Reset flags
    GameState.flags = {};
    GameState.flags.partyIsRevealed = false;
    // Reset history
    GameState.history = [];
    const historyEntries = document.getElementById("history-entries");
    if (historyEntries) historyEntries.innerHTML = "";
    // Reset node
    GameState.currentNodeId = gameFile.start;
    // Reset UI effects (background, music, portraits)
    if (
      gameFile.assets &&
      gameFile.assets.backgrounds &&
      gameFile.assets.backgrounds.default
    ) {
      bg.style.backgroundImage = `url("${gameFile.assets.backgrounds.default}")`;
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
    if (isFullscreen && (e.key === "Escape" || e.key === "Esc")) {
      setFullscreenMode(false);
    }
    historyPanel.classList.remove("show");
  });

  // init
  safeFetchJSON("story.json")
    .then((data) => {
      gameFile = data;
      // initialize flags with defaults
      GameState.flags = GameState.flags || {};
      GameState.flags.partyIsRevealed = false;

      // Apply URL params if present and valid
      const params = parseUrlParams();
      const parsedParty = parseBooleanParam(params.partyIsRevealed);
      if (parsedParty !== null) GameState.flags.partyIsRevealed = parsedParty;

      // determine starting node: prefer ?node= if valid, otherwise story.start
      let startNode = gameFile.start;
      if (params.node && gameFile.nodes && gameFile.nodes[params.node]) {
        startNode = params.node;
      }
      GameState.currentNodeId = startNode;
      // preload background default if any
      if (
        gameFile.assets &&
        gameFile.assets.backgrounds &&
        gameFile.assets.backgrounds.default
      ) {
        bg.style.backgroundImage = `url("${gameFile.assets.backgrounds.default}")`;
      }
      renderNode(GameState.currentNodeId);
    })
    .catch((e) => {
      console.error("Failed to load story.json", e);
      textEl.textContent = "Failed to load story.json";
    });
})();

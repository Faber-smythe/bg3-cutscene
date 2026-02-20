// --- GameFile Validator ---
function validateGameFile(gameFile) {
  const errors = [];
  const warnings = [];
  const validTypes = ["dialogue", "narration", "system"];

  if (!gameFile || typeof gameFile !== "object") {
    return {
      errors: ["ERROR [global] gameFile is not an object"],
      warnings: [],
    };
  }

  const nodeIds = gameFile.nodes ? Object.keys(gameFile.nodes) : [];

  const asset = gameFile.assets || {};
  const backgrounds = asset.backgrounds || {};
  const soundtracks = asset.soundtracks || {};
  const soundEffects = asset.soundEffects || {};
  const portraits = asset.portraits || {};

  // Collect all flag keys set anywhere for condition key validation
  const allFlagKeys = new Set();

  function collectFlagsFromSetObject(setObj) {
    if (!setObj || typeof setObj !== "object") return;
    Object.keys(setObj).forEach((k) => allFlagKeys.add(k));
  }

  nodeIds.forEach((id) => {
    const node = gameFile.nodes[id];
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node.earlySet)) {
      node.earlySet.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        if (entry.set) collectFlagsFromSetObject(entry.set);
        else collectFlagsFromSetObject(entry);
      });
    }

    if (Array.isArray(node.lateSet)) {
      node.lateSet.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        if (entry.set) collectFlagsFromSetObject(entry.set);
        else collectFlagsFromSetObject(entry);
      });
    }

    if (Array.isArray(node.choices)) {
      node.choices.forEach((choice) => {
        if (!choice || typeof choice !== "object") return;
        collectFlagsFromSetObject(choice.set);
      });
    }
  });

  // Global structure checks
  if (
    !gameFile.start ||
    !gameFile.nodes ||
    typeof gameFile.nodes !== "object" ||
    nodeIds.length === 0
  ) {
    errors.push(
      "ERROR [global] Missing or invalid gameFile.start or gameFile.nodes structure",
    );
  } else if (!gameFile.nodes[gameFile.start]) {
    errors.push(
      `ERROR [global] gameFile.start references missing node "${gameFile.start}"`,
    );
  }

  // Per-node validation
  nodeIds.forEach((nodeId) => {
    const node = gameFile.nodes[nodeId];

    if (!node || typeof node !== "object") {
      errors.push(`ERROR [nodeId=${nodeId}] Node is not a valid object`);
      return;
    }

    // Node type
    if (!node.type || !validTypes.includes(node.type)) {
      errors.push(
        `ERROR [nodeId=${nodeId}] Invalid or missing node type "${node.type}"`,
      );
    }

    // Dead-end check
    const hasChoices = Array.isArray(node.choices) && node.choices.length > 0;
    const hasAutoNext =
      typeof node.autoNext === "string" && node.autoNext.length > 0;
    const isEnd = node.end === true;

    if (!hasChoices && !hasAutoNext && !isEnd) {
      errors.push(
        `ERROR [nodeId=${nodeId}] Node is a dead-end (no choices, no autoNext, not end=true)`,
      );
    }

    // callForContinue misuse
    if (node.callForContinue === true && !hasAutoNext) {
      errors.push(
        `ERROR [nodeId=${nodeId}] callForContinue is true but node has no autoNext`,
      );
    }

    // autoNext checks
    if (node.autoNext) {
      if (node.autoNext === nodeId) {
        errors.push(
          `ERROR [nodeId=${nodeId}] autoNext references itself (self-loop)`,
        );
      } else if (!gameFile.nodes[node.autoNext]) {
        warnings.push(
          `WARNING [nodeId=${nodeId}] autoNext references missing node "${node.autoNext}"`,
        );
      }
    }

    // choices checks
    if (node.choices !== undefined && !Array.isArray(node.choices)) {
      errors.push(`ERROR [nodeId=${nodeId}] choices is not an array`);
    }

    if (Array.isArray(node.choices)) {
      node.choices.forEach((choice, idx) => {
        if (!choice || typeof choice !== "object") {
          errors.push(
            `ERROR [nodeId=${nodeId}] choice[${idx}] is not an object`,
          );
          return;
        }

        if (!choice.text || typeof choice.text !== "string") {
          warnings.push(
            `WARNING [nodeId=${nodeId}] choice[${idx}] missing or invalid text`,
          );
        }

        if (!choice.next || typeof choice.next !== "string") {
          errors.push(
            `ERROR [nodeId=${nodeId}] choice[${idx}] missing 'next' property`,
          );
        } else if (choice.next === nodeId) {
          errors.push(
            `ERROR [nodeId=${nodeId}] choice[${idx}] next references itself (self-loop)`,
          );
        } else if (!gameFile.nodes[choice.next]) {
          warnings.push(
            `WARNING [nodeId=${nodeId}] choice[${idx}] next references missing node "${choice.next}"`,
          );
        }

        // Condition key validation for choice.if
        if (choice.if && typeof choice.if === "object") {
          Object.keys(choice.if).forEach((k) => {
            if (!allFlagKeys.has(k)) {
              warnings.push(
                `WARNING [nodeId=${nodeId}] choice[${idx}] if references unknown flag "${k}"`,
              );
            }
          });
        }
      });
    }

    // effects validation
    if (node.effects !== undefined && !Array.isArray(node.effects)) {
      errors.push(`ERROR [nodeId=${nodeId}] effects is not an array`);
    }

    if (Array.isArray(node.effects)) {
      node.effects.forEach((effect, idx) => {
        if (!effect || typeof effect !== "object") {
          errors.push(
            `ERROR [nodeId=${nodeId}] effect[${idx}] is not an object`,
          );
          return;
        }

        if (effect.background && !backgrounds[effect.background]) {
          warnings.push(
            `WARNING [nodeId=${nodeId}] effect[${idx}] background "${effect.background}" missing in assets.backgrounds`,
          );
        }

        if (effect.soundtrack && !soundtracks[effect.soundtrack]) {
          warnings.push(
            `WARNING [nodeId=${nodeId}] effect[${idx}] soundtrack "${effect.soundtrack}" missing in assets.soundtracks`,
          );
        }

        if (effect.soundEffect && !soundEffects[effect.soundEffect]) {
          warnings.push(
            `WARNING [nodeId=${nodeId}] effect[${idx}] soundEffect "${effect.soundEffect}" missing in assets.soundEffects`,
          );
        }

        if (effect.portraitLeft && !portraits[effect.portraitLeft]) {
          warnings.push(
            `WARNING [nodeId=${nodeId}] effect[${idx}] portraitLeft "${effect.portraitLeft}" missing in assets.portraits`,
          );
        }

        if (effect.portraitRight && !portraits[effect.portraitRight]) {
          warnings.push(
            `WARNING [nodeId=${nodeId}] effect[${idx}] portraitRight "${effect.portraitRight}" missing in assets.portraits`,
          );
        }

        if (effect.if && typeof effect.if === "object") {
          Object.keys(effect.if).forEach((k) => {
            if (!allFlagKeys.has(k)) {
              warnings.push(
                `WARNING [nodeId=${nodeId}] effect[${idx}] if references unknown flag "${k}"`,
              );
            }
          });
        }
      });
    }

    // textVariants validation
    if (node.textVariants !== undefined && !Array.isArray(node.textVariants)) {
      errors.push(`ERROR [nodeId=${nodeId}] textVariants is not an array`);
    }

    if (Array.isArray(node.textVariants)) {
      node.textVariants.forEach((tv, idx) => {
        if (!tv || typeof tv !== "object") {
          errors.push(
            `ERROR [nodeId=${nodeId}] textVariants[${idx}] is not an object`,
          );
          return;
        }

        if (!tv.text) {
          errors.push(
            `ERROR [nodeId=${nodeId}] textVariants[${idx}] missing 'text' property`,
          );
        }

        // Your intended rule: either "if" or "else" must exist
        if (!tv.else && (!tv.if || typeof tv.if !== "object")) {
          errors.push(
            `ERROR [nodeId=${nodeId}] textVariants[${idx}] missing required "if" condition (or else=true)`,
          );
        }

        if (tv.if && typeof tv.if === "object") {
          Object.keys(tv.if).forEach((k) => {
            if (!allFlagKeys.has(k)) {
              warnings.push(
                `WARNING [nodeId=${nodeId}] textVariants[${idx}] if references unknown flag "${k}"`,
              );
            }
          });
        }
      });
    }

    // earlySet / lateSet validation
    ["earlySet", "lateSet"].forEach((setType) => {
      if (node[setType] !== undefined && !Array.isArray(node[setType])) {
        errors.push(`ERROR [nodeId=${nodeId}] ${setType} is not an array`);
      }

      if (Array.isArray(node[setType])) {
        node[setType].forEach((entry, idx) => {
          if (!entry || typeof entry !== "object") {
            errors.push(
              `ERROR [nodeId=${nodeId}] ${setType}[${idx}] is not an object`,
            );
            return;
          }

          if (entry.if && typeof entry.if === "object") {
            if (!entry.set || typeof entry.set !== "object") {
              errors.push(
                `ERROR [nodeId=${nodeId}] ${setType}[${idx}] conditional entry missing 'set' object`,
              );
            }

            Object.keys(entry.if).forEach((k) => {
              if (!allFlagKeys.has(k)) {
                warnings.push(
                  `WARNING [nodeId=${nodeId}] ${setType}[${idx}] if references unknown flag "${k}"`,
                );
              }
            });
          }
        });
      }
    });
  });

  return { errors, warnings };
}

// schema.d.ts
// Dialogue data schema for "On the hunt for oneself" / "En chasse de soi-même"

export type SceneId = "A" | "B" | "C";
export type NodeId = string;


export type NodeType =
  | "narration"
  | "dialogue"
  | "system"; // optional (for meta messages, debug, etc.)

export type SpeakerId =
  | "Ven"
  | "Wyll"
  | "Kholkan"
  | "Lusignelle"
  | "Scratch"
  | string; // allow future extension without editing schema

/*
 * Used to track story progression
 * A rendered node's information are stored as an history entry
 */
export interface HistoryEntry {
  nodeId: string;
  speaker?: string;
  text: string[];
}

/* 
 * Global state of the story
 * Tracks dialogue choices and progression
 */
export interface GameState {
  currentNodeId: string;
  flags: StateFlags;
  history: HistoryEntry[];
}

/**
 * Minimal game state flags.
 * For now we only track partyIsRevealed, but schema allows more later.
 */
export interface StateFlags {
  partyIsRevealed?: boolean | undefined;
  pryedOnVen?: boolean | undefined;
  unmasked?: boolean | undefined;
  wyllIsFree?: boolean | undefined;
  [key: string]: boolean | number | string | undefined;
}

/**
 * Used to conditionally display different text.
 * If condition matches the current flags, the text is used.
 */
export interface Condition {
  [flagName: string]: boolean | number | string | undefined;
}

/**
 * Conditional text entry.
 * - If "if" matches current flags => use this text.
 * - If "else" is true => fallback text.
 */
export interface TextVariant {
  if?: Condition;
  else?: true;
  text: string | string[];
}


export interface SoundEffectSpec {
  src: string;
  volume?: number;
};

/**
 * UI changes requested by a node.
 * These are interpreted by the renderer.
 */
export interface Effect {
  /**
   * Key referencing assets.backgrounds
   */
  background?: string;

  /**
   * Key referencing assets.soundtracks
   */
  soundtrack?: string;
  soundEffect?: string | string[] | SoundEffectSpec | SoundEffectSpec[];

  /*
  * Indicating when in the rendering logic the effect should be triggerd
  */
  timing?: "nodeStart" | "predialogueStart" | "predialogueEnd" | "textStart" | "textEnd" | "choicesStart" | "callForContinue"

  /*
   * How dark the background vignette effect should be
   */
  vignetteDarkFactor?: number;

  /**
   * Portrait keys referencing assets.portraits
   */
  portraitLeft?: string;
  portraitRight?: string;

  /**
   * Optional: stop music, fade out, etc.
   */
  stopSoundtrack?: boolean;


  /**
   * Optional: can be used to enable an effect.
  */
  if?: Condition;
}

/**
 * A dialogue choice presented to the player.
 */
export interface Choice {
  text: string;
  context?: string;
  narrative?: boolean;
  next: NodeId;

  /**
   * Optional: update flags/state when this choice is taken.
  */
  set?: StateFlags[];

  /**
   * Optional: can be used to hide/show a choice.
  */
  if?: Condition;
}


export interface Predialogue {
  text: string | string[]

  /**
   * Optional: can be used to hide/show a choice.
   */
  if?: Condition;
}

/**
 * Base shared structure for all node types.
 */
export interface BaseNode {
  scene: SceneId;
  type: NodeType;

  /**
   * Optional: used for debugging, tooling, and UI.
   */
  title?: string;

  /**
   * Optional: changes UI (music, background, portraits).
   */
  effects?: Effect[];

  /*
   * Optional: wait for user instead of autotransitioning
   */
  callForContinue?: boolean

  /**
   * Default linear progression (no choice).
   */
  autoNext?: NodeId

  /**
   * Optional: update flags/state before the node starts rendering.
  */
  earlySet?: StateFlags[];

  /**
   * Optional: update flags/state after the node is finished rendering.
  */
  lateSet?: StateFlags[];

  /**
   * If present, ends the experience.
   */
  end?: boolean;

}

/**
 * Node containing a single text field (narration/system).
 */
export interface TextNode extends BaseNode {
  text?: string | string[];
  textVariants?: TextVariant[];

  /**
   * Branching progression.
   */
  choices?: Choice[];

}

/**
 * Node with an explicit speaker (character dialogue).
 */
export interface DialogueNode extends TextNode {
  type: "dialogue";
  speaker: SpeakerId;
  predialogue?: Predialogue;
}

/**
 * Narration node (speaker implied as narrator).
 */
export interface NarrationNode extends TextNode {
  type: "narration";
}

/**
 * Union type for all node shapes.
 */
export type Node = DialogueNode | NarrationNode;

/**
 * Asset registry (keys used by effects).
 */
export interface Assets {
  soundtracks?: Record<string, string>;
  soundEffects?: Record<string, string>;
  backgrounds?: Record<string, string>;
  portraits?: Record<string, string>;
}

/**
 * Metadata for the project.
 */
export interface Meta {
  title: string;
  title_fr?: string;
  version?: string;
}

/**
 * Full dialogue file format.
 */
export interface GameFile {

  meta: Meta;
  assets: Assets;
  start: NodeId;

  nodes: Record<NodeId, Node>;
}

import { ButtonStyle } from 'discord.js';
import { defaultRng, pick, randInt, shuffle, type Rng } from '../lib/rng';
import { minigameTimeLimit, performance, type Job } from '../content/jobs';

/**
 * Work-shift minigames. Each is a few button presses, under 10 seconds.
 * A game is a set of buttons plus the order they must be pressed in.
 */

export type MinigameKind = 'unscramble' | 'math' | 'memory' | 'colour';

export interface MinigameButton {
  label: string;
  emoji?: string;
  style: ButtonStyle;
}

export interface Minigame {
  kind: MinigameKind;
  title: string;
  /** Shown while playing. */
  prompt: string;
  /** Memory only: shown first, then replaced by the buttons after `previewMs`. */
  preview?: { text: string; ms: number };
  buttons: MinigameButton[];
  /** Indices of `buttons`, in the order they must be pressed. */
  solution: number[];
  timeLimitMs: number;
}

const grey = ButtonStyle.Secondary;

function uniqueVariants(word: string, count: number, swaps: number, rng: Rng): string[] {
  const variants = new Set<string>();
  for (let attempts = 0; variants.size < count && attempts < 200; attempts++) {
    const letters = word.split('');
    for (let s = 0; s < swaps; s++) {
      const i = randInt(0, letters.length - 2, rng);
      const j = swaps === 1 ? i + 1 : randInt(0, letters.length - 1, rng);
      [letters[i], letters[j]] = [letters[j]!, letters[i]!];
    }
    const variant = letters.join('');
    if (variant !== word) variants.add(variant);
  }
  return [...variants];
}

/** Scrambled word; pick the real spelling among near-miss decoys. Harder jobs use subtler decoys. */
export function unscramble(job: Job, rng: Rng = defaultRng): Minigame {
  const word = pick(job.words, rng);
  const scrambled = uniqueVariants(word, 1, word.length, rng)[0] ?? word.split('').reverse().join('');
  const decoys = uniqueVariants(word, 3, job.difficulty >= 3 ? 1 : 2, rng);
  const options = shuffle([word, ...decoys], rng);
  return {
    kind: 'unscramble',
    title: 'Unscramble',
    prompt: `Which word is **\`${scrambled.toUpperCase()}\`** unscrambled?`,
    buttons: options.map((label) => ({ label, style: grey })),
    solution: [options.indexOf(word)],
    timeLimitMs: minigameTimeLimit * 1000,
  };
}

/** Quick maths with four answers. Difficulty raises the operation and the numbers. */
export function quickMath(job: Job, rng: Rng = defaultRng): Minigame {
  const d = job.difficulty;
  let text: string;
  let answer: number;
  if (d <= 1) {
    const a = randInt(2, 20, rng), b = randInt(2, 20, rng);
    text = `${a} + ${b}`; answer = a + b;
  } else if (d === 2) {
    const a = randInt(20, 60, rng), b = randInt(5, 30, rng);
    if (rng.next() < 0.5) { text = `${a} + ${b}`; answer = a + b; } else { text = `${a} − ${b}`; answer = a - b; }
  } else if (d === 3) {
    const a = randInt(3, 12, rng), b = randInt(3, 12, rng);
    text = `${a} × ${b}`; answer = a * b;
  } else {
    const a = randInt(4, 12, rng), b = randInt(4, 12, rng);
    // Keep the subtraction answer positive
    const c = randInt(2, Math.min(d === 4 ? 20 : 50, a * b - 1), rng);
    if (rng.next() < 0.5) { text = `${a} × ${b} + ${c}`; answer = a * b + c; } else { text = `${a} × ${b} − ${c}`; answer = a * b - c; }
  }
  const options = new Set<number>([answer]);
  // Decoys are near the answer; offsets go up as well as down, so this always finds three
  for (let attempts = 0; options.size < 4 && attempts < 100; attempts++) {
    const offset = randInt(1, d >= 3 ? 12 : 6, rng) * (rng.next() < 0.5 ? -1 : 1);
    if (answer + offset >= 0) options.add(answer + offset);
  }
  for (let n = answer + 1; options.size < 4; n++) options.add(n);
  const shuffled = shuffle([...options], rng);
  return {
    kind: 'math',
    title: 'Quick Maths',
    prompt: `What's **${text}**?`,
    buttons: shuffled.map((n) => ({ label: String(n), style: grey })),
    solution: [shuffled.indexOf(answer)],
    timeLimitMs: minigameTimeLimit * 1000,
  };
}

const MEMORY_EMOJI = ['🍎', '🍋', '🍇', '🍉', '🥝', '🍒', '🥥', '🍌', '🫐', '🍑'];

/** Remember a short emoji sequence, then press it back in order. */
export function memory(job: Job, rng: Rng = defaultRng): Minigame {
  const length = job.difficulty <= 2 ? 3 : job.difficulty <= 4 ? 4 : 5;
  const pool = shuffle(MEMORY_EMOJI, rng);
  const sequence = pool.slice(0, length);
  const decoys = pool.slice(length, length + Math.max(0, 5 - length));
  const buttons = shuffle([...sequence, ...decoys], rng);
  return {
    kind: 'memory',
    title: 'Memory',
    prompt: 'Press them back **in order**!',
    preview: { text: `Remember this:\n# ${sequence.join(' ')}`, ms: 2_600 - job.difficulty * 150 },
    buttons: buttons.map((emoji) => ({ label: '​', emoji, style: grey })),
    solution: sequence.map((e) => buttons.indexOf(e)),
    timeLimitMs: minigameTimeLimit * 1000,
  };
}

const COLOURS = [
  { name: 'BLUE', style: ButtonStyle.Primary },
  { name: 'GREEN', style: ButtonStyle.Success },
  { name: 'RED', style: ButtonStyle.Danger },
  { name: 'GREY', style: ButtonStyle.Secondary },
] as const;

/**
 * Colour click with a twist: the labels lie. Sometimes you need the button that *is* a colour,
 * sometimes the one that *says* it.
 */
export function colourClick(job: Job, rng: Rng = defaultRng): Minigame {
  const styles = shuffle(COLOURS, rng);
  const labels = job.difficulty <= 1 ? styles : shuffle(COLOURS, rng);
  const buttons = styles.map((c, i) => ({ label: labels[i]!.name, style: c.style }));
  const target = pick(COLOURS, rng);
  const byLabel = job.difficulty >= 2 && rng.next() < 0.5;
  const answer = byLabel
    ? buttons.findIndex((b) => b.label === target.name)
    : buttons.findIndex((b) => b.style === target.style);
  return {
    kind: 'colour',
    title: 'Colour Click',
    prompt: byLabel ? `Click the button that **SAYS** ${target.name}` : `Click the button that **IS** ${target.name.toLowerCase()}`,
    buttons,
    solution: [answer],
    timeLimitMs: minigameTimeLimit * 1000,
  };
}

const GAMES = [unscramble, quickMath, memory, colourClick];

/** A random minigame, avoiding the one played last time. */
export function randomMinigame(job: Job, rng: Rng = defaultRng, avoid?: MinigameKind): Minigame {
  for (let i = 0; i < 5; i++) {
    const game = pick(GAMES, rng)(job, rng);
    if (game.kind !== avoid) return game;
  }
  return quickMath(job, rng);
}

/** Pay multiplier from a finished game. */
export function performanceFor(success: boolean, elapsedMs: number, timeLimitMs: number): number {
  if (!success) return performance.fail;
  const speed = 1 - Math.min(1, Math.max(0, elapsedMs / timeLimitMs));
  return performance.slowest + (performance.fastest - performance.slowest) * speed;
}

/** Answering in the first third of the time limit counts as a perfect shift. */
export function isPerfect(success: boolean, elapsedMs: number, timeLimitMs: number): boolean {
  return success && elapsedMs <= timeLimitMs / 3;
}

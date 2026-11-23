import { describe, expect, it } from 'vitest';
// Loads every command and handler (also fills the command list the Help screen reads)
import '../src/framework/registry';
import { ButtonStyle, ComponentType } from 'discord.js';
import { render, screens } from '../src/ui/screens';
import { MAX_LABEL, MAX_OPTIONS, MORE, type Origin, type Payload, type ScreenCtx } from '../src/ui/kit';
import { parseId } from '../src/lib/customId';
import { items } from '../src/content/items';
import { pickaxes, rods, weapons, shovels } from '../src/content/tools';
import { cosmetics } from '../src/content/cosmetics';
import { totalXpForLevel } from '../src/content/levels';
import { hubExpired, hubStamp } from '../src/ui/screens/hub';
import { statusOf } from '../src/ui/activities';
import { BRAND, iconDefs } from '../src/content/icons';
import { palette } from '../src/lib/embeds';
import { themeColor } from '../src/lib/theme';
import { firstSteps } from '../src/services/onboarding';
import type { Profile } from '../src/services/economy';

const OWNER = '460509056487129090';

function profile(over: Partial<Record<string, unknown>> = {}): Profile {
  return {
    _id: OWNER, wallet: 1_000, bank: 0, bankNotes: 0,
    account: { xp: 0, level: 0, prestige: 0 },
    inventory: {}, cooldowns: {}, tools: {}, job: { current: 'barista', shifts: {} },
    streak: { count: 0, best: 0, lastDaily: null, days: [], weeklyCount: 0, lastWeekly: null },
    fishdex: {}, fishdexRewards: [], stats: {}, boosts: {}, cosmetics: { owned: [], title: null, theme: null },
    rotation: { day: -1, bought: {} }, lockedItems: [], onboarding: { crateClaimed: false },
    jailUntil: null, lastActiveAt: new Date(), settings: { dmReminders: false }, migratedFromV2: false,
    ...over,
  } as unknown as Profile;
}

const everything = Object.fromEntries(items.map((i) => [i.id, 3]));
const players: Record<string, Profile> = {
  newbie: profile(),
  mid: profile({
    wallet: 40_000, bank: 30_000, account: { xp: totalXpForLevel(8), level: 8, prestige: 0 },
    inventory: { fish_carp: 4, fish_bass: 2, gem_ruby: 1, crate_common: 2, xp_boost: 1, streak_freeze: 1 },
    tools: { pickaxe: { id: 'pick_stone', durability: 3 }, rod: { id: 'rod_carbon', durability: 70 }, weapon: { id: 'weapon_slingshot', durability: 0 } },
    cosmetics: { owned: ['title_beggar', 'theme_ocean'], title: 'title_beggar', theme: 'theme_ocean' },
    lockedItems: ['gem_ruby'], cooldowns: { mine: new Date(Date.now() + 120_000) },
  }),
  maxed: profile({
    wallet: 50_000_000, bank: 100_000, account: { xp: totalXpForLevel(40), level: 40, prestige: 0 },
    inventory: everything,
    tools: {
      pickaxe: { id: pickaxes.at(-1)!.id, durability: 1 }, rod: { id: rods.at(-1)!.id, durability: 330 },
      weapon: { id: weapons.at(-1)!.id, durability: 2 }, shovel: { id: shovels.at(-1)!.id, durability: 420 },
    },
    cosmetics: { owned: cosmetics.map((c) => c.id), title: 'title_tycoon', theme: 'theme_gold', badge: 'badge_founder', background: 'bg_phoenix', frame: 'frame_founder' },
    onboarding: { crateClaimed: true },
    stats: { worked: 300, fishCaught: 40, crimeWins: { pickpocket: 12 } },
    achievements: { first_shift: new Date(), regular: new Date(), workaholic: new Date(), art_thief: new Date() },
  }),
  prestiged: profile({
    wallet: 2_000, account: { xp: totalXpForLevel(36), level: 36, prestige: 3, best: 40 },
    prestige: { tokens: 4, perks: ['deep_pockets'] },
  }),
  jailed: profile({ wallet: 0, account: { xp: totalXpForLevel(4), level: 4, prestige: 0 }, jailUntil: new Date(Date.now() + 5 * 60_000) }),
};

interface Seen { path: string; payload: Payload }

/** Renders a screen and follows every navigation button and select option, breadth first. */
function crawl(start: string, p: Profile, origin: Origin): Seen[] {
  const ctx: ScreenCtx = { owner: OWNER, origin, profile: p, userName: 'Oct' };
  const seen = new Map<string, Payload>();
  const queue = [start];
  while (queue.length && seen.size < 400) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    const payload = render(path, ctx);
    seen.set(path, payload);
    for (const r of payload.components) {
      for (const c of r.toJSON().components) {
        if (!('custom_id' in c)) continue;
        const id = parseId(c.custom_id);
        if (id.prefix !== 'ui') continue;
        const base = id.args[1]!;
        if (c.type === ComponentType.StringSelect) for (const o of c.options) queue.push(base === MORE ? o.value : `${base}.${o.value}`);
        else if (!('disabled' in c && c.disabled)) queue.push(base);
      }
    }
  }
  return [...seen].map(([path, payload]) => ({ path, payload }));
}

const ENTRY = ['hub', 'shop', 'shop.tools', 'inv.all.0', 'inv.sell.all.0.all', 'inv.sell.r-legendary.1.all', 'wardrobe', 'bal', 'job', 'dex.all', 'help', 'jail', 'ach', 'prestige', 'prestige.confirm', 'casino'];

describe('every menu screen', () => {
  for (const [who, p] of Object.entries(players)) {
    for (const origin of ['c', 'h'] as const) {
      it(`stays within Discord's limits and our menu rules (${who}, opened from ${origin === 'h' ? 'hub' : 'command'})`, () => {
        const all = ENTRY.flatMap((e) => crawl(e, p, origin));
        expect(all.length).toBeGreaterThan(20);
        for (const { path, payload } of all) {
          const where = `${who}/${origin} ${path}`;
          expect(payload.components.length, where).toBeLessThanOrEqual(5);
          const customIds: string[] = [];
          for (const e of payload.embeds) {
            const json = e.toJSON();
            expect((json.description ?? '').length, where).toBeLessThanOrEqual(4096);
            expect((json.fields ?? []).length, where).toBeLessThanOrEqual(25);
            for (const f of json.fields ?? []) expect(f.value.length, `${where} field ${f.name}`).toBeLessThanOrEqual(1024);
          }
          for (const r of payload.components) {
            const comps = r.toJSON().components;
            expect(comps.length, where).toBeLessThanOrEqual(5);
            for (const c of comps) {
              if ('custom_id' in c) {
                expect(c.custom_id.length, where).toBeLessThanOrEqual(100);
                customIds.push(c.custom_id);
              }
              if (c.type === ComponentType.Button && 'label' in c && c.label) {
                expect(c.label.length, `${where}: "${c.label}"`).toBeLessThanOrEqual(MAX_LABEL);
                // Icons only on green/blue buttons; grey buttons (cooldowns, locked, navigation) never get one
                if ('emoji' in c && c.emoji) {
                  expect(c.style === ButtonStyle.Success || c.style === ButtonStyle.Primary, `${where}: icon on grey "${c.label}"`).toBe(true);
                }
                if (/^(Back|Menu|Prev|Next|Cancel|Refresh)$/.test(c.label)) expect('emoji' in c && c.emoji, `${where}: icon on ${c.label}`).toBeFalsy();
                // Same time format as the embed ("6d 23h"), never "167h 43m"
                for (const [, h] of c.label.matchAll(/(\d+)h\b/g)) expect(Number(h), `${where}: "${c.label}"`).toBeLessThan(24);
              }
              if (c.type === ComponentType.StringSelect) {
                expect(c.options.length, where).toBeGreaterThan(0);
                expect(c.options.length, where).toBeLessThanOrEqual(MAX_OPTIONS);
              }
            }
          }
          expect(new Set(customIds).size, `${where}: duplicate custom IDs`).toBe(customIds.length);

          // Every screen except the hub itself starts its last button row with Back or Menu
          if (!path.startsWith('hub')) {
            const buttonRows = payload.components.map((r) => r.toJSON().components).filter((c) => c[0]?.type === ComponentType.Button);
            const first = buttonRows.at(-1)?.[0];
            expect(first && 'label' in first ? first.label : undefined, where).toMatch(/^(Back|Menu)$/);
            expect(first && 'style' in first ? first.style : undefined, where).toBe(ButtonStyle.Secondary);
          }
        }
      });
    }
  }

  it('covers every screen module', () => {
    const visited = new Set(Object.values(players).flatMap((p) => ENTRY.flatMap((e) => crawl(e, p, 'c'))).map((s) => s.path.split('.')[0]));
    for (const name of Object.keys(screens)) expect(visited, name).toContain(name);
  });

  it('never shows a negative wallet-after when something is unaffordable', () => {
    for (const path of ['shop.tools.pickaxe', 'shop.tools.weapon', 'shop.item.coin_boost.cons', 'jail']) {
      const text = render(path, { owner: OWNER, origin: 'c', profile: players.jailed!, userName: 'Oct' }).embeds[0]!.toJSON().description ?? '';
      expect(text, path).not.toMatch(/wallet after ₪ -/);
    }
  });

  it('screen text stays plain: no decorative emoji in descriptions of menu screens', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const [who, p] of Object.entries(players)) {
      for (const path of ['hub', 'shop', 'shop.tools', 'shop.cons', 'inv.all.0', 'bal', 'job', 'help', 'wardrobe']) {
        const json = render(path, { owner: OWNER, origin: 'c', profile: p, userName: 'Oct' }).embeds[0]!.toJSON();
        // With no icons uploaded in tests, icon() returns fallbacks, so strip known fallbacks first
        const fallbacks = Object.values(iconDefs).map((d) => d.fallback);
        let text = `${json.title ?? ''}\n${json.description ?? ''}\n${(json.fields ?? []).map((f) => `${f.name} ${f.value}`).join('\n')}`;
        for (const f of fallbacks) text = text.split(f).join('');
        text = text.split('🧪').join(''); // the test-version notice
        text = text.replace(/[✓★☆▰▱✨]/g, ''); // plain text glyphs (and the prestige-ready sparkle)
        expect(emoji.test(text), `${who} ${path}: ${text.match(emoji)?.[0]}`).toBe(false);
      }
    }
  });

  it('unaffordable buy buttons are disabled and say how much more is needed', () => {
    const payload = render('shop.tools.pickaxe', { owner: OWNER, origin: 'c', profile: players.newbie!, userName: 'Oct' });
    const buy = payload.components.flatMap((r) => r.toJSON().components).find((c) => 'label' in c && /Need|Buy/.test(c.label ?? ''));
    expect(buy && 'label' in buy && buy.label).toMatch(/Need ₪ [\d,]+ more/);
    expect(buy && 'disabled' in buy && buy.disabled).toBe(true);
  });

  it('bulk sell excludes Epic+ and locked items unless toggled', () => {
    const p = players.mid!;
    const off = render('inv.sell.all.0.all', { owner: OWNER, origin: 'c', profile: p, userName: 'Oct' }).embeds[0]!.toJSON().description!;
    expect(off).toMatch(/Keeping 1 Epic\+ stack|Skipping 1 locked/);
    expect(off).not.toMatch(/Ruby — /); // ruby is locked AND epic: never listed for sale
  });
});

describe('hub', () => {
  it('missing tools link to the shop instead of a dead end', () => {
    const payload = render('hub', { owner: OWNER, origin: 'h', profile: players.newbie!, userName: 'Oct' });
    const hunt = payload.components.flatMap((r) => r.toJSON().components).find((c) => 'label' in c && c.label === 'Get Slingshot');
    expect(hunt && 'label' in hunt && hunt.label).toBe('Get Slingshot');
    expect(hunt && 'disabled' in hunt && hunt.disabled).toBeFalsy();
    expect(hunt && 'custom_id' in hunt && parseId(hunt.custom_id).args[1]).toBe('shop.tools.weapon');
  });

  it('shows the First steps checklist until the crate is claimed', () => {
    const show = render('hub', { owner: OWNER, origin: 'h', profile: players.newbie!, userName: 'Oct' }).embeds[0]!.toJSON();
    expect(show.fields?.some((f) => f.name.includes('First steps'))).toBe(true);
    const hide = render('hub', { owner: OWNER, origin: 'h', profile: players.maxed!, userName: 'Oct' }).embeds[0]!.toJSON();
    expect(hide.fields?.some((f) => f.name.includes('First steps')) ?? false).toBe(false);
    // The tip line goes away with First steps
    expect(show.footer?.text).toMatch(/Tip/);
    expect(hide.footer?.text ?? '').not.toMatch(/Tip/);
  });

  it('orders ready activities first, cooldowns last, with exactly one suggested (blue) button', () => {
    for (const [who, p] of Object.entries(players)) {
      const buttons = render('hub', { owner: OWNER, origin: 'h', profile: p, userName: 'Oct' }).components.slice(0, 2)
        .flatMap((r) => r.toJSON().components).filter((c) => c.type === ComponentType.Button) as { style: number; disabled?: boolean; label?: string }[];
      const activityOnly = buttons.filter((b) => !/^(Refresh|Prestige|Pay bail|Need )/.test(b.label ?? ''));
      const kinds = activityOnly.map((b) => (b.style === ButtonStyle.Primary || b.style === ButtonStyle.Success ? 0 : / · \d/.test(b.label ?? '') && b.disabled ? 2 : 1));
      expect([...kinds].sort((a, b) => a - b), who).toEqual(kinds);
      const blue = activityOnly.filter((b) => b.style === ButtonStyle.Primary).length;
      const anyReady = kinds.includes(0);
      expect(blue, who).toBe(anyReady ? 1 : 0);
      if (anyReady) expect(activityOnly[0]!.style, who).toBe(ButtonStyle.Primary);
    }
  });

  it('has no Activities list, a level bar and next unlock, and a More menu (Prestige only from level 30)', () => {
    const hubOf = (p: Profile) => render('hub', { owner: OWNER, origin: 'h', profile: p, userName: 'Oct' });
    const newbie = hubOf(players.newbie!);
    const json = newbie.embeds[0]!.toJSON();
    expect(json.fields?.some((f) => f.name === 'Activities') ?? false).toBe(false);
    expect(json.description).toMatch(/\*\*Level 0\*\* [▰▱]{10} 0% → Level \d+ unlocks /);
    expect(json.description).toMatch(/Daily streak/);
    const moreOptions = (p: Profile) => hubOf(p).components.flatMap((r) => r.toJSON().components)
      .flatMap((c) => (c.type === ComponentType.StringSelect ? c.options.map((o) => o.label) : []));
    expect(moreOptions(players.newbie!)).toEqual(['Shop', 'Inventory', 'Balance', 'Achievements', 'Casino', 'Wardrobe', 'Help']);
    expect(moreOptions(players.maxed!)).toContain('Prestige');
    // Hidden where gambling is off (and in DMs)
    const off = render('hub', { owner: OWNER, origin: 'h', profile: players.newbie!, userName: 'Oct', gambling: false }).components
      .flatMap((r) => r.toJSON().components).flatMap((c) => (c.type === ComponentType.StringSelect ? c.options.map((o) => o.label) : []));
    expect(off).not.toContain('Casino');
    expect(moreOptions(players.prestiged!)).toContain('Prestige');
    // Refresh ends the last activity row; the More menu is the final row
    const rows = newbie.components.map((r) => r.toJSON().components);
    expect(rows.at(-1)![0]!.type).toBe(ComponentType.StringSelect);
    expect(rows.at(-2)!.map((c) => ('label' in c ? c.label : '')).at(-1)).toBe('Refresh');
  });

  it('at level 35 shows the prestige line and a Prestige button instead of the XP bar', () => {
    const json = (p: Profile) => render('hub', { owner: OWNER, origin: 'h', profile: p, userName: 'Oct' });
    const ready = json(players.maxed!);
    expect(ready.embeds[0]!.toJSON().description).toMatch(/You can prestige now/);
    expect(ready.embeds[0]!.toJSON().description).not.toMatch(/▰/);
    const labels = ready.components.flatMap((r) => r.toJSON().components).map((c) => ('label' in c ? c.label : ''));
    expect(labels).toContain('Prestige');
    const mid = json(players.mid!).embeds[0]!.toJSON().description!;
    expect(mid).toMatch(/\*\*Level 8\*\* [▰▱]{10} \d+% → Level \d+ unlocks /);
  });

  it('formats time left in whole units, rounded up', async () => {
    const { timeLeft } = await import('../src/lib/format.js');
    const m = 60_000, h = 60 * m, d = 24 * h;
    expect(timeLeft(5_000)).toBe('1m');
    expect(timeLeft(9 * m + 1_000)).toBe('10m');
    expect(timeLeft(59 * m + 30_000)).toBe('1h');
    expect(timeLeft(17 * h + 44 * m + 10_000)).toBe('17h 45m');
    expect(timeLeft(6 * d + 18 * h + 5 * m)).toBe('6d 19h');
    expect(timeLeft(2 * d)).toBe('2d');
  });

  it('hub activity buttons expire after 15 minutes', () => {
    const now = Date.now();
    expect(hubExpired(hubStamp(now), now + 14 * 60_000)).toBe(false);
    expect(hubExpired(hubStamp(now), now + 16 * 60_000)).toBe(true);
    expect(hubExpired(undefined)).toBe(false); // result-screen buttons never expire
  });

  it('activity status reflects cooldowns, tools, level and jail', () => {
    expect(statusOf('mine', players.mid!).state).toBe('cooldown');
    expect(statusOf('hunt', players.newbie!)).toMatchObject({ state: 'needs', fix: 'shop.tools.weapon' });
    expect(statusOf('hunt', players.mid!)).toMatchObject({ state: 'needs', label: 'Repair Slingshot' });
    expect(statusOf('crime', players.newbie!).state).toBe('locked');
    expect(statusOf('daily', players.jailed!).state).toBe('locked');
    expect(statusOf('fish', players.newbie!).state).toBe('ready'); // starter rod is free
  });

  it('first steps: daily, a shift, a tool', () => {
    expect(firstSteps(players.newbie!).map((s) => s.done)).toEqual([false, false, false]);
    expect(firstSteps(players.mid!)[2]!.done).toBe(true);
  });
});

describe('with real application emojis loaded', () => {
  // Every key in every variant: oi_<key>_<b|w|g|c>_abc123
  const fake = Object.fromEntries(Object.keys(iconDefs).flatMap((k, i) => ['b', 'w', 'g', 'c'].map((v, j) =>
    [`${k}.${v}`, { id: `12345678901234${String(i).padStart(3, '0')}${j}`, name: `oi_${k}_${v}_abc123` }])));
  const variants = (text: string) => [...text.matchAll(/<:oi_[a-z_]+?_([bwgc])_abc123:\d+>/g)].map((m) => m[1]);

  it('uses the right icon colour everywhere and fits Discord limits', async () => {
    const { setLoadedIconsForTest } = await import('../src/lib/icons.js');
    setLoadedIconsForTest(fake);
    try {
      for (const p of Object.values(players)) {
        for (const e of ENTRY) {
          for (const { path, payload } of crawl(e, p, 'h')) {
            for (const em of payload.embeds) {
              const json = em.toJSON();
              expect((json.title ?? '').length, path).toBeLessThanOrEqual(256);
              expect((json.description ?? '').length, path).toBeLessThanOrEqual(4096);
              for (const f of json.fields ?? []) expect(f.value.length, `${path} ${f.name}`).toBeLessThanOrEqual(1024);
              // Brand side colour on every menu screen (an equipped colour theme may recolour your own screens)
              expect([BRAND, themeColor(p)], `${path}: side colour`).toContain(json.color);
              // Title: the first icon is brand blue; anything after it (badges, rarity) keeps its fixed colour
              const [first, ...rest] = variants(json.title ?? '');
              if (first) expect(first, `${path}: title icon`).toBe('b');
              for (const v of rest) expect(v, `${path}: title`).toBe('c');
              // Embed text: grey or fixed colour only
              const body = [json.description, json.footer?.text, ...(json.fields ?? []).flatMap((f) => [f.name, f.value])].join('\n');
              for (const v of variants(body)) expect(['g', 'c'], `${path}: inline icon`).toContain(v);
            }
            for (const r of payload.components) {
              for (const c of r.toJSON().components) {
                if (c.type !== ComponentType.Button || !('emoji' in c) || !c.emoji?.name) continue;
                const v = /^oi_[a-z_]+?_([bwgc])_abc123$/.exec(c.emoji.name)?.[1];
                // White on green/blue buttons (rarity icons keep their colour)
                if (v) expect(['w', 'c'], `${path}: "${c.label}" icon`).toContain(v);
              }
            }
          }
        }
      }
      const hub = render('hub', { owner: OWNER, origin: 'h', profile: players.newbie!, userName: 'Oct' });
      expect(hub.embeds[0]!.toJSON().title).toMatch(/^<:oi_menu_b_abc123:\d+> Menu$/);
      const ready = hub.components.flatMap((r) => r.toJSON().components).find((c) => c.type === ComponentType.Button && c.style === ButtonStyle.Success);
      expect(ready && 'emoji' in ready ? ready.emoji?.name : undefined).toMatch(/^oi_[a-z]+_w_abc123$/);
    } finally {
      setLoadedIconsForTest({});
    }
  });

  it('result embeds use green / amber / red, everything else the brand colour', () => {
    expect(palette.success).toBe(0x23a55a);
    expect(palette.warning).toBe(0xf0b232);
    expect(palette.error).toBe(0xf23f43);
    for (const [k, v] of Object.entries(palette)) if (!['success', 'warning', 'error'].includes(k)) expect(v, k).toBe(BRAND);
  });
});

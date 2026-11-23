import { icon } from '../../lib/icons';
import { coins, num, relative } from '../../lib/format';
import { getItem, itemLabel } from '../../content/items';
import { rarities, rarityInfo } from '../../content/rarity';
import type { UseResult } from '../../services/items';

/** One short block describing what using an item did. */
export function describeUse(result: UseResult): string {
  switch (result.kind) {
    case 'boost': return `${icon('success')} ${result.label} active until ${relative(result.until)}.`;
    case 'bank_note': return `${icon('success')} Bank capacity raised. Bank notes now add **+${coins(result.newCapacityBonus)}** in total.`;
    case 'scratch': return `🎟️ ${result.prizes.map((p) => (p ? `🎉 ${coins(p)}` : '❌')).join(' • ')} — total **${coins(result.total)}**`;
    case 'crate': {
      const item = getItem(result.itemId);
      const loot = Object.entries(result.loot.items)
        .sort(([a], [b]) => rarities.indexOf(getItem(b)?.rarity ?? 'common') - rarities.indexOf(getItem(a)?.rarity ?? 'common'))
        .map(([id, q]) => `${icon(getItem(id)?.rarity ?? 'common')} ${itemLabel(id, q)}`);
      if (result.loot.coins) loot.unshift(`🪙 **${coins(result.loot.coins)}**`);
      return `${item?.emoji ?? '📦'} **Opened ${result.qty > 1 ? `${num(result.qty)}× ` : ''}${item?.name ?? 'crate'}:**\n${loot.join('\n')}`;
    }
  }
}

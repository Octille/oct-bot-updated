import {
  AttachmentBuilder,
  PermissionFlagsBits,
  type Collection,
  type GuildMember,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import { ANYONE, makeId } from '../lib/customId';
import { embed } from '../lib/embeds';
import { buttonIcon, titleIcon } from '../lib/icons';
import { btn, MAIN, NAV, DANGER, row, type Payload } from '../ui/kit';

export const ticketRules = {
  /** Transcripts include at most this many messages (newest kept). */
  transcriptMax: 1000,
  /** Channel-mode tickets are deleted this long after closing. */
  deleteChannelAfterMs: 5_000,
  /** Staff members added to a new ticket thread directly (on top of the role mention). */
  addStaffMax: 25,
} as const;

/** The public panel members press to open a ticket. */
export function ticketPanel(): Payload {
  return {
    embeds: [embed('utility').setTitle(`${titleIcon('ticket')} Support`).setDescription('Need help from the staff? Open a private ticket: only you and the staff can see it.')],
    components: [row(btn(makeId('tk', ANYONE, 'open'), 'Open ticket', MAIN, { emoji: buttonIcon('ticket') }))],
  };
}

/** The first message inside a ticket, with Close and Transcript. */
export function ticketWelcome(ticketId: string, number: number, ownerId: string, staffRoleId: string | null): Payload & { content: string } {
  return {
    content: [`<@${ownerId}>`, staffRoleId ? `<@&${staffRoleId}>` : null].filter(Boolean).join(' '),
    embeds: [embed('utility').setTitle(`${titleIcon('ticket')} Ticket #${number}`).setDescription([
      `Opened by <@${ownerId}>. Describe what you need and the staff will answer here.`,
      '-# Close the ticket when you are done. Staff and the opener can download a transcript.',
    ].join('\n'))],
    components: [row(
      btn(makeId('tk', ANYONE, 'tr', ticketId), 'Transcript', NAV),
      btn(makeId('tk', ANYONE, 'close', ticketId), 'Close', DANGER),
    )],
  };
}

export const ticketName = (number: number, userName: string) =>
  `ticket-${String(number).padStart(4, '0')}-${userName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'member'}`;

/** Staff: the ticket staff role, or anyone who can manage the server, channels or threads. */
export function isTicketStaff(member: GuildMember, staffRoleId: string | null | undefined): boolean {
  if (staffRoleId && member.roles.cache.has(staffRoleId)) return true;
  return member.permissions.any([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageThreads]);
}

export interface TranscriptLine {
  at: Date;
  author: string;
  authorId: string;
  bot: boolean;
  content: string;
  attachments: string[];
  embeds: number;
}

/** Plain-text transcript, oldest message first. */
export function formatTranscript(header: { server: string; channel: string; number: number; ownerId: string; truncated: boolean }, lines: TranscriptLine[]): string {
  const sorted = [...lines].sort((a, b) => a.at.getTime() - b.at.getTime());
  return [
    `Ticket #${header.number} · ${header.server} · #${header.channel}`,
    `Opened by user ${header.ownerId}`,
    `${sorted.length} messages${header.truncated ? ` (only the last ${ticketRules.transcriptMax} kept)` : ''}`,
    '─'.repeat(60),
    ...sorted.map((l) => {
      const extra = [...l.attachments.map((a) => `[attachment] ${a}`), ...(l.embeds ? [`[${l.embeds} embed${l.embeds === 1 ? '' : 's'}]`] : [])];
      return `[${l.at.toISOString().replace('T', ' ').slice(0, 19)} UTC] ${l.author}${l.bot ? ' [bot]' : ''} (${l.authorId}): ${l.content}${extra.length ? `\n    ${extra.join('\n    ')}` : ''}`;
    }),
    '',
  ].join('\n');
}

/** Reads the ticket's messages (newest `transcriptMax`) into a .txt attachment. */
export async function buildTranscript(channel: TextBasedChannel & { name: string }, header: { server: string; number: number; ownerId: string }): Promise<AttachmentBuilder> {
  const lines: TranscriptLine[] = [];
  let before: string | undefined;
  let truncated = false;
  while (lines.length < ticketRules.transcriptMax) {
    const batch: Collection<string, Message> = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    for (const m of batch.values()) {
      lines.push({ at: m.createdAt, author: m.author.tag, authorId: m.author.id, bot: m.author.bot, content: m.cleanContent, attachments: [...m.attachments.values()].map((a) => a.url), embeds: m.embeds.length });
    }
    if (batch.size < 100) break;
    before = batch.last()!.id;
    if (lines.length >= ticketRules.transcriptMax) truncated = true;
  }
  const text = formatTranscript({ ...header, channel: channel.name, truncated }, lines.slice(0, ticketRules.transcriptMax));
  return new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `ticket-${header.number}.txt` });
}


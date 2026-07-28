import type { DbcMessageRow, DbcSignalRow } from '@/lib/can/dbc-catalog';

/** Absolute bit index within the frame (byte0 bit0 = 0, Intel-style numbering). */
export type FrameBitCell = {
  byteIndex: number;
  /** 0–7, where 0 is LSB of the byte */
  bitInByte: number;
  signalName: string | null;
  signalIndex: number;
  /** Position within the signal (0 = LSB of signal for Intel; MSB-first for Motorola display order) */
  signalBit: number;
};

export type FrameBitLayout = {
  byteCount: number;
  /** [byte][bit7..bit0] for CANdb++ style columns */
  grid: Array<Array<FrameBitCell>>;
  overlaps: Array<{ byteIndex: number; bitInByte: number; signals: string[] }>;
};

function motorolaStartToNetworkBit(start: number): number {
  return 8 * Math.floor(start / 8) + (7 - (start % 8));
}

/** Absolute Intel-style bit indices occupied by a DBC signal. */
export function signalAbsoluteBits(sig: DbcSignalRow): number[] {
  const bits: number[] = [];
  if (sig.length <= 0) return bits;

  if (sig.endian === 'Intel') {
    for (let i = 0; i < sig.length; i += 1) {
      bits.push(sig.startBit + i);
    }
    return bits;
  }

  const networkStart = motorolaStartToNetworkBit(sig.startBit);
  for (let i = 0; i < sig.length; i += 1) {
    const networkBit = networkStart + i;
    const byteIndex = Math.floor(networkBit / 8);
    const bitInByte = 7 - (networkBit % 8);
    bits.push(byteIndex * 8 + bitInByte);
  }
  return bits;
}

const SIGNAL_COLORS = [
  {
    bg: 'bg-sky-400/55 dark:bg-sky-400/45',
    border: 'border-sky-500/60 dark:border-sky-300/50',
    text: 'text-sky-950 dark:text-sky-50',
  },
  {
    bg: 'bg-violet-400/55 dark:bg-violet-400/45',
    border: 'border-violet-500/60 dark:border-violet-300/50',
    text: 'text-violet-950 dark:text-violet-50',
  },
  {
    bg: 'bg-emerald-400/55 dark:bg-emerald-400/45',
    border: 'border-emerald-500/60 dark:border-emerald-300/50',
    text: 'text-emerald-950 dark:text-emerald-50',
  },
  {
    bg: 'bg-amber-400/55 dark:bg-amber-400/45',
    border: 'border-amber-500/60 dark:border-amber-300/50',
    text: 'text-amber-950 dark:text-amber-50',
  },
  {
    bg: 'bg-rose-400/55 dark:bg-rose-400/45',
    border: 'border-rose-500/60 dark:border-rose-300/50',
    text: 'text-rose-950 dark:text-rose-50',
  },
  {
    bg: 'bg-cyan-400/55 dark:bg-cyan-400/45',
    border: 'border-cyan-500/60 dark:border-cyan-300/50',
    text: 'text-cyan-950 dark:text-cyan-50',
  },
  {
    bg: 'bg-fuchsia-400/55 dark:bg-fuchsia-400/45',
    border: 'border-fuchsia-500/60 dark:border-fuchsia-300/50',
    text: 'text-fuchsia-950 dark:text-fuchsia-50',
  },
  {
    bg: 'bg-lime-400/55 dark:bg-lime-400/45',
    border: 'border-lime-500/60 dark:border-lime-300/50',
    text: 'text-lime-950 dark:text-lime-50',
  },
  {
    bg: 'bg-orange-400/55 dark:bg-orange-400/45',
    border: 'border-orange-500/60 dark:border-orange-300/50',
    text: 'text-orange-950 dark:text-orange-50',
  },
  {
    bg: 'bg-indigo-400/55 dark:bg-indigo-400/45',
    border: 'border-indigo-500/60 dark:border-indigo-300/50',
    text: 'text-indigo-950 dark:text-indigo-50',
  },
  {
    bg: 'bg-teal-400/55 dark:bg-teal-400/45',
    border: 'border-teal-500/60 dark:border-teal-300/50',
    text: 'text-teal-950 dark:text-teal-50',
  },
  {
    bg: 'bg-pink-400/55 dark:bg-pink-400/45',
    border: 'border-pink-500/60 dark:border-pink-300/50',
    text: 'text-pink-950 dark:text-pink-50',
  },
] as const;

export function signalColor(index: number) {
  return SIGNAL_COLORS[Math.abs(index) % SIGNAL_COLORS.length]!;
}

export function buildFrameBitLayout(message: DbcMessageRow): FrameBitLayout {
  let maxBit = Math.max(0, message.dlc * 8 - 1);
  const owners = new Map<number, { name: string; index: number; signalBit: number }[]>();

  message.signals.forEach((sig, index) => {
    const absBits = signalAbsoluteBits(sig);
    absBits.forEach((abs, signalBit) => {
      maxBit = Math.max(maxBit, abs);
      const list = owners.get(abs) ?? [];
      list.push({ name: sig.name, index, signalBit });
      owners.set(abs, list);
    });
  });

  const byteCount = Math.max(message.dlc, Math.floor(maxBit / 8) + 1);
  const overlaps: FrameBitLayout['overlaps'] = [];
  const grid: FrameBitLayout['grid'] = [];

  for (let byteIndex = 0; byteIndex < byteCount; byteIndex += 1) {
    const row: FrameBitCell[] = [];
    // Columns: bit 7 → bit 0 (CANdb++ / Vector)
    for (let col = 0; col < 8; col += 1) {
      const bitInByte = 7 - col;
      const abs = byteIndex * 8 + bitInByte;
      const list = owners.get(abs) ?? [];
      if (list.length > 1) {
        overlaps.push({
          byteIndex,
          bitInByte,
          signals: list.map((item) => item.name),
        });
      }
      const top = list[list.length - 1] ?? null;
      row.push({
        byteIndex,
        bitInByte,
        signalName: top?.name ?? null,
        signalIndex: top?.index ?? -1,
        signalBit: top?.signalBit ?? -1,
      });
    }
    grid.push(row);
  }

  return { byteCount, grid, overlaps };
}

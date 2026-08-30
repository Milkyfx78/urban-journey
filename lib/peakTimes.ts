import { prisma } from './db';
import { Platform } from '@prisma/client';

/**
 * Published-average fallback peak windows (hour of day, local time, 24h) per platform.
 * Used only until an account has accumulated enough EngagementSample history to compute
 * its own real per-account peak times.
 */
export const DEFAULT_PEAK_HOURS: Record<Platform, number[]> = {
  INSTAGRAM: [11, 13, 19],
  TIKTOK: [7, 12, 20],
  YOUTUBE: [14, 17, 20],
  FACEBOOK: [9, 13, 15],
  TWITTER: [8, 12, 17],
  LINKEDIN: [8, 10, 12],
  PINTEREST: [20, 21, 22],
  THREADS: [9, 12, 19]
};

const MIN_SAMPLES_FOR_PERSONALIZATION = 20;

/**
 * Returns the best upcoming Date to post for a given social account, preferring the account's
 * own historical engagement-by-hour data once enough samples exist, and falling back to the
 * platform-wide published average otherwise.
 */
export async function computeNextPeakSlot(
  socialAccountId: string,
  platform: Platform,
  notBefore: Date = new Date()
): Promise<Date> {
  const samples = await prisma.engagementSample.findMany({ where: { socialAccountId } });

  let bestHours: number[];
  if (samples.length >= MIN_SAMPLES_FOR_PERSONALIZATION) {
    const byHour = new Map<number, { total: number; count: number }>();
    for (const s of samples) {
      const cur = byHour.get(s.hourOfDay) ?? { total: 0, count: 0 };
      cur.total += s.engagementScore;
      cur.count += 1;
      byHour.set(s.hourOfDay, cur);
    }
    bestHours = [...byHour.entries()]
      .map(([hour, agg]) => ({ hour, avg: agg.total / agg.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)
      .map((x) => x.hour);
  } else {
    bestHours = DEFAULT_PEAK_HOURS[platform];
  }

  return nextOccurrenceOfAnyHour(bestHours, notBefore);
}

function nextOccurrenceOfAnyHour(hours: number[], notBefore: Date): Date {
  const candidates = [0, 1].flatMap((dayOffset) =>
    hours.map((hour) => {
      const d = new Date(notBefore);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(hour, 0, 0, 0);
      return d;
    })
  );
  const future = candidates.filter((d) => d.getTime() > notBefore.getTime());
  future.sort((a, b) => a.getTime() - b.getTime());
  return future[0];
}

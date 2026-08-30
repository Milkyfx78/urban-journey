import { prisma } from './db';
import { Platform } from '@prisma/client';

/**
 * Minimum spacing enforced between two posts to the *same* connected account, so the
 * scheduler never bursts multiple posts close together and risks a platform flagging the
 * account for spam-like behavior. Conservative defaults; tune per platform's own guidance.
 */
const MIN_GAP_MINUTES: Record<Platform, number> = {
  INSTAGRAM: 90,
  TIKTOK: 60,
  YOUTUBE: 240,
  FACEBOOK: 60,
  TWITTER: 15,
  LINKEDIN: 120,
  PINTEREST: 30,
  THREADS: 30
};

/** Max posts allowed to a single account within a rolling 24h window. */
const MAX_POSTS_PER_DAY: Record<Platform, number> = {
  INSTAGRAM: 6,
  TIKTOK: 10,
  YOUTUBE: 4,
  FACEBOOK: 8,
  TWITTER: 20,
  LINKEDIN: 4,
  PINTEREST: 25,
  THREADS: 10
};

/**
 * Given a desired posting time for an account, pushes it forward if needed so it respects
 * the minimum gap from that account's nearest neighboring scheduled/published post, and the
 * daily cap. Throws if the account is already at its daily cap with no room in the next 48h.
 */
export async function enforceRateLimit(
  socialAccountId: string,
  platform: Platform,
  desiredTime: Date
): Promise<Date> {
  const gapMs = MIN_GAP_MINUTES[platform] * 60_000;
  let candidate = new Date(desiredTime);

  for (let attempt = 0; attempt < 50; attempt++) {
    const windowStart = new Date(candidate.getTime() - 24 * 60 * 60_000);
    const windowEnd = new Date(candidate.getTime() + 24 * 60 * 60_000);

    const neighbors = await prisma.scheduledPost.findMany({
      where: {
        socialAccountId,
        status: { in: ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'] },
        scheduledFor: { gte: windowStart, lte: windowEnd }
      },
      orderBy: { scheduledFor: 'asc' }
    });

    const dayCount = neighbors.filter(
      (p) => Math.abs(p.scheduledFor.getTime() - candidate.getTime()) < 24 * 60 * 60_000
    ).length;

    const tooClose = neighbors.find((p) => Math.abs(p.scheduledFor.getTime() - candidate.getTime()) < gapMs);

    if (!tooClose && dayCount < MAX_POSTS_PER_DAY[platform]) {
      return candidate;
    }

    if (tooClose) {
      candidate = new Date(tooClose.scheduledFor.getTime() + gapMs);
    } else {
      candidate = new Date(candidate.getTime() + gapMs);
    }
  }

  throw new Error(`Could not find a compliant posting slot for account ${socialAccountId} within the search window`);
}

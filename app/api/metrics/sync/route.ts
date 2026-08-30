import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptToken } from '@/lib/crypto';
import { getConnector } from '@/lib/platforms';

/**
 * Meant to be called on a schedule (e.g. an hourly QStash schedule or Vercel Cron) rather
 * than on-demand. For every recently-published post, pulls fresh engagement metrics and:
 *  1. Records a PostMetric snapshot.
 *  2. Feeds an EngagementSample so the peak-time engine learns this account's real
 *     best posting hours over time (see lib/peakTimes.ts).
 *  3. Once both sides of an A/B group have metrics, marks the stronger variant as the
 *     winner so future caption generation for that account can lean toward its style.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const posts = await prisma.scheduledPost.findMany({
    where: { status: 'PUBLISHED', publishedAt: { gte: since }, platformPostId: { not: null } },
    include: { socialAccount: true }
  });

  let synced = 0;
  for (const post of posts) {
    const connector = getConnector(post.platform);
    if (!connector.getMetrics) continue;

    try {
      const accessToken = decryptToken(post.socialAccount.accessTokenEnc);
      const metrics = await connector.getMetrics(accessToken, post.platformPostId!);
      const engagementRate =
        (metrics.likes + metrics.comments * 2 + metrics.shares * 3) / Math.max(metrics.views, 1);

      await prisma.postMetric.create({
        data: { scheduledPostId: post.id, ...metrics, engagementRate }
      });

      const publishedAt = post.publishedAt!;
      await prisma.engagementSample.create({
        data: {
          socialAccountId: post.socialAccountId,
          dayOfWeek: publishedAt.getDay(),
          hourOfDay: publishedAt.getHours(),
          engagementScore: engagementRate
        }
      });
      synced++;
    } catch {
      // Metrics endpoints can be flaky/rate-limited; skip and pick it up on the next sync.
      continue;
    }
  }

  // Resolve A/B winners for groups where every variant now has at least one metric snapshot.
  const groupIds = await prisma.scheduledPost.findMany({
    where: { abTestGroupId: { not: null }, isWinner: null },
    select: { abTestGroupId: true },
    distinct: ['abTestGroupId']
  });

  for (const { abTestGroupId } of groupIds) {
    const variants = await prisma.scheduledPost.findMany({
      where: { abTestGroupId },
      include: { metrics: true }
    });
    if (variants.some((v) => v.metrics.length === 0)) continue;

    const scored = variants.map((v) => ({
      id: v.id,
      avgRate: v.metrics.reduce((sum, m) => sum + m.engagementRate, 0) / v.metrics.length
    }));
    scored.sort((a, b) => b.avgRate - a.avgRate);

    await prisma.$transaction(
      scored.map((s, i) => prisma.scheduledPost.update({ where: { id: s.id }, data: { isWinner: i === 0 } }))
    );
  }

  return NextResponse.json({ synced, groupsResolved: groupIds.length });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeNextPeakSlot } from '@/lib/peakTimes';
import { enforceRateLimit } from '@/lib/rateLimitGuardrail';
import { scheduleQstashPublish } from '@/lib/qstash';
import { z } from 'zod';
import crypto from 'crypto';

const variantSchema = z.object({
  socialAccountId: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  hashtagPlacement: z.enum(['inline', 'first-comment']).default('inline'),
  label: z.string().default('A')
});

const bodySchema = z.object({
  contentItemId: z.string(),
  // Grouped by platform: each entry is either a single post, or 2 sibling variants forming an A/B test
  posts: z.array(
    z.object({
      platform: z.string(),
      variants: z.array(variantSchema).min(1).max(3)
    })
  )
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { contentItemId, posts } = parsed.data;

  const created: { id: string; platform: string; scheduledFor: Date }[] = [];

  for (const group of posts) {
    const abTestGroupId = group.variants.length > 1 ? crypto.randomUUID() : null;

    for (const variant of group.variants) {
      const account = await prisma.socialAccount.findUnique({ where: { id: variant.socialAccountId } });
      if (!account) continue;

      const peakSlot = await computeNextPeakSlot(account.id, account.platform);
      const safeSlot = await enforceRateLimit(account.id, account.platform, peakSlot);

      const post = await prisma.scheduledPost.create({
        data: {
          contentItemId,
          socialAccountId: account.id,
          platform: account.platform,
          caption: variant.caption,
          hashtags: variant.hashtags,
          hashtagPlacement: variant.hashtagPlacement,
          status: 'SCHEDULED',
          scheduledFor: safeSlot,
          abTestGroupId,
          variantLabel: abTestGroupId ? variant.label : null
        }
      });

      const messageId = await scheduleQstashPublish(post.id, safeSlot);
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { qstashMessageId: messageId } });

      created.push({ id: post.id, platform: account.platform, scheduledFor: safeSlot });
    }
  }

  return NextResponse.json({ scheduled: created });
}

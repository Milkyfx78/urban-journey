import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { prisma } from '@/lib/db';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { getConnector } from '@/lib/platforms';
import { getPublicUrl } from '@/lib/storage';

/**
 * QStash calls this at the scheduled time for a given post. Verified via QStash's
 * signature so only genuine scheduled fires can trigger a publish.
 */
async function handler(req: NextRequest, { params }: { params: { id: string } }) {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: params.id },
    include: { socialAccount: true, contentItem: true }
  });
  if (!post) return NextResponse.json({ error: 'Scheduled post not found' }, { status: 404 });

  // A/B variants are staggered by the rate-limit guardrail (never posted back-to-back) and
  // both genuinely go live — there's no real audience-split test available via these public
  // APIs, so the comparison happens after the fact in /api/metrics/sync, which feeds the
  // better-performing style back into future caption generation.
  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'PUBLISHING' } });

  try {
    const connector = getConnector(post.platform);
    const account = post.socialAccount;

    let accessToken = decryptToken(account.accessTokenEnc);
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date() && account.refreshTokenEnc && connector.refreshAccessToken) {
      const refreshed = await connector.refreshAccessToken(decryptToken(account.refreshTokenEnc));
      accessToken = refreshed.accessToken;
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryptToken(refreshed.accessToken),
          refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
          tokenExpiresAt: refreshed.expiresAt
        }
      });
    }

    const result = await connector.publish({
      accessToken,
      externalAccountId: account.externalAccountId,
      caption: post.caption,
      hashtags: post.hashtagPlacement === 'inline' ? post.hashtags : [],
      mediaUrl: getPublicUrl(post.contentItem.storagePath),
      mediaType: post.contentItem.mediaType as 'image' | 'video'
    });

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), platformPostId: result.platformPostId }
    });

    // TODO: if hashtagPlacement === 'first-comment', follow up with a platform-specific
    // "add comment" call here using post.hashtags once result.platformPostId is available.

    return NextResponse.json({ success: true, platformPostId: result.platformPostId });
  } catch (err: any) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'FAILED', failureReason: String(err?.message ?? err) }
    });
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY ? verifySignatureAppRouter(handler) : handler;

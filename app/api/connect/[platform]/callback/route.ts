import { NextRequest, NextResponse } from 'next/server';
import { getConnector } from '@/lib/platforms';
import { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptToken } from '@/lib/crypto';

export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    userId = decoded.userId;
  } catch {
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  const platform = params.platform.toUpperCase() as Platform;
  const connector = getConnector(platform);
  const redirectUri = `${process.env.APP_URL}/api/connect/${params.platform}/callback`;

  const tokens = await connector.exchangeCode(code, redirectUri);

  await prisma.socialAccount.upsert({
    where: {
      userId_platform_externalAccountId: {
        userId,
        platform,
        externalAccountId: tokens.externalAccountId
      }
    },
    create: {
      userId,
      platform,
      externalAccountId: tokens.externalAccountId,
      displayName: tokens.displayName,
      avatarUrl: tokens.avatarUrl,
      accessTokenEnc: encryptToken(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      scopes: connector.scopes
    },
    update: {
      displayName: tokens.displayName,
      avatarUrl: tokens.avatarUrl,
      accessTokenEnc: encryptToken(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
      tokenExpiresAt: tokens.expiresAt,
      isActive: true
    }
  });

  return NextResponse.redirect(new URL('/dashboard?connected=' + params.platform, req.url));
}

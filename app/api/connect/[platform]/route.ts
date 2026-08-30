import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getConnector } from '@/lib/platforms';
import { Platform } from '@prisma/client';
import crypto from 'crypto';

/** Kicks off the OAuth consent flow for a given platform. */
export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL('/login', req.url));

  const platform = params.platform.toUpperCase() as Platform;
  const connector = getConnector(platform);

  // state binds this OAuth attempt to the logged-in user and guards against CSRF
  const state = Buffer.from(JSON.stringify({ userId: (session.user as any).id, nonce: crypto.randomUUID() })).toString(
    'base64url'
  );
  const redirectUri = `${process.env.APP_URL}/api/connect/${params.platform}/callback`;

  return NextResponse.redirect(connector.getAuthUrl(state, redirectUri));
}

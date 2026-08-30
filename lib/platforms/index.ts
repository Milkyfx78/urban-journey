import { Platform } from '@prisma/client';
import { PlatformConnector } from './types';
import { instagramConnector } from './instagram';
import { tiktokConnector } from './tiktok';
import { youtubeConnector } from './youtube';
import { facebookConnector } from './facebook';
import { twitterConnector } from './twitter';
import { linkedinConnector } from './linkedin';
import { pinterestConnector } from './pinterest';
import { threadsConnector } from './threads';

export const connectors: Record<Platform, PlatformConnector> = {
  INSTAGRAM: instagramConnector,
  TIKTOK: tiktokConnector,
  YOUTUBE: youtubeConnector,
  FACEBOOK: facebookConnector,
  TWITTER: twitterConnector,
  LINKEDIN: linkedinConnector,
  PINTEREST: pinterestConnector,
  THREADS: threadsConnector
};

export function getConnector(platform: Platform): PlatformConnector {
  const connector = connectors[platform];
  if (!connector) throw new Error(`No connector registered for platform ${platform}`);
  return connector;
}

export * from './types';

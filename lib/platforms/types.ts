import { Platform } from '@prisma/client';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  externalAccountId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface PublishInput {
  accessToken: string;
  externalAccountId: string;
  caption: string;
  hashtags: string[];
  mediaUrl: string; // publicly accessible URL (Supabase Storage) the platform API can fetch from
  mediaType: 'image' | 'video';
}

export interface PublishResult {
  platformPostId: string;
}

export interface MetricsResult {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export interface PlatformConnector {
  platform: Platform;
  /** Scopes requested during OAuth consent. */
  scopes: string[];
  /** Builds the URL the user is redirected to in order to grant access. */
  getAuthUrl(state: string, redirectUri: string): string;
  /** Exchanges the OAuth callback code for tokens + basic profile info. */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  /** Refreshes an expired access token, when the platform supports it. */
  refreshAccessToken?(refreshToken: string): Promise<OAuthTokens>;
  /** Publishes a piece of content to the connected account. */
  publish(input: PublishInput): Promise<PublishResult>;
  /** Fetches current engagement metrics for a previously published post, when supported. */
  getMetrics?(accessToken: string, platformPostId: string): Promise<MetricsResult>;
}

export function fullCaption(caption: string, hashtags: string[], style: 'inline' | 'appended' | 'first-comment'): string {
  if (style === 'first-comment') return caption;
  const tagLine = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return `${caption}\n\n${tagLine}`;
}

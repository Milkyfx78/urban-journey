import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

// X API v2. Posting requires a paid API tier (Basic or above) as of the platform's current
// pricing; the free tier is read-only for most endpoints.
export const twitterConnector: PlatformConnector = {
  platform: Platform.TWITTER,
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.TWITTER_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      scope: twitterConnector.scopes.join(' '),
      state,
      code_challenge: 'challenge', // replace with a real PKCE S256 challenge in production
      code_challenge_method: 'plain'
    });
    return `https://twitter.com/i/oauth2/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const basicAuth = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID ?? '',
        redirect_uri: redirectUri,
        code_verifier: 'challenge'
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`X token exchange failed: ${JSON.stringify(json)}`);

    const meRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    const meJson = await meRes.json();

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: meJson.data.id,
      displayName: meJson.data.username,
      avatarUrl: meJson.data.profile_image_url
    };
  },

  async publish({ accessToken, caption, hashtags }) {
    const text = fullCaption(caption, hashtags, 'inline').slice(0, 280);
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`X publish failed: ${JSON.stringify(json)}`);
    return { platformPostId: json.data.id };
  }
};

import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

export const linkedinConnector: PlatformConnector = {
  platform: Platform.LINKEDIN,
  scopes: ['openid', 'profile', 'w_member_social'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      state,
      scope: linkedinConnector.scopes.join(' ')
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? ''
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${JSON.stringify(json)}`);

    const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    const meJson = await meRes.json();

    return {
      accessToken: json.access_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: meJson.sub,
      displayName: meJson.name,
      avatarUrl: meJson.picture
    };
  },

  async publish({ accessToken, externalAccountId, caption, hashtags, mediaUrl, mediaType }) {
    const text = fullCaption(caption, hashtags, 'inline');
    const author = `urn:li:person:${externalAccountId}`;

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: mediaType === 'video' ? 'VIDEO' : 'IMAGE',
            media: [{ status: 'READY', originalUrl: mediaUrl }]
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`LinkedIn publish failed: ${JSON.stringify(json)}`);
    return { platformPostId: json.id };
  }
};

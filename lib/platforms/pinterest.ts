import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

export const pinterestConnector: PlatformConnector = {
  platform: Platform.PINTEREST,
  scopes: ['boards:read', 'pins:read', 'pins:write'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.PINTEREST_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: pinterestConnector.scopes.join(','),
      state
    });
    return `https://www.pinterest.com/oauth/?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const basicAuth = Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Pinterest token exchange failed: ${JSON.stringify(json)}`);

    const meRes = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    const meJson = await meRes.json();

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: meJson.username,
      displayName: meJson.username,
      avatarUrl: meJson.profile_image
    };
  },

  async publish({ accessToken, caption, hashtags, mediaUrl }) {
    const boardsRes = await fetch('https://api.pinterest.com/v5/boards', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const boardsJson = await boardsRes.json();
    const boardId = boardsJson.items?.[0]?.id;
    if (!boardId) throw new Error('No Pinterest board found to pin to');

    const text = fullCaption(caption, hashtags, 'inline');
    const res = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        title: caption.split('\n')[0].slice(0, 100),
        description: text,
        media_source: { source_type: 'image_url', url: mediaUrl }
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Pinterest publish failed: ${JSON.stringify(json)}`);
    return { platformPostId: json.id };
  }
};

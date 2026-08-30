import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

// TikTok Content Posting API. Requires app approval and, for direct (non-draft) posting,
// the "content posting API" scope which is only granted after audit.
export const tiktokConnector: PlatformConnector = {
  platform: Platform.TIKTOK,
  scopes: ['user.info.basic', 'video.publish'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      redirect_uri: redirectUri,
      state,
      scope: tiktokConnector.scopes.join(','),
      response_type: 'code'
    });
    return `https://www.tiktok.com/v2/auth/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`TikTok token exchange failed: ${JSON.stringify(json)}`);

    const profileRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    const profileJson = await profileRes.json();
    const user = profileJson.data?.user ?? {};

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: user.open_id ?? json.open_id,
      displayName: user.display_name ?? 'TikTok user',
      avatarUrl: user.avatar_url
    };
  },

  async refreshAccessToken(refreshToken) {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`TikTok token refresh failed: ${JSON.stringify(json)}`);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: json.open_id,
      displayName: ''
    };
  },

  async publish({ accessToken, caption, hashtags, mediaUrl }) {
    const text = fullCaption(caption, hashtags, 'inline');
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: text, privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl }
      })
    });
    const json = await res.json();
    if (!res.ok || json.error?.code !== 'ok') throw new Error(`TikTok publish failed: ${JSON.stringify(json)}`);
    return { platformPostId: json.data.publish_id };
  }
};

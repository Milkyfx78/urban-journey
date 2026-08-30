import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

// YouTube Data API v3. Video upload uses resumable upload; Shorts are just videos <=60s
// with #Shorts in the title/description and vertical aspect ratio.
export const youtubeConnector: PlatformConnector = {
  platform: Platform.YOUTUBE,
  scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state,
      scope: youtubeConnector.scopes.join(' ')
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`YouTube token exchange failed: ${JSON.stringify(json)}`);

    const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    const channelJson = await channelRes.json();
    const channel = channelJson.items?.[0];

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: channel?.id ?? 'unknown',
      displayName: channel?.snippet?.title ?? 'YouTube channel',
      avatarUrl: channel?.snippet?.thumbnails?.default?.url
    };
  },

  async refreshAccessToken(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`YouTube token refresh failed: ${JSON.stringify(json)}`);
    return {
      accessToken: json.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      externalAccountId: '',
      displayName: ''
    };
  },

  async publish({ accessToken, caption, hashtags, mediaUrl }) {
    const title = caption.split('\n')[0].slice(0, 90) + ' #Shorts';
    const description = fullCaption(caption, hashtags, 'inline');

    const mediaRes = await fetch(mediaUrl);
    const videoBuffer = await mediaRes.arrayBuffer();

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*'
        },
        body: JSON.stringify({
          snippet: { title, description, categoryId: '22' },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
        })
      }
    );
    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube resumable upload session failed to initialize');

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/*' },
      body: Buffer.from(videoBuffer)
    });
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`YouTube upload failed: ${JSON.stringify(uploadJson)}`);

    return { platformPostId: uploadJson.id };
  }
};

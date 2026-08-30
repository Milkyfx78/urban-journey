import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

// Threads API (Meta), a two-step "create container, then publish" flow similar to Instagram's.
const GRAPH_VERSION = 'v1.0';

export const threadsConnector: PlatformConnector = {
  platform: Platform.THREADS,
  scopes: ['threads_basic', 'threads_content_publish'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.THREADS_APP_ID ?? '',
      redirect_uri: redirectUri,
      scope: threadsConnector.scopes.join(','),
      response_type: 'code',
      state
    });
    return `https://threads.net/oauth/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID ?? '',
        client_secret: process.env.THREADS_APP_SECRET ?? '',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Threads token exchange failed: ${JSON.stringify(json)}`);

    const meRes = await fetch(
      `https://graph.threads.net/${GRAPH_VERSION}/me?fields=id,username,threads_profile_picture_url&access_token=${json.access_token}`
    );
    const meJson = await meRes.json();

    return {
      accessToken: json.access_token,
      externalAccountId: meJson.id,
      displayName: meJson.username,
      avatarUrl: meJson.threads_profile_picture_url
    };
  },

  async publish({ accessToken, externalAccountId, caption, hashtags, mediaUrl, mediaType }) {
    const text = fullCaption(caption, hashtags, 'inline');
    const createParams: Record<string, string> = {
      text,
      media_type: mediaType === 'video' ? 'VIDEO' : 'IMAGE',
      access_token: accessToken
    };
    createParams[mediaType === 'video' ? 'video_url' : 'image_url'] = mediaUrl;

    const createRes = await fetch(
      `https://graph.threads.net/${GRAPH_VERSION}/${externalAccountId}/threads?` + new URLSearchParams(createParams),
      { method: 'POST' }
    );
    const createJson = await createRes.json();
    if (!createRes.ok) throw new Error(`Threads container failed: ${JSON.stringify(createJson)}`);

    const publishRes = await fetch(
      `https://graph.threads.net/${GRAPH_VERSION}/${externalAccountId}/threads_publish?` +
        new URLSearchParams({ creation_id: createJson.id, access_token: accessToken }),
      { method: 'POST' }
    );
    const publishJson = await publishRes.json();
    if (!publishRes.ok) throw new Error(`Threads publish failed: ${JSON.stringify(publishJson)}`);
    return { platformPostId: publishJson.id };
  }
};

import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

const GRAPH_VERSION = 'v20.0';

export const facebookConnector: PlatformConnector = {
  platform: Platform.FACEBOOK,
  scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      redirect_uri: redirectUri,
      state,
      scope: facebookConnector.scopes.join(','),
      response_type: 'code'
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const tokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?` +
        new URLSearchParams({
          client_id: process.env.META_APP_ID ?? '',
          client_secret: process.env.META_APP_SECRET ?? '',
          redirect_uri: redirectUri,
          code
        })
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`Facebook token exchange failed: ${JSON.stringify(tokenJson)}`);

    const pagesRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?access_token=${tokenJson.access_token}`
    );
    const pagesJson = await pagesRes.json();
    const page = pagesJson.data?.[0];
    if (!page) throw new Error('No Facebook Page found for this account');

    return {
      accessToken: page.access_token,
      externalAccountId: page.id,
      displayName: page.name
    };
  },

  async publish({ accessToken, externalAccountId, caption, hashtags, mediaUrl, mediaType }) {
    const text = fullCaption(caption, hashtags, 'inline');
    const endpoint =
      mediaType === 'video'
        ? `https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/videos`
        : `https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/photos`;

    const body = new URLSearchParams({
      access_token: accessToken,
      description: text,
      [mediaType === 'video' ? 'file_url' : 'url']: mediaUrl
    });

    const res = await fetch(endpoint, { method: 'POST', body });
    const json = await res.json();
    if (!res.ok) throw new Error(`Facebook publish failed: ${JSON.stringify(json)}`);
    return { platformPostId: json.id ?? json.post_id };
  }
};

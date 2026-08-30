import { Platform } from '@prisma/client';
import { PlatformConnector, fullCaption } from './types';

// Instagram publishing goes through the Facebook Graph API against a connected Instagram
// Business/Creator account. Requires the app to pass Meta's App Review for
// instagram_content_publish + pages_show_list + instagram_basic.
const GRAPH_VERSION = 'v20.0';

export const instagramConnector: PlatformConnector = {
  platform: Platform.INSTAGRAM,
  scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'business_management'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      redirect_uri: redirectUri,
      state,
      scope: instagramConnector.scopes.join(','),
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
    if (!tokenRes.ok) throw new Error(`Instagram token exchange failed: ${JSON.stringify(tokenJson)}`);

    // Resolve the Page -> connected Instagram Business Account
    const pagesRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?access_token=${tokenJson.access_token}`
    );
    const pagesJson = await pagesRes.json();
    const page = pagesJson.data?.[0];
    if (!page) throw new Error('No Facebook Page found for this account (required to publish to Instagram)');

    const igRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${page.id}?fields=instagram_business_account,name,picture&access_token=${tokenJson.access_token}`
    );
    const igJson = await igRes.json();
    const igAccount = igJson.instagram_business_account;
    if (!igAccount) throw new Error('This Page has no connected Instagram Business account');

    return {
      accessToken: page.access_token,
      externalAccountId: igAccount.id,
      displayName: igJson.name,
      avatarUrl: igJson.picture?.data?.url
    };
  },

  async publish({ accessToken, externalAccountId, caption, hashtags, mediaUrl, mediaType }) {
    const text = fullCaption(caption, hashtags, 'inline');
    const createParams: Record<string, string> = {
      caption: text,
      access_token: accessToken
    };
    createParams[mediaType === 'video' ? 'video_url' : 'image_url'] = mediaUrl;
    if (mediaType === 'video') createParams.media_type = 'REELS';

    const createRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/media?` + new URLSearchParams(createParams),
      { method: 'POST' }
    );
    const createJson = await createRes.json();
    if (!createRes.ok) throw new Error(`Instagram media container failed: ${JSON.stringify(createJson)}`);

    const publishRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/media_publish?` +
        new URLSearchParams({ creation_id: createJson.id, access_token: accessToken }),
      { method: 'POST' }
    );
    const publishJson = await publishRes.json();
    if (!publishRes.ok) throw new Error(`Instagram publish failed: ${JSON.stringify(publishJson)}`);

    return { platformPostId: publishJson.id };
  },

  async getMetrics(accessToken, platformPostId) {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${platformPostId}/insights?metric=likes,comments,shares,plays&access_token=${accessToken}`
    );
    const json = await res.json();
    if (!res.ok) throw new Error(`Instagram metrics fetch failed: ${JSON.stringify(json)}`);
    const byName = (name: string) => json.data?.find((d: any) => d.name === name)?.values?.[0]?.value ?? 0;
    return { likes: byName('likes'), comments: byName('comments'), shares: byName('shares'), views: byName('plays') };
  }
};

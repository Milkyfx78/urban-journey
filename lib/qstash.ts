import { Client } from '@upstash/qstash';

// Created lazily so a missing QSTASH_TOKEN only breaks the request that needs it, not the
// whole `next build` (which imports every route module to collect page data).
let cachedClient: Client | null = null;

function getQstashClient(): Client {
  if (cachedClient) return cachedClient;
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN must be set to schedule publishing');
  cachedClient = new Client({ token });
  return cachedClient;
}

/** Schedules a one-time call to our publish webhook at the given time for a specific ScheduledPost. */
export async function scheduleQstashPublish(scheduledPostId: string, when: Date): Promise<string> {
  const notBefore = Math.floor(when.getTime() / 1000);
  const res = await getQstashClient().publishJSON({
    url: `${process.env.APP_URL}/api/publish/${scheduledPostId}`,
    notBefore,
    body: { scheduledPostId }
  });
  return res.messageId;
}

export async function cancelQstashMessage(messageId: string): Promise<void> {
  await getQstashClient().messages.delete(messageId);
}

import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN ?? '' });

/** Schedules a one-time call to our publish webhook at the given time for a specific ScheduledPost. */
export async function scheduleQstashPublish(scheduledPostId: string, when: Date): Promise<string> {
  const notBefore = Math.floor(when.getTime() / 1000);
  const res = await qstash.publishJSON({
    url: `${process.env.APP_URL}/api/publish/${scheduledPostId}`,
    notBefore,
    body: { scheduledPostId }
  });
  return res.messageId;
}

export async function cancelQstashMessage(messageId: string): Promise<void> {
  await qstash.messages.delete(messageId);
}

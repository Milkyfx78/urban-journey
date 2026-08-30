import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ConnectAccounts } from './ConnectAccounts';
import { UploadFlow } from './UploadFlow';

const ALL_PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN', 'PINTEREST', 'THREADS'] as const;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: (session.user as any).id, isActive: true },
    orderBy: { platform: 'asc' }
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-sm text-neutral-400">{session.user.email}</span>
      </header>

      <ConnectAccounts allPlatforms={ALL_PLATFORMS as unknown as string[]} connected={accounts} />

      <UploadFlow
        accounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          displayName: a.displayName
        }))}
      />
    </div>
  );
}

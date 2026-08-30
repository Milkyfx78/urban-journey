'use client';

interface Props {
  allPlatforms: string[];
  connected: { platform: string; displayName: string; avatarUrl?: string | null }[];
}

export function ConnectAccounts({ allPlatforms, connected }: Props) {
  const connectedPlatforms = new Set(connected.map((c) => c.platform));

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Connected accounts</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {allPlatforms.map((platform) => {
          const isConnected = connectedPlatforms.has(platform);
          const account = connected.find((c) => c.platform === platform);
          return (
            <div key={platform} className="flex flex-col items-center gap-2 rounded border border-neutral-800 p-4">
              <span className="text-sm font-medium">{platform}</span>
              {isConnected ? (
                <span className="text-xs text-emerald-400">Connected — {account?.displayName}</span>
              ) : (
                <a
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500"
                  href={`/api/connect/${platform.toLowerCase()}`}
                >
                  Connect
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

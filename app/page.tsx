import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold">Upload once. Post everywhere. At the perfect time.</h1>
      <p className="text-neutral-400">
        Connect your social accounts, upload your content, and let AI read it, write
        platform-native captions and hashtags, and publish at each platform&apos;s real peak
        engagement hours for your audience.
      </p>
      <div className="flex gap-3">
        <Link className="rounded bg-indigo-600 px-5 py-2 font-medium hover:bg-indigo-500" href="/signup">
          Get started
        </Link>
        <Link className="rounded border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900" href="/login">
          Log in
        </Link>
      </div>
    </div>
  );
}

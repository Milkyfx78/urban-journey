'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error?.formErrors?.[0] ?? json.error ?? 'Sign up failed');
      return;
    }
    await signIn('credentials', { email, password, redirect: false });
    router.push('/dashboard');
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input className="rounded bg-neutral-900 px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="rounded bg-neutral-900 px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="rounded bg-neutral-900 px-3 py-2"
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="rounded bg-indigo-600 py-2 font-medium hover:bg-indigo-500" type="submit">
          Sign up
        </button>
      </form>
      <p className="text-sm text-neutral-400">
        Already have an account? <Link className="text-indigo-400" href="/login">Log in</Link>
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';

interface Account {
  id: string;
  platform: string;
  displayName: string;
}

interface CaptionVariant {
  caption: string;
  hashtags: string[];
  label: string;
}

interface PlatformResult {
  platform: string;
  variants: CaptionVariant[];
}

export function UploadFlow({ accounts }: { accounts: Account[] }) {
  const [step, setStep] = useState<'upload' | 'review' | 'scheduled'>('upload');
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [viralityScore, setViralityScore] = useState<number | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [abTest, setAbTest] = useState(false);
  const [results, setResults] = useState<PlatformResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [scheduledSummary, setScheduledSummary] = useState<{ platform: string; scheduledFor: string }[]>([]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return alert(json.error ?? 'Upload failed');
    setContentItemId(json.contentItemId);
    setViralityScore(Math.round(json.analysis.viralityScore));
  }

  async function handleGenerate() {
    if (!contentItemId || selectedAccountIds.size === 0) return;
    setBusy(true);
    const platforms = [...new Set(accounts.filter((a) => selectedAccountIds.has(a.id)).map((a) => a.platform))];
    const res = await fetch('/api/generate-captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentItemId, platforms, abTest })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return alert(JSON.stringify(json.error));
    setResults(json.results);
    setStep('review');
  }

  function updateVariant(platform: string, index: number, patch: Partial<CaptionVariant>) {
    setResults((prev) =>
      prev.map((r) => (r.platform !== platform ? r : { ...r, variants: r.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) }))
    );
  }

  async function handleSchedule() {
    if (!contentItemId) return;
    setBusy(true);
    const posts = results.map((r) => ({
      platform: r.platform,
      variants: r.variants.map((v) => ({
        socialAccountId: accounts.find((a) => a.platform === r.platform)!.id,
        caption: v.caption,
        hashtags: v.hashtags,
        hashtagPlacement: 'inline' as const,
        label: v.label
      }))
    }));
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentItemId, posts })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return alert(JSON.stringify(json.error));
    setScheduledSummary(json.scheduled.map((s: any) => ({ platform: s.platform, scheduledFor: s.scheduledFor })));
    setStep('scheduled');
  }

  if (step === 'scheduled') {
    return (
      <section className="rounded border border-emerald-800 bg-emerald-950/30 p-6">
        <h2 className="mb-3 text-lg font-medium">Scheduled</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {scheduledSummary.map((s, i) => (
            <li key={i}>
              {s.platform} → {new Date(s.scheduledFor).toLocaleString()}
            </li>
          ))}
        </ul>
        <button className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm" onClick={() => window.location.reload()}>
          Upload another
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-lg font-medium">Upload content</h2>
        <input type="file" accept="image/*,video/*" onChange={handleUpload} disabled={busy} />
        {viralityScore !== null && (
          <p className="mt-2 text-sm text-neutral-400">
            AI virality estimate: <span className="font-semibold text-indigo-400">{viralityScore}/100</span>
          </p>
        )}
      </div>

      {contentItemId && (
        <div>
          <h2 className="mb-3 text-lg font-medium">Post to</h2>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 rounded border border-neutral-800 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedAccountIds.has(a.id)}
                  onChange={(e) => {
                    const next = new Set(selectedAccountIds);
                    e.target.checked ? next.add(a.id) : next.delete(a.id);
                    setSelectedAccountIds(next);
                  }}
                />
                {a.platform} — {a.displayName}
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-400">
            <input type="checkbox" checked={abTest} onChange={(e) => setAbTest(e.target.checked)} />
            Generate 2 caption variants per platform for A/B testing
          </label>
          <button
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm disabled:opacity-50"
            onClick={handleGenerate}
            disabled={busy || selectedAccountIds.size === 0}
          >
            {busy ? 'Thinking…' : 'Generate captions'}
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-medium">Review & edit</h2>
          {results.map((r) => (
            <div key={r.platform} className="rounded border border-neutral-800 p-4">
              <h3 className="mb-2 font-medium">{r.platform}</h3>
              {r.variants.map((v, i) => (
                <div key={i} className="mb-3 flex flex-col gap-2">
                  {r.variants.length > 1 && <span className="text-xs text-neutral-500">Variant {v.label}</span>}
                  <textarea
                    className="rounded bg-neutral-900 p-2 text-sm"
                    rows={3}
                    value={v.caption}
                    onChange={(e) => updateVariant(r.platform, i, { caption: e.target.value })}
                  />
                  <input
                    className="rounded bg-neutral-900 p-2 text-sm"
                    value={v.hashtags.join(' ')}
                    onChange={(e) => updateVariant(r.platform, i, { hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
                  />
                </div>
              ))}
            </div>
          ))}
          <button className="rounded bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50" onClick={handleSchedule} disabled={busy}>
            {busy ? 'Scheduling…' : 'Schedule at peak times'}
          </button>
        </div>
      )}
    </section>
  );
}

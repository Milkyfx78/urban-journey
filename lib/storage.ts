import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'content-uploads';

// Created lazily, on first real use, rather than at module load — so a missing env var only
// breaks the request that needed it, not the entire build (Next.js imports every route module
// during `next build` to collect page data, which would otherwise crash the build outright).
let cachedClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use content storage');
  }

  cachedClient = createClient(url, key);
  return cachedClient;
}

export async function uploadContentFile(
  path: string,
  file: Buffer,
  contentType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { storagePath: path, publicUrl: data.publicUrl };
}

export function getPublicUrl(storagePath: string): string {
  const { data } = getSupabaseClient().storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

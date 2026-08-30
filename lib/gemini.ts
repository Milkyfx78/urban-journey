import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { Platform } from '@prisma/client';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

export interface ContentAnalysisResult {
  summary: string;
  detectedThemes: string[];
  suggestedTone: string;
  viralityScore: number;
}

const analysisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING, description: 'One or two sentence description of what is actually in the media' },
    detectedThemes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    suggestedTone: { type: SchemaType.STRING, description: 'e.g. playful, aspirational, educational, dramatic' },
    viralityScore: { type: SchemaType.NUMBER, description: '0-100 estimate of viral potential based on hook strength, novelty, emotional pull, and shareability' }
  },
  required: ['summary', 'detectedThemes', 'suggestedTone', 'viralityScore']
};

/**
 * "Reads" an uploaded image or video: what's actually in it, its tone, and a rough
 * virality estimate, before any caption is written.
 */
export async function analyzeContent(params: {
  mediaBase64: string;
  mimeType: string;
}): Promise<ContentAnalysisResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema: analysisSchema as any }
  });

  const result = await model.generateContent([
    {
      text: `You are a social media strategist. Analyze this media and describe what's actually
happening in it, the themes present, the tone that best fits it, and a 0-100 estimate of its
viral potential (consider: strong opening hook, novelty, emotional resonance, relatability,
shareability, trend-alignment). Be honest and specific, not generic.`
    },
    { inlineData: { data: params.mediaBase64, mimeType: params.mimeType } }
  ]);

  return JSON.parse(result.response.text());
}

export interface CaptionVariant {
  caption: string;
  hashtags: string[];
}

const captionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    caption: { type: SchemaType.STRING },
    hashtags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
  },
  required: ['caption', 'hashtags']
};

const PLATFORM_STYLE_GUIDE: Record<Platform, string> = {
  INSTAGRAM: 'Conversational, 1-3 short paragraphs max, strong hook as the first line, emoji used sparingly, 5-10 highly relevant hashtags (mix of broad + niche), no hashtags crammed at the end of the caption itself.',
  TIKTOK: 'Very short, punchy, casual, trend-aware language, 3-5 hashtags including at least one broad discovery tag.',
  YOUTUBE: 'Title-style hook first line, then 2-3 sentences of context and a call to action to watch/subscribe, 3-5 hashtags.',
  FACEBOOK: 'Slightly longer, storytelling tone, ask a question to invite comments, 2-5 hashtags at most.',
  TWITTER: 'Under 280 characters, punchy, witty or provocative hook, at most 2 hashtags.',
  LINKEDIN: 'Professional but human tone, lead with an insight or lesson, short paragraphs, 3-5 industry hashtags, no emoji overload.',
  PINTEREST: 'Descriptive and keyword-rich (Pinterest is a search engine), include a clear benefit or idea, 2-4 hashtags.',
  THREADS: 'Casual, conversational, similar to a tweet but slightly warmer in tone, 2-4 hashtags.'
};

/**
 * Generates a platform-native caption + hashtag set for a piece of content, informed by
 * the prior content analysis. Each platform gets its own distinct variant, not a copy-paste.
 */
export async function generateCaption(params: {
  analysis: ContentAnalysisResult;
  platform: Platform;
}): Promise<CaptionVariant> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema: captionSchema as any }
  });

  const result = await model.generateContent(`You are writing a social media caption for ${params.platform}.

Style guide for this platform: ${PLATFORM_STYLE_GUIDE[params.platform]}

Content summary: ${params.analysis.summary}
Detected themes: ${params.analysis.detectedThemes.join(', ')}
Tone to use: ${params.analysis.suggestedTone}

Write a caption optimized to maximize engagement and shares on this specific platform, and
propose hashtags that mix broad-reach and niche/specific tags appropriate to this platform's
norms. Do not just repeat the content summary verbatim — write copy a real creator would post.`);

  return JSON.parse(result.response.text());
}

/** Generates caption variants for every connected platform in parallel. */
export async function generateAllVariants(
  analysis: ContentAnalysisResult,
  platforms: Platform[]
): Promise<Record<string, CaptionVariant>> {
  const entries = await Promise.all(
    platforms.map(async (platform) => [platform, await generateCaption({ analysis, platform })] as const)
  );
  return Object.fromEntries(entries);
}

const VARIANT_ANGLES = [
  'a bold, curiosity-driven hook as the opening line',
  'a relatable, conversational, slightly humorous angle',
  'a direct, benefit/value-led angle stated plainly'
];

/**
 * Generates `count` distinctly-angled caption variants for one platform, for A/B testing.
 * Each variant is deliberately written from a different hook style so the test is meaningful
 * rather than three near-identical rewrites.
 */
export async function generateCaptionVariants(params: {
  analysis: ContentAnalysisResult;
  platform: Platform;
  count: 2 | 3;
}): Promise<CaptionVariant[]> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema: captionSchema as any }
  });

  const angles = VARIANT_ANGLES.slice(0, params.count);
  return Promise.all(
    angles.map(async (angle) => {
      const result = await model.generateContent(`You are writing a social media caption for ${params.platform}.

Style guide for this platform: ${PLATFORM_STYLE_GUIDE[params.platform]}
Write this specific variant using: ${angle}

Content summary: ${params.analysis.summary}
Detected themes: ${params.analysis.detectedThemes.join(', ')}
Tone to use: ${params.analysis.suggestedTone}

Write a caption optimized to maximize engagement and shares, using the angle specified above.
Propose hashtags mixing broad-reach and niche/specific tags appropriate to this platform.`);
      return JSON.parse(result.response.text()) as CaptionVariant;
    })
  );
}

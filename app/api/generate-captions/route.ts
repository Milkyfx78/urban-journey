import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateCaption, generateCaptionVariants, ContentAnalysisResult } from '@/lib/gemini';
import { Platform } from '@prisma/client';
import { z } from 'zod';

const bodySchema = z.object({
  contentItemId: z.string(),
  platforms: z.array(z.nativeEnum(Platform)),
  abTest: z.boolean().optional() // when true, generates 2 variants per platform for A/B testing
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { contentItemId, platforms, abTest } = parsed.data;

  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: { analysis: true }
  });
  if (!contentItem?.analysis) return NextResponse.json({ error: 'Content not analyzed yet' }, { status: 404 });

  const analysis: ContentAnalysisResult = {
    summary: contentItem.analysis.summary,
    detectedThemes: contentItem.analysis.detectedThemes,
    suggestedTone: contentItem.analysis.suggestedTone,
    viralityScore: contentItem.analysis.viralityScore
  };

  const results = await Promise.all(
    platforms.map(async (platform) => {
      if (abTest) {
        const variants = await generateCaptionVariants({ analysis, platform, count: 2 });
        return { platform, variants: variants.map((v, i) => ({ ...v, label: i === 0 ? 'A' : 'B' })) };
      }
      const variant = await generateCaption({ analysis, platform });
      return { platform, variants: [{ ...variant, label: 'A' }] };
    })
  );

  return NextResponse.json({ viralityScore: analysis.viralityScore, results });
}

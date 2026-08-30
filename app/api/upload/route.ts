import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadContentFile } from '@/lib/storage';
import { analyzeContent } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const mediaType = file.type.startsWith('video') ? 'video' : 'image';
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${userId}/${Date.now()}-${file.name}`;

  const { publicUrl } = await uploadContentFile(storagePath, buffer, file.type);

  const contentItem = await prisma.contentItem.create({
    data: { userId, storagePath, mediaType, originalName: file.name }
  });

  // "Reads" the content before anything else happens — this is the analysis step the
  // caption generator and virality score both depend on.
  const analysisResult = await analyzeContent({
    mediaBase64: buffer.toString('base64'),
    mimeType: file.type
  });

  await prisma.contentAnalysis.create({
    data: {
      contentItemId: contentItem.id,
      summary: analysisResult.summary,
      detectedThemes: analysisResult.detectedThemes,
      suggestedTone: analysisResult.suggestedTone,
      viralityScore: Math.round(analysisResult.viralityScore),
      rawModelOutput: analysisResult as any
    }
  });

  return NextResponse.json({
    contentItemId: contentItem.id,
    mediaUrl: publicUrl,
    analysis: analysisResult
  });
}

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { NextRequest, NextResponse } from "next/server";

const pollyClient = new PollyClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
});

export async function POST(req: NextRequest) {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 });

    const command = new SynthesizeSpeechCommand({
        Engine: 'neural',
        LanguageCode: 'fr-FR',
        Text: text,
        OutputFormat: 'mp3',
        VoiceId: 'Lea'
    });

    const response = await pollyClient.send(command);
    const audioData = await response.AudioStream?.transformToByteArray();
    if (!audioData) return NextResponse.json({ error: 'No audio' }, { status: 500 });

    return new NextResponse(Buffer.from(audioData), {
        headers: { 'Content-Type': 'audio/mpeg' }
    });
}
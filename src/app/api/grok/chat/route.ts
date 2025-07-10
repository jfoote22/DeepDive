import { createOpenAI } from "@ai-sdk/openai";
import { convertToCoreMessages, streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Create a custom OpenAI-compatible client for X.AI's API
    const grok = createOpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY || "", // Make sure to add this to your .env.local
    });
    
    const result = await streamText({
      model: grok("grok-4"),
      messages: convertToCoreMessages(messages),
      system: "You are Grok4, a witty and helpful AI assistant created by X.AI. You provide thoughtful, accurate, and engaging responses with a touch of humor when appropriate.",
      maxTokens: 4000,
      temperature: 0.7,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Grok API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request with Grok4' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 
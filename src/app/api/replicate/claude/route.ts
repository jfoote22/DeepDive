import Replicate from "replicate";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    
    if (!process.env.REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Replicate API token is missing" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Format messages for Claude
    const lastMessage = messages[messages.length - 1];
    const conversationHistory = messages
      .slice(0, -1)
      .map((msg: any) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const prompt = conversationHistory ? 
      `${conversationHistory}\nhuman: ${lastMessage.content}\nassistant:` : 
      lastMessage.content;

    const input = {
      prompt: prompt,
      max_tokens: 8192,
      system_prompt: "You are a helpful AI assistant. Respond naturally and conversationally.",
      max_image_resolution: 0.5
    };

    console.log("Calling Replicate with input:", { prompt: prompt.slice(0, 100) + "..." });

    // Create a ReadableStream for streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();
          
          // Start the Replicate stream
          const replicateStream = await replicate.stream("anthropic/claude-4-sonnet", { input });
          
          for await (const event of replicateStream) {
            const content = event.toString();
            if (content) {
              const chunk = {
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "claude-4-sonnet",
                choices: [{
                  index: 0,
                  delta: {
                    content: content
                  },
                  finish_reason: null
                }]
              };
              
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          }
          
          // Send completion signal
          const completionChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "claude-4-sonnet",
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionChunk)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          const errorData = `data: ${JSON.stringify({ error: errorMessage })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorData));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
} 
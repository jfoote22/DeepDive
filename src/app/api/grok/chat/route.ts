import { createOpenAI } from "@ai-sdk/openai";
import { convertToCoreMessages, streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { messages, showReasoning = false } = await req.json();
    
    // Create a custom OpenAI-compatible client for X.AI's API
    const grok = createOpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY || "", // Make sure to add this to your .env.local
    });
    
    // Enhanced system prompt for reasoning mode
    const systemPrompt = showReasoning 
      ? `You are Grok3, a witty and helpful AI assistant created by X.AI. When responding, you MUST show your complete thinking process using this exact format:

🤔 **THINKING:**
[Break down the problem step by step]
- First, I need to understand: [what you're analyzing]
- Let me consider: [key factors/information]
- I should think about: [relevant context or constraints]
- Alternative approaches: [other ways to think about this]
- My reasoning: [logical flow of your thinking]

💡 **ANSWER:**
[Your complete response based on the thinking above]

Always show your work like on grok.com's Think Mode. Be thorough in your reasoning process, even for simple questions.`
      : "You are Grok3, a witty and helpful AI assistant created by X.AI. You provide thoughtful, accurate, and engaging responses with a touch of humor when appropriate.";
    
    const result = await streamText({
      model: grok("grok-3-beta"), // Using correct model name
      messages: convertToCoreMessages(messages),
      system: systemPrompt,
      maxTokens: 4000,
      temperature: 0.7,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Grok API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request with Grok3' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 
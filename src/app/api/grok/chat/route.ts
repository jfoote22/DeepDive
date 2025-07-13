import { createOpenAI } from "@ai-sdk/openai";
import { convertToCoreMessages, streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { messages, showReasoning = false, mode = 'normal' } = await req.json();
    
    // Create a custom OpenAI-compatible client for X.AI's API
    const grok = createOpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY || "", // Make sure to add this to your .env.local
    });
    
    // Enhanced system prompt for reasoning mode and custom modes
    let systemPrompt = '';
    
    if (showReasoning) {
      systemPrompt = `You are Grok4, a witty and helpful AI assistant created by X.AI. When responding, you MUST show your complete thinking process using this exact format:

🤔 **THINKING:**
[Break down the problem step by step]
- First, I need to understand: [what you're analyzing]
- Let me consider: [key factors/information]
- I should think about: [relevant context or constraints]
- Alternative approaches: [other ways to think about this]
- My reasoning: [logical flow of your thinking]

💡 **ANSWER:**
[Your complete response based on the thinking above]

Always show your work like on grok.com's Think Mode. Be thorough in your reasoning process, even for simple questions.`;
    } else {
      switch (mode) {
        case 'fun':
          systemPrompt = 'You are Grok4, a maximally truth-seeking AI with a witty, humorous personality inspired by the Hitchhiker\'s Guide to the Galaxy. Respond with clever jokes, sarcasm, and fun insights while being helpful.';
          break;
        case 'creative':
          systemPrompt = 'You are Grok4, a creative and imaginative AI. Provide innovative, out-of-the-box ideas and responses while maintaining accuracy and helpfulness.';
          break;
        case 'precise':
          systemPrompt = 'You are Grok4, a precise and factual AI. Provide concise, accurate information without unnecessary elaboration or humor.';
          break;
        case 'normal':
        default:
          systemPrompt = 'You are Grok4, a witty and helpful AI assistant created by X.AI. You provide thoughtful, accurate, and engaging responses with a touch of humor when appropriate.';
          break;
      }
    }
    
    const result = await streamText({
      model: grok('grok-4'),
      messages: convertToCoreMessages(messages),
      system: systemPrompt,
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
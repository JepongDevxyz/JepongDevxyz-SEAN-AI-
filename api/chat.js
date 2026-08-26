import OpenAI from 'openai';
import { CohereClientV2 } from 'cohere-ai';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { messages, provider } = await req.json();

  try {
    // 1. OPENAI (ChatGPT)
    if (provider === 'openai') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });
      return buildOpenAISucceededStream(stream);
    }

    // 2. LLAMA (via Groq API)
    if (provider === 'llama') {
      const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      const stream = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });
      return buildOpenAISucceededStream(stream);
    }

    // 3. DEEPSEEK
    if (provider === 'deepseek') {
      const deepseek = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com',
      });
      const stream = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });
      return buildOpenAISucceededStream(stream);
    }

    // 4. MISTRAL AI
    if (provider === 'mistral') {
      const mistral = new OpenAI({
        apiKey: process.env.MISTRAL_API_KEY,
        baseURL: 'https://api.mistral.ai/v1',
      });
      const stream = await mistral.chat.completions.create({
        model: 'mistral-small-latest',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });
      return buildOpenAISucceededStream(stream);
    }

    // 5. COHERE
    if (provider === 'cohere') {
      const cohere = new CohereClientV2({
        token: process.env.COHERE_API_KEY,
      });

      const stream = await cohere.chatStream({
        model: 'command-r-plus',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            if (chunk.type === 'content-delta') {
              controller.enqueue(encoder.encode(chunk.delta?.message?.content?.text || ''));
            }
          }
          controller.close();
        },
      });

      return new Response(readableStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // 6. HUGGING FACE
    if (provider === 'huggingface') {
      const hf = new OpenAI({
        apiKey: process.env.HUGGINGFACE_API_KEY,
        baseURL: 'https://api-inference.huggingface.co/v1/',
      });
      const stream = await hf.chat.completions.create({
        model: 'Qwen/Qwen2.5-72B-Instruct',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });
      return buildOpenAISucceededStream(stream);
    }

    return new Response('Invalid Provider Selected', { status: 400 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

function buildOpenAISucceededStream(stream) {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readableStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

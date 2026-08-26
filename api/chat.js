import OpenAI from 'openai';
import { CohereClientV2 } from 'cohere-ai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages, provider } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages array' });
  }

  // Streaming headers setup
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 1. GEMINI (Google AI)
    if (provider === 'gemini') {
      const keys = getApiKeys('GEMINI');
      if (keys.length === 0) throw new Error('Walang nakaset na GEMINI_API_KEYS');

      let lastErr = null;
      for (const key of keys) {
        try {
          const genAI = new GoogleGenerativeAI(key);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const prompt = messages[messages.length - 1]?.content || '';
          const result = await model.generateContentStream(prompt);

          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) res.write(chunkText);
          }
          return res.end();
        } catch (err) {
          console.warn('[Gemini Error]:', err.message);
          lastErr = err;
        }
      }
      throw lastErr || new Error('All Gemini keys failed.');
    }

    // 2. OPENAI
    if (provider === 'openai') {
      return await handleOpenAIStyle(res, getApiKeys('OPENAI'), null, 'gpt-4o-mini', messages);
    }

    // 3. LLAMA (Groq)
    if (provider === 'llama') {
      return await handleOpenAIStyle(res, getApiKeys('GROQ'), 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', messages);
    }

    // 4. DEEPSEEK
    if (provider === 'deepseek') {
      return await handleOpenAIStyle(res, getApiKeys('DEEPSEEK'), 'https://api.deepseek.com', 'deepseek-chat', messages);
    }

    // 5. MISTRAL
    if (provider === 'mistral') {
      return await handleOpenAIStyle(res, getApiKeys('MISTRAL'), 'https://api.mistral.ai/v1', 'mistral-small-latest', messages);
    }

    // 6. HUGGINGFACE
    if (provider === 'huggingface') {
      return await handleOpenAIStyle(res, getApiKeys('HUGGINGFACE'), 'https://api-inference.huggingface.co/v1/', 'Qwen/Qwen2.5-72B-Instruct', messages);
    }

    // 7. COHERE
    if (provider === 'cohere') {
      const keys = getApiKeys('COHERE');
      if (keys.length === 0) throw new Error('Walang nakaset na COHERE_API_KEYS');

      let lastErr = null;
      for (const key of keys) {
        try {
          const cohere = new CohereClientV2({ token: key });
          const stream = await cohere.chatStream({
            model: 'command-r-plus',
            messages: messages.map(m => ({ role: m.role, content: m.content })),
          });

          for await (const chunk of stream) {
            if (chunk.type === 'content-delta') {
              const text = chunk.delta?.message?.content?.text || '';
              if (text) res.write(text);
            }
          }
          return res.end();
        } catch (err) {
          console.warn('[Cohere Error]:', err.message);
          lastErr = err;
        }
      }
      throw lastErr || new Error('All Cohere keys failed.');
    }

    return res.status(400).write('Invalid provider selection');
  } catch (error) {
    console.error('API Handler Error:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    } else {
      res.write(`\n[Error: ${error.message}]`);
      return res.end();
    }
  }
}

function getApiKeys(prefix) {
  const rawKeys = process.env[`${prefix}_API_KEYS`] || process.env[`${prefix}_API_KEY`] || '';
  return rawKeys.split(',').map(k => k.trim()).filter(Boolean);
}

async function handleOpenAIStyle(res, keys, baseURL, model, messages) {
  if (keys.length === 0) throw new Error(`Walang API Key na mahanap para sa ${model}`);

  let lastErr = null;
  for (const apiKey of keys) {
    try {
      const client = new OpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {})
      });

      const stream = await client.chat.completions.create({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) res.write(text);
      }
      return res.end();
    } catch (err) {
      console.warn(`[Key Failed for ${model}]:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error(`All keys failed for ${model}`);
}

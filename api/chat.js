import OpenAI from 'openai';
import { CohereClientV2 } from 'cohere-ai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { messages, provider } = req.body;

  try {
    // Set streaming headers for Serverless Node.js
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // 1. GEMINI (Google AI)
    if (provider === 'gemini') {
      const keys = getApiKeys('GEMINI');
      if (keys.length === 0) throw new Error('Walang nakaset na Gemini API Key.');

      let lastError = null;
      for (const apiKey of keys) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const prompt = messages[messages.length - 1]?.content || '';
          const result = await model.generateContent(prompt);
          const responseText = result.response.text();

          res.write(responseText);
          return res.end();
        } catch (err) {
          console.warn(`[Gemini Fallback] Failed key. Trying next...`, err.message);
          lastError = err;
        }
      }
      throw new Error(`All Gemini keys failed: ${lastError?.message}`);
    }

    // 2. OPENAI (ChatGPT)
    if (provider === 'openai') {
      return await executeOpenAICompatibleWithRotation(
        res,
        getApiKeys('OPENAI'),
        null,
        'gpt-4o-mini',
        messages
      );
    }

    // 3. LLAMA (via Groq API)
    if (provider === 'llama') {
      return await executeOpenAICompatibleWithRotation(
        res,
        getApiKeys('GROQ'),
        'https://api.groq.com/openai/v1',
        'llama-3.3-70b-versatile',
        messages
      );
    }

    // 4. DEEPSEEK
    if (provider === 'deepseek') {
      return await executeOpenAICompatibleWithRotation(
        res,
        getApiKeys('DEEPSEEK'),
        'https://api.deepseek.com',
        'deepseek-chat',
        messages
      );
    }

    // 5. MISTRAL AI
    if (provider === 'mistral') {
      return await executeOpenAICompatibleWithRotation(
        res,
        getApiKeys('MISTRAL'),
        'https://api.mistral.ai/v1',
        'mistral-small-latest',
        messages
      );
    }

    // 6. HUGGING FACE
    if (provider === 'huggingface') {
      return await executeOpenAICompatibleWithRotation(
        res,
        getApiKeys('HUGGINGFACE'),
        'https://api-inference.huggingface.co/v1/',
        'Qwen/Qwen2.5-72B-Instruct',
        messages
      );
    }

    // 7. COHERE
    if (provider === 'cohere') {
      const keys = getApiKeys('COHERE');
      if (keys.length === 0) throw new Error('Walang nakaset na Cohere API Key.');

      let lastError = null;
      for (const apiKey of keys) {
        try {
          const cohere = new CohereClientV2({ token: apiKey });
          const stream = await cohere.chatStream({
            model: 'command-r-plus',
            messages: messages.map(m => ({ role: m.role, content: m.content })),
          });

          for await (const chunk of stream) {
            if (chunk.type === 'content-delta') {
              res.write(chunk.delta?.message?.content?.text || '');
            }
          }
          return res.end();
        } catch (err) {
          console.warn(`[Cohere Fallback] Failed key. Trying next...`, err.message);
          lastError = err;
        }
      }
      throw new Error(`All Cohere keys failed: ${lastError?.message}`);
    }

    return res.status(400).send('Invalid Provider Selected');

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Helper: Comma-separated keys parsing
function getApiKeys(prefix) {
  const rawKeys = process.env[`${prefix}_API_KEYS`] || process.env[`${prefix}_API_KEY`] || '';
  return rawKeys.split(',').map(k => k.trim()).filter(Boolean);
}

// Helper: Generic execution function para sa OpenAI-compatible providers
async function executeOpenAICompatibleWithRotation(res, keys, baseURL, model, messages) {
  if (keys.length === 0) throw new Error(`Walang nakaset na API Key para sa model: ${model}`);

  let lastError = null;
  for (const apiKey of keys) {
    try {
      const client = new OpenAI({
        apiKey: apiKey,
        ...(baseURL ? { baseURL } : {})
      });

      const stream = await client.chat.completions.create({
        model: model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        res.write(text);
      }
      return res.end();
    } catch (err) {
      console.warn(`[Rotation] Failed Key for ${model}. Trying next...`, err.message);
      lastError = err;
    }
  }

  throw new Error(`All keys failed for model ${model}: ${lastError?.message}`);
}

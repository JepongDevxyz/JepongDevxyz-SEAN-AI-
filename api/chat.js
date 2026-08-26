export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { messages, provider } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages structure' }), { status: 400 });
    }

    // Kinukuha at nililinis ang API Key
    const getKey = (envName) => {
      const raw = process.env[`${envName}_API_KEYS`] || process.env[`${envName}_API_KEY`] || '';
      const first = raw.split(',')[0] || '';
      return first.trim().replace(/["']/g, '');
    };

    // Standard Chat Format (OpenAI Standard)
    const formattedMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));

    let url = '';
    let headers = { 'Content-Type': 'application/json' };
    let body = {};

    // 1. GEMINI (Kailangan ng 'contents' at 'parts' format)
    if (provider === 'gemini') {
      const key = getKey('GEMINI');
      if (!key) return new Response('GEMINI_API_KEYS is missing', { status: 400 });
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
      body = {
        contents: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(m.content || '') }]
        }))
      };
    }

    // 2. OPENAI
    else if (provider === 'openai') {
      const key = getKey('OPENAI');
      if (!key) return new Response('OPENAI_API_KEYS is missing', { status: 400 });
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${key}`;
      body = { model: 'gpt-4o-mini', messages: formattedMessages };
    }

    // 3. LLAMA / GROQ (Official Active Model: llama-3.3-70b-versatile)
    else if (provider === 'llama') {
      const key = getKey('GROQ');
      if (!key) return new Response('GROQ_API_KEYS is missing', { status: 400 });
      url = 'https://api.groq.com/openai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${key}`;
      body = { model: 'llama-3.3-70b-versatile', messages: formattedMessages };
    }

    // 4. DEEPSEEK
    else if (provider === 'deepseek') {
      const key = getKey('DEEPSEEK');
      if (!key) return new Response('DEEPSEEK_API_KEYS is missing', { status: 400 });
      url = 'https://api.deepseek.com/chat/completions';
      headers['Authorization'] = `Bearer ${key}`;
      body = { model: 'deepseek-chat', messages: formattedMessages };
    }

    // 5. MISTRAL (WORKING)
    else if (provider === 'mistral') {
      const key = getKey('MISTRAL');
      if (!key) return new Response('MISTRAL_API_KEYS is missing', { status: 400 });
      url = 'https://api.mistral.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${key}`;
      body = { model: 'mistral-small-latest', messages: formattedMessages };
    }

    // 6. HUGGING FACE (Serverless Inference Endpoint)
    else if (provider === 'huggingface') {
      const key = getKey('HUGGINGFACE');
      if (!key) return new Response('HUGGINGFACE_API_KEYS is missing', { status: 400 });
      url = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions';
      headers['Authorization'] = `Bearer ${key}`;
      body = { model: 'Qwen/Qwen2.5-72B-Instruct', messages: formattedMessages };
    }

    // 7. COHERE (WORKING)
    else if (provider === 'cohere') {
      const key = getKey('COHERE');
      if (!key) return new Response('COHERE_API_KEYS is missing', { status: 400 });
      url = 'https://api.cohere.com/v1/chat';
      headers['Authorization'] = `Bearer ${key}`;
      body = {
        message: String(messages[messages.length - 1]?.content || 'Hello'),
        chat_history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'USER' : 'CHATBOT',
          message: String(m.content || '')
        }))
      };
    } else {
      return new Response('Invalid provider', { status: 400 });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const resText = await res.text();

    if (!res.ok) {
      // Magpapadala ng malinis na text para makita sa chat UI kung ano eksakto ang error mula sa API provider
      return new Response(`[${provider.toUpperCase()} ERROR ${res.status}]: ${resText}`, { status: 400 });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(resText);
    } catch (e) {
      return new Response(resText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    let replyText = '';
    if (provider === 'gemini') {
      replyText = parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (['openai', 'llama', 'deepseek', 'mistral', 'huggingface'].includes(provider)) {
      replyText = parsedData.choices?.[0]?.message?.content || '';
    } else if (provider === 'cohere') {
      replyText = parsedData.text || '';
    }

    return new Response(replyText, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (err) {
    return new Response(`Server Catch Error: ${err.message}`, { status: 500 });
  }
}

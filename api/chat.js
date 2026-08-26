export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const bodyData = await req.json().catch(() => ({}));
    const { messages, provider } = bodyData;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Error: Invalid messages array.', { status: 400 });
    }

    const cleanMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));

    const lastUserMessage = cleanMessages[cleanMessages.length - 1]?.content || 'Hello';

    // Helper para kumuha ng unang key kung marami
    const parseKey = (val) => {
      if (!val) return '';
      return val.split(',')[0].trim().replace(/["']/g, '');
    };

    // Explicit statically referenced env variables
    const keys = {
      cohere: parseKey(process.env.COHERE_API_KEYS),
      deepseek: parseKey(process.env.DEEPSEEK_API_KEYS),
      gemini: parseKey(process.env.GEMINI_API_KEYS),
      groq: parseKey(process.env.GROQ_API_KEYS),
      huggingface: parseKey(process.env.HUGGINGFACE_API_KEYS),
      mistral: parseKey(process.env.MISTRAL_API_KEYS),
      openai: parseKey(process.env.OPENAI_API_KEYS),
    };

    let fetchUrl = '';
    let fetchHeaders = { 'Content-Type': 'application/json' };
    let fetchBody = {};

    // 1. GEMINI
    if (provider === 'gemini') {
      const key = keys.gemini;
      if (!key) return new Response('Nawawala ang GEMINI_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
      fetchBody = {
        contents: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(m.content || '') }]
        }))
      };
    }

    // 2. OPENAI
    else if (provider === 'openai') {
      const key = keys.openai;
      if (!key) return new Response('Nawawala ang OPENAI_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.openai.com/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'gpt-4o-mini', messages: cleanMessages };
    }

    // 3. LLAMA (GROQ)
    else if (provider === 'llama') {
      const key = keys.groq;
      if (!key) return new Response('Nawawala ang GROQ_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'llama-3.3-70b-versatile', messages: cleanMessages };
    }

    // 4. DEEPSEEK
    else if (provider === 'deepseek') {
      const key = keys.deepseek;
      if (!key) return new Response('Nawawala ang DEEPSEEK_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.deepseek.com/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'deepseek-chat', messages: cleanMessages };
    }

    // 5. MISTRAL
    else if (provider === 'mistral') {
      const key = keys.mistral;
      if (!key) return new Response('Nawawala ang MISTRAL_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.mistral.ai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'mistral-small-latest', messages: cleanMessages };
    }

    // 6. HUGGING FACE
    else if (provider === 'huggingface') {
      const key = keys.huggingface;
      if (!key) return new Response('Nawawala ang HUGGINGFACE_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'Qwen/Qwen2.5-72B-Instruct', messages: cleanMessages };
    }

    // 7. COHERE
    else if (provider === 'cohere') {
      const key = keys.cohere;
      if (!key) return new Response('Nawawala ang COHERE_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.cohere.com/v1/chat';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = {
        message: lastUserMessage,
        chat_history: cleanMessages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'USER' : 'CHATBOT',
          message: m.content
        }))
      };
    } else {
      return new Response(`Invalid provider: ${provider}`, { status: 400 });
    }

    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody)
    });

    const resText = await res.text();

    if (!res.ok) {
      return new Response(`[${provider.toUpperCase()} API ERROR ${res.status}]: ${resText}`, { status: 400 });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(resText);
    } catch (e) {
      return new Response(resText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    let textOutput = '';
    if (provider === 'gemini') {
      textOutput = parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (['openai', 'llama', 'deepseek', 'mistral', 'huggingface'].includes(provider)) {
      textOutput = parsedData.choices?.[0]?.message?.content || '';
    } else if (provider === 'cohere') {
      textOutput = parsedData.text || '';
    }

    return new Response(textOutput || 'Walang ibinalik na text ang model.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (err) {
    return new Response(`Edge Function Fatal Error: ${err.message}`, { status: 500 });
  }
}

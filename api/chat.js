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

    const getKey = (env) => {
      const val = process.env[`${env}_API_KEYS`] || process.env[`${env}_API_KEY`] || '';
      const first = val.split(',')[0] || '';
      return first.replace(/["'\s]/g, '');
    };

    let fetchUrl = '';
    let fetchHeaders = { 'Content-Type': 'application/json' };
    let fetchBody = {};

    const cleanMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    // 1. GEMINI
    if (provider === 'gemini') {
      const key = getKey('GEMINI');
      if (!key) return new Response('Nawawala ang GEMINI_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;
      fetchBody = {
        contents: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      };
    }

    // 2. OPENAI
    else if (provider === 'openai') {
      const key = getKey('OPENAI');
      if (!key) return new Response('Nawawala ang OPENAI_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.openai.com/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'gpt-3.5-turbo', messages: cleanMessages };
    }

    // 3. LLAMA (Groq)
    else if (provider === 'llama') {
      const key = getKey('GROQ');
      if (!key) return new Response('Nawawala ang GROQ_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'llama-3.1-8b-instant', messages: cleanMessages };
    }

    // 4. DEEPSEEK
    else if (provider === 'deepseek') {
      const key = getKey('DEEPSEEK');
      if (!key) return new Response('Nawawala ang DEEPSEEK_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.deepseek.com/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'deepseek-chat', messages: cleanMessages };
    }

    // 5. MISTRAL
    else if (provider === 'mistral') {
      const key = getKey('MISTRAL');
      if (!key) return new Response('Nawawala ang MISTRAL_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.mistral.ai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'mistral-small-latest', messages: cleanMessages };
    }

    // 6. HUGGING FACE
    else if (provider === 'huggingface') {
      const key = getKey('HUGGINGFACE');
      if (!key) return new Response('Nawawala ang HUGGINGFACE_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'mistralai/Mistral-7B-Instruct-v0.2', messages: cleanMessages };
    }

    // 7. COHERE
    else if (provider === 'cohere') {
      const key = getKey('COHERE');
      if (!key) return new Response('Nawawala ang COHERE_API_KEYS sa Vercel Environment Variables.', { status: 400 });
      fetchUrl = 'https://api.cohere.com/v1/chat';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = {
        message: messages[messages.length - 1].content,
        chat_history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'USER' : 'CHATBOT',
          message: m.content
        }))
      };
    } else {
      return new Response('Invalid provider selected', { status: 400 });
    }

    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody)
    });

    const resText = await res.text();

    if (!res.ok) {
      return new Response(`[${provider.toUpperCase()} ERROR]: ${resText}`, { status: 400 });
    }

    let data;
    try {
      data = JSON.parse(resText);
    } catch (e) {
      return new Response(resText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    let textOutput = '';
    if (provider === 'gemini') {
      textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (['openai', 'llama', 'deepseek', 'mistral', 'huggingface'].includes(provider)) {
      textOutput = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'cohere') {
      textOutput = data.text || '';
    }

    if (!textOutput) {
      return new Response(`[${provider.toUpperCase()}]: Walang text na naibalik sa response. Raw: ${resText}`, { status: 400 });
    }

    return new Response(textOutput, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (err) {
    return new Response(`Server Catch Error: ${err.message}`, { status: 500 });
  }
}

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

    // Helper para malinis ang key mula sa kahit anong space o quotes
    const getCleanKey = (envName) => {
      const raw = process.env[`${envName}_API_KEYS`] || process.env[`${envName}_API_KEY`] || '';
      const firstKey = raw.split(',')[0] || '';
      return firstKey.replace(/["'\s]/g, '');
    };

    let fetchUrl = '';
    let fetchHeaders = { 'Content-Type': 'application/json' };
    let fetchBody = {};

    // 1. GEMINI
    if (provider === 'gemini') {
      const key = getCleanKey('GEMINI');
      if (!key) throw new Error('GEMINI_API_KEYS is missing in Vercel');
      fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
      fetchBody = {
        contents: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      };
    }

    // 2. OPENAI
    else if (provider === 'openai') {
      const key = getCleanKey('OPENAI');
      if (!key) throw new Error('OPENAI_API_KEYS is missing in Vercel');
      fetchUrl = 'https://api.openai.com/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'gpt-3.5-turbo', messages };
    }

    // 3. LLAMA (Groq)
    else if (provider === 'llama') {
      const key = getCleanKey('GROQ');
      if (!key) throw new Error('GROQ_API_KEYS is missing in Vercel');
      fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'llama3-8b-8192', messages };
    }

    // 4. DEEPSEEK
    else if (provider === 'deepseek') {
      const key = getCleanKey('DEEPSEEK');
      if (!key) throw new Error('DEEPSEEK_API_KEYS is missing in Vercel');
      fetchUrl = 'https://api.deepseek.com/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'deepseek-chat', messages };
    }

    // 5. MISTRAL
    else if (provider === 'mistral') {
      const key = getCleanKey('MISTRAL');
      if (!key) throw new Error('MISTRAL_API_KEYS is missing in Vercel');
      fetchUrl = 'https://api.mistral.ai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'mistral-small-latest', messages };
    }

    // 6. HUGGING FACE
    else if (provider === 'huggingface') {
      const key = getCleanKey('HUGGINGFACE');
      if (!key) throw new Error('HUGGINGFACE_API_KEYS is missing in Vercel');
      fetchUrl = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-32B-Instruct/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'Qwen/Qwen2.5-Coder-32B-Instruct', messages };
    }

    // 7. COHERE
    else if (provider === 'cohere') {
      const key = getCleanKey('COHERE');
      if (!key) throw new Error('COHERE_API_KEYS is missing in Vercel');
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
      throw new Error('Invalid Provider Selected');
    }

    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody)
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.error?.message || data.message || JSON.stringify(data);
      throw new Error(`[${provider.toUpperCase()} Error]: ${msg}`);
    }

    // Extract Text Output per Provider
    let textOutput = '';
    if (provider === 'gemini') {
      textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (['openai', 'llama', 'deepseek', 'mistral', 'huggingface'].includes(provider)) {
      textOutput = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'cohere') {
      textOutput = data.text || '';
    }

    return new Response(textOutput, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

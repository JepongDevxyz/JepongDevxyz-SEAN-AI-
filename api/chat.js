export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { messages, provider } = await req.json();

    const getKey = (env) => {
      const val = process.env[`${env}_API_KEYS`] || process.env[`${env}_API_KEY`] || '';
      return val.split(',')[0].trim().replace(/["']/g, '');
    };

    let url = '', headers = { 'Content-Type': 'application/json' }, body = {};

    if (provider === 'gemini') {
      const key = getKey('GEMINI');
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      body = { contents: [{ role: 'user', parts: [{ text: messages[messages.length - 1].content }] }] };
    } 
    else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${getKey('OPENAI')}`;
      body = { model: 'gpt-4o-mini', messages };
    } 
    else if (provider === 'llama') {
      url = 'https://api.groq.com/openai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${getKey('GROQ')}`;
      body = { model: 'llama-3.3-70b-versatile', messages };
    } 
    else if (provider === 'deepseek') {
      url = 'https://api.deepseek.com/chat/completions';
      headers['Authorization'] = `Bearer ${getKey('DEEPSEEK')}`;
      body = { model: 'deepseek-chat', messages };
    } 
    else if (provider === 'mistral') {
      url = 'https://api.mistral.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${getKey('MISTRAL')}`;
      body = { model: 'mistral-small-latest', messages };
    } 
    else if (provider === 'cohere') {
      url = 'https://api.cohere.com/v1/chat';
      headers['Authorization'] = `Bearer ${getKey('COHERE')}`;
      body = { message: messages[messages.length - 1].content };
    } 
    else if (provider === 'huggingface') {
      url = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions';
      headers['Authorization'] = `Bearer ${getKey('HUGGINGFACE')}`;
      body = { model: 'Qwen/Qwen2.5-72B-Instruct', messages };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();

    if (!res.ok) {
      // Ipapalabas nito ang mismong sinasabi ng API (hal. "Quota Exceeded", "Invalid Key", etc.)
      return new Response(`[${provider.toUpperCase()} ERROR]: ${JSON.stringify(data)}`, { status: 400 });
    }

    let text = data.choices?.[0]?.message?.content || 
               data.candidates?.[0]?.content?.parts?.[0]?.text || 
               data.text || '';

    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (e) {
    return new Response(`Server Error: ${e.message}`, { status: 500 });
  }
}

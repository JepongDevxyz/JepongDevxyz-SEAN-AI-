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
      return new Response(JSON.stringify({ error: 'Invalid messages array' }), { status: 400 });
    }

    const getKeys = (prefix) => {
      const raw = process.env[`${prefix}_API_KEYS`] || process.env[`${prefix}_API_KEY`] || '';
      return raw.split(',').map(k => k.trim()).filter(Boolean);
    };

    let keys = [];
    let getPayload = null;

    if (provider === 'gemini') {
      keys = getKeys('GEMINI');
      getPayload = (key) => ({
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${key}`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          contents: messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        }
      });
    } else if (provider === 'openai') {
      keys = getKeys('OPENAI');
      getPayload = (key) => ({
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'gpt-4o-mini', messages, stream: true }
      });
    } else if (provider === 'llama') {
      keys = getKeys('GROQ');
      getPayload = (key) => ({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'llama-3.3-70b-versatile', messages, stream: true }
      });
    } else if (provider === 'deepseek') {
      keys = getKeys('DEEPSEEK');
      getPayload = (key) => ({
        url: 'https://api.deepseek.com/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'deepseek-chat', messages, stream: true }
      });
    } else if (provider === 'mistral') {
      keys = getKeys('MISTRAL');
      getPayload = (key) => ({
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'mistral-small-latest', messages, stream: true }
      });
    } else if (provider === 'huggingface') {
      keys = getKeys('HUGGINGFACE');
      getPayload = (key) => ({
        url: 'https://api-inference.huggingface.co/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'Qwen/Qwen2.5-72B-Instruct', messages, stream: true }
      });
    } else if (provider === 'cohere') {
      keys = getKeys('COHERE');
      getPayload = (key) => ({
        url: 'https://api.cohere.com/v2/chat',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: {
          model: 'command-r-plus',
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true
        }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Invalid provider' }), { status: 400 });
    }

    if (keys.length === 0) {
      return new Response(JSON.stringify({ error: `Walang mahanap na API Key para sa ${provider.toUpperCase()}` }), { status: 400 });
    }

    let response = null;
    let lastErrorMsg = '';

    for (const key of keys) {
      try {
        const payload = getPayload(key);
        const res = await fetch(payload.url, {
          method: 'POST',
          headers: payload.headers,
          body: JSON.stringify(payload.body),
        });

        if (res.ok) {
          response = res;
          break;
        } else {
          const errDetail = await res.text();
          lastErrorMsg = errDetail;
        }
      } catch (err) {
        lastErrorMsg = err.message;
      }
    }

    if (!response) {
      return new Response(JSON.stringify({ error: `API Error: ${lastErrorMsg}` }), { status: 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';

    const stream = new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              let text = '';

              if (provider === 'gemini') {
                text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              } else if (['openai', 'llama', 'deepseek', 'mistral', 'huggingface'].includes(provider)) {
                text = parsed.choices?.[0]?.delta?.content || '';
              } else if (provider === 'cohere') {
                if (parsed.type === 'content-delta') {
                  text = parsed.delta?.message?.content?.text || '';
                }
              }

              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            } catch (e) {
              // Ignore incomplete JSON chunks until the next stream iteration
            }
          }
        }
      }
    });

    return new Response(response.body.pipeThrough(stream), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

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

    // Helper: Kinukuha lahat ng keys mula sa environment variable (hal. OPENAI_API_KEYS="key1,key2")
    const getKeys = (prefix) => {
      const raw = process.env[`${prefix}_API_KEYS`] || process.env[`${prefix}_API_KEY`] || '';
      return raw.split(',').map(k => k.trim()).filter(Boolean);
    };

    let keys = [];
    let getPayload = null;

    // 1. GEMINI
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
    }

    // 2. OPENAI
    else if (provider === 'openai') {
      keys = getKeys('OPENAI');
      getPayload = (key) => ({
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'gpt-4o-mini', messages, stream: true }
      });
    }

    // 3. LLAMA (Groq)
    else if (provider === 'llama') {
      keys = getKeys('GROQ');
      getPayload = (key) => ({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'llama-3.3-70b-versatile', messages, stream: true }
      });
    }

    // 4. DEEPSEEK
    else if (provider === 'deepseek') {
      keys = getKeys('DEEPSEEK');
      getPayload = (key) => ({
        url: 'https://api.deepseek.com/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'deepseek-chat', messages, stream: true }
      });
    }

    // 5. MISTRAL
    else if (provider === 'mistral') {
      keys = getKeys('MISTRAL');
      getPayload = (key) => ({
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'mistral-small-latest', messages, stream: true }
      });
    }

    // 6. HUGGING FACE
    else if (provider === 'huggingface') {
      keys = getKeys('HUGGINGFACE');
      getPayload = (key) => ({
        url: 'https://api-inference.huggingface.co/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model: 'Qwen/Qwen2.5-72B-Instruct', messages, stream: true }
      });
    }

    // 7. COHERE
    else if (provider === 'cohere') {
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
      throw new Error('Invalid Provider selected');
    }

    if (keys.length === 0) {
      throw new Error(`Walang nahanap na API Keys para sa ${provider.toUpperCase()}_API_KEYS sa Vercel.`);
    }

    // Key Rotation Loop (Subukan ang mga keys isa-isa hanggang may gumana)
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
          break; // Nagtagumpay, itigil ang rotation
        } else {
          const errDetail = await res.text();
          lastErrorMsg = `[Key Failed]: ${errDetail}`;
          console.warn(`[Rotation Warning] Key failed for ${provider}:`, errDetail);
        }
      } catch (err) {
        lastErrorMsg = err.message;
      }
    }

    if (!response) {
      throw new Error(`Lahat ng API keys para sa ${provider.toUpperCase()} ay nag-fail. Error: ${lastErrorMsg}`);
    }

    // Stream Transformer para sa client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new TransformStream({
      transform(chunk, controller) {
        const textChunk = decoder.decode(chunk);
        const lines = textChunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataData = trimmed.replace('data: ', '').trim();
            if (dataData === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataData);
              let contentText = '';

              if (provider === 'gemini') {
                contentText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              } else if (['openai', 'llama', 'deepseek', 'mistral', 'huggingface'].includes(provider)) {
                contentText = parsed.choices?.[0]?.delta?.content || '';
              } else if (provider === 'cohere') {
                if (parsed.type === 'content-delta') {
                  contentText = parsed.delta?.message?.content?.text || '';
                }
              }

              if (contentText) {
                controller.enqueue(encoder.encode(contentText));
              }
            } catch (e) {
              // Ignore partial chunk JSON parse errors
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

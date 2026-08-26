export const config = {
  runtime: 'edge', // Mas mabilis at mas maganda sa streaming
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { messages, provider } = await req.json();
    const userPrompt = messages[messages.length - 1]?.content || '';

    let apiUrl = '';
    let headers = { 'Content-Type': 'application/json' };
    let body = {};

    switch (provider) {
      case 'gemini': {
        const apiKey = process.env.GEMINI_API_KEYS;
        if (!apiKey) throw new Error('GEMINI_API_KEY is missing in environment variables.');
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;
        body = {
          contents: messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        };
        break;
      }

      case 'openai': {
        const apiKey = process.env.OPENAI_API_KEYS;
        if (!apiKey) throw new Error('OPENAI_API_KEY is missing.');
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model: 'gpt-3.5-turbo', messages, stream: true };
        break;
      }

      case 'llama': { // Groq API
        const apiKey = process.env.GROQ_API_KEYS;
        if (!apiKey) throw new Error('GROQ_API_KEY is missing.');
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model: 'llama-3.1-8b-instant', messages, stream: true };
        break;
      }

      case 'deepseek': {
        const apiKey = process.env.DEEPSEEK_API_KEYS;
        if (!apiKey) throw new Error('DEEPSEEK_API_KEY is missing.');
        apiUrl = 'https://api.deepseek.com/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model: 'deepseek-chat', messages, stream: true };
        break;
      }

      case 'mistral': {
        const apiKey = process.env.MISTRAL_API_KEYS;
        if (!apiKey) throw new Error('MISTRAL_API_KEY is missing.');
        apiUrl = 'https://api.mistral.ai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model: 'mistral-tiny', messages, stream: true };
        break;
      }

      case 'cohere': {
        const apiKey = process.env.COHERE_API_KEYS;
        if (!apiKey) throw new Error('COHERE_API_KEY is missing.');
        apiUrl = 'https://api.cohere.com/v2/chat';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: 'command-r-plus',
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true
        };
        break;
      }

      default:
        throw new Error('Unsupported provider selected.');
    }

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      return new Response(JSON.stringify({ error: `Provider Error: ${errText}` }), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Transform stream para maging uniform plain text sa frontend
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk);
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;

          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;

            try {
              const json = JSON.parse(dataStr);
              let content = '';

              if (provider === 'gemini') {
                content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
              } else if (['openai', 'llama', 'deepseek', 'mistral'].includes(provider)) {
                content = json.choices?.[0]?.delta?.content || '';
              } else if (provider === 'cohere') {
                if (json.type === 'content-delta') {
                  content = json.delta?.message?.content?.text || '';
                }
              }

              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch (e) {
              // Ignore invalid JSON chunks
            }
          }
        }
      }
    });

    return new Response(apiResponse.body.pipeThrough(transformStream), {
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

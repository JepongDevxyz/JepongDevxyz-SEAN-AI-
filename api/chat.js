export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const bodyData = await req.json().catch(() => ({}));
    const { messages, provider, system_prompt } = bodyData;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Error: Walang naipasang messages array.', { status: 200 });
    }

    // Default system prompt kapag walang naipasa mula sa frontend
    const defaultSystemPrompt = "You are S.E.A.N. AI, created solely by Jay-Ar Lee Espiritu. If asked who created or developed you in any language, state clearly that you are S.E.A.N. AI created by Jay-Ar Lee Espiritu.";
    const activeSystemPrompt = system_prompt || defaultSystemPrompt;

    const cleanMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));

    // OpenAI-compatible format na may nakalagay na System Role sa pinaka-unahan
    const messagesWithSystem = [
      { role: 'system', content: activeSystemPrompt },
      ...cleanMessages
    ];

    const lastUserMessage = cleanMessages[cleanMessages.length - 1]?.content || 'Hello';

    // Helper function para sa Multi-Key Rotation (random selection sa comma-separated keys)
    const getRandomKey = (val) => {
      if (!val) return '';
      const keyList = val
        .split(',')
        .map(k => k.trim().replace(/["']/g, ''))
        .filter(k => k.length > 0);
      
      if (keyList.length === 0) return '';
      const randomIndex = Math.floor(Math.random() * keyList.length);
      return keyList[randomIndex];
    };

    const keys = {
      cohere: getRandomKey(process.env.COHERE_API_KEYS),
      gemini: getRandomKey(process.env.GEMINI_API_KEYS),
      groq: getRandomKey(process.env.GROQ_API_KEYS),
      openrouter: getRandomKey(process.env.OPENROUTER_API_KEYS),
      mistral: getRandomKey(process.env.MISTRAL_API_KEYS),
    };

    let fetchUrl = '';
    let fetchHeaders = { 'Content-Type': 'application/json' };
    let fetchBody = {};

    // 1. GEMINI
    if (provider === 'gemini') {
      const key = keys.gemini;
      if (!key) return new Response('[GEMINI ERROR]: Walang available na GEMINI_API_KEYS.', { status: 200 });
      fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
      fetchBody = {
        system_instruction: {
          parts: [{ text: activeSystemPrompt }]
        },
        contents: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(m.content || '') }]
        }))
      };
    } 

    // 2. LLAMA / GROQ
    else if (provider === 'llama') {
      const key = keys.groq;
      if (!key) return new Response('[LLAMA/GROQ ERROR]: Walang available na GROQ_API_KEYS.', { status: 200 });
      fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'openai/gpt-oss-120b', messages: messagesWithSystem };
    } 

    // 3. MISTRAL
    else if (provider === 'mistral') {
      const key = keys.mistral;
      if (!key) return new Response('[MISTRAL ERROR]: Walang available na MISTRAL_API_KEYS.', { status: 200 });
      fetchUrl = 'https://api.mistral.ai/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = { model: 'mistral-small-latest', messages: messagesWithSystem };
    } 

    // 4. OPENROUTER
    else if (provider === 'openrouter') {
      const key = keys.openrouter;
      if (!key) return new Response('[OPENROUTER ERROR]: Walang available na OPENROUTER_API_KEYS.', { status: 200 });
      fetchUrl = 'https://openrouter.ai/api/v1/chat/completions';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchHeaders['HTTP-Referer'] = 'https://jepong-devxyz-sean-ai.vercel.app/';
      fetchHeaders['X-Title'] = 'S.E.A.N. - AI Assistant';
      fetchBody = { 
        model: 'openrouter/auto', 
        messages: messagesWithSystem 
      };
    } 

    // 5. COHERE
    else if (provider === 'cohere') {
      const key = keys.cohere;
      if (!key) return new Response('[COHERE ERROR]: Walang available na COHERE_API_KEYS.', { status: 200 });
      fetchUrl = 'https://api.cohere.com/v1/chat';
      fetchHeaders['Authorization'] = `Bearer ${key}`;
      fetchBody = {
        preamble: activeSystemPrompt,
        message: lastUserMessage,
        chat_history: cleanMessages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'USER' : 'CHATBOT',
          message: m.content
        }))
      };
    } else {
      return new Response(`[SYSTEM ERROR]: Hindi kilala ang provider na "${provider}".`, { status: 200 });
    }

    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody)
    });

    const resText = await res.text();

    if (!res.ok) {
      return new Response(`[${provider.toUpperCase()} ERROR ${res.status}]: ${resText}`, { status: 200 });
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
    } else if (['llama', 'mistral', 'openrouter'].includes(provider)) {
      textOutput = parsedData.choices?.[0]?.message?.content || '';
    } else if (provider === 'cohere') {
      textOutput = parsedData.text || '';
    }

    return new Response(textOutput || `[${provider.toUpperCase()}]: Walang text response.`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (err) {
    return new Response(`[SERVER ERROR]: ${err.message}`, { status: 200 });
  }
}

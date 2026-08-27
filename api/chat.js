export const config = {
  runtime: 'edge',
};

// Helper function para sa maikling pause sa pagitan ng failover attempts
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const bodyData = await req.json().catch(() => ({}));
    const { messages, provider, system_prompt, shuffle } = bodyData;

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

    // OpenAI-compatible format
    const messagesWithSystem = [
      { role: 'system', content: activeSystemPrompt },
      ...cleanMessages
    ];

    const lastUserMessage = cleanMessages[cleanMessages.length - 1]?.content || 'Hello';

    // Helper function para sa Multi-Key Rotation
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

    // Function para bumuo ng API Call Parameters para sa bawat provider
    const getProviderConfig = (selectedProvider) => {
      let fetchUrl = '';
      let fetchHeaders = { 'Content-Type': 'application/json' };
      let fetchBody = {};

      if (selectedProvider === 'gemini') {
        const key = getRandomKey(process.env.GEMINI_API_KEYS);
        if (!key) return { error: '[GEMINI ERROR]: Walang available na GEMINI_API_KEYS.' };
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
      else if (selectedProvider === 'llama') {
        const key = getRandomKey(process.env.GROQ_API_KEYS);
        if (!key) return { error: '[LLAMA/GROQ ERROR]: Walang available na GROQ_API_KEYS.' };
        fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
        fetchHeaders['Authorization'] = `Bearer ${key}`;
        fetchBody = { model: 'openai/gpt-oss-120b', messages: messagesWithSystem };
      } 
      else if (selectedProvider === 'mistral') {
        const key = getRandomKey(process.env.MISTRAL_API_KEYS);
        if (!key) return { error: '[MISTRAL ERROR]: Walang available na MISTRAL_API_KEYS.' };
        fetchUrl = 'https://api.mistral.ai/v1/chat/completions';
        fetchHeaders['Authorization'] = `Bearer ${key}`;
        fetchBody = { model: 'mistral-small-latest', messages: messagesWithSystem };
      } 
      else if (selectedProvider === 'openrouter') {
        const key = getRandomKey(process.env.OPENROUTER_API_KEYS);
        if (!key) return { error: '[OPENROUTER ERROR]: Walang available na OPENROUTER_API_KEYS.' };
        fetchUrl = 'https://openrouter.ai/api/v1/chat/completions';
        fetchHeaders['Authorization'] = `Bearer ${key}`;
        fetchHeaders['HTTP-Referer'] = 'https://jepong-devxyz-sean-ai.vercel.app/';
        fetchHeaders['X-Title'] = 'S.E.A.N. - AI Assistant';
        fetchBody = { 
          model: 'openrouter/auto', 
          messages: messagesWithSystem 
        };
      } 
      else if (selectedProvider === 'cohere') {
        const key = getRandomKey(process.env.COHERE_API_KEYS);
        if (!key) return { error: '[COHERE ERROR]: Walang available na COHERE_API_KEYS.' };
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
        return { error: `[SYSTEM ERROR]: Hindi kilala ang provider na "${selectedProvider}".` };
      }

      return { fetchUrl, fetchHeaders, fetchBody };
    };

    // Single Model Fetch Execution Function
    const tryFetchModel = async (targetProvider) => {
      const config = getProviderConfig(targetProvider);
      if (config.error) throw new Error(config.error);

      const res = await fetch(config.fetchUrl, {
        method: 'POST',
        headers: config.fetchHeaders,
        body: JSON.stringify(config.fetchBody)
      });

      const resText = await res.text();

      if (!res.ok) {
        throw new Error(`[${targetProvider.toUpperCase()} ERROR ${res.status}]: ${resText}`);
      }

      let parsedData;
      try {
        parsedData = JSON.parse(resText);
      } catch (e) {
        return resText;
      }

      let textOutput = '';
      if (targetProvider === 'gemini') {
        textOutput = parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (['llama', 'mistral', 'openrouter'].includes(targetProvider)) {
        textOutput = parsedData.choices?.[0]?.message?.content || '';
      } else if (targetProvider === 'cohere') {
        textOutput = parsedData.text || '';
      }

      if (!textOutput) {
        throw new Error(`[${targetProvider.toUpperCase()}]: Walang nilalaman ang nakuha response.`);
      }

      return textOutput;
    };

    // List ng lahat ng sinusuportahang models sa app mo
    const allProviders = ['gemini', 'llama', 'mistral', 'openrouter', 'cohere'];

    // ==========================================
    // 1. KAPAG NAKA-ON ANG SHUFFLE MODE
    // ==========================================
    if (shuffle) {
      // Isantabi muna ang piniling provider sa unahan ng queue
      const remainingProviders = allProviders.filter(p => p !== provider);

      // Fisher-Yates Shuffle Algorithm para sa natitirang models
      for (let i = remainingProviders.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingProviders[i], remainingProviders[j]] = [remainingProviders[j], remainingProviders[i]];
      }

      // Ang queue ay: [Selected Model, Random Model 1, Random Model 2, ...]
      const queue = [provider, ...remainingProviders];
      let errorLogs = [];

      // Subukang tumawag sa bawat model sa queue hanggang may kumagat na gumagana
      for (const currentProvider of queue) {
        try {
          const resultText = await tryFetchModel(currentProvider);
          return new Response(resultText, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        } catch (err) {
          errorLogs.push(err.message);
          await delay(300); // Konting pahinga bago mag-failover sa susunod na model
        }
      }

      // Kapag nag-down LAHAT ng models (halimbawa, kulang ang API keys o offline ang lahat ng services)
      return new Response(`[ALL SHUFFLE MODELS FAILED]:\n` + errorLogs.join('\n'), { status: 200 });
    } 

    // ==========================================
    // 2. KAPAG NAKA-OFF ANG SHUFFLE MODE
    // ==========================================
    try {
      const resultText = await tryFetchModel(provider);
      return new Response(resultText, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    } catch (singleErr) {
      return new Response(singleErr.message, { status: 200 });
    }

  } catch (err) {
    return new Response(`[SERVER ERROR]: ${err.message}`, { status: 200 });
  }
}

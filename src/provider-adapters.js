(function initTranslateOnlineProviderAdapters(globalScope) {
  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalScope.TranslateOnlineShared;

  function buildProviderEndpoint(provider, apiUrl) {
    const baseUrl = shared.normalizeApiBaseUrl(apiUrl).replace(/\/+$/, '');
    const chatPath = `/${String(provider.chatPath).replace(/^\/+/, '')}`;
    return `${baseUrl}${chatPath}`;
  }

  function buildProviderHeaders(provider, apiKey) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (provider.auth === 'bearer') {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (provider.auth === 'api-key') {
      headers['api-key'] = apiKey;
    } else if (provider.auth === 'x-api-key') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    return headers;
  }

  function buildSystemPrompt({
    texts,
    sourceLang,
    targetLang,
    glossaryInstruction
  }) {
    const languageInstruction = sourceLang === 'auto'
      ? `Detect the source language automatically and translate to ${targetLang}.`
      : `Translate from ${sourceLang} to ${targetLang}.`;
    const lines = [
      'You are a precise translation engine.',
      languageInstruction
    ];

    if (Array.isArray(texts)) {
      lines.push(
        `Return only a valid JSON array of exactly ${texts.length} strings.`,
        'Preserve input order. Do not return Markdown or explanations.'
      );
    } else {
      lines.push('Return only the translated text, without explanations or Markdown.');
    }

    const glossary = String(glossaryInstruction || '').trim();
    if (glossary) {
      lines.push(`Glossary instructions: ${glossary}`);
    }

    return lines.join('\n');
  }

  function buildUserContent(text, texts) {
    return Array.isArray(texts)
      ? JSON.stringify(texts.map(value => String(value)))
      : String(text || '');
  }

  function buildOpenAiRequestBody({
    model,
    text,
    texts,
    sourceLang,
    targetLang,
    glossaryInstruction
  }) {
    return {
      model,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt({
            texts,
            sourceLang,
            targetLang,
            glossaryInstruction
          })
        },
        {
          role: 'user',
          content: buildUserContent(text, texts)
        }
      ],
      temperature: 0.1,
      max_tokens: 8192
    };
  }

  function buildAnthropicRequestBody({
    model,
    text,
    texts,
    sourceLang,
    targetLang,
    glossaryInstruction
  }) {
    return {
      model,
      system: buildSystemPrompt({
        texts,
        sourceLang,
        targetLang,
        glossaryInstruction
      }),
      messages: [
        {
          role: 'user',
          content: buildUserContent(text, texts)
        }
      ],
      temperature: 0.1,
      max_tokens: 8192
    };
  }

  function parseOpenAiText(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      const error = new Error(
        'OpenAI-compatible response did not contain translated text'
      );
      error.code = 'empty_response';
      throw error;
    }
    return content.trim();
  }

  function parseAnthropicText(data) {
    const block = Array.isArray(data?.content)
      ? data.content.find(item => item?.type === 'text')
      : undefined;

    if (typeof block?.text !== 'string' || !block.text.trim()) {
      const error = new Error(
        'Anthropic response did not contain a non-empty text block'
      );
      error.code = 'empty_response';
      throw error;
    }
    return block.text.trim();
  }

  function mapProviderHttpError(providerName, status) {
    let code = 'request_failed';
    if (status === 401) {
      code = 'unauthorized';
    } else if (status === 403) {
      code = 'forbidden';
    } else if (status === 429) {
      code = 'rate_limited';
    } else if (status >= 500 && status <= 599) {
      code = 'service_unavailable';
    }

    const error = new Error(`${providerName} request failed with HTTP ${status}`);
    error.code = code;
    error.status = status;
    return error;
  }

  function createUnsupportedProtocolError(provider) {
    const error = new Error(
      `${provider.name} protocol ${provider.protocol} is not supported by JSON adapters`
    );
    error.code = 'unsupported_protocol';
    return error;
  }

  function createInvalidResponseError(provider) {
    const error = new Error(`${provider.name} returned an invalid JSON response`);
    error.code = 'invalid_response';
    return error;
  }

  function assertSupportedProtocol(provider) {
    if (
      provider.protocol !== 'openai-chat' &&
      provider.protocol !== 'anthropic-messages'
    ) {
      throw createUnsupportedProtocolError(provider);
    }
  }

  function buildRequestBody(provider, options) {
    const bodyOptions = {
      model: options.config.model,
      text: options.text,
      texts: options.texts,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      glossaryInstruction: options.glossaryInstruction
    };

    return provider.protocol === 'anthropic-messages'
      ? buildAnthropicRequestBody(bodyOptions)
      : buildOpenAiRequestBody(bodyOptions);
  }

  function parseProviderText(provider, data) {
    return provider.protocol === 'anthropic-messages'
      ? parseAnthropicText(data)
      : parseOpenAiText(data);
  }

  async function requestProvider(options) {
    const { provider, config, apiKey, signal, fetchImpl } = options;
    assertSupportedProtocol(provider);

    const response = await fetchImpl(
      buildProviderEndpoint(provider, config.apiUrl),
      {
        method: 'POST',
        headers: buildProviderHeaders(provider, apiKey),
        body: JSON.stringify(buildRequestBody(provider, options)),
        signal
      }
    );

    if (!response.ok) {
      throw mapProviderHttpError(provider.name, response.status);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      throw createInvalidResponseError(provider);
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createInvalidResponseError(provider);
    }

    return parseProviderText(provider, data);
  }

  async function requestProviderTranslation(options) {
    assertSupportedProtocol(options.provider);
    if (!String(options.text || '').trim()) {
      return '';
    }
    return requestProvider(options);
  }

  async function requestProviderBatchTranslation(options) {
    assertSupportedProtocol(options.provider);
    if (!options.texts.length) {
      return [];
    }

    const content = await requestProvider(options);
    const translations = shared.parseTranslationBatchContent(
      content,
      options.texts.length
    );
    if (!translations) {
      const error = new Error(
        `${options.provider.name} returned an invalid batch translation response`
      );
      error.code = 'invalid_batch_response';
      throw error;
    }
    return translations;
  }

  const api = {
    buildProviderEndpoint,
    buildProviderHeaders,
    buildOpenAiRequestBody,
    buildAnthropicRequestBody,
    parseOpenAiText,
    parseAnthropicText,
    mapProviderHttpError,
    requestProviderTranslation,
    requestProviderBatchTranslation
  };

  globalScope.TranslateOnlineProviderAdapters = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

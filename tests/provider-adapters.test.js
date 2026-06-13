const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { getProvider } = require('../src/providers.js');
const {
  buildProviderEndpoint,
  buildProviderHeaders,
  buildOpenAiRequestBody,
  buildAnthropicRequestBody,
  parseOpenAiText,
  parseAnthropicText,
  mapProviderHttpError,
  requestProviderTranslation,
  requestProviderBatchTranslation
} = require('../src/provider-adapters.js');

function createJsonResponse(data, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async json() {
      return data;
    }
  };
}

test('exposes the adapter API through the browser global UMD path', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'provider-adapters.js'),
    'utf8'
  );
  const context = {
    TranslateOnlineShared: require('../src/shared.js')
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);

  assert.deepEqual(
    Object.keys(context.TranslateOnlineProviderAdapters),
    [
      'buildProviderEndpoint',
      'buildProviderHeaders',
      'buildOpenAiRequestBody',
      'buildAnthropicRequestBody',
      'parseOpenAiText',
      'parseAnthropicText',
      'mapProviderHttpError',
      'requestProviderTranslation',
      'requestProviderBatchTranslation'
    ]
  );
  assert.equal(
    context.TranslateOnlineProviderAdapters.buildProviderEndpoint(
      getProvider('deepseek'),
      'https://api.deepseek.com///'
    ),
    'https://api.deepseek.com/v1/chat/completions'
  );
  assert.equal(
    context.TranslateOnlineProviderAdapters.parseOpenAiText({
      choices: [{ message: { content: 'translated' } }]
    }),
    'translated'
  );
});

test('builds exact endpoints without adding or duplicating version paths', () => {
  assert.equal(
    buildProviderEndpoint(getProvider('deepseek'), 'https://api.deepseek.com///'),
    'https://api.deepseek.com/v1/chat/completions'
  );
  assert.equal(
    buildProviderEndpoint(getProvider('deepseek'), 'https://api.deepseek.com/'),
    'https://api.deepseek.com/v1/chat/completions'
  );
  assert.equal(
    buildProviderEndpoint(
      getProvider('gemini'),
      'https://generativelanguage.googleapis.com/v1beta/openai/'
    ),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  );
  assert.equal(
    buildProviderEndpoint(getProvider('claude'), 'https://api.anthropic.com/v1/'),
    'https://api.anthropic.com/v1/messages'
  );
});

test('builds the three exact authentication header variants', () => {
  assert.deepEqual(buildProviderHeaders(getProvider('openai'), 'openai-key'), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer openai-key'
  });
  assert.deepEqual(buildProviderHeaders(getProvider('mimo'), 'mimo-key'), {
    'Content-Type': 'application/json',
    'api-key': 'mimo-key'
  });
  assert.deepEqual(buildProviderHeaders(getProvider('claude'), 'claude-key'), {
    'Content-Type': 'application/json',
    'x-api-key': 'claude-key',
    'anthropic-version': '2023-06-01'
  });
});

test('builds deterministic OpenAI-compatible single and batch request bodies', () => {
  const single = buildOpenAiRequestBody({
    model: 'gpt-4.1-mini',
    text: 'Stats',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: 'Use "Stats" -> "数据统计".'
  });
  assert.deepEqual(single, {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: [
          'You are a precise translation engine.',
          'Translate from en to zh-CN.',
          'Return only the translated text, without explanations or Markdown.',
          'Glossary instructions: Use "Stats" -> "数据统计".'
        ].join('\n')
      },
      { role: 'user', content: 'Stats' }
    ],
    temperature: 0.1,
    max_tokens: 8192
  });

  const batch = buildOpenAiRequestBody({
    model: 'gpt-4.1-mini',
    texts: ['Stats', 'Live'],
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: ''
  });
  assert.deepEqual(batch, {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: [
          'You are a precise translation engine.',
          'Translate from en to zh-CN.',
          'Return only a valid JSON array of exactly 2 strings.',
          'Preserve input order. Do not return Markdown or explanations.'
        ].join('\n')
      },
      { role: 'user', content: '["Stats","Live"]' }
    ],
    temperature: 0.1,
    max_tokens: 8192
  });

  const automatic = buildOpenAiRequestBody({
    model: 'gpt-4.1-mini',
    text: 'Stats',
    sourceLang: 'auto',
    targetLang: 'zh-CN',
    glossaryInstruction: ''
  });
  assert.equal(
    automatic.messages[0].content,
    [
      'You are a precise translation engine.',
      'Detect the source language automatically and translate to zh-CN.',
      'Return only the translated text, without explanations or Markdown.'
    ].join('\n')
  );
});

test('builds deterministic Anthropic single and batch request bodies', () => {
  const single = buildAnthropicRequestBody({
    model: 'claude-sonnet-4-6',
    text: 'Matches',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: 'Translate "Matches" as "比赛".'
  });
  assert.deepEqual(single, {
    model: 'claude-sonnet-4-6',
    system: [
      'You are a precise translation engine.',
      'Translate from en to zh-CN.',
      'Return only the translated text, without explanations or Markdown.',
      'Glossary instructions: Translate "Matches" as "比赛".'
    ].join('\n'),
    messages: [{ role: 'user', content: 'Matches' }],
    temperature: 0.1,
    max_tokens: 8192
  });

  const batch = buildAnthropicRequestBody({
    model: 'claude-sonnet-4-6',
    texts: ['Matches', 'Results'],
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: ''
  });
  assert.deepEqual(batch, {
    model: 'claude-sonnet-4-6',
    system: [
      'You are a precise translation engine.',
      'Translate from en to zh-CN.',
      'Return only a valid JSON array of exactly 2 strings.',
      'Preserve input order. Do not return Markdown or explanations.'
    ].join('\n'),
    messages: [{ role: 'user', content: '["Matches","Results"]' }],
    temperature: 0.1,
    max_tokens: 8192
  });

  const automatic = buildAnthropicRequestBody({
    model: 'claude-sonnet-4-6',
    text: 'Matches',
    sourceLang: 'auto',
    targetLang: 'zh-CN',
    glossaryInstruction: ''
  });
  assert.equal(
    automatic.system,
    [
      'You are a precise translation engine.',
      'Detect the source language automatically and translate to zh-CN.',
      'Return only the translated text, without explanations or Markdown.'
    ].join('\n')
  );
});

test('parses non-empty text from OpenAI and Anthropic responses', () => {
  assert.equal(
    parseOpenAiText({ choices: [{ message: { content: '  数据统计  ' } }] }),
    '数据统计'
  );
  assert.equal(
    parseAnthropicText({
      content: [
        { type: 'tool_use', name: 'ignored' },
        { type: 'text', text: '  比赛  ' }
      ]
    }),
    '比赛'
  );
  assert.throws(
    () => parseOpenAiText({ choices: [] }),
    error => error.code === 'empty_response' && /OpenAI-compatible/.test(error.message)
  );
  assert.throws(
    () => parseOpenAiText({ choices: [{ message: { content: '   ' } }] }),
    error => error.code === 'empty_response' && /OpenAI-compatible/.test(error.message)
  );
  assert.throws(
    () => parseAnthropicText({ content: [] }),
    error => error.code === 'empty_response' && /Anthropic/.test(error.message)
  );
  assert.throws(
    () => parseAnthropicText({ content: [{ type: 'text', text: '' }] }),
    error => error.code === 'empty_response' && /Anthropic/.test(error.message)
  );
  assert.throws(
    () => parseAnthropicText({
      content: [
        { type: 'text', text: '   ' },
        { type: 'text', text: 'later content must not be used' }
      ]
    }),
    error => error.code === 'empty_response' && /Anthropic/.test(error.message)
  );
});

test('maps provider HTTP failures to stable error codes', () => {
  const cases = [
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'service_unavailable'],
    [599, 'service_unavailable'],
    [400, 'request_failed']
  ];

  for (const [status, code] of cases) {
    const error = mapProviderHttpError('DeepSeek', status);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.match(error.message, /DeepSeek/);
  }
});

test('requests one OpenAI-compatible translation with the supplied signal', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const result = await requestProviderTranslation({
    provider: getProvider('deepseek'),
    config: {
      apiUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat'
    },
    apiKey: 'secret',
    text: 'Stats',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: '',
    signal,
    fetchImpl: async (...args) => {
      calls.push(args);
      return createJsonResponse({
        choices: [{ message: { content: '数据统计' } }]
      });
    }
  });

  assert.equal(result, '数据统计');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].signal, signal);
  assert.deepEqual(calls[0][1].headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer secret'
  });
  assert.equal(JSON.parse(calls[0][1].body).model, 'deepseek-chat');
});

test('requests one Anthropic translation and parses its text block', async () => {
  const calls = [];
  const result = await requestProviderTranslation({
    provider: getProvider('claude'),
    config: {
      apiUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-6'
    },
    apiKey: 'secret',
    text: 'Matches',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: '',
    signal: undefined,
    fetchImpl: async (...args) => {
      calls.push(args);
      return createJsonResponse({
        content: [{ type: 'text', text: '比赛' }]
      });
    }
  });

  assert.equal(result, '比赛');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.anthropic.com/v1/messages');
  assert.equal(JSON.parse(calls[0][1].body).model, 'claude-sonnet-4-6');
});

test('strictly parses a complete ordered batch response', async () => {
  let callCount = 0;
  const result = await requestProviderBatchTranslation({
    provider: getProvider('gemini'),
    config: {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash'
    },
    apiKey: 'secret',
    texts: ['Stats', 'Live'],
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: '',
    signal: undefined,
    fetchImpl: async () => {
      callCount += 1;
      return createJsonResponse({
        choices: [{ message: { content: '["数据统计","直播"]' } }]
      });
    }
  });

  assert.deepEqual(result, ['数据统计', '直播']);
  assert.equal(callCount, 1);
});

test('rejects invalid batch responses with a stable code', async () => {
  await assert.rejects(
    requestProviderBatchTranslation({
      provider: getProvider('openai'),
      config: {
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini'
      },
      apiKey: 'secret',
      texts: ['Stats', 'Live'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: undefined,
      fetchImpl: async () => createJsonResponse({
        choices: [{ message: { content: '["数据统计"]' } }]
      })
    }),
    error => error.code === 'invalid_batch_response'
  );
});

test('does not fetch for empty single or batch input', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return createJsonResponse({});
  };
  const options = {
    provider: getProvider('openai'),
    config: {
      apiUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini'
    },
    apiKey: 'secret',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: '',
    signal: undefined,
    fetchImpl
  };

  assert.equal(
    await requestProviderTranslation({ ...options, text: '   ' }),
    ''
  );
  assert.deepEqual(
    await requestProviderBatchTranslation({ ...options, texts: [] }),
    []
  );
  assert.equal(callCount, 0);
});

test('uses mapped HTTP errors for non-ok responses', async () => {
  await assert.rejects(
    requestProviderTranslation({
      provider: getProvider('deepseek'),
      config: {
        apiUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat'
      },
      apiKey: 'secret',
      text: 'Stats',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: undefined,
      fetchImpl: async () => createJsonResponse({}, { ok: false, status: 429 })
    }),
    error => (
      error.code === 'rate_limited' &&
      error.status === 429 &&
      /DeepSeek/.test(error.message)
    )
  );
});

test('maps JSON parsing failures and invalid response values with provider context', async () => {
  const options = {
    provider: getProvider('openai'),
    config: {
      apiUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini'
    },
    apiKey: 'secret',
    text: 'Stats',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    glossaryInstruction: '',
    signal: undefined
  };

  await assert.rejects(
    requestProviderTranslation({
      ...options,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new SyntaxError('Unexpected token');
        }
      })
    }),
    error => (
      error.code === 'invalid_response' &&
      /OpenAI/.test(error.message)
    )
  );

  for (const data of [null, 'not an object', []]) {
    await assert.rejects(
      requestProviderTranslation({
        ...options,
        fetchImpl: async () => createJsonResponse(data)
      }),
      error => (
        error.code === 'invalid_response' &&
        /OpenAI/.test(error.message)
      )
    );
  }
});

test('preserves AbortError identity from fetch and response JSON parsing', async () => {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';

  await assert.rejects(
    requestProviderTranslation({
      provider: getProvider('openai'),
      config: {
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini'
      },
      apiKey: 'secret',
      text: 'Stats',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: new AbortController().signal,
      fetchImpl: async () => {
        throw abortError;
      }
    }),
    error => error === abortError && error.name === 'AbortError'
  );

  await assert.rejects(
    requestProviderTranslation({
      provider: getProvider('openai'),
      config: {
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini'
      },
      apiKey: 'secret',
      text: 'Stats',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: new AbortController().signal,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          throw abortError;
        }
      })
    }),
    error => error === abortError && error.name === 'AbortError'
  );
});

test('rejects MyMemory instead of silently routing it through JSON adapters', async () => {
  for (const request of [
    requestProviderTranslation({
      provider: getProvider('mymemory'),
      config: {
        apiUrl: 'https://api.mymemory.translated.net',
        model: ''
      },
      apiKey: '',
      text: 'Stats',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: undefined,
      fetchImpl: async () => createJsonResponse({})
    }),
    requestProviderBatchTranslation({
      provider: getProvider('mymemory'),
      config: {
        apiUrl: 'https://api.mymemory.translated.net',
        model: ''
      },
      apiKey: '',
      texts: ['Stats'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: undefined,
      fetchImpl: async () => createJsonResponse({})
    })
  ]) {
    await assert.rejects(request, error => error.code === 'unsupported_protocol');
  }
});

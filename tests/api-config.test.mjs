import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createEnvironment(options = {}) {
  const store = new Map();
  const location = options.location || undefined;

  const context = {
    Array,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    TypeError,
    URL: typeof URL !== 'undefined' ? URL : undefined,
    clearTimeout,
    console,
    isFinite,
    setTimeout,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear()
    }
  };

  if (location) {
    context.location = location;
  }

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  if (options.configUrl !== undefined) {
    context.MINDFORGE_CONFIG = { apiBaseUrl: options.configUrl };
  } else {
    // Run js/config.js
    vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), context, {
      filename: 'js/config.js'
    });
  }

  // Run study-contract, mock-generator, api-config, generation
  ['js/study-contract.js', 'js/mock-generator.js', 'js/api-config.js', 'js/generation.js'].forEach(
    (file) => {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
        filename: file
      });
    }
  );

  return context;
}

test('1. valid HTTPS production API URL accepted', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: 'https://mindforge-api.onrender.com/'
  });

  assert.equal(env.MindForgeApiConfig.isLocalEnvironment(), false);
  assert.equal(
    env.MindForgeApiConfig.isValidProductionUrl('https://mindforge-api.onrender.com'),
    true
  );
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), 'https://mindforge-api.onrender.com');

  // Also via localStorage override
  env.MindForgeApiConfig.setApiBaseUrl('https://custom-api.example.com');
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), 'https://custom-api.example.com');
});

test('2. remote HTTP production URL rejected', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: 'http://mindforge-api.onrender.com'
  });

  assert.equal(env.MindForgeApiConfig.isLocalEnvironment(), false);
  assert.equal(
    env.MindForgeApiConfig.isValidProductionUrl('http://mindforge-api.onrender.com'),
    false
  );
  // Remote HTTP must be rejected and return empty string
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');

  // LocalStorage override with remote HTTP must also be rejected
  env.MindForgeApiConfig.setApiBaseUrl('http://insecure-api.example.com');
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');
});

test('3. localhost HTTP URL rejected in production', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: 'http://localhost:8000'
  });

  assert.equal(env.MindForgeApiConfig.isLocalEnvironment(), false);
  assert.equal(env.MindForgeApiConfig.isValidProductionUrl('http://localhost:8000'), false);
  assert.equal(env.MindForgeApiConfig.isValidProductionUrl('https://localhost:8000'), false);
  assert.equal(env.MindForgeApiConfig.isValidProductionUrl('http://127.0.0.1:8000'), false);
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');

  // Localhost in localStorage override on production must be ignored
  env.localStorage.setItem('mindforge:apiBaseUrl', 'http://127.0.0.1:8000');
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');
});

test('4. invalid or malformed URL rejected', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' }
  });

  const malformed = [
    '',
    '   ',
    'not-a-url',
    'javascript:alert(1)',
    'ftp://api.example.com',
    'https://',
    'https://.com',
    'https://example',
    'https://foo..bar',
    null,
    undefined
  ];

  for (const candidate of malformed) {
    assert.equal(
      env.MindForgeApiConfig.isValidProductionUrl(candidate),
      false,
      `Should reject malformed URL: ${candidate}`
    );
  }

  // Setting malformed URL in config returns empty string
  env.window.MINDFORGE_CONFIG = { apiBaseUrl: 'not-a-valid-url' };
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');
});

test('5. local development still supports the local FastAPI URL', () => {
  // Test localhost
  const envLocalhost = createEnvironment({
    location: { hostname: 'localhost', protocol: 'http:' }
  });
  assert.equal(envLocalhost.MindForgeApiConfig.isLocalEnvironment(), true);
  assert.equal(envLocalhost.MindForgeApiConfig.getApiBaseUrl(), 'http://127.0.0.1:8000');

  // Test 127.0.0.1
  const env127 = createEnvironment({
    location: { hostname: '127.0.0.1', protocol: 'http:' }
  });
  assert.equal(env127.MindForgeApiConfig.isLocalEnvironment(), true);
  assert.equal(env127.MindForgeApiConfig.getApiBaseUrl(), 'http://127.0.0.1:8000');

  // Test file: protocol
  const envFile = createEnvironment({
    location: { hostname: '', protocol: 'file:' }
  });
  assert.equal(envFile.MindForgeApiConfig.isLocalEnvironment(), true);
  assert.equal(envFile.MindForgeApiConfig.getApiBaseUrl(), 'http://127.0.0.1:8000');

  // Test local development localStorage override (e.g. custom port)
  envLocalhost.MindForgeApiConfig.setApiBaseUrl('http://127.0.0.1:9000/');
  assert.equal(envLocalhost.MindForgeApiConfig.getApiBaseUrl(), 'http://127.0.0.1:9000');
});

test('6. invalid runtime configuration cannot silently fall through to an unsafe URL', async () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: 'http://insecure-api.example.com'
  });

  // Must not fall back to local URL or the insecure HTTP URL
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');

  let fetchCalled = false;
  env.fetch = () => {
    fetchCalled = true;
    return Promise.resolve({ ok: true });
  };

  await assert.rejects(
    async () => {
      await env.MindForgeGeneration.generate({
        topic: 'Test Topic',
        notes: 'These are valid study notes for testing validation.',
        answerStyle: 'exam',
        difficulty: 'medium'
      });
    },
    (err) => {
      assert.equal(err.code, 'configuration-error');
      assert.match(err.message, /configured/i);
      return true;
    }
  );

  assert.equal(fetchCalled, false, 'fetch should not be called when production configuration is unsafe');
});

test('unconfigured production environment fails safely before making network call', async () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: ''
  });

  let fetchCalled = false;
  env.fetch = () => {
    fetchCalled = true;
    return Promise.resolve({ ok: true });
  };

  await assert.rejects(
    async () => {
      await env.MindForgeGeneration.generate({
        topic: 'Test Topic',
        notes: 'These are valid study notes for testing validation.',
        answerStyle: 'exam',
        difficulty: 'medium'
      });
    },
    (err) => {
      assert.equal(err.code, 'configuration-error');
      assert.match(err.message, /not configured/i);
      return true;
    }
  );

  assert.equal(fetchCalled, false, 'fetch should not be called when API URL is unconfigured');
});

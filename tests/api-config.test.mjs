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

test('local environment defaults to http://127.0.0.1:8000', () => {
  const env = createEnvironment({
    location: { hostname: 'localhost', protocol: 'http:' }
  });

  assert.equal(env.MindForgeApiConfig.isLocalEnvironment(), true);
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), 'http://127.0.0.1:8000');
});

test('local 127.0.0.1 and file: protocols are detected as local', () => {
  const env1 = createEnvironment({
    location: { hostname: '127.0.0.1', protocol: 'http:' }
  });
  assert.equal(env1.MindForgeApiConfig.isLocalEnvironment(), true);

  const env2 = createEnvironment({
    location: { hostname: '', protocol: 'file:' }
  });
  assert.equal(env2.MindForgeApiConfig.isLocalEnvironment(), true);
});

test('local environment allows localStorage override', () => {
  const env = createEnvironment({
    location: { hostname: 'localhost', protocol: 'http:' }
  });

  env.MindForgeApiConfig.setApiBaseUrl('http://127.0.0.1:9000/');
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), 'http://127.0.0.1:9000');
});

test('production environment detects remote domain and reads MINDFORGE_CONFIG', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: 'https://mindforge-api.onrender.com/'
  });

  assert.equal(env.MindForgeApiConfig.isLocalEnvironment(), false);
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), 'https://mindforge-api.onrender.com');
});

test('production environment refuses to return localhost URL and prevents requests to localhost', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: 'http://localhost:8000'
  });

  assert.equal(env.MindForgeApiConfig.isLocalEnvironment(), false);
  // Must NOT return localhost on production!
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');
});

test('production environment ignores localhost in localStorage override', () => {
  const env = createEnvironment({
    location: { hostname: 'mindforge.vercel.app', protocol: 'https:' },
    configUrl: ''
  });

  env.localStorage.setItem('mindforge:apiBaseUrl', 'http://127.0.0.1:8000');
  assert.equal(env.MindForgeApiConfig.getApiBaseUrl(), '');
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

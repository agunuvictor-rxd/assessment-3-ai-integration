import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db.js';
import { rateLimiterStore } from '../src/middleware/rate-limiter.js';
import { jobQueue } from '../src/ai/worker.js';
import { setTestSimulationMode } from '../src/ai/provider.js';

function makeRequest(app, method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (cookie) options.headers['Cookie'] = cookie;

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: data, headers: res.headers, setCookie: res.headers['set-cookie'] || [] });
        });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

function extractCookie(setCookieArray) {
  for (const raw of setCookieArray) {
    const match = raw.match(/^ai_sid=([^;]+)/);
    if (match) return `ai_sid=${match[1]}`;
  }
  return null;
}

function post(app, path, body, cookie) {
  return makeRequest(app, 'POST', path, { body, cookie });
}

function get(app, path, cookie) {
  return makeRequest(app, 'GET', path, { cookie });
}

test.beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = ':memory:';
  closeDatabase();
  rateLimiterStore.reset();
  jobQueue.reset();
  setTestSimulationMode(null);
  getDatabase(':memory:');
});

test.after(() => {
  closeDatabase();
});

test('Signup: creates account and returns session cookie', async () => {
  const app = createApp();
  const res = await post(app, '/api/auth/signup', {
    name: 'Test User',
    email: 'test@example.com',
    password: 'securePass123',
  });

  assert.equal(res.status, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(extractCookie(res.setCookie), 'Must set ai_sid cookie');
});

test('Signup: rejects duplicate email', async () => {
  const app = createApp();
  await post(app, '/api/auth/signup', {
    name: 'User One',
    email: 'dup@example.com',
    password: 'pass123456',
  });

  const res = await post(app, '/api/auth/signup', {
    name: 'User Two',
    email: 'dup@example.com',
    password: 'pass654321',
  });

  assert.equal(res.status, 409);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
  assert.ok(body.error.includes('already registered'));
});

test('Signup: rejects missing fields', async () => {
  const app = createApp();
  const res = await post(app, '/api/auth/signup', {
    name: '',
    email: '',
    password: '',
  });

  assert.equal(res.status, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
});

test('Signin: successful login with correct credentials', async () => {
  const app = createApp();
  await post(app, '/api/auth/signup', {
    name: 'Login User',
    email: 'login@example.com',
    password: 'correctPass',
  });

  const res = await post(app, '/api/auth/signin', {
    email: 'login@example.com',
    password: 'correctPass',
  });

  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(extractCookie(res.setCookie), 'Must set session cookie on signin');
});

test('Signin: rejects wrong password', async () => {
  const app = createApp();
  await post(app, '/api/auth/signup', {
    name: 'Wrong Pass User',
    email: 'wrongpass@example.com',
    password: 'correctPass',
  });

  const res = await post(app, '/api/auth/signin', {
    email: 'wrongpass@example.com',
    password: 'wrongPass',
  });

  assert.equal(res.status, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
});

test('Signin: rejects nonexistent email', async () => {
  const app = createApp();
  const res = await post(app, '/api/auth/signin', {
    email: 'nonexistent@example.com',
    password: 'anypassword',
  });

  assert.equal(res.status, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
});

test('Signout: clears session cookie and redirects', async () => {
  const app = createApp();
  const signupRes = await post(app, '/api/auth/signup', {
    name: 'Signout User',
    email: 'signout@example.com',
    password: 'pass123456',
  });

  const cookie = extractCookie(signupRes.setCookie);
  assert.ok(cookie, 'Must have session cookie after signup');

  const res = await makeRequest(app, 'POST', '/api/auth/signout', { cookie });
  assert.equal(res.status, 302);
  assert.ok(res.headers.location === '/signin', 'Must redirect to signin');
});

test('requireAuth: blocks unauthenticated API requests', async () => {
  const app = createApp();
  const res = await get(app, '/api/ai/jobs/some_id');

  assert.equal(res.status, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
  assert.ok(body.error.includes('Authentication required'));
});

test('requireAuth: allows authenticated requests', async () => {
  const app = createApp();
  const signupRes = await post(app, '/api/auth/signup', {
    name: 'Auth User',
    email: 'auth@example.com',
    password: 'pass123456',
  });

  const cookie = extractCookie(signupRes.setCookie);
  const res = await get(app, '/api/ai/jobs/nonexistent_job_id', cookie);

  assert.equal(res.status, 404);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
  assert.ok(body.error.includes('not found'));
});

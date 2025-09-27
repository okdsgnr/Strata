const http = require('http');
const crypto = require('crypto');

const routes = [
  // Basic health/routing tests
  { method: 'GET', path: '/health', expect: { status: 'ok' } },
  { method: 'GET', path: '/test', expect: { ok: true } },
  { method: 'GET', path: '/api/test', expect: { ok: true } },
  
  // Webhook tests
  { 
    name: 'Webhook without signature',
    method: 'POST', 
    path: '/api/webhooks/helio',
    body: { 
      user_id: 'test-user-123',
      plan: 'monthly',
      status: 'active'
    },
    expectStatus: 401
  },
  { 
    name: 'Webhook with invalid signature',
    method: 'POST', 
    path: '/api/webhooks/helio',
    headers: {
      'x-helio-signature': 'invalid'
    },
    body: { 
      user_id: 'test-user-123',
      plan: 'monthly',
      status: 'active'
    },
    expectStatus: 401
  },
  { 
    name: 'Webhook with valid signature',
    method: 'POST', 
    path: '/api/webhooks/helio',
    addSignature: true,
    body: { 
      user_id: 'test-user-123',
      plan: 'monthly',
      status: 'active'
    },
    expect: { ok: true }
  }
];

function generateSignature(payload) {
  const secret = process.env.HELIO_WEBHOOK_SECRET || 'test-secret';
  const hmac = crypto.createHmac('sha256', secret);
  return hmac.update(JSON.stringify(payload)).digest('hex');
}

async function testRoute({ method, path, body, headers = {}, addSignature, expect, expectStatus, name }) {
  return new Promise((resolve, reject) => {
    if (addSignature && body) {
      headers['x-helio-signature'] = generateSignature(body);
    }

    const options = {
      hostname: 'localhost',
      port: 4000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`\n${name || `${method} ${path}`}`);
        console.log('Status:', res.statusCode);
        console.log('Headers:', res.headers);
        
        try {
          const response = data ? JSON.parse(data) : null;
          console.log('Response:', response);
          
          // Check status code if specified
          if (expectStatus && res.statusCode !== expectStatus) {
            console.log(`❌ Expected status ${expectStatus}, got ${res.statusCode}`);
            resolve({ success: false, statusCode: res.statusCode, body: response });
            return;
          }
          
          // Check response body if specified
          if (expect && JSON.stringify(response) !== JSON.stringify(expect)) {
            console.log(`❌ Expected ${JSON.stringify(expect)}, got ${JSON.stringify(response)}`);
            resolve({ success: false, statusCode: res.statusCode, body: response });
            return;
          }

          resolve({ 
            success: !expectStatus || res.statusCode === expectStatus,
            statusCode: res.statusCode, 
            body: response 
          });
        } catch (e) {
          console.log('Raw response:', data);
          resolve({ 
            success: !expectStatus || res.statusCode === expectStatus,
            statusCode: res.statusCode, 
            body: data 
          });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error:', error);
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('Starting route tests...\n');
  let passed = 0;
  let failed = 0;

  for (const route of routes) {
    try {
      const result = await testRoute(route);
      if (result.success) {
        console.log('✅ Test passed\n');
        passed++;
      } else {
        console.log('❌ Test failed\n');
        failed++;
      }
    } catch (error) {
      console.error(`Failed to test ${route.method} ${route.path}:`, error);
      failed++;
    }
  }

  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Only run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testRoute, runTests };
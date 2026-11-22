/* A fake auth/database boundary, with real browser storage and app UI. No real
   account, email, property or cloud service is used by this suite. */
import { test, expect } from '@playwright/test';
import { flatFile } from '../../src/core/files.js';
import { sampleFlat } from '../../src/core/sample-flat.js';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const userFor = (email) => ({ id: email.startsWith('other') ? OTHER : USER, email, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() });
const sessionFor = (email) => {
  const user = userFor(email), now = Math.floor(Date.now() / 1000);
  const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })).toString('base64url')}.mock`;
  return { access_token: jwt, token_type: 'bearer', refresh_token: `refresh-${email}`, expires_in: 3600, user };
};
function backend() {
  const rows = new Map(), requests = [];
  let offline = false;
  return { rows, requests, set offline(v) { offline = v; },
    async attach(context) {
      await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
      await context.route('http://127.0.0.1:54321/**', async (route) => {
        const req = route.request(), url = new URL(req.url());
        requests.push(`${req.method()} ${url.pathname}`);
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (offline) return route.abort('internetdisconnected');
        if (url.pathname.endsWith('/otp')) return json({});
        if (url.pathname.endsWith('/verify')) {
          const body = req.postDataJSON();
          return body.token === '123456' ? json(sessionFor(body.email)) : json({ msg: 'Invalid code' }, 403);
        }
        if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
        const token = req.headers().authorization?.replace('Bearer ', '');
        const id = token?.includes('.') ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : null;
        if (url.pathname.endsWith('/user')) return json({ ...userFor(id === OTHER ? 'other@example.com' : 'owner@example.com') });
        if (url.pathname.includes('/rest/v1/')) {
          const filter = url.searchParams.get('user_id')?.replace('eq.', '');
          const body = req.postData() ? req.postDataJSON() : null;
          if (!id || (filter && filter !== id) || (body?.user_id && body.user_id !== id)) return json({ message: 'Forbidden' }, 403);
          const row = rows.get(id), object = req.headers().accept?.includes('vnd.pgrst.object');
          const result = (value) => json(object ? value : value ? [value] : []);
          if (req.method() === 'GET') return result(row);
          if (req.method() === 'POST') {
            if (row) return json({ code: '23505', message: 'Duplicate' }, 409);
            rows.set(id, structuredClone(body)); return result({ revision: body.revision });
          }
          if (req.method() === 'PATCH') {
            const revision = Number(url.searchParams.get('revision')?.replace('eq.', ''));
            if (revision !== row?.revision) return result(null);
            rows.set(id, { ...row, ...structuredClone(body) }); return result({ revision: body.revision });
          }
        }
        return json({ message: 'Unexpected request' }, 400);
      });
    },
  };
}
async function signIn(page, email = 'owner@example.com') {
  await page.getByRole('button', { name: 'Sign in to save', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send email code', exact: true }).click();
  await page.getByLabel('Email code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to account', exact: true })).toBeVisible();
}
async function syncNow(page) {
  await page.locator('[data-account]:visible').click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to account', exact: true })).toBeVisible();
}
async function home(page) { await page.goto('/', { waitUntil: 'domcontentloaded' }); await expect(page.getByRole('heading', { name: 'Flats you’re looking at' })).toBeVisible(); }
async function addFile(page) {
  const flat = sampleFlat({}, { id: 'test-flat', name: 'Test flat', address: 'Example address', rent: 123000, rentPeriod: 'sale' });
  const picking = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a file', exact: true }).click();
  const chooser = await picking;
  await chooser.setFiles({ name: 'example.flat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flatFile(flat, [], image))) });
  await expect(page).toHaveURL(/flat\/test-flat/);
  await home(page);
  await expect(page.getByRole('heading', { name: 'Test flat', exact: true })).toBeVisible();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('sign-in, migration, a fresh browser, reload, offline changes and sign-out', async ({ browser }) => {
  const api = backend();
  const first = await browser.newContext({ viewport: { width: 390, height: 844 } }); await api.attach(first);
  const page = await first.newPage(); await home(page); await addFile(page);
  await signIn(page); await noOverflow(page);
  expect(api.rows.get(USER).data.flats[0]).toMatchObject({ name: 'Test flat', rent: 123000, underlayImage: image });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } }); await api.attach(second);
  const otherPage = await second.newPage(); await home(otherPage); await signIn(otherPage);
  await expect(otherPage.getByRole('heading', { name: 'Test flat', exact: true })).toBeVisible();
  await otherPage.reload();
  await expect(otherPage.getByRole('button', { name: 'Saved to account' })).toBeVisible();
  await expect(otherPage.getByRole('heading', { name: 'Test flat', exact: true })).toBeVisible();
  api.offline = true;
  await page.getByRole('button', { name: 'Add a flat', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Offline flat');
  await page.getByRole('button', { name: 'Add flat', exact: true }).click();
  await expect(page).toHaveURL(/#\/flat\/.+\/layout/);
  await noOverflow(page);
  await page.getByRole('link', { name: '← My flats', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Flats you’re looking at' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Offline flat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cloud save pending', exact: true })).toBeVisible();
  api.offline = false; await syncNow(page); await syncNow(otherPage);
  await expect(otherPage.getByRole('heading', { name: 'Offline flat', exact: true })).toBeVisible();
  await otherPage.getByRole('link', { name: 'My catalogue', exact: true }).click();
  await expect(otherPage.getByRole('heading', { name: 'My catalogue', exact: true })).toBeVisible();
  await noOverflow(otherPage);
  await otherPage.getByRole('button', { name: 'Saved to account' }).click();
  await noOverflow(otherPage);
  await otherPage.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(otherPage.getByRole('button', { name: 'Sign in to save' })).toBeVisible();
  await home(otherPage); await expect(otherPage.getByRole('heading', { name: 'Test flat', exact: true })).toHaveCount(0);
  await signIn(otherPage, 'other@example.com');
  await expect(otherPage.getByRole('heading', { name: 'Test flat', exact: true })).toHaveCount(0);
  expect(api.rows.get(OTHER).data.flats).toEqual([]);
  await first.close(); await second.close();
});

test('email errors and code fields fit on iPhone', async ({ browser }) => {
  const api = backend(), context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await api.attach(context);
  const page = await context.newPage(); await home(page);
  await page.getByRole('button', { name: 'Sign in to save' }).click(); await noOverflow(page);
  await page.getByLabel('Email address', { exact: true }).fill('owner@example.com');
  await page.getByRole('button', { name: 'Send email code' }).click();
  await page.getByLabel('Email code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('That code didn’t work.', { exact: false })).toBeVisible();
  await noOverflow(page);
  await context.close();
});

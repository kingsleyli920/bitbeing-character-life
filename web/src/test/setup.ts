import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

// Node's fetch needs absolute URLs; the browser resolves them against the page.
const nodeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  typeof input === 'string' && input.startsWith('/')
    ? nodeFetch(new URL(input, window.location.href), init)
    : nodeFetch(input, init);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

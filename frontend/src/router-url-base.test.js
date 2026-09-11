import { describe, expect, it } from 'vitest';
import { routerUrlBase } from '../build/router-url-base.js';

describe('production router URL base', () => {
  it('only transforms the router dependency during builds', () => {
    const plugin = routerUrlBase();
    expect(plugin.apply).toBe('build');
    expect(plugin.transform('const api = "http://localhost"', '/src/api.js')).toBeNull();
    expect(plugin.transform('const api = "http://localhost:3002/api"', '/node_modules/react-router/dist/production/chunk.mjs')).toBeNull();
  });

  it.each(['/app/node_modules/react-router/dist/production/chunk.mjs', 'C:\\app\\node_modules\\react-router\\dist\\production\\chunk.mjs'])('preserves URL resolution with the inert base: %s', (id) => {
    const result = routerUrlBase().transform('const base = "http://localhost";', id);
    expect(result.code).toBe('const base = "https://router.invalid";');
    const relative = '/forms/123?tab=answers#latest';
    const before = new URL(relative, 'http://localhost');
    const after = new URL(relative, 'https://router.invalid');
    expect(after.pathname + after.search + after.hash).toBe(before.pathname + before.search + before.hash);
    expect(new URL('https://external.example.org', after).href).toBe('https://external.example.org/');
  });
});

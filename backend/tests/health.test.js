import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
describe('GET /api/health',()=>{it('responde que a API está disponível',async()=>{const response=await request(app).get('/api/health');expect(response.status).toBe(200);expect(response.body.status).toBe('ok');expect(response.headers['x-powered-by']).toBeUndefined();});});

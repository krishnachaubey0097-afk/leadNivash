import { describe, it, expect } from 'vitest';
import { app } from '../src/app.js';

describe('Trust Proxy Configuration', () => {
  it('has trust proxy configured on express app', () => {
    const trustProxy = app.get('trust proxy');
    expect(trustProxy).toBeDefined();
    expect(trustProxy).not.toBeUndefined();
  });
});


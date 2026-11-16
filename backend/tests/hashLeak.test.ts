import { describe, it, expect } from 'vitest';
import { User } from '../src/modules/users/user.model.js';

describe('Hash & Secret Leakage Prevention', () => {
  it('strips passwordHash and refreshTokenHash in User toJSON transform', () => {
    const userDoc = new User({
      name: 'Rajesh',
      email: 'rajesh@example.com',
      passwordHash: '$2a$12$hashedpasswordthatmustneverleak',
      phone: '+919876543210',
      consent: { termsAcceptedAt: new Date(), privacyVersion: '1.0' },
      sessions: [
        {
          sessionId: 'sess_1',
          refreshTokenHash: '$2a$10$hashedsecretthatmustneverleak',
          previousTokenHash: '$2a$10$previoussecretthatmustneverleak',
          previousHashExpiresAt: new Date(),
          expiresAt: new Date(),
        },
      ],
    });

    const json: any = userDoc.toJSON();

    expect(json.passwordHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.sessions?.[0]?.refreshTokenHash).toBeUndefined();
    expect(json.sessions?.[0]?.previousTokenHash).toBeUndefined();
    expect(json.sessions?.[0]?.previousHashExpiresAt).toBeUndefined();
  });
});

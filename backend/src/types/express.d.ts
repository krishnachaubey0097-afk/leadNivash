export interface AuthenticatedUserPayload {
  _id: string;
  email: string;
  role: 'user' | 'admin';
  sessionId: string;
  plan?: {
    tier: 'trial' | 'lite' | 'pro';
    trialEndsAt?: Date;
    expiresAt?: Date;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

export {};

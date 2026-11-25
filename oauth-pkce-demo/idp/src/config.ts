export const PORT = Number(process.env.PORT ?? 4000);
export const ISSUER = process.env.ISSUER ?? `http://localhost:${PORT}`;
export const API_AUDIENCE = 'demo-api';

// Lifetimes (seconds). Set ACCESS_TOKEN_TTL=20 to watch refresh-token rotation happen quickly.
export const CODE_TTL = Number(process.env.CODE_TTL ?? 60);
export const ACCESS_TOKEN_TTL = Number(process.env.ACCESS_TOKEN_TTL ?? 300);
export const REFRESH_TOKEN_TTL = Number(process.env.REFRESH_TOKEN_TTL ?? 3600);

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Read your name',
  email: 'Read your email address',
  offline_access: 'Stay signed in (issue a refresh token)',
};
export const ALLOWED_SCOPES = Object.keys(SCOPE_DESCRIPTIONS);

export interface ClientConfig {
  id: string;
  name: string;
  redirectUris: string[];
}

// A *public* client: no client secret. PKCE is what protects the code exchange.
export const clients = new Map<string, ClientConfig>([
  [
    'demo-client',
    {
      id: 'demo-client',
      name: 'Demo Client App',
      redirectUris: [process.env.CLIENT_REDIRECT_URI ?? 'http://localhost:3000/callback'],
    },
  ],
]);

export interface User {
  id: string;
  username: string;
  password: string; // plain text: DEMO ONLY. Use a password hash (argon2/bcrypt) in real systems.
  name: string;
  email: string;
}

export const users: User[] = [
  { id: 'u-1001', username: 'alice', password: 'wonderland', name: 'Alice Liddell', email: 'alice@example.com' },
  { id: 'u-1002', username: 'bob', password: 'builder', name: 'Bob Builder', email: 'bob@example.com' },
];

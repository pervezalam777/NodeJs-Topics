export const PORT = Number(process.env.PORT ?? 3000);
export const IDP_URL = process.env.IDP_URL ?? 'http://localhost:4000';
export const CLIENT_ID = process.env.CLIENT_ID ?? 'demo-client';
export const REDIRECT_URI = process.env.REDIRECT_URI ?? `http://localhost:${PORT}/callback`;
export const SCOPE = process.env.SCOPE ?? 'openid profile email offline_access';

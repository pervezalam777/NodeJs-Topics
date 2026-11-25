import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, type User } from '../lib/api';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadProfile() {
    try {
      // If the 15-min access token has expired, api() transparently refreshes it and retries.
      const d = await api<{ user: User }>('/me');
      setProfile(d.user);
      setMsg(null);
    } catch {
      setMsg('Could not load profile');
    }
  }

  async function logoutAll() {
    await api('/auth/logout-all', { method: 'POST' });
    await logout();
    navigate('/login');
  }

  return (
    <div className="card">
      <h1>Welcome, {user?.name} 👋</h1>
      <p className="muted">{user?.email}</p>

      <div className="row">
        <button onClick={loadProfile}>Fetch protected /api/me</button>
        <button className="secondary" onClick={async () => { await logout(); navigate('/login'); }}>
          Log out
        </button>
        <button className="secondary" onClick={logoutAll}>Log out everywhere</button>
      </div>

      {msg && <p className="error">{msg}</p>}
      {profile && <pre>{JSON.stringify(profile, null, 2)}</pre>}
    </div>
  );
}

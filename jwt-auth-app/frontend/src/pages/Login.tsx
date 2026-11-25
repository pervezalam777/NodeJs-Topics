import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  if (user) return <Navigate to="/" replace />;

  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={async ({ email, password }) => {
        await login(email, password);
        navigate(from, { replace: true });
      }}
      footer={<>No account? <Link to="/register">Create one</Link></>}
    />
  );
}

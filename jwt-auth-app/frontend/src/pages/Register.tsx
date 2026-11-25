import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  return (
    <AuthForm
      title="Create account"
      submitLabel="Register"
      withName
      onSubmit={async ({ name, email, password }) => {
        await register(name, email, password);
        navigate('/', { replace: true });
      }}
      footer={<>Already registered? <Link to="/login">Sign in</Link></>}
    />
  );
}

import { useState } from 'react';
import { login, requestAccess, setupPassword } from '../services/metricsApi';

const AuthScreen = ({ onAuthenticated }) => {
  const [tab, setTab] = useState('login');
  const [status, setStatus] = useState({ loading: false, message: '', error: '' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [requestForm, setRequestForm] = useState({ username: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ username: '', email: '', password: '' });

  const runAction = async (action) => {
    setStatus({ loading: true, message: '', error: '' });
    try {
      await action();
      setStatus({ loading: false, message: 'Success.', error: '' });
    } catch (error) {
      setStatus({ loading: false, message: '', error: error?.message || 'Action failed.' });
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      const output = await login(loginForm);
      window.localStorage.setItem('ddex_auth_token', output.token);
      onAuthenticated(output.user);
    });
  };

  const handleAccessRequest = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      const output = await requestAccess(requestForm);
      setStatus({ loading: false, message: output.message || 'Request submitted.', error: '' });
    });
  };

  const handlePasswordSetup = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      const output = await setupPassword(passwordForm);
      setStatus({ loading: false, message: output.message || 'Password setup completed.', error: '' });
    });
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>DDEX Report Portal</h1>
        <p className="auth-subtitle">Secure login with admin approval</p>

        <div className="auth-tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>Login</button>
          <button className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>Request Access</button>
          <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>Setup Password</button>
        </div>

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <label>Username</label>
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
            <label>Password</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
            <button disabled={status.loading} type="submit">{status.loading ? 'Please wait...' : 'Login'}</button>
          </form>
        )}

        {tab === 'request' && (
          <form onSubmit={handleAccessRequest} className="auth-form">
            <label>Username</label>
            <input
              value={requestForm.username}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
            <label>Email</label>
            <input
              type="email"
              value={requestForm.email}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <button disabled={status.loading} type="submit">{status.loading ? 'Please wait...' : 'Submit Request'}</button>
          </form>
        )}

        {tab === 'setup' && (
          <form onSubmit={handlePasswordSetup} className="auth-form">
            <label>Username</label>
            <input
              value={passwordForm.username}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
            <label>Email</label>
            <input
              type="email"
              value={passwordForm.email}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <label>New Password</label>
            <input
              type="password"
              minLength={6}
              value={passwordForm.password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
            <button disabled={status.loading} type="submit">{status.loading ? 'Please wait...' : 'Set Password'}</button>
          </form>
        )}

        {status.message ? <p className="auth-message success">{status.message}</p> : null}
        {status.error ? <p className="auth-message error">{status.error}</p> : null}
      </div>
    </div>
  );
};

export default AuthScreen;

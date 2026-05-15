import { useState } from 'react';
import { User, Lock, Mail, KeyRound, Loader2, ArrowRight } from 'lucide-react';
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
        <div className="auth-logo-container">
          <img src="/hungama_logo.png" alt="Hungama" className="auth-logo" />
        </div>
        <div className="auth-header">
          <h1>DDEX Report Portal</h1>
        </div>

        <div className="auth-tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>Login</button>
          <button className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>Request Access</button>
          <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>Setup Password</button>
        </div>

        <div className="auth-body">
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-input-group">
                <label><User size={14} /> Username</label>
                <div className="input-wrapper">
                  <User className="field-icon" size={18} />
                  <input
                    placeholder="Enter your username"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="auth-input-group">
                <label><Lock size={14} /> Password</label>
                <div className="input-wrapper">
                  <Lock className="field-icon" size={18} />
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <button disabled={status.loading} type="submit" className="auth-submit-btn">
                {status.loading ? <Loader2 className="animate-spin" /> : <>Login <ArrowRight size={18} /></>}
              </button>
            </form>
          )}

          {tab === 'request' && (
            <form onSubmit={handleAccessRequest} className="auth-form">
              <div className="auth-input-group">
                <label><User size={14} /> Username</label>
                <div className="input-wrapper">
                  <User className="field-icon" size={18} />
                  <input
                    placeholder="Preferred username"
                    value={requestForm.username}
                    onChange={(event) => setRequestForm((prev) => ({ ...prev, username: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="auth-input-group">
                <label><Mail size={14} /> Email</label>
                <div className="input-wrapper">
                  <Mail className="field-icon" size={18} />
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={requestForm.email}
                    onChange={(event) => setRequestForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <button disabled={status.loading} type="submit" className="auth-submit-btn">
                {status.loading ? <Loader2 className="animate-spin" /> : <>Request Access <ArrowRight size={18} /></>}
              </button>
            </form>
          )}

          {tab === 'setup' && (
            <form onSubmit={handlePasswordSetup} className="auth-form">
              <div className="auth-input-group">
                <label><User size={14} /> Username</label>
                <div className="input-wrapper">
                  <User className="field-icon" size={18} />
                  <input
                    placeholder="Enter your username"
                    value={passwordForm.username}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, username: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="auth-input-group">
                <label><Mail size={14} /> Email</label>
                <div className="input-wrapper">
                  <Mail className="field-icon" size={18} />
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={passwordForm.email}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="auth-input-group">
                <label><KeyRound size={14} /> New Password</label>
                <div className="input-wrapper">
                  <KeyRound className="field-icon" size={18} />
                  <input
                    type="password"
                    placeholder="Min 6 characters"
                    minLength={6}
                    value={passwordForm.password}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, password: event.target.value }))}
                    required
                  />
                </div>
              </div>
              <button disabled={status.loading} type="submit" className="auth-submit-btn">
                {status.loading ? <Loader2 className="animate-spin" /> : <>Set Password <ArrowRight size={18} /></>}
              </button>
            </form>
          )}
        </div>

        {status.message || status.error ? (
          <div className={`auth-feedback ${status.error ? 'error' : 'success'}`}>
            {status.error || status.message}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AuthScreen;

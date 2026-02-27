import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!username.trim()) return setError('Введите имя пользователя');
        await register(username.trim(), email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 400 }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '2rem', color: '#3455eb' }}>
            BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
          </div>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3', letterSpacing: '0.2em', marginTop: '0.25rem' }}>
            СОЗДАЙТЕ ПРОФИЛЬ
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #262626', marginBottom: '2rem' }}>
          {[
            { id: 'login', label: 'ВОЙТИ' },
            { id: 'register', label: 'РЕГИСТРАЦИЯ' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setMode(tab.id); setError(''); }}
              data-testid={`auth-tab-${tab.id}`}
              style={{
                flex: 1, padding: '0.875rem', background: 'none', border: 'none',
                borderBottom: `2px solid ${mode === tab.id ? '#3455eb' : 'transparent'}`,
                color: mode === tab.id ? '#3455eb' : '#A3A3A3',
                fontFamily: 'Space Mono', fontSize: '0.7rem', textTransform: 'uppercase',
                letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 0.2s',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          >
            {mode === 'register' && (
              <div>
                <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                  ИМЯ ПОЛЬЗОВАТЕЛЯ
                </label>
                <input
                  className="bb-input"
                  type="text"
                  placeholder="Ваш никнейм"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  data-testid="input-username"
                  maxLength={20}
                />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                EMAIL
              </label>
              <input
                className="bb-input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                data-testid="input-email"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                ПАРОЛЬ
              </label>
              <input
                className="bb-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                data-testid="input-password"
                minLength={6}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ color: '#FF3366', fontFamily: 'Space Mono', fontSize: '0.75rem', padding: '0.75rem', border: '1px solid rgba(255,51,102,0.3)', background: 'rgba(255,51,102,0.05)' }}
                data-testid="auth-error"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              className="bb-btn bb-btn-primary"
              disabled={loading}
              data-testid="btn-auth-submit"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'ЗАГРУЗКА...' : mode === 'login' ? 'ВОЙТИ →' : 'СОЗДАТЬ АККАУНТ →'}
            </button>

            {mode === 'register' && (
              <p style={{ color: '#A3A3A3', fontSize: '0.65rem', fontFamily: 'Space Mono', textAlign: 'center', margin: 0 }}>
                Регистрация не обязательна для игры.<br />
                Профиль нужен для рейтинга.
              </p>
            )}
          </motion.form>
        </AnimatePresence>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button className="bb-btn" onClick={() => navigate('/')} data-testid="btn-back-home" style={{ fontSize: '0.65rem' }}>
            ← НА ГЛАВНУЮ БЕЗ ВХОДА
          </button>
        </div>
      </motion.div>
    </div>
  );
}

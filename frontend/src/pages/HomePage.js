import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { API, storage, STORAGE_KEYS, DIFFICULTY_LABELS, MODE_LABELS } from '../utils';
import axios from 'axios';

// Sound effects
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'click') {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
};

// Logo 3D component
function Logo3D() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
      <div className="logo-3d">BB</div>
      <div>
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(1.1rem, 4vw, 1.75rem)', lineHeight: 1, color: '#3455eb' }}>
          BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
        </div>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.55rem', color: '#A3A3A3', letterSpacing: '0.15em' }}>
          QUIZBATTLE
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { joinGame, rejoin, clearGame } = useGame();
  
  const [mode, setMode] = useState('join'); // join | create | auth
  const [pin, setPin] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRejoin, setShowRejoin] = useState(false);
  const [savedSession, setSavedSession] = useState(null);

  // Create game state
  const [topic, setTopic] = useState('');
  const [numQ, setNumQ] = useState(7);
  const [difficulty, setDifficulty] = useState('medium');
  const [gameMode, setGameMode] = useState('teams');
  const [gamePassword, setGamePassword] = useState('');
  const [timePerQ, setTimePerQ] = useState(30);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Check for existing session
  useEffect(() => {
    const gameId = storage.get(STORAGE_KEYS.GAME_ID);
    const pId = storage.get(STORAGE_KEYS.PLAYER_ID);
    const pName = storage.get(STORAGE_KEYS.PLAYER_NAME);
    const savedPin = storage.get(STORAGE_KEYS.PIN);
    if (gameId && pId) {
      setSavedSession({ gameId, playerId: pId, playerName: pName, pin: savedPin });
      setShowRejoin(true);
    }
    // Prefill name
    if (user) setPlayerName(user.username);
    else if (pName) setPlayerName(pName);
  }, [user]);

  const handleRejoin = async () => {
    setLoading(true);
    try {
      const result = await rejoin();
      if (result) {
        const { game } = result;
        if (game.state === 'finished') {
          navigate(`/results/${game.id}`);
        } else if (game.state === 'waiting') {
          navigate(`/lobby/${game.pin}`);
        } else {
          navigate(`/game/${game.id}`);
        }
      } else {
        setShowRejoin(false);
        setSavedSession(null);
      }
    } catch {
      setShowRejoin(false);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!pin.trim()) return setError('Введите PIN код');
    if (!playerName.trim()) return setError('Введите ваше имя');
    
    setError('');
    setLoading(true);
    playSound('click');
    
    try {
      const userId = user?.id;
      const result = await joinGame(pin.toUpperCase(), playerName.trim(), roomPassword, userId);
      navigate(`/lobby/${result.game.pin}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return setError('Введите тему викторины');
    
    setError('');
    setLoading(true);
    playSound('click');
    
    try {
      const headers = user ? { Authorization: `Bearer ${storage.get(STORAGE_KEYS.TOKEN)}` } : {};
      const res = await axios.post(`${API}/games/create`, {
        topic: topic.trim(),
        num_questions: numQ,
        difficulty,
        mode: gameMode,
        password: gamePassword || undefined,
        time_per_question: timePerQ,
      }, { headers });

      const { game_id, pin: newPin, host_id } = res.data;
      
      storage.set(STORAGE_KEYS.GAME_ID, game_id);
      storage.set(STORAGE_KEYS.PLAYER_ID, host_id);
      storage.set(STORAGE_KEYS.PLAYER_NAME, user?.username || 'Ведущий');
      storage.set(STORAGE_KEYS.PIN, newPin);

      // Connect to the game via context
      const { connectWS, setPlayerId, setPlayerName: setCtxName } = window.__gameCtx || {};
      
      playSound('success');
      navigate(`/lobby/${newPin}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания игры');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="noise" style={{ minHeight: '100vh', background: '#050505', position: 'relative', overflow: 'hidden' }}>
      {/* Grid background */}
      <div className="grid-bg" style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.3 }} />
      
      {/* Floating accent shapes */}
      <div style={{
        position: 'absolute', top: '10%', right: '5%',
        width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(204,255,0,0.06) 0%, transparent 70%)',
        borderRadius: '50%', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', left: '3%',
        width: 250, height: 250,
        background: 'radial-gradient(circle, rgba(255,51,102,0.05) 0%, transparent 70%)',
        borderRadius: '50%', zIndex: 0,
      }} />

      {/* Nav */}
      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', borderBottom: '1px solid #1a1a1a' }}>
        <Logo3D />
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="bb-btn" onClick={() => navigate('/leaderboard')} data-testid="nav-leaderboard">
            РЕЙТИНГ
          </button>
          {user ? (
            <>
              <button className="bb-btn" onClick={() => navigate('/profile')} data-testid="nav-profile">
                {user.username}
              </button>
              <button className="bb-btn bb-btn-red" onClick={logout} data-testid="nav-logout">ВЫЙТИ</button>
            </>
          ) : (
            <button className="bb-btn bb-btn-primary" onClick={() => navigate('/auth')} data-testid="nav-auth">ВОЙТИ</button>
          )}
        </div>
      </nav>

      {/* Rejoin banner */}
      <AnimatePresence>
        {showRejoin && savedSession && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'relative', zIndex: 10,
              background: 'rgba(204,255,0,0.1)',
              border: '1px solid rgba(204,255,0,0.3)',
              padding: '0.75rem 2rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '0.5rem',
            }}
          >
            <span style={{ fontFamily: 'Space Mono', fontSize: '0.75rem', color: '#A3A3A3' }}>
              Обнаружена активная игра с PIN <span style={{ color: '#CCFF00' }}>{savedSession.pin}</span>
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="bb-btn bb-btn-primary" onClick={handleRejoin} data-testid="btn-rejoin" disabled={loading} style={{ padding: '0.5rem 1rem', fontSize: '0.65rem' }}>
                ВЕРНУТЬСЯ В ИГРУ
              </button>
              <button className="bb-btn bb-btn-red" onClick={() => { clearGame(); setShowRejoin(false); }} style={{ padding: '0.5rem 1rem', fontSize: '0.65rem' }}>
                ВЫЙТИ ИЗ ИГРЫ
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem' }}>
        
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <div className="bb-badge" style={{ marginBottom: '1.5rem' }}>КОМАНДНЫЙ КВИЗ В РЕАЛЬНОМ ВРЕМЕНИ</div>
          <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)', margin: '0 0 1rem', lineHeight: 1 }}>
            УМНЕЕ?<br />
            <span style={{ color: '#CCFF00' }}>ДОКАЖИ.</span>
          </h1>
          <p style={{ color: '#A3A3A3', fontSize: '0.9rem', maxWidth: 500, margin: '0 auto', lineHeight: 1.8 }}>
            Создай игру, отправь PIN друзьям и соревнуйся в реальном времени.<br />
            AI генерирует вопросы по любой теме.
          </p>
        </motion.div>

        {/* Mode tabs + Form */}
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', marginBottom: '2rem', borderBottom: '1px solid #262626' }}>
            {[
              { id: 'join', label: 'ВОЙТИ В ИГРУ' },
              { id: 'create', label: 'СОЗДАТЬ ИГРУ' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setMode(tab.id); setError(''); }}
                data-testid={`tab-${tab.id}`}
                style={{
                  flex: 1, padding: '0.875rem', background: 'none', border: 'none',
                  borderBottom: `2px solid ${mode === tab.id ? '#CCFF00' : 'transparent'}`,
                  color: mode === tab.id ? '#CCFF00' : '#A3A3A3',
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
            {mode === 'join' ? (
              <motion.form
                key="join"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleJoin}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
              >
                <div>
                  <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                    PIN КОД ИГРЫ
                  </label>
                  <input
                    className="bb-input"
                    type="text"
                    placeholder="НАПРИМЕР: AB1234"
                    value={pin}
                    onChange={e => setPin(e.target.value.toUpperCase())}
                    maxLength={6}
                    data-testid="input-pin"
                    style={{ fontSize: '1.5rem', letterSpacing: '0.3em', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                    ВАШЕ ИМЯ
                  </label>
                  <input
                    className="bb-input"
                    type="text"
                    placeholder="Введите имя..."
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    maxLength={20}
                    data-testid="input-player-name"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                    ПАРОЛЬ КОМНАТЫ (если есть)
                  </label>
                  <input
                    className="bb-input"
                    type="password"
                    placeholder="Оставьте пустым если нет пароля"
                    value={roomPassword}
                    onChange={e => setRoomPassword(e.target.value)}
                    data-testid="input-room-password"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ color: '#FF3366', fontFamily: 'Space Mono', fontSize: '0.75rem', padding: '0.75rem', border: '1px solid rgba(255,51,102,0.3)', background: 'rgba(255,51,102,0.05)' }}
                    data-testid="error-msg"
                  >
                    {error}
                  </motion.div>
                )}

                <button type="submit" className="bb-btn bb-btn-primary" disabled={loading} data-testid="btn-join-game" style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? 'ПОДКЛЮЧЕНИЕ...' : 'ВОЙТИ В ИГРУ →'}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="create"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleCreate}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                <div>
                  <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                    ТЕМА ВИКТОРИНЫ
                  </label>
                  <input
                    className="bb-input"
                    type="text"
                    placeholder="Наука, история, технологии..."
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    data-testid="input-topic"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                      ВОПРОСОВ НА КОМАНДУ
                    </label>
                    <select
                      className="bb-input"
                      value={numQ}
                      onChange={e => setNumQ(parseInt(e.target.value))}
                      data-testid="select-num-questions"
                      style={{ appearance: 'none', cursor: 'pointer' }}
                    >
                      <option value={5}>5 вопросов</option>
                      <option value={6}>6 вопросов</option>
                      <option value={7}>7 вопросов</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                      СЛОЖНОСТЬ
                    </label>
                    <select
                      className="bb-input"
                      value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
                      data-testid="select-difficulty"
                      style={{ appearance: 'none', cursor: 'pointer' }}
                    >
                      <option value="easy">Лёгкий</option>
                      <option value="medium">Средний</option>
                      <option value="hard">Сложный</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>
                    РЕЖИМ ИГРЫ
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {[
                      { id: 'teams', label: 'КОМАНДНЫЙ', desc: '2 команды' },
                      { id: 'ffa', label: 'КАЖДЫЙ ЗА СЕБЯ', desc: 'Свободная игра' },
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setGameMode(m.id)}
                        data-testid={`mode-${m.id}`}
                        style={{
                          padding: '0.75rem', border: `1px solid ${gameMode === m.id ? '#CCFF00' : '#262626'}`,
                          background: gameMode === m.id ? 'rgba(204,255,0,0.1)' : '#0A0A0A',
                          color: gameMode === m.id ? '#CCFF00' : '#A3A3A3',
                          cursor: 'pointer', fontFamily: 'Space Mono', fontSize: '0.65rem',
                          textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'all 0.2s',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{m.label}</div>
                        <div style={{ fontSize: '0.6rem', opacity: 0.7, marginTop: '0.25rem' }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced settings toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{ background: 'none', border: 'none', color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                >
                  {showAdvanced ? '▲' : '▼'} ДОП. НАСТРОЙКИ
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1rem' }}
                    >
                      <div>
                        <label style={{ display: 'block', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                          ПАРОЛЬ КОМНАТЫ (необязательно)
                        </label>
                        <input
                          className="bb-input"
                          type="text"
                          placeholder="Оставьте пустым для открытой комнаты"
                          value={gamePassword}
                          onChange={e => setGamePassword(e.target.value)}
                          data-testid="input-game-password"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                          <span>ВРЕМЯ НА ВОПРОС</span>
                          <span style={{ color: '#CCFF00' }}>{timePerQ}с</span>
                        </label>
                        <input
                          type="range"
                          min={15} max={60} step={5}
                          value={timePerQ}
                          onChange={e => setTimePerQ(parseInt(e.target.value))}
                          data-testid="range-time"
                          style={{ width: '100%', accentColor: '#CCFF00' }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ color: '#FF3366', fontFamily: 'Space Mono', fontSize: '0.75rem', padding: '0.75rem', border: '1px solid rgba(255,51,102,0.3)', background: 'rgba(255,51,102,0.05)' }}
                    data-testid="error-msg"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={loading}
                  data-testid="btn-create-game"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {loading ? 'ГЕНЕРАЦИЯ ВОПРОСОВ AI...' : 'СОЗДАТЬ ИГРУ →'}
                </button>
                
                <p style={{ color: '#A3A3A3', fontSize: '0.65rem', fontFamily: 'Space Mono', textAlign: 'center', margin: 0 }}>
                  AI автоматически генерирует вопросы по теме
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1px', 
            marginTop: '5rem',
            border: '1px solid #1a1a1a',
            background: '#1a1a1a',
          }}
        >
          {[
            { icon: '⚡', title: 'РЕАЛЬНОЕ ВРЕМЯ', desc: 'WebSocket синхронизация всех участников' },
            { icon: '🤖', title: 'AI ВОПРОСЫ', desc: 'GPT-4o генерирует уникальные вопросы' },
            { icon: '🏆', title: 'РЕЙТИНГ', desc: 'Набирай очки и поднимайся в таблице' },
            { icon: '📱', title: 'ЛЮБОЕ УСТРОЙСТВО', desc: 'Телефон, планшет, компьютер' },
          ].map((f, i) => (
            <div key={i} className="bb-card" style={{ padding: '1.5rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <div style={{ fontFamily: 'Syne', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{f.title}</div>
              <div style={{ color: '#A3A3A3', fontSize: '0.75rem', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

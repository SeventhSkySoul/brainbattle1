import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API } from '../utils';
import axios from 'axios';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    setLoading(true);
    axios.get(`${API}/user/${user.id}/history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setHistory(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const winRate = user.games_played > 0
    ? Math.round((user.wins / user.games_played) * 100)
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: '2rem 1.5rem', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1rem', color: '#3455eb' }}>
          BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="bb-btn" onClick={() => navigate('/')} data-testid="btn-home">← ГЛАВНАЯ</button>
          <button className="bb-btn bb-btn-red" onClick={() => { logout(); navigate('/'); }} data-testid="btn-logout">ВЫЙТИ</button>
        </div>
      </div>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: '2rem', border: '1px solid #262626', background: '#0A0A0A', marginBottom: '2rem' }}
      >
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            width: 72, height: 72,
            border: '2px solid #3455eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne', fontWeight: 900, fontSize: '2rem', color: '#3455eb',
            flexShrink: 0,
          }}>
            {user.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'Syne', fontSize: '1.5rem', fontWeight: 900 }} data-testid="profile-username">
              {user.username}
            </div>
            <div style={{ fontFamily: 'Space Mono', fontSize: '0.7rem', color: '#A3A3A3' }}>{user.email}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
          {[
            { label: 'РЕЙТИНГ', value: user.rating, color: '#FFD600' },
            { label: 'ИГР СЫГРАНО', value: user.games_played, color: '#3455eb' },
            { label: 'ПОБЕД', value: user.wins, color: '#00F0FF' },
            { label: 'ПРОЦЕНТ ПОБЕД', value: `${winRate}%`, color: '#FF3366' },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '1rem', border: '1px solid #1f1f1f' }}>
              <div style={{ fontFamily: 'Syne', fontSize: '1.75rem', fontWeight: 900, color: stat.color }}
                data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                {stat.value}
              </div>
              <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3', marginTop: '0.25rem' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Game history */}
      <div>
        <div style={{ fontFamily: 'Syne', fontSize: '0.8rem', fontWeight: 800, color: '#A3A3A3', marginBottom: '1rem', borderBottom: '1px solid #1a1a1a', paddingBottom: '0.5rem' }}>
          ИСТОРИЯ ИГР
        </div>
        {loading ? (
          <div style={{ color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>
            ЗАГРУЗКА...
          </div>
        ) : history.length === 0 ? (
          <div style={{ color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>
            Нет сыгранных игр
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map((game, i) => {
              const myPlayer = game.players?.find(p => p.id === user.id);
              const won = (game.mode === 'teams' && myPlayer?.team === game.winner) ||
                         (game.mode === 'ffa' && game.winner === user.id);
              return (
                <div
                  key={i}
                  style={{
                    padding: '0.875rem 1rem',
                    border: `1px solid ${won ? 'rgba(204,255,0,0.3)' : '#1f1f1f'}`,
                    background: won ? 'rgba(204,255,0,0.03)' : '#0A0A0A',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: '0.5rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/results/${game.game_id}`)}
                  data-testid={`history-item-${i}`}
                >
                  <div>
                    <div style={{ fontFamily: 'Space Mono', fontSize: '0.75rem', fontWeight: 700 }}>{game.topic}</div>
                    <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
                      {game.mode === 'teams' ? 'КОМАНДНЫЙ' : 'КАЖДЫЙ ЗА СЕБЯ'} · {game.difficulty}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'Space Mono', fontSize: '0.7rem', color: '#A3A3A3' }}>
                      Очки: <span style={{ color: '#3455eb' }}>{myPlayer?.score || 0}</span>
                    </div>
                    <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: won ? '#3455eb' : '#FF3366', fontWeight: 700 }}>
                      {won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button className="bb-btn bb-btn-primary" onClick={() => navigate('/')} data-testid="btn-play">
          ИГРАТЬ →
        </button>
      </div>
    </div>
  );
}

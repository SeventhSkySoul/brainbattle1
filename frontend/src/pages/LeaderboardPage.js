import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { API } from '../utils';
import axios from 'axios';

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/leaderboard`)
      .then(res => setUsers(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: '2rem 1.5rem', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1rem', color: '#3455eb', marginBottom: '0.25rem' }}>
            BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>РЕЙТИНГ</h1>
        </div>
        <button className="bb-btn" onClick={() => navigate('/')} data-testid="btn-back">
          ← НАЗАД
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#A3A3A3', fontFamily: 'Space Mono', padding: '3rem' }}>
          ЗАГРУЗКА...
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Пока нет зарегистрированных игроков
          </div>
          <button className="bb-btn bb-btn-primary" onClick={() => navigate('/auth')} data-testid="btn-register">
            ЗАРЕГИСТРИРОВАТЬСЯ
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {users.map((user, i) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: i === 0 ? '1.25rem' : '0.875rem 1rem',
                border: `1px solid ${i === 0 ? '#FFD600' : i === 1 ? '#A3A3A3' : i === 2 ? '#FF6B35' : '#1f1f1f'}`,
                background: i === 0 ? 'rgba(255,214,0,0.05)' : '#0A0A0A',
                transition: 'border-color 0.2s',
              }}
              data-testid={`leaderboard-row-${i}`}
            >
              <div style={{
                fontFamily: 'Syne', fontWeight: 900,
                fontSize: i < 3 ? '1.5rem' : '1rem',
                color: i === 0 ? '#FFD600' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#A3A3A3',
                minWidth: 40, textAlign: 'center',
              }}>
                {i === 0 ? '1' : i === 1 ? '2' : i === 2 ? '3' : `#${i + 1}`}
              </div>
              <div style={{
                width: 40, height: 40,
                border: '1px solid #262626',
                background: '#0A0A0A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Syne', fontWeight: 800, fontSize: '1rem',
                color: '#3455eb', flexShrink: 0,
              }}>
                {user.username?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Space Mono', fontWeight: 700, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.username}
                </div>
                <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
                  {user.games_played} игр · {user.wins} побед
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'Syne', fontSize: '1.25rem', fontWeight: 900, color: '#3455eb' }}>
                  {user.rating}
                </div>
                <div style={{ fontFamily: 'Space Mono', fontSize: '0.55rem', color: '#A3A3A3' }}>РЕЙТИНГ</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

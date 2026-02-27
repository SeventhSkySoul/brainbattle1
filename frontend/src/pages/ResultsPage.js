import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { API, getTeamColors, storage, STORAGE_KEYS } from '../utils';
import axios from 'axios';

function StatBar({ value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 6, background: '#1a1a1a', borderRadius: 0, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
        style={{ height: '100%', background: color }}
      />
    </div>
  );
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const { clearGame } = useGame();
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Try active games first, then history
        let res;
        try {
          res = await axios.get(`${API}/games/id/${gameId}`);
        } catch {
          res = await axios.get(`${API}/games/${gameId}/stats`);
        }
        setGameData(res.data);
      } catch {
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [gameId]);

  const handleExport = async () => {
    try {
      const res = await axios.get(`${API}/games/${gameId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brainbattle_${gameId.slice(0, 8)}_results.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Не удалось экспортировать');
    }
  };

  const handleNewGame = () => {
    clearGame();
    navigate('/');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', color: '#A3A3A3' }}>ЗАГРУЗКА РЕЗУЛЬТАТОВ...</div>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ color: '#FF3366', fontFamily: 'Space Mono' }}>Результаты не найдены</div>
        <button className="bb-btn" onClick={handleNewGame}>НА ГЛАВНУЮ</button>
      </div>
    );
  }

  const winner = gameData.winner;
  const isTeams = gameData.mode === 'teams';
  const players = gameData.players || [];
  const scores = gameData.scores || { A: 0, B: 0 };
  const history = gameData.round_history || [];
  
  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const maxScore = sortedPlayers[0]?.score || 1;

  // Winner text
  let winnerText = '';
  let winnerColor = '#3455eb';
  if (isTeams) {
    if (winner === 'draw') winnerText = 'НИЧЬЯ!';
    else {
      winnerText = `ПОБЕДА КОМАНДЫ ${winner === 'A' ? 'А' : 'Б'}!`;
      winnerColor = winner === 'A' ? '#FF6B35' : '#00B4D8';
    }
  } else {
    const winPlayer = players.find(p => p.id === winner);
    winnerText = winPlayer ? `ПОБЕДИТЕЛЬ: ${winPlayer.name}!` : 'НИЧЬЯ!';
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', marginBottom: '3rem' }}
      >
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1rem', color: '#A3A3A3', letterSpacing: '0.3em', marginBottom: '0.5rem' }}>
          ИГРА ЗАВЕРШЕНА
        </div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(1.75rem, 5vw, 3rem)', color: winnerColor }}
          data-testid="winner-text"
        >
          {winnerText}
        </motion.div>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.7rem', color: '#A3A3A3', marginTop: '0.75rem' }}>
          ТЕМА: {gameData.topic} | {gameData.difficulty?.toUpperCase()} | {gameData.mode === 'teams' ? 'КОМАНДНЫЙ' : 'КАЖДЫЙ ЗА СЕБЯ'}
        </div>
      </motion.div>

      {/* Score summary (teams) */}
      {isTeams && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '3rem', flexWrap: 'wrap' }}
        >
          {['A', 'B'].map(team => (
            <div
              key={team}
              style={{
                textAlign: 'center', padding: '2rem 3rem',
                border: `2px solid ${winner === team ? TEAM_COLORS[team].text : '#1f1f1f'}`,
                background: winner === team ? `rgba(${team === 'A' ? '255,107,53' : '0,180,216'},0.1)` : '#0A0A0A',
                flex: '1', minWidth: 150, maxWidth: 250,
              }}
              data-testid={`team-${team}-final-score`}
            >
              <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: TEAM_COLORS[team].text, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                КОМАНДА {team === 'A' ? 'А' : 'Б'}
              </div>
              <div style={{ fontFamily: 'Syne', fontSize: '3.5rem', fontWeight: 900, color: winner === team ? TEAM_COLORS[team].text : '#A3A3A3', lineHeight: 1 }}>
                {scores[team]}
              </div>
              <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3', marginTop: '0.25rem' }}>
                ОЧКОВ
              </div>
              {winner === team && (
                <div style={{ marginTop: '0.5rem', fontFamily: 'Space Mono', fontSize: '0.6rem', color: TEAM_COLORS[team].text }}>
                  ПОБЕДИТЕЛИ
                </div>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {/* Player stats */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontFamily: 'Syne', fontSize: '0.8rem', fontWeight: 800, color: '#A3A3A3', marginBottom: '1rem', borderBottom: '1px solid #1a1a1a', paddingBottom: '0.5rem' }}>
          СТАТИСТИКА ИГРОКОВ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sortedPlayers.map((player, i) => {
            const teamColor = isTeams ? TEAM_COLORS[player.team]?.text : '#3455eb';
            const avgTime = player.answers_count > 0
              ? (player.total_response_time / player.answers_count).toFixed(1)
              : '—';
            
            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  padding: '1rem 1.25rem',
                  border: `1px solid ${i === 0 && !isTeams ? '#3455eb' : '#1f1f1f'}`,
                  background: '#0A0A0A',
                }}
                data-testid={`player-stat-${player.id}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.1rem', color: i === 0 ? '#FFD600' : '#A3A3A3' }}>
                      #{i + 1}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Space Mono', fontSize: '0.8rem', fontWeight: 700 }}>
                        {player.name}
                        {player.is_host && <span style={{ color: '#FFD600', fontSize: '0.6rem', marginLeft: '0.5rem' }}>ВЕДУЩИЙ</span>}
                      </div>
                      {isTeams && (
                        <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: teamColor }}>
                          КОМАНДА {player.team === 'A' ? 'А' : 'Б'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Syne', fontSize: '1.5rem', fontWeight: 900, color: teamColor || '#3455eb' }}>
                    {player.score || 0}
                  </div>
                </div>
                <StatBar value={player.score || 0} max={maxScore} color={teamColor || '#3455eb'} />
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
                    ✓ {player.correct_answers || 0}
                  </span>
                  <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
                    ✗ {player.wrong_answers || 0}
                  </span>
                  <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
                    ⏱ {avgTime}с avg
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Round history */}
      {history.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontFamily: 'Syne', fontSize: '0.8rem', fontWeight: 800, color: '#A3A3A3', marginBottom: '1rem', borderBottom: '1px solid #1a1a1a', paddingBottom: '0.5rem' }}>
            ИСТОРИЯ РАУНДА
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 300, overflowY: 'auto' }}>
            {history.map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: h.is_correct ? 'rgba(204,255,0,0.04)' : 'rgba(255,51,102,0.04)',
                  borderLeft: `2px solid ${h.is_correct ? '#3455eb' : '#FF3366'}`,
                  flexWrap: 'wrap', gap: '0.5rem',
                }}
              >
                <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem' }}>
                  <span style={{ color: '#A3A3A3' }}>Q{h.question_index + 1}</span>
                  {' '}
                  <span style={{ color: isTeams ? TEAM_COLORS[h.team]?.text : '#3455eb' }}>{h.player_name}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
                    {h.response_time?.toFixed(1)}с
                  </span>
                  {h.is_correct ? (
                    <span style={{ color: '#3455eb', fontSize: '0.7rem' }}>+{h.points}</span>
                  ) : (
                    <span style={{ color: '#FF3366', fontSize: '0.7rem' }}>НЕВЕРНО</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="bb-btn bb-btn-primary" onClick={handleNewGame} data-testid="btn-new-game">
          НОВАЯ ИГРА
        </button>
        <button className="bb-btn" onClick={handleExport} data-testid="btn-export">
          СКАЧАТЬ РЕЗУЛЬТАТЫ
        </button>
        <button className="bb-btn" onClick={() => navigate('/leaderboard')} data-testid="btn-leaderboard">
          РЕЙТИНГ
        </button>
      </div>
    </div>
  );
}

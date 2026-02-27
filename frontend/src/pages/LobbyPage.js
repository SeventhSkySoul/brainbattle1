import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { TEAM_COLORS, storage, STORAGE_KEYS, API, DIFFICULTY_LABELS, MODE_LABELS } from '../utils';
import axios from 'axios';

function PlayerCard({ player, isCurrentUser, isHost, teamColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1rem',
        border: `1px solid ${isCurrentUser ? '#3455eb' : '#1f1f1f'}`,
        background: isCurrentUser ? 'rgba(204,255,0,0.05)' : 'transparent',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{
        width: 36, height: 36,
        background: teamColor ? teamColor.bg : 'rgba(255,255,255,0.05)',
        border: `1px solid ${teamColor ? teamColor.border : '#262626'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Syne', fontWeight: 800, fontSize: '0.85rem',
        color: teamColor ? teamColor.text : '#fff',
        flexShrink: 0,
      }}>
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
          {isCurrentUser && <span style={{ color: '#3455eb', marginLeft: '0.5rem', fontSize: '0.6rem' }}>(ВЫ)</span>}
          {isHost && <span style={{ color: '#FFD600', marginLeft: '0.5rem', fontSize: '0.6rem' }}>ВЕДУЩИЙ</span>}
        </div>
      </div>
      {player.disqualified && (
        <span style={{ color: '#FF3366', fontSize: '0.6rem', fontFamily: 'Space Mono' }}>ДИСКВ.</span>
      )}
    </motion.div>
  );
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const { pin } = useParams();
  const { game, setGame, playerId, setPlayerId, setPlayerName, connectWS, startGame, chooseTeam } = useGame();
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const pollingRef = useRef(null);

  const savedPlayerId = storage.get(STORAGE_KEYS.PLAYER_ID);
  const savedGameId = storage.get(STORAGE_KEYS.GAME_ID);
  const currentPlayerId = playerId || savedPlayerId;

  // Load game & connect
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/games/${pin.toUpperCase()}`);
        setGame(res.data);
        const gameId = res.data.id;
        const pId = currentPlayerId;
        if (gameId && pId) {
          connectWS(gameId, pId);
        }
      } catch (err) {
        setError('Игра не найдена');
      }
    };
    load();

    // Polling fallback (every 2s)
    pollingRef.current = setInterval(async () => {
      try {
        const gId = storage.get(STORAGE_KEYS.GAME_ID);
        if (!gId) return;
        const res = await axios.get(`${API}/games/id/${gId}`);
        if (res.data.state === 'in_progress') {
          clearInterval(pollingRef.current);
          navigate(`/game/${res.data.id}`);
        } else {
          setGame(res.data);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(pollingRef.current);
  }, [pin]);

  // Navigate when game starts
  useEffect(() => {
    if (game?.state === 'in_progress') {
      clearInterval(pollingRef.current);
      navigate(`/game/${game.id}`);
    }
    if (game?.state === 'finished') {
      navigate(`/results/${game.id}`);
    }
  }, [game?.state]);

  const handleStart = async () => {
    if (!game || !currentPlayerId) return;
    setLoading(true);
    setError('');
    try {
      await startGame(game.id, currentPlayerId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка запуска');
    } finally {
      setLoading(false);
    }
  };

  const handleChooseTeam = async (team) => {
    if (!game || !currentPlayerId) return;
    try {
      await chooseTeam(game.id, currentPlayerId, team);
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка');
    }
  };

  const copyPin = () => {
    const gameUrl = `${window.location.origin}?pin=${pin}`;
    navigator.clipboard.writeText(gameUrl).catch(() => {
      // Fallback
      const el = document.createElement('textarea');
      el.value = gameUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!game && !error) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', color: '#A3A3A3', fontSize: '0.8rem' }}>ЗАГРУЗКА ЛОББИ...</div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ color: '#FF3366', fontFamily: 'Space Mono' }}>{error}</div>
        <button className="bb-btn" onClick={() => navigate('/')}>НА ГЛАВНУЮ</button>
      </div>
    );
  }

  const isHost = game?.host_id === currentPlayerId;
  const currentPlayer = game?.players?.find(p => p.id === currentPlayerId);
  const currentTeam = currentPlayer?.team;

  const teamAPlayers = game?.players?.filter(p => p.team === 'A') || [];
  const teamBPlayers = game?.players?.filter(p => p.team === 'B') || [];
  const allPlayers = game?.players || [];

  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1.25rem', color: '#3455eb' }}>
          BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {game && (
            <>
              <span className="bb-badge">{DIFFICULTY_LABELS[game.difficulty] || game.difficulty}</span>
              <span className="bb-badge" style={{ borderColor: '#00F0FF', color: '#00F0FF', background: 'rgba(0,240,255,0.08)' }}>
                {MODE_LABELS[game.mode] || game.mode}
              </span>
              <span style={{ fontFamily: 'Space Mono', fontSize: '0.7rem', color: '#A3A3A3' }}>
                ТЕМА: <span style={{ color: '#fff' }}>{game.topic}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* PIN Display */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', marginBottom: '2.5rem' }}
      >
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.75rem' }}>
          PIN КОД ИГРЫ
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem', marginBottom: '1rem' }}>
          {(game?.pin || pin || '').split('').map((char, i) => (
            <div key={i} className="pin-char">{char}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="bb-btn" onClick={copyPin} data-testid="btn-copy-pin" style={{ fontSize: '0.65rem', padding: '0.5rem 1.25rem' }}>
            {copied ? '✓ СКОПИРОВАНО' : 'СКОПИРОВАТЬ ССЫЛКУ'}
          </button>
        </div>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', marginTop: '0.5rem' }}>
          {allPlayers.length} {allPlayers.length === 1 ? 'игрок' : allPlayers.length < 5 ? 'игрока' : 'игроков'} в лобби
        </div>
      </motion.div>

      {/* Teams / Players */}
      {game?.mode === 'teams' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', maxWidth: 900, margin: '0 auto', marginBottom: '2rem', alignItems: 'start' }}>
          {/* Team A */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div style={{ 
              border: '1px solid rgba(255,107,53,0.3)', padding: '1.25rem',
              background: 'rgba(255,107,53,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.9rem', color: '#FF6B35' }}>
                  КОМАНДА А
                </div>
                <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
                  {teamAPlayers.length} игр.
                </div>
              </div>
              <AnimatePresence>
                {teamAPlayers.map(p => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    isCurrentUser={p.id === currentPlayerId}
                    isHost={p.is_host}
                    teamColor={TEAM_COLORS.A}
                  />
                ))}
                {teamAPlayers.length === 0 && (
                  <div style={{ color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.7rem', padding: '1rem 0', textAlign: 'center' }}>
                    Нет игроков
                  </div>
                )}
              </AnimatePresence>
              {currentTeam !== 'A' && game?.state === 'waiting' && (
                <button
                  className="bb-btn"
                  style={{ width: '100%', marginTop: '0.75rem', borderColor: 'rgba(255,107,53,0.4)', color: '#FF6B35', fontSize: '0.65rem' }}
                  onClick={() => handleChooseTeam('A')}
                  data-testid="btn-join-team-a"
                >
                  ВЫБРАТЬ КОМАНДУ А
                </button>
              )}
            </div>
          </motion.div>

          {/* VS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem 0' }}>
            <div style={{ 
              fontFamily: 'Syne', fontWeight: 900, fontSize: '1.5rem',
              color: '#262626', border: '1px solid #262626', padding: '0.5rem 1rem',
              background: '#0A0A0A', letterSpacing: '0.05em',
            }}>VS</div>
          </div>

          {/* Team B */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div style={{ 
              border: '1px solid rgba(0,180,216,0.3)', padding: '1.25rem',
              background: 'rgba(0,180,216,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.9rem', color: '#00B4D8' }}>
                  КОМАНДА Б
                </div>
                <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
                  {teamBPlayers.length} игр.
                </div>
              </div>
              <AnimatePresence>
                {teamBPlayers.map(p => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    isCurrentUser={p.id === currentPlayerId}
                    isHost={p.is_host}
                    teamColor={TEAM_COLORS.B}
                  />
                ))}
                {teamBPlayers.length === 0 && (
                  <div style={{ color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.7rem', padding: '1rem 0', textAlign: 'center' }}>
                    Нет игроков
                  </div>
                )}
              </AnimatePresence>
              {currentTeam !== 'B' && game?.state === 'waiting' && (
                <button
                  className="bb-btn"
                  style={{ width: '100%', marginTop: '0.75rem', borderColor: 'rgba(0,180,216,0.4)', color: '#00B4D8', fontSize: '0.65rem' }}
                  onClick={() => handleChooseTeam('B')}
                  data-testid="btn-join-team-b"
                >
                  ВЫБРАТЬ КОМАНДУ Б
                </button>
              )}
            </div>
          </motion.div>
        </div>
      ) : (
        // FFA mode - all players list
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ maxWidth: 600, margin: '0 auto 2rem', padding: '1.25rem', border: '1px solid #1f1f1f', background: '#0A0A0A' }}
        >
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.9rem', marginBottom: '1rem', color: '#A3A3A3' }}>
            ВСЕ ИГРОКИ ({allPlayers.length})
          </div>
          <AnimatePresence>
            {allPlayers.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                isCurrentUser={p.id === currentPlayerId}
                isHost={p.is_host}
                teamColor={null}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div style={{ textAlign: 'center', color: '#FF3366', fontFamily: 'Space Mono', fontSize: '0.75rem', marginBottom: '1rem' }}
          data-testid="lobby-error"
        >
          {error}
        </div>
      )}

      {/* Start button (host only) */}
      {isHost && game?.state === 'waiting' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', marginTop: '1rem' }}
        >
          <button
            className="bb-btn bb-btn-primary"
            style={{ fontSize: '1rem', padding: '1rem 3rem', letterSpacing: '0.2em' }}
            onClick={handleStart}
            disabled={loading || allPlayers.length < 2}
            data-testid="btn-start-game"
          >
            {loading ? 'ЗАПУСК...' : 'НАЧАТЬ ИГРУ →'}
          </button>
          {allPlayers.length < 2 && (
            <div style={{ color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.65rem', marginTop: '0.75rem' }}>
              Нужно минимум 2 игрока
            </div>
          )}
        </motion.div>
      )}

      {!isHost && (
        <div style={{ textAlign: 'center', color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.75rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3455eb', animation: 'pulse-accent 2s infinite' }} className="pulse-accent" />
            ОЖИДАНИЕ ВЕДУЩЕГО...
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button className="bb-btn" onClick={() => navigate('/')} data-testid="btn-back-home" style={{ fontSize: '0.65rem' }}>
          ← НА ГЛАВНУЮ
        </button>
      </div>
    </div>
  );
}

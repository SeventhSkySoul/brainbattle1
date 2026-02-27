import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { getTeamColors, DEFAULT_TEAM_COLORS, storage, STORAGE_KEYS, API, DIFFICULTY_LABELS, MODE_LABELS } from '../utils';import axios from 'axios';

function PlayerCard({ player, isCurrentUser, isHost, teamColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.6rem 0.75rem',
        border: `1px solid ${isCurrentUser ? '#3455eb' : '#1f1f1f'}`,
        background: isCurrentUser ? 'rgba(52,85,235,0.05)' : 'transparent',
        marginBottom: '0.4rem',
        userSelect: 'none',
      }}
    >
      <div style={{
        width: 32, height: 32, flexShrink: 0,
        background: teamColor ? teamColor.bg : 'rgba(255,255,255,0.05)',
        border: `1px solid ${teamColor ? teamColor.border : '#262626'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Syne', fontWeight: 800, fontSize: '0.8rem',
        color: teamColor ? teamColor.text : '#fff',
      }}>
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.75rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
          {isCurrentUser && <span style={{ color: '#3455eb', marginLeft: '0.4rem', fontSize: '0.55rem' }}>(ВЫ)</span>}
          {isHost && <span style={{ color: '#FFD600', marginLeft: '0.4rem', fontSize: '0.55rem' }}>ВЕДУЩИЙ</span>}
        </div>
      </div>
      {player.disqualified && (
        <span style={{ color: '#FF3366', fontSize: '0.55rem', fontFamily: 'Space Mono', flexShrink: 0 }}>ДИСКВ.</span>
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
  const pollingRef = useRef(null);

  const savedPlayerId = storage.get(STORAGE_KEYS.PLAYER_ID);
  const currentPlayerId = playerId || savedPlayerId;

  // Load game & connect
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/games/${pin.toUpperCase()}`);
        setGame(res.data);
        const gameId = res.data.id;
        if (gameId && currentPlayerId) {
          connectWS(gameId, currentPlayerId);
        }
      } catch {
        setError('Игра не найдена');
      }
    };
    load();

    // Polling fallback
    pollingRef.current = setInterval(async () => {
      try {
        const gId = storage.get(STORAGE_KEYS.GAME_ID);
        if (!gId) return;
        const res = await axios.get(`${API}/games/id/${gId}`);
        setGame(res.data);
        if (res.data.state === 'in_progress') {
          clearInterval(pollingRef.current);
          navigate(`/game/${res.data.id}`);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(pollingRef.current);
  }, [pin]); // eslint-disable-line

  // Navigate on state change
  useEffect(() => {
    if (game?.state === 'in_progress') {
      clearInterval(pollingRef.current);
      navigate(`/game/${game.id}`);
    }
    if (game?.state === 'finished') navigate(`/results/${game.id}`);
  }, [game?.state]); // eslint-disable-line

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
    const url = `${window.location.origin}?pin=${pin}`;
    try {
      navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!game && !error) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', color: '#A3A3A3', fontSize: '0.8rem' }}>ЗАГРУЗКА...</div>
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
  const tc = getTeamColors(game);
  const teamAPlayers = game?.players?.filter(p => p.team === 'A') || [];
  const teamBPlayers = game?.players?.filter(p => p.team === 'B') || [];
  const allPlayers = game?.players || [];

  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: '1rem', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1.1rem', color: '#3455eb', userSelect: 'none' }}>
          BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {game && (
            <>
              <span className="bb-badge" style={{ userSelect: 'none' }}>{DIFFICULTY_LABELS[game.difficulty] || game.difficulty}</span>
              <span className="bb-badge" style={{ borderColor: '#00F0FF', color: '#00F0FF', background: 'transparent', userSelect: 'none' }}>
                {MODE_LABELS[game.mode] || game.mode}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Topic */}
      {game && (
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3', marginBottom: '1rem', userSelect: 'none' }}>
          ТЕМА: <span style={{ color: '#fff' }}>{game.topic}</span>
        </div>
      )}

      {/* PIN */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.6rem', userSelect: 'none' }}>
          PIN КОД
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.2rem', marginBottom: '0.75rem' }}>
          {(game?.pin || pin || '').split('').map((char, i) => (
            <div key={i} className="pin-char" style={{ userSelect: 'none' }}>{char}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="bb-btn" onClick={copyPin} data-testid="btn-copy-pin" style={{ fontSize: '0.6rem', padding: '0.4rem 1rem' }}>
            {copied ? '✓ СКОПИРОВАНО' : 'СКОПИРОВАТЬ ССЫЛКУ'}
          </button>
        </div>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3', marginTop: '0.4rem', userSelect: 'none' }}>
          {allPlayers.length} игроков в лобби
        </div>
      </div>

      {/* Teams — стек колонок на мобиле */}
      {game?.mode === 'teams' ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Team A */}
          <div style={{ flex: 1, minWidth: 0, border: `1px solid ${tc.A.border}`, padding: '0.875rem', background: tc.A.bg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', userSelect: 'none' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.85rem', color: tc.A.text }}>КОМАНДА А</div>
              <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>{teamAPlayers.length}</div>
            </div>
            <AnimatePresence>
              {teamAPlayers.map(p => (
                <PlayerCard key={p.id} player={p} isCurrentUser={p.id === currentPlayerId} isHost={p.is_host} teamColor={tc.A} />
              ))}
              {teamAPlayers.length === 0 && (
                <div style={{ color: '#333', fontFamily: 'Space Mono', fontSize: '0.65rem', padding: '0.5rem 0', textAlign: 'center', userSelect: 'none' }}>пусто</div>
              )}
            </AnimatePresence>
            {currentTeam !== 'A' && game?.state === 'waiting' && (
              <button className="bb-btn" style={{ width: '100%', marginTop: '0.5rem', borderColor: 'rgba(255,107,53,0.5)', color: '#FF6B35', fontSize: '0.6rem', padding: '0.4rem' }}
                onClick={() => handleChooseTeam('A')} data-testid="btn-join-team-a">
                ВЫБРАТЬ
              </button>
            )}
          </div>

          {/* VS divider */}
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem', flexShrink: 0, userSelect: 'none' }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1rem', color: '#1f1f1f' }}>VS</div>
          </div>

          {/* Team B */}
          <div style={{ flex: 1, minWidth: 0, border: '1px solid rgba(0,180,216,0.3)', padding: '0.875rem', background: 'rgba(0,180,216,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', userSelect: 'none' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.85rem', color: '#00B4D8' }}>КОМ. Б</div>
              <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>{teamBPlayers.length}</div>
            </div>
            <AnimatePresence>
              {teamBPlayers.map(p => (
                <PlayerCard key={p.id} player={p} isCurrentUser={p.id === currentPlayerId} isHost={p.is_host} teamColor={tc.B} />
              ))}
              {teamBPlayers.length === 0 && (
                <div style={{ color: '#333', fontFamily: 'Space Mono', fontSize: '0.65rem', padding: '0.5rem 0', textAlign: 'center', userSelect: 'none' }}>пусто</div>
              )}
            </AnimatePresence>
            {currentTeam !== 'B' && game?.state === 'waiting' && (
              <button className="bb-btn" style={{ width: '100%', marginTop: '0.5rem', borderColor: 'rgba(0,180,216,0.5)', color: '#00B4D8', fontSize: '0.6rem', padding: '0.4rem' }}
                onClick={() => handleChooseTeam('B')} data-testid="btn-join-team-b">
                ВЫБРАТЬ
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '1.25rem', border: '1px solid #1f1f1f', padding: '1rem', background: '#0A0A0A' }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.85rem', color: '#A3A3A3', marginBottom: '0.75rem', userSelect: 'none' }}>
            ИГРОКИ ({allPlayers.length})
          </div>
          <AnimatePresence>
            {allPlayers.map(p => (
              <PlayerCard key={p.id} player={p} isCurrentUser={p.id === currentPlayerId} isHost={p.is_host} teamColor={null} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ textAlign: 'center', color: '#FF3366', fontFamily: 'Space Mono', fontSize: '0.7rem', marginBottom: '0.75rem', userSelect: 'none' }} data-testid="lobby-error">
          {error}
        </div>
      )}

      {/* Start (host) */}
      {isHost && game?.state === 'waiting' && (
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button className="bb-btn bb-btn-primary"
            style={{ fontSize: '0.9rem', padding: '0.875rem 2.5rem', letterSpacing: '0.15em', userSelect: 'none' }}
            onClick={handleStart} disabled={loading || allPlayers.length < 2} data-testid="btn-start-game">
            {loading ? 'ЗАПУСК...' : 'НАЧАТЬ ИГРУ →'}
          </button>
          {allPlayers.length < 2 && (
            <div style={{ color: '#555', fontFamily: 'Space Mono', fontSize: '0.6rem', marginTop: '0.5rem', userSelect: 'none' }}>
              Нужно минимум 2 игрока
            </div>
          )}
        </div>
      )}

      {/* Waiting indicator (non-host) */}
      {!isHost && (
        <div style={{ textAlign: 'center', color: '#A3A3A3', fontFamily: 'Space Mono', fontSize: '0.7rem', marginBottom: '1rem', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3455eb' }} className="pulse-accent" />
            ОЖИДАНИЕ ВЕДУЩЕГО...
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <button className="bb-btn" onClick={() => navigate('/')} data-testid="btn-back-home" style={{ fontSize: '0.6rem' }}>
          ← ГЛАВНАЯ
        </button>
      </div>
    </div>
  );
}

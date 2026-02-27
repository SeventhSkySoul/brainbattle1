import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { TEAM_COLORS, getCurrentTurnPlayer, storage, STORAGE_KEYS, API, formatTime } from '../utils';
import axios from 'axios';

// Sound effects
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'correct') {
      oscillator.frequency.setValueAtTime(523, ctx.currentTime);
      oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } else if (type === 'wrong') {
      oscillator.frequency.setValueAtTime(300, ctx.currentTime);
      oscillator.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } else if (type === 'tick') {
      oscillator.frequency.setValueAtTime(1000, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
    } else if (type === 'timeout') {
      oscillator.frequency.setValueAtTime(200, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    }
  } catch {}
};

function ScoreBoard({ game }) {
  const scoreA = game?.scores?.A || 0;
  const scoreB = game?.scores?.B || 0;

  if (game?.mode === 'ffa') {
    const sorted = [...(game?.players || [])].sort((a, b) => b.score - a.score).slice(0, 5);
    return (
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {sorted.map((p, i) => (
          <div key={p.id} style={{
            fontFamily: 'Space Mono', fontSize: '0.65rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #262626',
            background: i === 0 ? 'rgba(204,255,0,0.1)' : '#0A0A0A',
            color: i === 0 ? '#CCFF00' : '#A3A3A3',
          }}>
            {i + 1}. {p.name}: {p.score}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#FF6B35', textTransform: 'uppercase', letterSpacing: '0.15em' }}>КОМАНДА А</div>
        <div style={{ fontFamily: 'Syne', fontSize: '2rem', fontWeight: 900, color: game?.current_team === 'A' ? '#FF6B35' : '#A3A3A3' }}
          data-testid="score-team-a"
        >
          {scoreA}
        </div>
      </div>
      <div style={{ fontFamily: 'Syne', fontSize: '1rem', color: '#262626', fontWeight: 800 }}>:</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#00B4D8', textTransform: 'uppercase', letterSpacing: '0.15em' }}>КОМАНДА Б</div>
        <div style={{ fontFamily: 'Syne', fontSize: '2rem', fontWeight: 900, color: game?.current_team === 'B' ? '#00B4D8' : '#A3A3A3' }}
          data-testid="score-team-b"
        >
          {scoreB}
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const { game, setGame, playerId, sendAction, connectWS, event, setEvent } = useGame();

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [correctIndex, setCorrectIndex] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [resultMsg, setResultMsg] = useState(null); // { text, color, points }
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const timerRef = useRef(null);
  const pollingRef = useRef(null);
  const prevQIdx = useRef(-1);

  const savedPlayerId = storage.get(STORAGE_KEYS.PLAYER_ID);
  const currentPlayerId = playerId || savedPlayerId;

  // Load game if not in context
  useEffect(() => {
    const load = async () => {
      if (!game) {
        try {
          const res = await axios.get(`${API}/games/id/${gameId}`);
          setGame(res.data);
          connectWS(gameId, currentPlayerId);
        } catch {}
      } else {
        connectWS(gameId, currentPlayerId);
      }
    };
    load();

    // Polling fallback
    pollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/games/id/${gameId}`);
        setGame(res.data);
        if (res.data.state === 'finished') {
          clearInterval(pollingRef.current);
          navigate(`/results/${gameId}`);
        }
      } catch {}
    }, 3000);

    return () => {
      clearInterval(pollingRef.current);
      clearInterval(timerRef.current);
    };
  }, [gameId]);

  // Navigate when game ends
  useEffect(() => {
    if (game?.state === 'finished') {
      setTimeout(() => navigate(`/results/${gameId}`), 1500);
    }
  }, [game?.state]);

  // Handle events from WebSocket
  useEffect(() => {
    if (!event) return;
    
    if (event.event === 'answer_result') {
      const isCorrect = event.is_correct;
      setCorrectIndex(event.correct_index);
      setAnswerRevealed(true);
      setTimerRunning(false);
      clearInterval(timerRef.current);
      
      if (soundEnabled) playSound(isCorrect ? 'correct' : 'wrong');
      
      if (event.points > 0) {
        setResultMsg({ text: `+${event.points} ОЧКОВ`, color: '#CCFF00' });
      } else {
        setResultMsg({ text: 'НЕВЕРНО', color: '#FF3366' });
      }
    } else if (event.event === 'timeout') {
      setCorrectIndex(event.correct_index);
      setAnswerRevealed(true);
      setTimerRunning(false);
      clearInterval(timerRef.current);
      setResultMsg({ text: 'ВРЕМЯ ВЫШЛО', color: '#FFD600' });
      if (soundEnabled) playSound('timeout');
    } else if (event.event === 'next_question') {
      setSelectedAnswer(null);
      setAnswerRevealed(false);
      setCorrectIndex(null);
      setResultMsg(null);
    }
    
    setEvent(null);
  }, [event]);

  // Reset state on question change
  useEffect(() => {
    if (!game) return;
    const qIdx = game.current_question_index;
    
    if (qIdx !== prevQIdx.current) {
      prevQIdx.current = qIdx;
      setSelectedAnswer(null);
      setAnswerRevealed(false);
      setCorrectIndex(null);
      setResultMsg(null);
      
      // Reset and restart timer immediately
      clearInterval(timerRef.current);
      setTimerRunning(false);
      
      if (game.state === 'in_progress' && qIdx < (game.questions?.length || 0)) {
        const startTime = game.question_start_time;
        let initial = game.time_per_question || 30;
        
        if (startTime) {
          const elapsed = (Date.now() - new Date(startTime).getTime()) / 1000;
          initial = Math.max(0, initial - elapsed);
        }
        
        setTimeLeft(Math.round(initial));
        // Small delay to allow React to clear previous interval
        setTimeout(() => setTimerRunning(true), 50);
      }
    }
  }, [game?.current_question_index, game?.state]);

  // Timer countdown
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!timerRunning || game?.state === 'paused' || game?.state !== 'in_progress') {
      return;
    }
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        if (next <= 5 && next > 0 && soundEnabled) playSound('tick');
        if (next <= 0) {
          clearInterval(timerRef.current);
          setTimerRunning(false);
          return 0;
        }
        return next;
      });
    }, 1000);
    
    return () => clearInterval(timerRef.current);
  }, [timerRunning, game?.state, soundEnabled]);

  // Sync timer with server on game state update  
  useEffect(() => {
    if (!game) return;
    if (game.state === 'paused') {
      clearInterval(timerRef.current);
      setTimerRunning(false);
      return;
    }
    if (game.state !== 'in_progress') return;
    const startTime = game.question_start_time;
    if (!startTime) return;
    const elapsed = (Date.now() - new Date(startTime).getTime()) / 1000;
    const remaining = Math.max(0, (game.time_per_question || 30) - elapsed);
    if (!game.answer_given) {
      setTimeLeft(Math.round(remaining));
      setTimerRunning(true);
    } else {
      clearInterval(timerRef.current);
      setTimerRunning(false);
    }
  }, [game?.question_start_time, game?.state, game?.answer_given]);

  // Determine if it's my turn
  useEffect(() => {
    if (!game || !currentPlayerId) return;
    
    if (game.mode === 'ffa') {
      setIsMyTurn(!game.answer_given && game.state === 'in_progress');
      return;
    }
    
    const currentTeam = game.current_team;
    const teamPlayers = game.teams?.[currentTeam] || [];
    const idx = (game.current_player_index?.[currentTeam] || 0) % Math.max(1, teamPlayers.length);
    const currentTurnPlayerId = teamPlayers[idx];
    const myTurn = currentTurnPlayerId === currentPlayerId && !game.answer_given && game.state === 'in_progress';
    setIsMyTurn(myTurn);
  }, [game, currentPlayerId]);

  const handleAnswer = async (answerIdx) => {
    if (!isMyTurn || selectedAnswer !== null || answerRevealed || loading) return;
    
    setSelectedAnswer(answerIdx);
    setLoading(true);
    
    try {
      await sendAction(gameId, 'answer', currentPlayerId, { answer_index: answerIdx });
    } catch (err) {
      setSelectedAnswer(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    try {
      await sendAction(gameId, game?.state === 'paused' ? 'resume' : 'pause', currentPlayerId, {});
    } catch {}
  };

  const handleSkip = async () => {
    try {
      await sendAction(gameId, 'skip', currentPlayerId, {});
    } catch {}
  };

  if (!game) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', color: '#A3A3A3' }}>ЗАГРУЗКА...</div>
      </div>
    );
  }

  const currentQ = game.questions?.[game.current_question_index];
  const totalQ = game.questions?.length || 0;
  const qNum = game.current_question_index + 1;
  const isHost = game.host_id === currentPlayerId;
  const timerPercent = (timeLeft / (game.time_per_question || 30)) * 100;
  const timerColor = timerPercent > 50 ? '#3455eb' : timerPercent > 25 ? '#FFD600' : '#FF3366';

  const currentTeam = game.mode === 'teams' ? game.current_team : null;
  const teamColor = currentTeam ? TEAM_COLORS[currentTeam] : null;

  // Who's answering now
  let currentAnsweringPlayer = null;
  if (game.mode === 'teams' && currentTeam) {
    const teamPlayers = game.teams?.[currentTeam] || [];
    const idx = (game.current_player_index?.[currentTeam] || 0) % Math.max(1, teamPlayers.length);
    const pid = teamPlayers[idx];
    currentAnsweringPlayer = game.players?.find(p => p.id === pid);
  }

  const myPlayer = game.players?.find(p => p.id === currentPlayerId);

  // Teams question count (for teams mode)
  const questionsPerTeam = game.num_questions || 7;
  const qsAnsweredA = Math.floor(game.current_question_index / 2) + (currentTeam === 'A' ? 0 : 1);
  const qsAnsweredB = Math.floor(game.current_question_index / 2);

  return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', flexDirection: 'column', maxWidth: 900, margin: '0 auto', padding: '1rem 1.25rem' }}>
      
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1rem', color: '#3455eb' }}>
          BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
        </div>
        
        <ScoreBoard game={game} />
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ background: 'none', border: 'none', color: soundEnabled ? '#3455eb' : '#A3A3A3', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' }}
            title={soundEnabled ? 'Выкл звук' : 'Вкл звук'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          {isHost && (
            <>
              <button
                className="bb-btn"
                style={{ padding: '0.4rem 0.875rem', fontSize: '0.6rem' }}
                onClick={handlePause}
                data-testid="btn-pause"
              >
                {game.state === 'paused' ? '▶ ПРОДОЛЖИТЬ' : '⏸ ПАУЗА'}
              </button>
              <button
                className="bb-btn"
                style={{ padding: '0.4rem 0.875rem', fontSize: '0.6rem', borderColor: '#FFD600', color: '#FFD600' }}
                onClick={handleSkip}
                disabled={game.state !== 'in_progress' || game.answer_given}
                data-testid="btn-skip"
              >
                ПРОПУСТИТЬ
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pause overlay */}
      <AnimatePresence>
        {game.state === 'paused' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              background: 'rgba(5,5,5,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '1.5rem',
            }}
          >
            <div style={{ fontFamily: 'Syne', fontSize: '3rem', fontWeight: 900, color: '#FFD600' }}>ПАУЗА</div>
            <div style={{ fontFamily: 'Space Mono', fontSize: '0.75rem', color: '#A3A3A3' }}>Игра приостановлена ведущим</div>
            {isHost && (
              <button className="bb-btn bb-btn-primary" onClick={handlePause} data-testid="btn-resume">
                ▶ ПРОДОЛЖИТЬ
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar (timer) */}
      <div style={{ height: 4, background: '#1a1a1a', marginBottom: '1.25rem', position: 'relative', overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', background: timerColor, position: 'absolute', left: 0 }}
          animate={{ width: `${timerPercent}%` }}
          transition={{ duration: 0.3 }}
          data-testid="timer-bar"
        />
      </div>

      {/* Question header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="bb-badge" data-testid="question-counter">
            ВОПРОС {qNum}/{totalQ}
          </span>
          {game.mode === 'teams' && currentTeam && (
            <span className="bb-badge" style={{ borderColor: teamColor?.text, color: teamColor?.text, background: `rgba(${teamColor?.text === '#FF6B35' ? '255,107,53' : '0,180,216'},0.1)` }}>
              ОТВЕЧАЕТ: {currentTeam === 'A' ? 'КОМАНДА А' : 'КОМАНДА Б'}
            </span>
          )}
          {currentAnsweringPlayer && (
            <span style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
              Игрок: <span style={{ color: '#fff' }}>{currentAnsweringPlayer.name}</span>
              {currentAnsweringPlayer.id === currentPlayerId && <span style={{ color: '#3455eb' }}> (ВЫ)</span>}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            fontFamily: 'Syne', fontSize: '2rem', fontWeight: 900,
            color: timerColor, minWidth: '2.5rem', textAlign: 'right',
          }} data-testid="timer-display" className="countdown-tick">
            {timeLeft}
          </div>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>СЕК</div>
        </div>
      </div>

      {/* Question text */}
      <AnimatePresence mode="wait">
        {currentQ ? (
          <motion.div
            key={game.current_question_index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ flex: 1 }}
          >
            <div style={{
              fontFamily: 'Syne', fontSize: 'clamp(1.1rem, 3vw, 1.75rem)',
              fontWeight: 800, lineHeight: 1.3, color: '#fff',
              marginBottom: '2rem', padding: '1.5rem', 
              border: '1px solid #1f1f1f', background: '#0A0A0A',
              minHeight: 100, display: 'flex', alignItems: 'center',
            }} data-testid="question-text">
              {currentQ.text}
            </div>

            {/* Answer options */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
              {(currentQ.options || []).map((option, idx) => {
                let btnClass = 'answer-btn';
                let extra = {};
                
                if (answerRevealed) {
                  if (idx === correctIndex) btnClass += ' correct';
                  else if (idx === selectedAnswer && idx !== correctIndex) btnClass += ' wrong';
                } else if (idx === selectedAnswer) {
                  btnClass += ' selected';
                }
                
                const letters = ['A', 'B', 'C', 'D'];
                
                return (
                  <button
                    key={idx}
                    className={btnClass}
                    onClick={() => handleAnswer(idx)}
                    disabled={!isMyTurn || selectedAnswer !== null || answerRevealed || game.state !== 'in_progress'}
                    data-testid={`answer-btn-${idx}`}
                    style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
                  >
                    <span style={{
                      minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid currentColor', fontSize: '0.7rem', flexShrink: 0,
                      marginTop: '0.1rem',
                    }}>
                      {letters[idx]}
                    </span>
                    <span style={{ lineHeight: 1.4 }}>{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Result message */}
            <AnimatePresence>
              {resultMsg && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    textAlign: 'center', marginTop: '1.5rem',
                    fontFamily: 'Syne', fontSize: '1.5rem', fontWeight: 900,
                    color: resultMsg.color,
                    textShadow: `0 0 20px ${resultMsg.color}`,
                  }}
                  data-testid="result-message"
                >
                  {resultMsg.text}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Not your turn indicator */}
            {!isMyTurn && !game.answer_given && game.state === 'in_progress' && (
              <div style={{
                textAlign: 'center', marginTop: '1.25rem',
                padding: '0.75rem', border: '1px solid #1f1f1f',
                fontFamily: 'Space Mono', fontSize: '0.75rem', color: '#A3A3A3',
              }} data-testid="waiting-indicator">
                {game.mode === 'teams'
                  ? `ОТВЕЧАЕТ ${currentTeam === 'A' ? 'КОМАНДА А' : 'КОМАНДА Б'}...`
                  : 'ОЖИДАЙТЕ СВОЕЙ ОЧЕРЕДИ'}
              </div>
            )}

            {isMyTurn && !selectedAnswer !== null && !answerRevealed && game.state === 'in_progress' && (
              <motion.div
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                  textAlign: 'center', marginTop: '1.25rem',
                  fontFamily: 'Space Mono', fontSize: '0.75rem', color: '#3455eb',
                }}
                data-testid="your-turn-indicator"
              >
                ВАШ ХОД — ВЫБЕРИТЕ ОТВЕТ
              </motion.div>
            )}
          </motion.div>
        ) : (
          <div style={{ textAlign: 'center', color: '#A3A3A3', fontFamily: 'Space Mono' }}>
            {game.state === 'finished' ? 'ИГРА ЗАВЕРШЕНА' : 'ЗАГРУЗКА ВОПРОСА...'}
          </div>
        )}
      </AnimatePresence>

      {/* Bottom: player stats mini */}
      {myPlayer && (
        <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #1a1a1a', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
            ОЧКИ: <span style={{ color: '#3455eb' }}>{myPlayer.score}</span>
          </div>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
            ПРАВИЛЬНО: <span style={{ color: '#22c55e' }}>{myPlayer.correct_answers}</span>
          </div>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
            НЕВЕРНО: <span style={{ color: '#FF3366' }}>{myPlayer.wrong_answers}</span>
          </div>
          {game.mode === 'teams' && myPlayer.team && (
            <div style={{ fontFamily: 'Space Mono', fontSize: '0.65rem', color: '#A3A3A3' }}>
              КОМАНДА: <span style={{ color: myPlayer.team === 'A' ? '#FF6B35' : '#00B4D8' }}>
                {myPlayer.team === 'A' ? 'А' : 'Б'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Host disqualify panel */}
      {isHost && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #1a1a1a', background: '#0A0A0A' }}>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            ПАНЕЛЬ ВЕДУЩЕГО
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {game.players?.filter(p => !p.is_host && !p.disqualified).map(p => (
              <button
                key={p.id}
                className="bb-btn bb-btn-red"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.6rem' }}
                onClick={async () => {
                  if (window.confirm(`Дисквалифицировать ${p.name}?`)) {
                    await sendAction(gameId, 'disqualify', currentPlayerId, { target_player_id: p.id });
                  }
                }}
                data-testid={`disqualify-${p.id}`}
              >
                ДИСКВ: {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

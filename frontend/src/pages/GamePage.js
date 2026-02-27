import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { TEAM_COLORS, storage, STORAGE_KEYS, API } from '../utils';
import axios from 'axios';

// Sound effects
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'correct') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'wrong') {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'tick') {
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'timeout') {
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    }
  } catch {}
};

function ScoreBoard({ game }) {
  if (game?.mode === 'ffa') {
    const sorted = [...(game?.players || [])].sort((a, b) => b.score - a.score).slice(0, 5);
    return (
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', userSelect: 'none' }}>
        {sorted.map((p, i) => (
          <div key={p.id} style={{
            fontFamily: 'Space Mono', fontSize: '0.6rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #262626',
            background: i === 0 ? 'rgba(52,85,235,0.1)' : '#0A0A0A',
            color: i === 0 ? '#3455eb' : '#A3A3A3',
          }}>
            #{i + 1} {p.name}: {p.score}
          </div>
        ))}
      </div>
    );
  }
  const scoreA = game?.scores?.A || 0;
  const scoreB = game?.scores?.B || 0;
  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', userSelect: 'none' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.55rem', color: '#FF6B35', textTransform: 'uppercase', letterSpacing: '0.1em' }}>КОМ. А</div>
        <div style={{ fontFamily: 'Syne', fontSize: '1.75rem', fontWeight: 900, color: game?.current_team === 'A' ? '#FF6B35' : '#A3A3A3', lineHeight: 1 }} data-testid="score-team-a">{scoreA}</div>
      </div>
      <div style={{ fontFamily: 'Syne', fontSize: '1rem', color: '#333', fontWeight: 800 }}>:</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Space Mono', fontSize: '0.55rem', color: '#00B4D8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>КОМ. Б</div>
        <div style={{ fontFamily: 'Syne', fontSize: '1.75rem', fontWeight: 900, color: game?.current_team === 'B' ? '#00B4D8' : '#A3A3A3', lineHeight: 1 }} data-testid="score-team-b">{scoreB}</div>
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
  const [resultMsg, setResultMsg] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Timer: single source of truth — use ref to avoid stale closures
  const timerRef = useRef(null);
  const timerStartRef = useRef(null); // when the current question timer started (wall clock)
  const timerDurationRef = useRef(30); // total time for this question
  const pollingRef = useRef(null);
  const prevQStartRef = useRef(null); // track question_start_time to avoid re-triggering
  const prevQIdxRef = useRef(-1);

  const savedPlayerId = storage.get(STORAGE_KEYS.PLAYER_ID);
  const currentPlayerId = playerId || savedPlayerId;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = (startTimeISO, duration) => {
    stopTimer();
    const start = new Date(startTimeISO).getTime();
    const end = start + duration * 1000;
    timerStartRef.current = start;
    timerDurationRef.current = duration;

    const tick = () => {
      const remaining = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0 && soundEnabled) playSound('tick');
      if (remaining <= 0) stopTimer();
    };
    tick(); // immediate first tick
    timerRef.current = setInterval(tick, 500); // 500ms ticks = smooth countdown
  };

  // ── Load & connect ────────────────────────────────────────────────────────
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

    // Polling — only for state sync, NOT timer control
    pollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/games/id/${gameId}`);
        setGame(res.data);
        if (res.data.state === 'finished') {
          clearInterval(pollingRef.current);
          navigate(`/results/${gameId}`);
        }
      } catch {}
    }, 4000); // slower polling to not interfere with timer

    return () => {
      clearInterval(pollingRef.current);
      stopTimer();
    };
  }, [gameId]); // eslint-disable-line

  // ── Navigate when finished ────────────────────────────────────────────────
  useEffect(() => {
    if (game?.state === 'finished') {
      stopTimer();
      setTimeout(() => navigate(`/results/${gameId}`), 1500);
    }
  }, [game?.state]); // eslint-disable-line

  // ── Timer: react to question_start_time change (new question / skip / start) ──
  useEffect(() => {
    if (!game) return;
    const qStart = game.question_start_time;
    const qIdx = game.current_question_index;

    // Only restart timer if we have a genuinely new question start
    const isNewQuestion = qStart && (qStart !== prevQStartRef.current || qIdx !== prevQIdxRef.current);
    if (!isNewQuestion) return;

    prevQStartRef.current = qStart;

    // New question — reset answer UI
    if (qIdx !== prevQIdxRef.current) {
      prevQIdxRef.current = qIdx;
      setSelectedAnswer(null);
      setAnswerRevealed(false);
      setCorrectIndex(null);
      setResultMsg(null);
    }

    if (game.state === 'in_progress' && !game.answer_given) {
      startTimer(qStart, game.time_per_question || 30);
    }
  }, [game?.question_start_time, game?.current_question_index]); // eslint-disable-line

  // ── Pause / resume timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!game) return;
    if (game.state === 'paused') {
      stopTimer();
    } else if (game.state === 'in_progress' && !game.answer_given && game.question_start_time) {
      // Resume — recalculate from server's start_time
      if (!timerRef.current) {
        startTimer(game.question_start_time, game.time_per_question || 30);
      }
    }
  }, [game?.state]); // eslint-disable-line

  // ── Stop timer when answer given ──────────────────────────────────────────
  useEffect(() => {
    if (game?.answer_given) stopTimer();
  }, [game?.answer_given]);

  // ── WebSocket events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!event) return;
    if (event.event === 'answer_result') {
      setCorrectIndex(event.correct_index);
      setAnswerRevealed(true);
      stopTimer();
      if (soundEnabled) playSound(event.is_correct ? 'correct' : 'wrong');
      setResultMsg(event.points > 0
        ? { text: `+${event.points} ОЧКОВ`, color: '#22c55e' }
        : { text: 'НЕВЕРНО', color: '#FF3366' });
    } else if (event.event === 'timeout') {
      setCorrectIndex(event.correct_index);
      setAnswerRevealed(true);
      stopTimer();
      setResultMsg({ text: 'ВРЕМЯ ВЫШЛО', color: '#FFD600' });
      if (soundEnabled) playSound('timeout');
    } else if (event.event === 'next_question') {
      setSelectedAnswer(null);
      setAnswerRevealed(false);
      setCorrectIndex(null);
      setResultMsg(null);
    }
    setEvent(null);
  }, [event]); // eslint-disable-line

  // ── Determine my turn ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!game || !currentPlayerId) return;
    if (game.mode === 'ffa') {
      setIsMyTurn(!game.answer_given && game.state === 'in_progress');
      return;
    }
    const ct = game.current_team;
    const tp = game.teams?.[ct] || [];
    const idx = (game.current_player_index?.[ct] || 0) % Math.max(1, tp.length);
    setIsMyTurn(tp[idx] === currentPlayerId && !game.answer_given && game.state === 'in_progress');
  }, [game, currentPlayerId]); // eslint-disable-line

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAnswer = async (answerIdx) => {
    if (!isMyTurn || selectedAnswer !== null || answerRevealed || actionLoading) return;
    setSelectedAnswer(answerIdx);
    setActionLoading(true);
    try {
      await sendAction(gameId, 'answer', currentPlayerId, { answer_index: answerIdx });
    } catch {
      setSelectedAnswer(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    try { await sendAction(gameId, game?.state === 'paused' ? 'resume' : 'pause', currentPlayerId, {}); } catch {}
  };

  const handleSkip = async () => {
    try { await sendAction(gameId, 'skip', currentPlayerId, {}); } catch {}
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
  const timerMax = game.time_per_question || 30;
  const timerPercent = (timeLeft / timerMax) * 100;
  const timerColor = timerPercent > 50 ? '#3455eb' : timerPercent > 25 ? '#FFD600' : '#FF3366';

  const currentTeam = game.mode === 'teams' ? game.current_team : null;
  const teamColor = currentTeam ? TEAM_COLORS[currentTeam] : null;

  let currentAnsweringPlayer = null;
  if (game.mode === 'teams' && currentTeam) {
    const tp = game.teams?.[currentTeam] || [];
    const idx = (game.current_player_index?.[currentTeam] || 0) % Math.max(1, tp.length);
    currentAnsweringPlayer = game.players?.find(p => p.id === tp[idx]);
  }
  const myPlayer = game.players?.find(p => p.id === currentPlayerId);

  const LETTERS = ['A', 'B', 'C', 'D'];

  return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', flexDirection: 'column', maxWidth: 860, margin: '0 auto', padding: '1rem 1rem', userSelect: 'none' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: '1rem', color: '#3455eb', flexShrink: 0 }}>
          BRAIN<span style={{ color: '#FF3366' }}>BATTLE</span>
        </div>
        <ScoreBoard game={game} />
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button onClick={() => setSoundEnabled(!soundEnabled)} style={{ background: 'none', border: 'none', color: soundEnabled ? '#3455eb' : '#555', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', userSelect: 'none' }}>
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          {isHost && (
            <>
              <button className="bb-btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.6rem' }} onClick={handlePause} data-testid="btn-pause">
                {game.state === 'paused' ? '▶' : '⏸'}
              </button>
              <button className="bb-btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.6rem', borderColor: '#FFD600', color: '#FFD600' }}
                onClick={handleSkip} disabled={game.state !== 'in_progress' || game.answer_given} data-testid="btn-skip">
                ПРОПУСК
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pause overlay */}
      <AnimatePresence>
        {game.state === 'paused' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(5,5,5,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ fontFamily: 'Syne', fontSize: '3rem', fontWeight: 900, color: '#FFD600', userSelect: 'none' }}>ПАУЗА</div>
            <div style={{ fontFamily: 'Space Mono', fontSize: '0.75rem', color: '#A3A3A3', userSelect: 'none' }}>Игра приостановлена ведущим</div>
            {isHost && <button className="bb-btn bb-btn-primary" onClick={handlePause} data-testid="btn-resume">▶ ПРОДОЛЖИТЬ</button>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timer bar */}
      <div style={{ height: 4, background: '#1a1a1a', marginBottom: '0.875rem', position: 'relative', overflow: 'hidden' }}>
        <motion.div style={{ height: '100%', background: timerColor, position: 'absolute', left: 0 }}
          animate={{ width: `${timerPercent}%` }} transition={{ duration: 0.4 }} data-testid="timer-bar" />
      </div>

      {/* Question header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', userSelect: 'none' }}>
          <span className="bb-badge" data-testid="question-counter">Q {qNum}/{totalQ}</span>
          {game.mode === 'teams' && currentTeam && (
            <span className="bb-badge" style={{ borderColor: teamColor?.text, color: teamColor?.text, background: 'transparent' }}>
              {currentTeam === 'A' ? 'КОМ. А' : 'КОМ. Б'}
            </span>
          )}
          {currentAnsweringPlayer && (
            <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>
              {currentAnsweringPlayer.name}
              {currentAnsweringPlayer.id === currentPlayerId && <span style={{ color: '#3455eb' }}> (ВЫ)</span>}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', userSelect: 'none' }}>
          <div style={{ fontFamily: 'Syne', fontSize: '2rem', fontWeight: 900, color: timerColor, minWidth: '2.25rem', textAlign: 'right', lineHeight: 1 }} data-testid="timer-display">
            {timeLeft}
          </div>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.55rem', color: '#A3A3A3' }}>СЕК</div>
        </div>
      </div>

      {/* Question + answers */}
      <AnimatePresence mode="wait">
        {currentQ ? (
          <motion.div key={game.current_question_index} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} style={{ flex: 1 }}>
            {/* Question text */}
            <div style={{
              fontFamily: 'Syne', fontSize: 'clamp(1rem, 3vw, 1.5rem)', fontWeight: 800,
              lineHeight: 1.4, color: '#fff', marginBottom: '1.25rem',
              padding: '1.25rem', border: '1px solid #1f1f1f', background: '#0A0A0A',
              userSelect: 'none',
            }} data-testid="question-text">
              {currentQ.text}
            </div>

            {/* Answer grid — 2×2 layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              {(currentQ.options || []).map((option, idx) => {
                let extraStyle = {};
                let borderColor = '#262626';
                let bgColor = '#0A0A0A';
                let textColor = '#fff';

                if (answerRevealed) {
                  if (idx === correctIndex) {
                    borderColor = '#22c55e';
                    bgColor = 'rgba(34,197,94,0.15)';
                    textColor = '#22c55e';
                  } else if (idx === selectedAnswer) {
                    borderColor = '#FF3366';
                    bgColor = 'rgba(255,51,102,0.15)';
                    textColor = '#FF3366';
                  } else {
                    textColor = '#555';
                  }
                } else if (idx === selectedAnswer) {
                  borderColor = '#3455eb';
                  bgColor = 'rgba(52,85,235,0.15)';
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={!isMyTurn || selectedAnswer !== null || answerRevealed || game.state !== 'in_progress'}
                    data-testid={`answer-btn-${idx}`}
                    style={{
                      display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                      padding: '0.875rem 1rem',
                      border: `2px solid ${borderColor}`,
                      background: bgColor,
                      color: textColor,
                      cursor: (!isMyTurn || selectedAnswer !== null || answerRevealed) ? 'default' : 'pointer',
                      fontFamily: 'Space Mono', fontSize: '0.8rem',
                      textAlign: 'left', transition: 'all 0.2s',
                      userSelect: 'none',
                      transform: (idx === selectedAnswer && !answerRevealed) ? 'scale(0.98)' : 'scale(1)',
                    }}
                  >
                    <span style={{
                      minWidth: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${borderColor}`, fontSize: '0.65rem', flexShrink: 0, marginTop: '0.05rem',
                      color: textColor,
                    }}>
                      {LETTERS[idx]}
                    </span>
                    <span style={{ lineHeight: 1.4 }}>{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Result flash */}
            <AnimatePresence>
              {resultMsg && (
                <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  style={{ textAlign: 'center', marginTop: '1.25rem', fontFamily: 'Syne', fontSize: '1.75rem', fontWeight: 900, color: resultMsg.color, userSelect: 'none' }}
                  data-testid="result-message">
                  {resultMsg.text}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status banner */}
            {!game.answer_given && game.state === 'in_progress' && (
              <div style={{ textAlign: 'center', marginTop: '1rem', fontFamily: 'Space Mono', fontSize: '0.7rem', userSelect: 'none' }}>
                {isMyTurn
                  ? <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: '#3455eb' }}>ВАШ ХОД</motion.span>
                  : <span style={{ color: '#A3A3A3' }}>
                      {game.mode === 'teams'
                        ? `ОТВЕЧАЕТ ${currentTeam === 'A' ? 'КОМАНДА А' : 'КОМАНДА Б'}...`
                        : 'ОЖИДАЙТЕ...'}
                    </span>
                }
              </div>
            )}
          </motion.div>
        ) : (
          <div style={{ textAlign: 'center', color: '#A3A3A3', fontFamily: 'Space Mono', userSelect: 'none' }}>
            {game.state === 'finished' ? 'ИГРА ЗАВЕРШЕНА' : 'ЗАГРУЗКА...'}
          </div>
        )}
      </AnimatePresence>

      {/* My stats */}
      {myPlayer && (
        <div style={{ marginTop: '1.25rem', padding: '0.6rem 1rem', border: '1px solid #1a1a1a', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', userSelect: 'none' }}>
          <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>ОЧКИ: <b style={{ color: '#3455eb' }}>{myPlayer.score}</b></span>
          <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>✓ <b style={{ color: '#22c55e' }}>{myPlayer.correct_answers}</b></span>
          <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: '#A3A3A3' }}>✗ <b style={{ color: '#FF3366' }}>{myPlayer.wrong_answers}</b></span>
          {game.mode === 'teams' && myPlayer.team && (
            <span style={{ fontFamily: 'Space Mono', fontSize: '0.6rem', color: myPlayer.team === 'A' ? '#FF6B35' : '#00B4D8' }}>КОМ. {myPlayer.team}</span>
          )}
        </div>
      )}

      {/* Host panel */}
      {isHost && game.players?.filter(p => !p.is_host && !p.disqualified).length > 0 && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem', border: '1px solid #1a1a1a', background: '#0A0A0A' }}>
          <div style={{ fontFamily: 'Space Mono', fontSize: '0.55rem', color: '#555', marginBottom: '0.4rem', userSelect: 'none' }}>ДИСКВАЛИФИКАЦИЯ</div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {game.players.filter(p => !p.is_host && !p.disqualified).map(p => (
              <button key={p.id} className="bb-btn bb-btn-red" style={{ padding: '0.25rem 0.6rem', fontSize: '0.55rem' }}
                onClick={async () => {
                  if (window.confirm(`Дисквалифицировать ${p.name}?`)) {
                    await sendAction(gameId, 'disqualify', currentPlayerId, { target_player_id: p.id });
                  }
                }} data-testid={`disqualify-${p.id}`}>
                ✕ {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

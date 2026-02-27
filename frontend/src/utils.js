// Shared utilities and constants
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
export const WS_URL = BACKEND_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');

// Local storage keys
export const STORAGE_KEYS = {
  TOKEN: 'bb_token',
  USER: 'bb_user',
  PLAYER_ID: 'bb_player_id',
  PLAYER_NAME: 'bb_player_name',
  GAME_ID: 'bb_game_id',
  PIN: 'bb_pin',
};

// Default team colors (fallback when game.team_colors not loaded yet)
export const DEFAULT_TEAM_COLORS = {
  A: { text: '#FF6B35', bg: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.4)', name: 'КОМАНДА А' },
  B: { text: '#00B4D8', bg: 'rgba(0,180,216,0.12)', border: 'rgba(0,180,216,0.4)', name: 'КОМАНДА Б' },
};

// Get team colors from game object (dynamic) or fallback
export function getTeamColors(game) {
  if (game?.team_colors) return game.team_colors;
  return DEFAULT_TEAM_COLORS;
}

export const DIFFICULTY_LABELS = {
  easy: 'ЛЁГКИЙ',
  medium: 'СРЕДНИЙ',
  hard: 'СЛОЖНЫЙ',
};

export const MODE_LABELS = {
  teams: 'КОМАНДНЫЙ',
  ffa: 'КАЖДЫЙ ЗА СЕБЯ',
};

// Storage helpers
export const storage = {
  get: (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
  remove: (key) => {
    try { localStorage.removeItem(key); } catch {}
  },
};

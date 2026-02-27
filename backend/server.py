from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import json
import random
import string
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from passlib.context import CryptContext
from jose import JWTError, jwt
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Auth
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET', 'brainbattle_secret')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', '168'))

# AI
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="BrainBattle API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Random team color palettes
_TEAM_PALETTES = [
    {"A": {"text": "#FF6B35", "bg": "rgba(255,107,53,0.12)", "border": "rgba(255,107,53,0.4)", "name": "КОМАНДА А"},
     "B": {"text": "#00B4D8", "bg": "rgba(0,180,216,0.12)", "border": "rgba(0,180,216,0.4)", "name": "КОМАНДА Б"}},
    {"A": {"text": "#EF4444", "bg": "rgba(239,68,68,0.12)", "border": "rgba(239,68,68,0.4)", "name": "КОМАНДА А"},
     "B": {"text": "#8B5CF6", "bg": "rgba(139,92,246,0.12)", "border": "rgba(139,92,246,0.4)", "name": "КОМАНДА Б"}},
    {"A": {"text": "#F59E0B", "bg": "rgba(245,158,11,0.12)", "border": "rgba(245,158,11,0.4)", "name": "КОМАНДА А"},
     "B": {"text": "#10B981", "bg": "rgba(16,185,129,0.12)", "border": "rgba(16,185,129,0.4)", "name": "КОМАНДА Б"}},
    {"A": {"text": "#EC4899", "bg": "rgba(236,72,153,0.12)", "border": "rgba(236,72,153,0.4)", "name": "КОМАНДА А"},
     "B": {"text": "#06B6D4", "bg": "rgba(6,182,212,0.12)", "border": "rgba(6,182,212,0.4)", "name": "КОМАНДА Б"}},
    {"A": {"text": "#F97316", "bg": "rgba(249,115,22,0.12)", "border": "rgba(249,115,22,0.4)", "name": "КОМАНДА А"},
     "B": {"text": "#6366F1", "bg": "rgba(99,102,241,0.12)", "border": "rgba(99,102,241,0.4)", "name": "КОМАНДА Б"}},
]

def _pick_team_colors() -> dict:
    return random.choice(_TEAM_PALETTES)

# ============================================================
# BACKUP QUESTIONS
# ============================================================
BACKUP_QUESTIONS = {
    "general": {
        "easy": [
            {"text": "Какая планета ближайшая к Солнцу?", "options": ["Меркурий", "Венера", "Земля", "Марс"], "correct": 0},
            {"text": "Сколько цветов в радуге?", "options": ["5", "6", "7", "8"], "correct": 2},
            {"text": "Какой самый большой океан?", "options": ["Атлантический", "Индийский", "Тихий", "Северный Ледовитый"], "correct": 2},
            {"text": "Сколько сторон у треугольника?", "options": ["2", "3", "4", "5"], "correct": 1},
            {"text": "Столица России?", "options": ["Санкт-Петербург", "Новосибирск", "Казань", "Москва"], "correct": 3},
            {"text": "Какое животное самое высокое?", "options": ["Слон", "Жираф", "Лошадь", "Верблюд"], "correct": 1},
            {"text": "Из чего делают хлеб?", "options": ["Рис", "Кукуруза", "Пшеница", "Ячмень"], "correct": 2},
            {"text": "Сколько дней в неделе?", "options": ["5", "6", "7", "8"], "correct": 2},
            {"text": "Какой цвет получается при смешении красного и синего?", "options": ["Зелёный", "Фиолетовый", "Оранжевый", "Коричневый"], "correct": 1},
            {"text": "Самая быстрая птица?", "options": ["Орёл", "Сокол", "Страус", "Ласточка"], "correct": 1},
        ],
        "medium": [
            {"text": "В каком году началась Вторая Мировая война?", "options": ["1935", "1937", "1939", "1941"], "correct": 2},
            {"text": "Какой элемент обозначается символом Au?", "options": ["Серебро", "Алюминий", "Золото", "Аргон"], "correct": 2},
            {"text": "Кто написал 'Войну и мир'?", "options": ["Достоевский", "Чехов", "Толстой", "Пушкин"], "correct": 2},
            {"text": "Столица Австралии?", "options": ["Сидней", "Мельбурн", "Канберра", "Брисбен"], "correct": 2},
            {"text": "Сколько хромосом у человека?", "options": ["42", "44", "46", "48"], "correct": 2},
            {"text": "Какой газ преобладает в атмосфере Земли?", "options": ["Кислород", "Углекислый газ", "Аргон", "Азот"], "correct": 3},
            {"text": "Скорость звука в воздухе (м/с)?", "options": ["240", "340", "440", "540"], "correct": 1},
            {"text": "Кто изобрел телефон?", "options": ["Эдисон", "Белл", "Маркони", "Тесла"], "correct": 1},
            {"text": "Самая длинная река в мире?", "options": ["Амазонка", "Нил", "Янцзы", "Миссисипи"], "correct": 1},
            {"text": "Какое число Пи (до 2 знаков)?", "options": ["3.12", "3.14", "3.16", "3.18"], "correct": 1},
        ],
        "hard": [
            {"text": "Какова скорость света в вакууме (км/с)?", "options": ["200 000", "250 000", "300 000", "350 000"], "correct": 2},
            {"text": "Кто открыл пенициллин?", "options": ["Пастер", "Флеминг", "Кох", "Мечников"], "correct": 1},
            {"text": "Какой элемент имеет атомный номер 79?", "options": ["Ртуть", "Платина", "Золото", "Вольфрам"], "correct": 2},
            {"text": "В каком году Юрий Гагарин полетел в космос?", "options": ["1959", "1960", "1961", "1962"], "correct": 2},
            {"text": "Что означает DNA (ДНК)?", "options": ["Дезоксирибонуклеиновая кислота", "Двойная нуклеиновая цепь", "Динамическая нуклеарная ось", "Диффузная нуклеотидная цепь"], "correct": 0},
            {"text": "Кто написал 'Фауст'?", "options": ["Шиллер", "Гёте", "Гейне", "Кант"], "correct": 1},
            {"text": "Самый распространённый элемент во Вселенной?", "options": ["Гелий", "Углерод", "Водород", "Кислород"], "correct": 2},
            {"text": "Сколько нобелевских премий у Марии Кюри?", "options": ["1", "2", "3", "4"], "correct": 1},
            {"text": "Что такое апогей?", "options": ["Точка ближайшая к Земле", "Наивысшая точка орбиты", "Экватор планеты", "Центр масс системы"], "correct": 1},
            {"text": "Теорема Пифагора: a²+b²=?", "options": ["a+b", "2ab", "c²", "c³"], "correct": 2},
        ],
    },
    "технологии": {
        "easy": [
            {"text": "Что означает CPU?", "options": ["Центральный процессор", "Центральная память", "Модуль питания", "Блок управления"], "correct": 0},
            {"text": "Сколько бит в одном байте?", "options": ["4", "8", "16", "32"], "correct": 1},
            {"text": "Какой язык программирования используется для веб-страниц?", "options": ["Python", "Java", "HTML", "C++"], "correct": 2},
            {"text": "Что такое Wi-Fi?", "options": ["Проводная сеть", "Беспроводная сеть", "Протокол связи", "Тип антенны"], "correct": 1},
            {"text": "Основатель Apple?", "options": ["Билл Гейтс", "Марк Цукерберг", "Стив Джобс", "Джефф Безос"], "correct": 2},
            {"text": "Что такое URL?", "options": ["Язык программирования", "Адрес веб-страницы", "Тип файла", "Браузер"], "correct": 1},
            {"text": "Расширение Python файлов?", "options": [".java", ".py", ".js", ".cs"], "correct": 1},
            {"text": "Что означает RAM?", "options": ["Постоянная память", "Оперативная память", "Виртуальная память", "Кэш"], "correct": 1},
            {"text": "Первый коммерческий браузер?", "options": ["Firefox", "Chrome", "Netscape", "Safari"], "correct": 2},
            {"text": "Что означает HTTP?", "options": ["Протокол передачи гипертекста", "Язык разметки", "Протокол безопасности", "Алгоритм шифрования"], "correct": 0},
        ],
        "medium": [
            {"text": "Какой алгоритм сортировки имеет O(n log n) в среднем?", "options": ["Пузырьковая", "Вставками", "Быстрая", "Выборкой"], "correct": 2},
            {"text": "Что такое REST API?", "options": ["База данных", "Архитектурный стиль веб-сервисов", "Язык запросов", "Протокол шифрования"], "correct": 1},
            {"text": "В каком году вышел Python 3?", "options": ["2006", "2008", "2010", "2012"], "correct": 1},
            {"text": "Что такое Docker?", "options": ["IDE", "Платформа контейнеризации", "Система контроля версий", "Фреймворк"], "correct": 1},
            {"text": "Что делает команда git pull?", "options": ["Загружает изменения", "Создаёт ветку", "Удаляет репо", "Фиксирует изменения"], "correct": 0},
            {"text": "Что такое SQL?", "options": ["Язык программирования", "Язык запросов к БД", "Протокол сети", "Фреймворк"], "correct": 1},
            {"text": "Что такое VPN?", "options": ["Виртуальная частная сеть", "Высокоскоростной протокол", "Тип Wi-Fi", "Браузер"], "correct": 0},
            {"text": "Для чего нужен JSON?", "options": ["Стилизация", "Обмен данными", "Безопасность", "Шифрование"], "correct": 1},
            {"text": "Что такое GitHub?", "options": ["Социальная сеть", "Платформа для кода и Git", "IDE", "База данных"], "correct": 1},
            {"text": "Что такое машинное обучение?", "options": ["Программирование роботов", "Обучение алгоритмов на данных", "Написание ИИ кода вручную", "Тип процессора"], "correct": 1},
        ],
        "hard": [
            {"text": "Что такое Big O нотация?", "options": ["Метрика памяти", "Описание сложности алгоритма", "Тип данных", "Протокол сети"], "correct": 1},
            {"text": "Что такое blockchain?", "options": ["Тип базы данных", "Децентрализованный реестр", "Протокол шифрования", "Сеть серверов"], "correct": 1},
            {"text": "Что такое deadlock?", "options": ["Утечка памяти", "Взаимная блокировка процессов", "Ошибка компиляции", "Переполнение буфера"], "correct": 1},
            {"text": "Что такое ACID в БД?", "options": ["Язык запросов", "Свойства транзакций", "Тип индекса", "Протокол репликации"], "correct": 1},
            {"text": "Что такое CAP теорема?", "options": ["Алгоритм шифрования", "Теорема распределённых систем", "Метрика производительности", "Метод кэширования"], "correct": 1},
            {"text": "Что такое JWT?", "options": ["База данных", "Токен для аутентификации", "Протокол WebSocket", "Тип шифрования"], "correct": 1},
            {"text": "Что такое WebSocket?", "options": ["HTTP расширение", "Полнодуплексный протокол связи", "Тип REST API", "Библиотека JS"], "correct": 1},
            {"text": "Что такое CI/CD?", "options": ["Тип тестирования", "Непрерывная интеграция и доставка", "Методология разработки", "Облачный сервис"], "correct": 1},
            {"text": "Что такое microservices?", "options": ["Маленькие программы", "Архитектурный стиль с малыми сервисами", "Тип API", "Метод тестирования"], "correct": 1},
            {"text": "Что такое Kubernetes?", "options": ["Язык программирования", "Система оркестрации контейнеров", "База данных", "Фреймворк"], "correct": 1},
        ],
    },
}

def get_backup_questions(topic: str, difficulty: str, count: int) -> list:
    """Get backup questions for a topic"""
    # Try to find matching category
    cat = "general"
    topic_lower = topic.lower()
    for key in BACKUP_QUESTIONS.keys():
        if key in topic_lower or topic_lower in key:
            cat = key
            break
    
    diff = difficulty if difficulty in ["easy", "medium", "hard"] else "medium"
    questions = BACKUP_QUESTIONS.get(cat, BACKUP_QUESTIONS["general"]).get(diff, [])
    
    if not questions:
        questions = BACKUP_QUESTIONS["general"]["medium"]
    
    selected = random.sample(questions, min(count, len(questions)))
    if len(selected) < count:
        # Pad with questions from other difficulties
        all_q = []
        for d in ["easy", "medium", "hard"]:
            all_q.extend(BACKUP_QUESTIONS.get(cat, BACKUP_QUESTIONS["general"]).get(d, []))
        extra = random.sample(all_q, min(count - len(selected), len(all_q)))
        selected.extend(extra)
    
    return selected[:count]


# ============================================================
# MODELS
# ============================================================
class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    username: str
    email: str
    rating: int = 0
    games_played: int = 0
    wins: int = 0

class CreateGameRequest(BaseModel):
    topic: str
    num_questions: int = 7  # 5,6,7
    difficulty: str = "medium"  # easy, medium, hard
    mode: str = "teams"  # teams, ffa
    password: Optional[str] = None
    time_per_question: int = 30

class JoinGameRequest(BaseModel):
    pin: str
    player_name: str
    password: Optional[str] = None
    user_id: Optional[str] = None

class ChooseTeamRequest(BaseModel):
    game_id: str
    player_id: str
    team: str  # "A" or "B"

class GameAction(BaseModel):
    action: str
    player_id: str
    data: Optional[Dict[str, Any]] = None

# ============================================================
# AUTH HELPERS
# ============================================================
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(user_id: str, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "username": username, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        return user
    except JWTError:
        return None

async def require_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    user = await get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ============================================================
# GAME STATE MANAGEMENT (in-memory + MongoDB)
# ============================================================
active_games: Dict[str, dict] = {}  # pin -> game state
websocket_connections: Dict[str, List[WebSocket]] = {}  # game_id -> list of WS
player_ws_map: Dict[str, WebSocket] = {}  # player_id -> WS

def generate_pin() -> str:
    chars = string.ascii_uppercase + string.digits
    while True:
        pin = ''.join(random.choices(chars, k=6))
        if pin not in active_games:
            return pin

async def ai_generate_questions(topic: str, difficulty: str, count: int) -> list:
    """Generate questions using AI with fallback"""
    try:
        if not EMERGENT_LLM_KEY:
            raise ValueError("No AI key")
        
        diff_map = {"easy": "лёгкие", "medium": "средние", "hard": "сложные"}
        diff_ru = diff_map.get(difficulty, "средние")
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"quiz_{uuid.uuid4()}",
            system_message="Ты генератор вопросов для викторины. Всегда отвечай строго в JSON формате."
        ).with_model("openai", "gpt-4o")
        
        prompt = f"""Сгенерируй {count} вопросов для викторины на тему "{topic}". 
Уровень сложности: {diff_ru}.
Верни ТОЛЬКО JSON массив без пояснений:
[
  {{
    "text": "Текст вопроса?",
    "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
    "correct": 0
  }}
]
"correct" - это индекс правильного ответа (0-3). Строго {count} вопросов."""
        
        msg = UserMessage(text=prompt)
        response = await chat.send_message(msg)
        
        # Parse JSON
        text = response.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        
        questions = json.loads(text)
        
        # Validate
        valid = []
        for q in questions:
            if "text" in q and "options" in q and "correct" in q and len(q["options"]) == 4:
                valid.append(q)
        
        if len(valid) >= count:
            return valid[:count]
        
        logger.warning(f"AI returned {len(valid)} questions, need {count}. Using backup for rest.")
        backup = get_backup_questions(topic, difficulty, count - len(valid))
        return valid + backup
        
    except Exception as e:
        logger.warning(f"AI generation failed: {e}. Using backup questions.")
        return get_backup_questions(topic, difficulty, count)

# ============================================================
# AUTH ROUTES
# ============================================================
@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"$or": [{"email": data.email}, {"username": data.username}]}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "username": data.username,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "rating": 1000,
        "games_played": 0,
        "wins": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    token = create_token(user_id, data.username)
    return {"token": token, "user": {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Неверные данные")
    token = create_token(user["id"], user["username"])
    return {"token": token, "user": {k: v for k, v in user.items() if k != "password_hash"}}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(require_user)):
    return {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}

# ============================================================
# GAME ROUTES
# ============================================================
@api_router.post("/games/create")
async def create_game(data: CreateGameRequest, user: Optional[dict] = Depends(get_current_user)):
    pin = generate_pin()
    game_id = str(uuid.uuid4())
    
    host_id = user["id"] if user else str(uuid.uuid4())
    host_name = user["username"] if user else "Ведущий"
    
    # Generate questions
    total_questions = data.num_questions * 2 if data.mode == "teams" else data.num_questions
    logger.info(f"Generating {total_questions} questions on '{data.topic}'...")
    questions = await ai_generate_questions(data.topic, data.difficulty, total_questions)
    
    game = {
        "id": game_id,
        "pin": pin,
        "host_id": host_id,
        "host_name": host_name,
        "topic": data.topic,
        "difficulty": data.difficulty,
        "num_questions": data.num_questions,
        "mode": data.mode,
        "password": data.password,
        "time_per_question": data.time_per_question,
        "state": "waiting",  # waiting, in_progress, paused, finished
        "players": [{
            "id": host_id,
            "name": host_name,
            "team": "A",
            "is_host": True,
            "score": 0,
            "correct_answers": 0,
            "wrong_answers": 0,
            "total_response_time": 0,
            "answers_count": 0,
        }],
        "teams": {"A": [], "B": []},
        "team_colors": _pick_team_colors(),
        "questions": questions,
        "backup_pool": [],  # extra questions for skip replacements
        "current_question_index": 0,
        "current_team": "A",
        "current_player_index": {"A": 0, "B": 0},
        "scores": {"A": 0, "B": 0},
        "skips": {"A": 0, "B": 0},  # skips per team to track equality
        "question_start_time": None,
        "answer_given": False,
        "skipped": False,
        "round_history": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "winner": None,
    }
    
    # Add host to team A
    game["teams"]["A"].append(host_id)
    
    active_games[pin] = game
    websocket_connections[game_id] = []
    
    # Save to DB
    db_game = {k: v for k, v in game.items() if k != "questions"}
    db_game["questions_count"] = len(questions)
    await db.games.insert_one(db_game)
    
    logger.info(f"Game created: PIN={pin}, ID={game_id}, Questions: {len(questions)}")
    
    return {
        "game_id": game_id,
        "pin": pin,
        "host_id": host_id,
        "questions_count": len(questions),
        "ai_used": EMERGENT_LLM_KEY != ""
    }

@api_router.post("/games/join")
async def join_game(data: JoinGameRequest):
    pin = data.pin.upper().strip()
    game = active_games.get(pin)
    
    if not game:
        raise HTTPException(status_code=404, detail="Игра не найдена. Проверьте PIN код.")
    
    if game["state"] == "finished":
        raise HTTPException(status_code=400, detail="Игра уже завершена")
    
    if game["state"] == "in_progress":
        # Allow rejoin
        existing = next((p for p in game["players"] if p["name"] == data.player_name), None)
        if existing:
            return {"game_id": game["id"], "player_id": existing["id"], "game": sanitize_game(game)}
    
    if game["password"] and game["password"] != data.password:
        raise HTTPException(status_code=403, detail="Неверный пароль комнаты")
    
    player_id = data.user_id or str(uuid.uuid4())
    
    # Check if already in game
    existing = next((p for p in game["players"] if p["id"] == player_id or p["name"] == data.player_name), None)
    if existing:
        return {"game_id": game["id"], "player_id": existing["id"], "game": sanitize_game(game)}
    
    # Auto-assign team (balance teams)
    team_a_count = len(game["teams"]["A"])
    team_b_count = len(game["teams"]["B"])
    auto_team = "A" if team_a_count <= team_b_count else "B"
    
    player = {
        "id": player_id,
        "name": data.player_name,
        "team": auto_team,
        "is_host": False,
        "score": 0,
        "correct_answers": 0,
        "wrong_answers": 0,
        "total_response_time": 0,
        "answers_count": 0,
    }
    
    game["players"].append(player)
    game["teams"][auto_team].append(player_id)
    
    await broadcast_game_state(game)
    
    return {"game_id": game["id"], "player_id": player_id, "game": sanitize_game(game)}

@api_router.post("/games/choose-team")
async def choose_team(data: ChooseTeamRequest):
    game = None
    for g in active_games.values():
        if g["id"] == data.game_id:
            game = g
            break
    
    if not game:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    
    if game["state"] != "waiting":
        raise HTTPException(status_code=400, detail="Нельзя менять команду во время игры")
    
    player = next((p for p in game["players"] if p["id"] == data.player_id), None)
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    
    old_team = player["team"]
    new_team = data.team
    
    if old_team == new_team:
        return {"success": True, "game": sanitize_game(game)}
    
    # Remove from old team
    if data.player_id in game["teams"][old_team]:
        game["teams"][old_team].remove(data.player_id)
    
    # Add to new team
    player["team"] = new_team
    if data.player_id not in game["teams"][new_team]:
        game["teams"][new_team].append(data.player_id)
    
    await broadcast_game_state(game)
    return {"success": True, "game": sanitize_game(game)}

@api_router.get("/games/{pin}")
async def get_game(pin: str):
    game = active_games.get(pin.upper())
    if not game:
        # Try to find in DB
        db_game = await db.games.find_one({"pin": pin.upper()}, {"_id": 0})
        if db_game:
            raise HTTPException(status_code=410, detail="Игра завершена")
        raise HTTPException(status_code=404, detail="Игра не найдена")
    return sanitize_game(game)

@api_router.get("/games/id/{game_id}")
async def get_game_by_id(game_id: str):
    for game in active_games.values():
        if game["id"] == game_id:
            return sanitize_game(game)
    raise HTTPException(status_code=404, detail="Игра не найдена")

@api_router.post("/games/{game_id}/start")
async def start_game(game_id: str, player_id: str):
    game = None
    for g in active_games.values():
        if g["id"] == game_id:
            game = g
            break
    
    if not game:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    
    if game["host_id"] != player_id:
        raise HTTPException(status_code=403, detail="Только ведущий может начать игру")
    
    if len(game["players"]) < 2:
        raise HTTPException(status_code=400, detail="Недостаточно игроков (минимум 2)")
    
    if game["state"] != "waiting":
        raise HTTPException(status_code=400, detail="Игра уже началась")
    
    # Ensure teams have players
    if game["mode"] == "teams":
        if len(game["teams"]["A"]) == 0 or len(game["teams"]["B"]) == 0:
            # Auto-balance
            all_players = [p["id"] for p in game["players"]]
            random.shuffle(all_players)
            mid = len(all_players) // 2
            game["teams"]["A"] = all_players[:mid] if mid > 0 else all_players[:1]
            game["teams"]["B"] = all_players[mid:] if mid > 0 else all_players[1:]
            for p in game["players"]:
                p["team"] = "A" if p["id"] in game["teams"]["A"] else "B"
    
    game["state"] = "in_progress"
    game["current_question_index"] = 0
    game["current_team"] = "A"
    game["question_start_time"] = datetime.now(timezone.utc).isoformat()
    game["answer_given"] = False
    game["skipped"] = False
    
    await broadcast_game_state(game)
    asyncio.create_task(question_timer(game))
    
    return {"success": True, "game": sanitize_game(game)}

@api_router.post("/games/{game_id}/action")
async def game_action(game_id: str, action: GameAction):
    game = None
    for g in active_games.values():
        if g["id"] == game_id:
            game = g
            break
    
    if not game:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    
    if action.action == "answer":
        return await handle_answer(game, action.player_id, action.data or {})
    elif action.action == "pause":
        return await handle_pause(game, action.player_id)
    elif action.action == "resume":
        return await handle_resume(game, action.player_id)
    elif action.action == "skip":
        return await handle_skip(game, action.player_id)
    elif action.action == "next_question":
        return await handle_next_question(game, action.player_id)
    elif action.action == "disqualify":
        return await handle_disqualify(game, action.player_id, action.data or {})
    else:
        raise HTTPException(status_code=400, detail="Неизвестное действие")

async def handle_answer(game: dict, player_id: str, data: dict):
    if game["state"] not in ["in_progress"]:
        return {"error": "Игра не активна"}
    
    if game["answer_given"]:
        return {"error": "Ответ уже дан"}
    
    player = next((p for p in game["players"] if p["id"] == player_id), None)
    if not player:
        return {"error": "Игрок не найден"}
    
    mode = game["mode"]
    
    if mode == "teams":
        # Check if it's this player's turn
        current_team = game["current_team"]
        if player["team"] != current_team:
            return {"error": "Не ваш ход"}
        
        team_players = [pid for pid in game["teams"][current_team]]
        if not team_players:
            return {"error": "В команде нет игроков"}
        
        current_idx = game["current_player_index"].get(current_team, 0) % len(team_players)
        if team_players[current_idx] != player_id:
            return {"error": "Сейчас не ваша очередь отвечать"}
    
    # Calculate response time
    start_time = game.get("question_start_time")
    response_time = 30.0
    if start_time:
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(start_time.replace("Z", "+00:00"))).total_seconds()
        response_time = max(0.1, min(elapsed, game["time_per_question"]))
    
    q_idx = game["current_question_index"]
    question = game["questions"][q_idx]
    chosen = data.get("answer_index", -1)
    correct = question["correct"]
    is_correct = chosen == correct
    
    # Base points
    points = 0
    if is_correct:
        # Speed bonus: faster = more points (max 10, min 1)
        time_ratio = 1 - (response_time / game["time_per_question"])
        speed_bonus = int(time_ratio * 5)
        
        difficulty_bonus = {"easy": 1, "medium": 2, "hard": 3}.get(game["difficulty"], 2)
        points = difficulty_bonus + speed_bonus
        
        if mode == "teams":
            game["scores"][player["team"]] += points
        
        player["score"] += points
        player["correct_answers"] += 1
    else:
        player["wrong_answers"] += 1
    
    player["total_response_time"] += response_time
    player["answers_count"] += 1
    
    game["answer_given"] = True
    
    # Record history
    game["round_history"].append({
        "question_index": q_idx,
        "player_id": player_id,
        "player_name": player["name"],
        "team": player.get("team", ""),
        "chosen": chosen,
        "correct": correct,
        "is_correct": is_correct,
        "points": points,
        "response_time": response_time,
    })
    
    await broadcast_game_state(game, extra={"event": "answer_result", "is_correct": is_correct, "correct_index": correct, "points": points})
    
    # Wait 2 seconds then advance
    asyncio.create_task(advance_after_delay(game, 2.0))
    
    return {"is_correct": is_correct, "correct_index": correct, "points": points}

async def advance_after_delay(game: dict, delay: float):
    await asyncio.sleep(delay)
    if game["state"] == "in_progress" and game["answer_given"]:
        await advance_question(game, reason="answered")

async def handle_pause(game: dict, player_id: str):
    if game["host_id"] != player_id:
        return {"error": "Только ведущий может поставить на паузу"}
    
    if game["state"] == "in_progress":
        # Save remaining time
        start_time = game.get("question_start_time")
        if start_time:
            elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(start_time.replace("Z", "+00:00"))).total_seconds()
            game["paused_remaining"] = max(0, game["time_per_question"] - elapsed)
        else:
            game["paused_remaining"] = game["time_per_question"]
        
        game["state"] = "paused"
        game["paused_at"] = datetime.now(timezone.utc).isoformat()
        await broadcast_game_state(game)
        return {"success": True, "state": "paused"}
    
    return {"error": "Нельзя поставить на паузу"}

async def handle_resume(game: dict, player_id: str):
    if game["host_id"] != player_id:
        return {"error": "Только ведущий может снять с паузы"}
    
    if game["state"] == "paused":
        remaining = game.get("paused_remaining", game["time_per_question"])
        # Set new start time so timer reflects remaining time
        new_start = datetime.now(timezone.utc) - timedelta(seconds=game["time_per_question"] - remaining)
        game["question_start_time"] = new_start.isoformat()
        game["state"] = "in_progress"
        game["paused_remaining"] = None
        await broadcast_game_state(game)
        # Restart timer
        asyncio.create_task(question_timer(game))
        return {"success": True, "state": "in_progress"}
    
    return {"error": "Игра не на паузе"}

async def handle_skip(game: dict, player_id: str):
    if game["host_id"] != player_id:
        return {"error": "Только ведущий может пропустить вопрос"}
    
    if game["state"] == "in_progress" and not game["answer_given"]:
        # Skip: do NOT switch teams, do NOT advance player index — just move to next question for SAME team
        game["skipped"] = True
        game["answer_given"] = True
        await advance_question_skip(game)
        return {"success": True}
    
    return {"error": "Нельзя пропустить"}

async def advance_question_skip(game: dict):
    """Skip: move to next question without switching team or updating player index"""
    if game["state"] == "finished":
        return
    
    q_idx = game["current_question_index"]
    total_q = len(game["questions"])
    
    game["current_question_index"] = q_idx + 1
    
    if game["current_question_index"] >= total_q:
        await end_game(game)
        return
    
    game["answer_given"] = False
    game["skipped"] = False
    game["question_start_time"] = datetime.now(timezone.utc).isoformat()
    
    await broadcast_game_state(game, extra={"event": "next_question"})
    asyncio.create_task(question_timer(game))

async def handle_next_question(game: dict, player_id: str):
    if game["host_id"] != player_id:
        return {"error": "Только ведущий"}
    await advance_question(game, reason="host_next")
    return {"success": True}

async def handle_disqualify(game: dict, player_id: str, data: dict):
    if game["host_id"] != player_id:
        return {"error": "Только ведущий"}
    
    target_id = data.get("target_player_id")
    target = next((p for p in game["players"] if p["id"] == target_id), None)
    if target and not target.get("is_host"):
        target["disqualified"] = True
        # Remove from team
        for team in ["A", "B"]:
            if target_id in game["teams"][team]:
                game["teams"][team].remove(target_id)
        await broadcast_game_state(game)
        return {"success": True}
    
    return {"error": "Игрок не найден"}

async def advance_question(game: dict, reason: str = "timeout"):
    """Move to next question or end game"""
    if game["state"] == "finished":
        return
    
    q_idx = game["current_question_index"]
    total_q = len(game["questions"])
    mode = game["mode"]
    
    if mode == "teams":
        current_team = game["current_team"]
        num_q_per_team = game["num_questions"]
        
        # Update player index in team
        team_players = [pid for pid in game["teams"][current_team] if not next((p for p in game["players"] if p["id"] == pid and p.get("disqualified")), None)]
        if team_players:
            current_idx = game["current_player_index"].get(current_team, 0)
            game["current_player_index"][current_team] = (current_idx + 1) % len(team_players)
        
        # Switch team
        game["current_team"] = "B" if current_team == "A" else "A"
        game["current_question_index"] = q_idx + 1
    else:
        game["current_question_index"] = q_idx + 1
    
    # Check if game is over
    if game["current_question_index"] >= total_q:
        await end_game(game)
        return
    
    # Next question
    game["answer_given"] = False
    game["skipped"] = False
    game["question_start_time"] = datetime.now(timezone.utc).isoformat()
    
    await broadcast_game_state(game, extra={"event": "next_question"})
    asyncio.create_task(question_timer(game))

async def question_timer(game: dict):
    """Timer for each question — keyed by (game_id, q_idx, start_time) to avoid duplicates"""
    game_id = game["id"]
    q_idx = game["current_question_index"]
    start_time = game["question_start_time"]
    time_limit = game["time_per_question"]
    
    await asyncio.sleep(time_limit)
    
    # Check if still on same question and not answered
    current_game = None
    for g in active_games.values():
        if g["id"] == game_id:
            current_game = g
            break
    
    if not current_game:
        return
    
    # Guard: only fire if we're still on the exact same question + start_time
    if (current_game["state"] == "in_progress" and 
        current_game["current_question_index"] == q_idx and
        current_game["question_start_time"] == start_time and
        not current_game["answer_given"]):
        
        logger.info(f"Timer expired for game {game_id}, question {q_idx}")
        current_game["answer_given"] = True
        await broadcast_game_state(current_game, extra={"event": "timeout", "correct_index": current_game["questions"][q_idx]["correct"]})
        await asyncio.sleep(1.5)
        await advance_question(current_game, reason="timeout")

async def end_game(game: dict):
    game["state"] = "finished"
    game["finished_at"] = datetime.now(timezone.utc).isoformat()
    
    # Determine winner
    if game["mode"] == "teams":
        score_a = game["scores"]["A"]
        score_b = game["scores"]["B"]
        if score_a > score_b:
            game["winner"] = "A"
        elif score_b > score_a:
            game["winner"] = "B"
        else:
            game["winner"] = "draw"
    else:
        # FFA: player with most points wins
        top = max(game["players"], key=lambda p: p["score"], default=None)
        game["winner"] = top["id"] if top else "draw"
    
    # Update player stats in DB
    for player in game["players"]:
        if player.get("id"):
            update = {
                "$inc": {
                    "games_played": 1,
                    "wins": 1 if (game["mode"] == "teams" and player["team"] == game["winner"]) or 
                                  (game["mode"] == "ffa" and player["id"] == game["winner"]) else 0,
                    "rating": 10 if player["correct_answers"] > 0 else -5
                }
            }
            await db.users.update_one({"id": player["id"]}, update)
    
    # Save final game to DB
    await db.game_history.insert_one({
        "game_id": game["id"],
        "pin": game["pin"],
        "topic": game["topic"],
        "mode": game["mode"],
        "difficulty": game["difficulty"],
        "winner": game["winner"],
        "scores": game["scores"],
        "players": game["players"],
        "round_history": game["round_history"],
        "created_at": game["created_at"],
        "finished_at": game["finished_at"],
    })
    
    await broadcast_game_state(game, extra={"event": "game_over"})
    logger.info(f"Game {game['id']} finished. Winner: {game['winner']}")

def sanitize_game(game: dict) -> dict:
    """Return game state without sensitive data, hide question answers if in progress"""
    g = {k: v for k, v in game.items() if k not in ["_id"]}
    
    # Hide correct answers during active game
    if game["state"] in ["in_progress", "paused"]:
        safe_questions = []
        for i, q in enumerate(game.get("questions", [])):
            if i < game["current_question_index"]:
                safe_questions.append(q)  # Past questions can show answer
            elif i == game["current_question_index"]:
                safe_questions.append({k: v for k, v in q.items() if k != "correct"})
            else:
                safe_questions.append({k: v for k, v in q.items() if k != "correct"})
        g["questions"] = safe_questions
    
    return g

async def broadcast_game_state(game: dict, extra: dict = None):
    """Broadcast game state to all connected WebSocket clients"""
    game_id = game["id"]
    if game_id not in websocket_connections:
        return
    
    state = sanitize_game(game)
    if extra:
        state["_event"] = extra
    
    message = json.dumps({"type": "game_state", "data": state})
    
    dead_ws = []
    for ws in websocket_connections[game_id]:
        try:
            await ws.send_text(message)
        except Exception:
            dead_ws.append(ws)
    
    for ws in dead_ws:
        if ws in websocket_connections[game_id]:
            websocket_connections[game_id].remove(ws)

# ============================================================
# WEBSOCKET
# ============================================================
@app.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(ws: WebSocket, game_id: str, player_id: str):
    await ws.accept()
    
    if game_id not in websocket_connections:
        websocket_connections[game_id] = []
    websocket_connections[game_id].append(ws)
    player_ws_map[player_id] = ws
    
    logger.info(f"WS connected: game={game_id}, player={player_id}")
    
    # Send initial state
    for game in active_games.values():
        if game["id"] == game_id:
            await ws.send_text(json.dumps({"type": "game_state", "data": sanitize_game(game)}))
            break
    
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            
            if msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
            
    except WebSocketDisconnect:
        logger.info(f"WS disconnected: game={game_id}, player={player_id}")
    except Exception as e:
        logger.warning(f"WS error: {e}")
    finally:
        if game_id in websocket_connections and ws in websocket_connections[game_id]:
            websocket_connections[game_id].remove(ws)
        if player_id in player_ws_map:
            del player_ws_map[player_id]
        
        # Remove disconnected player from game (waiting room AND active game)
        for game in active_games.values():
            if game["id"] == game_id:
                player = next((p for p in game["players"] if p["id"] == player_id and not p.get("is_host")), None)
                if player:
                    # Always remove from player list and teams
                    game["players"] = [p for p in game["players"] if p["id"] != player_id]
                    for team in ["A", "B"]:
                        if player_id in game["teams"][team]:
                            game["teams"][team].remove(player_id)
                    await broadcast_game_state(game)
                break

# ============================================================
# LEADERBOARD & STATS
# ============================================================
@api_router.get("/leaderboard")
async def get_leaderboard():
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("rating", -1).limit(50).to_list(50)
    return users

@api_router.get("/games/{game_id}/stats")
async def get_game_stats(game_id: str):
    history = await db.game_history.find_one({"game_id": game_id}, {"_id": 0})
    if not history:
        # Check active game
        for game in active_games.values():
            if game["id"] == game_id:
                return sanitize_game(game)
        raise HTTPException(status_code=404, detail="Статистика не найдена")
    return history

@api_router.get("/games/{game_id}/export")
async def export_game_results(game_id: str):
    """Export game results as formatted TXT file"""
    history = await db.game_history.find_one({"game_id": game_id}, {"_id": 0})
    if not history:
        raise HTTPException(status_code=404, detail="Статистика не найдена")
    
    from fastapi.responses import Response
    
    lines = []
    lines.append("=" * 50)
    lines.append("  BRAINBATTLE — РЕЗУЛЬТАТЫ ИГРЫ")
    lines.append("=" * 50)
    lines.append(f"Тема:         {history.get('topic', '—')}")
    lines.append(f"Режим:        {'Командный' if history.get('mode') == 'teams' else 'Каждый за себя'}")
    lines.append(f"Сложность:    {history.get('difficulty', '—')}")
    lines.append(f"Победитель:   {'Команда А' if history.get('winner') == 'A' else 'Команда Б' if history.get('winner') == 'B' else history.get('winner', '—')}")
    lines.append(f"Дата:         {history.get('finished_at', '—')[:10] if history.get('finished_at') else '—'}")
    lines.append("")
    
    if history.get('mode') == 'teams':
        scores = history.get('scores', {})
        lines.append(f"СЧЁТ: Команда А {scores.get('A', 0)} : {scores.get('B', 0)} Команда Б")
        lines.append("")
    
    lines.append("СТАТИСТИКА ИГРОКОВ:")
    lines.append("-" * 50)
    players = sorted(history.get('players', []), key=lambda p: p.get('score', 0), reverse=True)
    for i, p in enumerate(players, 1):
        avg_time = f"{p.get('total_response_time', 0) / max(p.get('answers_count', 1), 1):.1f}с"
        team_str = f" [Команда {'А' if p.get('team') == 'A' else 'Б'}]" if history.get('mode') == 'teams' else ""
        lines.append(f"  #{i} {p.get('name', '?')}{team_str}")
        lines.append(f"     Очки: {p.get('score', 0)}  |  Правильно: {p.get('correct_answers', 0)}  |  Неверно: {p.get('wrong_answers', 0)}  |  Среднее время: {avg_time}")
    
    lines.append("")
    lines.append("ИСТОРИЯ ВОПРОСОВ:")
    lines.append("-" * 50)
    for h in history.get('round_history', []):
        result = "✓" if h.get('is_correct') else "✗"
        lines.append(f"  Q{h.get('question_index', 0)+1} | {h.get('player_name', '?')} | {result} | {h.get('response_time', 0):.1f}с | +{h.get('points', 0)} очков")
    
    lines.append("")
    lines.append("=" * 50)
    lines.append("  BRAINBATTLE — quizbattle.game")
    lines.append("=" * 50)
    
    content = "\n".join(lines)
    
    return Response(
        content=content.encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f"attachment; filename=brainbattle_{game_id[:8]}_results.txt"}
    )

@api_router.get("/user/{user_id}/history")
async def get_user_history(user_id: str):
    games = await db.game_history.find(
        {"players.id": user_id}, {"_id": 0}
    ).sort("finished_at", -1).limit(20).to_list(20)
    return games

# ============================================================
# HEALTH CHECK
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "BrainBattle API running", "active_games": len(active_games)}

@api_router.get("/health")
async def health():
    return {"status": "ok", "active_games": len(active_games), "ai_enabled": bool(EMERGENT_LLM_KEY)}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

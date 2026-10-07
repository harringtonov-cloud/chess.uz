# CHESS.UZ — архитектура «аналога Lichess»

## Стек

| Слой | Выбор | Почему |
|---|---|---|
| Язык | TypeScript везде | Один шахматный движок (`src/chess`) работает в браузере, Web Worker и на сервере — сервер проверяет ходы тем же кодом |
| Frontend | React 18 + Vite (уже в проекте) | Доска — лёгкий компонент; тяжёлое (Stockfish, ИИ) уходит в Web Worker |
| Backend | Node.js + Fastify + `ws` (WebSocket) | Тот же TS-код, низкая задержка, простое горизонтальное масштабирование |
| Состояние партий | Redis (pub/sub, активные партии, часы) | Быстрый обмен ходами между инстансами |
| Данные | PostgreSQL (игроки, партии, рейтинги, пазлы) | Надёжность, SQL для статистики и турниров |
| Анализ | Stockfish WASM (клиент) + очередь воркеров (сервер) | Этап 3 |

## Структура репозитория (целевая)

```
src/chess/        ← ЭТАП 1 (готово): чистое ядро правил, без DOM
  types.ts          Color, Role, Square, Move, Outcome…
  position.ts       Position: легальные ходы, рокировки (в т.ч. 960), e.p., превращения, мат/пат, материал, perft
  fen.ts            parseFen / makeFen (X-FEN и Shredder-FEN)
  san.ts            SAN и UCI
  game.ts           Game: история, откат, мат/пат/повторения/50-75 ходов, сдача, ничья, флаг
  pgn.ts            parsePgn (теги, комментарии, NAG, вариации, [%clk]), gameFromPgn, toPgn
  clock.ts          ChessClock: Фишер / задержка / Бронштейн, категории bullet/blitz/rapid, sync с сервером
  premove.ts        premoveDests, PremoveController
  chess960.ts       генератор позиций 0…959
  __tests__/        perft + правила + PGN + часы + пре-мувы (npm test, без зависимостей)
src/chess-ui/     фигуры (SVG), позже — анимации, звуки
src/components/   ChessBoard, PromotionModal
src/game/         ИИ (встроенный), конфиги, пазлы
server/           ← этап 4: Fastify + ws, матчмейкинг, авторитетные часы
packages/         ← при росте: chess-core (src/chess), protocol (типы сообщений WS)
```

## Как подключатся следующие этапы

**Варианты (этап 2).** `Position` уже хранит `variant` и принимает рокировку в общей (960) форме. Для остальных вариантов добавляется слой правил: `variants/<name>.ts` реализует `legalMoves`, `playUnchecked`, `outcome` поверх `Position` (Atomic — взрывы в `playUnchecked`; Antichess — обязательное взятие в `legalMoves`; Crazyhouse — карман + ходы-сбросы в `Move`; KOTH/Three-check/Racing Kings — дополнительные условия в `Game.detectAutomatic`). Тесты — тот же perft с известными числами для каждого варианта.

**Stockfish (этап 3).** Web Worker с UCI-протоколом: `moveToUci`/`parseUci` уже готовы (в т.ч. Chess960). Уровни 1–8 = Skill Level + глубина/время.

**Сеть (этап 4).** Клиент шлёт `{type:'move', uci, ply}`; сервер валидирует через `Game.play`, ведёт авторитетный `ChessClock` (`press(mover, lagMs)` — компенсация лага), рассылает `ClockSnapshot` (`sync()` на клиенте). Пре-мувы исполняются на клиенте сразу после хода соперника (`PremoveController.resolve`).

**Рейтинг (этап 5).** Категории из `categorize(timeControl)`; Glicko-2 отдельно по категории и варианту.

## Замена набора фигур

Фигуры лежат в `src/chess-ui/pieces.ts` (векторные SVG, собираются кодом). Чтобы использовать готовый набор (например, официальный набор Lichess), положите файлы `wK.svg … bP.svg` в `public/pieces/<набор>/` и поменяйте `pieceUrl()` так, чтобы она возвращала `./pieces/<набор>/${color}${ROLE}.svg`. Учтите лицензию выбранного набора.

## Запуск

```
bun install
bun run dev      # интерфейс
bun run test     # тесты движка (Node ≥ 22.18, без зависимостей)
```

## Деплой на Netlify

Сайт — статический (Vite). Файл `netlify.toml` уже настроен: команда `npm run build`, папка публикации `dist`, Node 22, SPA-редиректы.
1. Загрузите проект в GitHub → Netlify → *Add new site → Import from Git* → выберите репозиторий (настройки подтянутся из `netlify.toml`).
2. Либо вручную: `npm install && npm run build`, затем перетащите папку `dist` на https://app.netlify.com/drop.
3. Проверка типов отдельно: `npm run typecheck`.

Важно для этапа 4 (онлайн): Netlify Functions не держат постоянные WebSocket-соединения. Игровой сервер (`server/`) нужно разместить отдельно (Fly.io, Railway, Render и т. п.), а на Netlify оставить фронтенд.

## Firebase (хранение партий)

Код: `src/data/firebase.ts` (инициализация), `src/data/games.ts` (анонимный вход, сохранение и история партий), правила — `firestore.rules`.
Настройка в консоли Firebase (проект `chess-b0c48`):
1. *Authentication → Sign-in method → Anonymous* — включить.
2. *Firestore Database* — создать базу (production mode) и вставить содержимое `firestore.rules` во вкладку Rules → Publish.
3. *Authentication → Settings → Authorized domains* — добавить домен Netlify (`<имя>.netlify.app`).

## Деплой на Vercel

`vercel.json` уже настроен (Vite, `dist`, SPA-перенаправления). Vercel → *Add New → Project* → импорт репозитория GitHub → Deploy. Домен вида `<имя>.vercel.app` добавьте в Firebase: *Authentication → Settings → Authorized domains*.

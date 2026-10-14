# chess.uz

Шахматный сайт: React + Vite + TypeScript, база и вход — Firebase (Auth + Firestore), хостинг — Netlify.

## Что уже есть

- **Онлайн-партии 1 на 1** в реальном времени: быстрый подбор соперника, игра по ссылке, часы (пуля, блиц, рапид, классика), ничья, сдача, отмена, реванш, чат, смайлы
- **Рейтинг Эло** по контролям времени, профили, таблица лидеров, история партий
- **Игра с ботами** (7 уровней, Stockfish в браузере): подсказка, отмена хода, выбор цвета
- **Анализ партий**: Stockfish, график преимущества, оценка каждого хода (неточность / ошибка / грубая ошибка), точность в %, импорт PGN и FEN
- **Головоломки** из базы Lichess с рейтингом, сериями и подсказками (есть запасные задачи на случай, если база недоступна)
- Правила: рокировка, взятие на проходе, превращение, мат/пат/ничья (повторение, 50 ходов, недостаток материала)

## Запуск локально

```bash
npm install
cp .env.example .env.local   # впишите ключи Firebase
npm run dev
```

Без ключей Firebase работают боты, анализ и головоломки; онлайн-игра и профили будут отключены.

## Настройка Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Sign-in method**: включите **Google** и **Email/Password**.
3. **Authentication → Settings → Authorized domains**: добавьте домен вашего сайта на Netlify и свой домен (chess.uz).
4. **Build → Firestore Database → Create database** (режим production, ближайший регион).
5. **Project settings → Your apps → Web app (`</>`)**: скопируйте конфиг в `.env.local` (поля `VITE_FIREBASE_*`).
6. Опубликуйте правила и индексы:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add          # выберите проект
   firebase deploy --only firestore
   ```
   Это загрузит `firestore.rules` и `firestore.indexes.json` (индекс нужен для истории партий в профиле).

## Деплой на Netlify

1. **Add new site → Import from Git** → выберите этот репозиторий. Настройки подтянутся из `netlify.toml` (build: `npm run build`, publish: `dist`).
2. **Site settings → Environment variables**: добавьте все `VITE_FIREBASE_*` из `.env.example`.
3. Запустите деплой. Маршрутизация SPA настроена в `netlify.toml`.

## Известные ограничения (важно)

- Правильность ходов, часы и обновление рейтинга проверяются **в браузерах игроков**. Правила Firestore пускают в партию только её участников, но без серверного кода (Cloud Functions) нельзя полностью исключить жульничество. Для серьёзного запуска перенесите `makeMove`, `flagGame` и `applyRating` в Cloud Functions.
- Брошенные ожидающие партии остаются в базе (подбор их игнорирует по «пульсу» создателя). Их можно чистить по расписанию Cloud Function.
- Фигуры рисуются символами Unicode; для своего вида подключите набор SVG-фигур.
- Движок Stockfish (asm.js) подгружается с CDN jsDelivr.

## Дорожная карта

Турниры (арена, швейцарка), друзья и клубы, шахматные варианты (Chess960, Crazyhouse и др.), курсы и уроки, дебютный справочник, Puzzle Rush, ежедневные партии, серверная проверка ходов.

# Game Plan

- Planned at:     2026-10-06T07:51:59Z
- Mode:           2d
- Title:            CHESS.UZ
- One-line pitch: CHESS.UZ — энергичные «королевские» шахматы в неоновом векторе: полные правила, AI, локальный 2P, часы, пазлы и анализ — как Lichess, но с драматичным пульсом шахов и матов.

## 1. Verb — the moment-to-moment action

**Primary verb:** move
**Input:** tap / click (select square then destination, or drag); UI buttons for modes and clocks

**Actions** (each is a candidate SFX cue for audio generation; mark core vs. secondary):

- `select_piece` *(core)*: игрок выбирает фигуру — подсветка легальных ходов
- `make_move` *(core)*: фигура переезжает на клетку с короткой анимацией
- `capture` *(core)*: вспышка и звук при взятии
- `check_pulse` *(core)*: пульсация короля и рамки доски под шахом
- `promote` *(core)*: выбор ферзь / ладья / слон / конь
- `clock_tick` *(secondary)*: тик в цейтноте
- `puzzle_solve` *(core)*: верный ход в тактической задаче
- `puzzle_fail` *(secondary)*: неверный ход в пазле
- `undo` *(secondary)*: откат хода (vs AI / анализ)
- `resign` *(secondary)*: сдача партии
- `mate_fanfare` *(core)*: драматичный финал мата

## 2. Loop — the rhythm

**30-second loop:** Сделать легальный ход, увидеть реакцию доски (шах / взятие / часы) и ждать ответа соперника или AI.
**5-minute loop:** Доиграть партию или серию пазлов → экран результата → реванш / другой режим / анализ.

## 3. Stakes — what's at risk and what's earned

**Tension:** часы тикают и позиция под угрозой мата / цейтнота
**Reward:** победа, стрик пазлов, чистая комбинация, красивый мат
**Failure:** мат, время вышло, серия пазлов оборвана ошибкой

## 4. Setting — the lightweight vibe

**World:** неоновая королевская арена — классические фигуры на светящейся доске
**Mood:** epic + tense
**Art style:** flat neon vector (чистые формы, свечение ходов, контрастный HUD)

**Scenes** (each is a candidate background asset):

- `lobby`: выбор режима — Партия / Пазлы / Анализ
- `board`: игровая доска + часы + панель ходов
- `result`: драматичный финал (мат / время / ничья)

**Cast** (each is a candidate portrait or sprite asset; omit if none):

- *(нет именованных персонажей — «герои» это фигуры и пульс шаха/мата)*

## 5. MVP — the line we don't cross

**Tier:** Ambitious

**Must-have** (the smallest thing that's still the game):
- Полные правила FIDE: рокировка, en passant, превращение, пат, мат, троекратное повторение, правило 50 ходов
- Партия vs AI (несколько уровней сложности) + локальный 2 игрока на одном устройстве
- Часы: пресеты Bullet / Blitz / Rapid + режим без часов
- Список ходов, undo (с лимитом в vs AI), resign, предложение/принятие ничьей
- Тактические пазлы: набор позиций + серийный режим
- Доска анализа: свободная расстановка и проигрывание линии
- 2–3 темы доски/фигур, звук ходов/шаха/мата, энергичные анимации
- Импорт/экспорт PGN локально

**Nice-to-have** (explicit "if we have time"):
- Opening book / подсказки лучших ходов
- Упрощённая оценка позиции «полоской»
- История партий в localStorage
- Дополнительные темы и звуковые пакеты

**Out of scope** (the temptations we're refusing — must be non-empty):
- Настоящий онлайн-матчмейкинг, рейтинг, турниры (только через отдельный `/multiplayer`)
- Облачный Stockfish / серверный анализ
- Opening explorer с огромной базой, tablebase, broadcast, study editor
- Аккаунты, чат, друзья, донаты

**Asset budget:** 3 фона (lobby / board / result); неоновые UI-акценты; 6–8 SFX (ход, взятие, шах, мат, ошибка пазла, тик часов, UI-клик); 1–2 BGM (меню / партия). Фигуры и доска — код/SVG для читаемости и контроля бюджета.

## Open questions

- Онлайн появится только после явного вызова `/multiplayer` — в MVP его нет.
- AI реализуется встроенным браузерным движком (минимакс / упрощённая оценка), без внешнего сервера.

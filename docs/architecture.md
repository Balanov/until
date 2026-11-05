# UNTIL — архитектура и границы MVP

## Решение

UNTIL — открытый local-first control plane для непрерывных продуктовых циклов. Детерминированное ядро получает бизнес-цель и реальные сигналы, ставит работу ролевым агентам, проверяет их полномочия и результаты, выпускает только доказанные артефакты и по исходу запускает следующий цикл. LLM может исследовать, предлагать и синтезировать, но не владеет очередью, бюджетом, правами, verdict или внешним side effect.

**Формула:** signal → hypothesis → contract → execution → independent proof → release candidate → observed outcome → next work.

**Позиционирование:** не «первая виртуальная софтверная компания», а нейтральное открытое ядро доказуемой автономии поверх существующих research- и coding-инструментов.

## Что именно доказывает версия 0.1

Версия 0.1 — работающий engineering MVP, а не заявление о полной замене продуктовой команды. Она должна продемонстрировать на детерминированных и реальных адаптерах:

1. Постоянную самостоятельную постановку задач из незакрытых целей, а не завершение после первого ответа модели.
2. Durable queue на SQLite с lease, retry/backoff, dead-letter, восстановлением после перезапуска и bounded concurrency.
3. Persistent epoch stop: новые задачи блокируются, а поздние результаты старого epoch отклоняются перед публикацией.
4. Ролевые capability policy: исследователь не выпускает, builder не принимает собственную работу, verifier не меняет цель, evolver не меняет права и бюджеты.
5. Evidence gate: synthetic-сигнал может создать гипотезу или исследование, но не разблокировать production delivery. Для выпуска нужны реальные наблюдения и исполняемые acceptance checks.
6. Идемпотентные действия и hash-chain аудит: повтор одного логического действия не создаёт второй артефакт или внешний вызов.
7. Model neutrality: OpenAI-compatible HTTP, отдельная модель по роли, таймауты, учёт usage/cost, replay без ключа.
8. Управляемое самоулучшение: кандидат меняет только разрешённую стратегию, сравнивается с неизменным baseline на selection и held-out наборах и откатывается при регрессии.
9. Воспроизводимый proof bundle: исходные сигналы, конфигурация, события, проверки, артефакты, метрики, сырые замеры и команда повторения.

## Что версия 0.1 сознательно не доказывает

- Универсальную замену PM, исследователей, аналитиков, дизайнеров, инженеров или владельца бизнеса.
- Качество произвольной LLM, автоматическое понимание рынка или прибыльность продукта.
- Кастдев без реальных клиентов. Агенты могут модерировать и обрабатывать интервью; человек-клиент остаётся источником наблюдения. Синтетические пользователи — инструмент генерации гипотез, не demand proof.
- Безопасное исполнение произвольного кода внутри основного процесса. Внешний coding-agent запускается только как отдельный процесс в настроенной OS/VM/container sandbox.
- Exactly-once внешние эффекты без поддержки idempotency/reconciliation у провайдера.
- Production deployment, публичную рассылку, оплату и изменение IAM без отдельно настроенного контура риска.
- Рост «в десятки раз» или экономию ФОТ без сопоставимого пилота на задачах конкретной компании.

## Компоненты

| Компонент | Ответственность | Не может |
|---|---|---|
| Goal kernel | Хранит цель, baseline, target, ограничения и Definition of Done | Не изменяется агентами |
| Signal ledger | Типизирует observed / reported / inferred / synthetic, источник, время, consent, hash | Не превращает synthetic в observed |
| Director | Находит незакрытый дефицит и создаёт work contracts | Не исполняет side effects |
| Research agents | Планируют исследование, интервью, анализ источников | Не подтверждают спрос мнением модели |
| Product owner | Приоритизирует evidence-linked opportunities | Не игнорирует evidence gate |
| Architect | Формирует спецификацию, риск и acceptance contract | Не принимает готовую реализацию |
| Builder adapter | Вызывает deterministic executor или внешний coding harness | Не верифицирует себя и не публикует |
| Verifier | Выполняет только разрешённые проверки и читает authoritative state | Не доверяет заявлению builder |
| Release controller | Создаёт release candidate и idempotent outbox | Не объявляет бизнес-результат |
| Observer | Сравнивает последующие метрики с baseline и создаёт новый дефицит | Не выдумывает отсутствующую телеметрию |
| Evolver | Мутирует разрешённые параметры стратегии и запускает eval | Не меняет ядро, политику, права, eval и бюджет |
| Audit | Hash-chain события, lineage, конфигурация и proof bundle | Не доказывает истинность внешнего источника |

## Данные и состояние

Node.js 24+, только стандартная библиотека, `node:sqlite` в WAL-режиме. Секреты приходят из переменных окружения и не записываются в БД, конфигурацию, журналы или proof bundle.

Основные сущности:

- `goals`: outcome, baseline, target, unit, deadline, policy version.
- `signals`: kind, source URI, content, observed_at, consent, provenance hash.
- `opportunities`: проблема, механизм, evidence IDs, impact/confidence/effort, статус.
- `tasks`: role, kind, contract, dependencies, state, attempts, lease, epoch, idempotency key, budget.
- `artifacts`: immutable content hash, автор, contract, проверки, lineage.
- `verdicts`: проверяющий, метод, observed result, exit/result evidence, ограничения.
- `outbox`: точный canonical action digest, состояние, receipt, ключ идемпотентности.
- `events`: предыдущий hash, canonical payload и текущий SHA-256.
- `strategies` и `evaluations`: genome, parent, selection score, held-out score, решение promote/reject.

Переходы задач: `queued → leased → done | retry_wait | dead | blocked | canceled`. Завершение принимается транзакцией только при совпадающих lease и epoch. Просроченный lease восстанавливается в очередь до исчерпания attempts. Неизвестный role/kind/check/action завершается fail-closed.

## Внешний autonomous loop

```text
while not stopped and budget remains:
    recover_expired_leases()
    close_ready_observations()
    director.create_work_for_open_deficits()
    execute_ready_tasks_with_bounded_concurrency()
    independently_verify_finished_contracts()
    emit_release_candidates_and_observe_outcomes()
    if no runnable work: wait_for_signal_or_timer()
```

«Не заканчивать работу» означает, что прекращение agent turn не завершает продуктовый процесс. Ядро продолжает наблюдение и ставит следующую задачу. Это не бесконечный token burn: время, стоимость, число действий, retries, пустые повторы и внешние вызовы ограничены отдельными бюджетами. При исчерпании ресурсов состояние становится `blocked_budget`, а не фальшивым success.

## Evidence policy

| Сигнал | Может породить | Не может сам по себе |
|---|---|---|
| Подтверждённое интервью реального клиента | problem hypothesis, experiment, при достаточной силе delivery | Доказать масштаб рынка или прибыль |
| Продуктовая аналитика / incident / оплата | baseline, измеренный эффект, регрессию | Объяснить причинность без дизайна эксперимента |
| Публичный источник | market observation со ссылкой и датой | Подтвердить собственный demand |
| Вывод модели | inferred hypothesis для проверки | Стать observed evidence |
| Synthetic user | interview guide, red-team, список допущений | Разблокировать production delivery |

Пороги не маскируются универсальным «confidence». Версия 0.1 требует минимум один реальный независимый сигнал для экспериментального артефакта и явную политику для release candidate. Для реального продукта порог настраивается по риску и методологии; одно интервью не объявляется статистической истиной.

## Model router

Единый адаптер `POST {baseURL}/chat/completions` поддерживает hosted, Ollama, LM Studio, llama.cpp и Hugging Face-compatible endpoints. Каждая роль имеет модель, timeout, output limit и optional price card. API key задаётся именем env-переменной. Неизвестная цена записывается как `null`, а не ноль.

Ответ агента — JSON по схеме роли. Ядро валидирует поля, ссылки на существующие evidence IDs, capabilities и resource limits. Текст модели, внешние документы и tool results считаются untrusted data. Replay adapter возвращает зафиксированные ответы и явно маркирует прогон как fixture, а не как доказательство качества LLM.

## Executor и delivery

Встроенный executor создаёт только декларативные artifact files внутри назначенного workspace. Внешний builder — заранее зарегистрированный argv-профиль без shell interpolation, например UNCUT, Shim, OpenHands или CI runner. Контракт передаётся через stdin; модель не формирует имя исполняемого файла или произвольную команду. Для небезопасных задач требуется отдельная sandbox и запрет наследования секретов.

Acceptance checks реестровые: `file_exists`, `sha256`, `json_schema_subset`, `contains`, `http_contract`, `command_profile`. Command profile заранее определяет argv, cwd, timeout, env allowlist и output limit. Зелёный exit code без проверки результата не является verdict.

## RSI как эволюция стратегии

Первый безопасный genome содержит веса приоритизации impact/confidence/effort/evidence, глубину исследования и retry policy в узких границах. Evolver создаёт кандидата, замораживает его и прогоняет одинаковый набор fixtures. Selection set выбирает сильнейшего, отдельный held-out set подтверждает перенос. Promotion требует отсутствия safety regressions и улучшения заранее объявленной метрики. Все родители и отвергнутые кандидаты сохраняются.

Самомодификация исходного кода — отдельная последующая research lane с archive, sandbox и независимым benchmark harness. Она не включается в обычный production loop и не называется доказанной в 0.1.

## Метрики

- Verified outcome rate и стоимость одного accepted outcome.
- Evidence coverage решений и доля synthetic-only остановок.
- Cycle time по стадиям, queue wait, rework, rollback и change failure.
- Retry exhaustion, stale completion rejection, duplicate prevention, crash resume.
- Cost/token/latency по модели и роли; unknown cost не скрывается.
- Selection/held-out delta для evolver и число отклонённых регрессий.
- Бизнес-метрика только из внешнего наблюдения после выпуска; отсутствие данных = `unknown`.

Все claims сопровождаются сценарием, числом задач, seed/fixture, версией, окружением и сырыми результатами. Fixture throughput не сравнивается с человеческой командой.

## MVP quick start

```sh
npm ci --ignore-scripts
npm test
npm run proof
node bin/until.mjs init --goal examples/goal.json
node bin/until.mjs signal add examples/interview.json
node bin/until.mjs run --cycles 8
node bin/until.mjs status
node bin/until.mjs audit
```

Полный фактический CLI и границы зафиксированы в корневом README.

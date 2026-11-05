# UNTIL — Готово значит доказано

**Открытая local-first система автономных продуктовых циклов.** Реальный сигнал → гипотеза → контракт → исполнение → независимая проверка → release candidate → наблюдаемый результат → следующая работа.

[Манифест и интерактивное доказательство](https://balanov.pro/until/) · [English README](README.md) · [Архитектура](docs/architecture.md) · [Анализ рынка](docs/market-research.md)

> **Engineering MVP 0.1.** Доказана механика control plane, а не универсальная замена команды, качество любой LLM, production-безопасность или ROI. Начинайте с низкорисковых цифровых задач, результат которых проверяется авторитетно.

## Почему это не ещё один чат с ролями

- Незакрытые цели сами создают следующую работу.
- SQLite WAL, leases, retries, dead-letter и восстановление после сбоя.
- Persistent epoch stop отклоняет поздние результаты до публикации.
- Synthetic personas улучшают исследование, но не открывают delivery.
- Builder никогда не проверяет собственную работу.
- Acceptance checks исполняются независимой ролью.
- Release candidate идемпотентен и получает content-hash receipt.
- Стратегии улучшаются только через selection и отдельные held-out fixtures.
- Hosted и локальные OpenAI-compatible модели подключаются по ролям; replay работает бесплатно.
- Тесты, исходные следы, benchmarks и ограничения опубликованы.

## Быстрый старт

Требуется **Node.js 24+**. В ядре нет runtime npm-зависимостей, аккаунта, телеметрии или обязательного ключа модели.

```sh
git clone https://github.com/Balanov/until.git
cd until
npm ci --ignore-scripts
npm test
npm run proof
node bin/until.mjs demo
```

`demo` — явно обозначенная детерминированная фикстура: 6 ролевых задач до локального release candidate, затем наблюдение метрики и `achieved`. Это проверка механики, не интеллекта модели или бизнес-эффекта.

## Своя цель и сигналы

```sh
node bin/until.mjs init --goal examples/goal.json
node bin/until.mjs signal add examples/interview.json
node bin/until.mjs run --cycles 8
node bin/until.mjs signal add examples/metric.json
node bin/until.mjs run --cycles 2
node bin/until.mjs status
node bin/until.mjs audit
```

Для проверки evidence gate добавьте `examples/synthetic.json`: получится research guide и `waiting_evidence`, но не delivery.

Непрерывный режим:

```sh
node bin/until.mjs start
# из другого процесса
node bin/until.mjs stop
node bin/until.mjs reset
```

`start` ждёт сигналы без бесполезного расхода токенов. `stop` увеличивает epoch и отклоняет позднюю работу. `reset` снимает latch, но не использует epoch повторно.

## Модели и исполнение

Скопируйте `until.config.example.json` в `until.config.json`. Поддерживаются Ollama, LM Studio, llama.cpp и hosted OpenAI-compatible API. Секрет передаётся только через env-переменную; в БД и proof он не сохраняется. Неизвестная стоимость — `null`, а не ноль.

Встроенный executor создаёт только ограниченные артефакты в `.until/artifacts/`. Внешний coding-agent запускается как заранее зарегистрированный argv-профиль без shell interpolation и только при `sandboxConfirmed: true` в отдельной OS/VM/container sandbox. High-risk контракты по умолчанию останавливаются. Production, платежи, outreach и IAM не входят в стандартный release path. Подробнее: [SECURITY.md](SECURITY.md).

## Проверяемые результаты

- **43 / 43** unit/integration теста.
- **10 / 10** независимых proof-проверок.
- **6** ролевых задач в real-signal цикле и последующее наблюдение.
- Late completion отклонён, lease восстановлен, дубликаты действий дедуплицированы.
- Evolver: **0/3 → 3/3** правильных held-out fixture rankings. Это проверка механизма, не реальный продуктовый рост.

Исходники: [tests](app/public/tests.json), [proof](app/public/proof.json), [real trace](app/public/fixtures/real-run.json), [synthetic trace](app/public/fixtures/synthetic-run.json), [benchmarks](app/public/benchmarks.json).

```sh
npm run check
node scripts/test-report.mjs
npm run proof
npm run bench
```

Benchmark — локальное измерение механики, не рейтинг и не обещание производительности агентов.

## Манифест на шести языках

English, русский, español, 中文, हिन्दी и العربية с RTL. Сайт проигрывает настоящие следы ядра и не имитирует вызов модели в браузере.

```sh
npm ci --prefix app --ignore-scripts
npm run site:build
npm run site:dev -- --host 127.0.0.1 --port 7100
npm run validate:site
```

## Границы

UNTIL не подменяет реальных клиентов синтетическими персонами. Агенты могут модерировать и анализировать без исследовательской команды, но реальные люди остаются источником наблюдений и поведения. Собственная LLM не нужна для доказательства основной ценности. Универсальные «10×» и экономия ФОТ заявляются только после парных пилотов на реальных задачах конкретной компании.

## Лицензия

MIT. Форкайте, изменяйте, публикуйте. [LICENSE](LICENSE) · [CITATION.cff](CITATION.cff) · [CREDITS.md](CREDITS.md)

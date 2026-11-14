export type Language = 'en' | 'ru'

const en = {
  title: 'UNTIL — your backlog reaches an accepted release',
  description:
    'Autonomous product operations: real signals → contract → code change → your own test suite → independent acceptance → hashed candidate with a full audit trail. MIT.',
  nav: {
    value: 'What it does',
    proof: 'Proof',
    security: 'Security',
    economics: 'Economics',
    pilot: 'Pilot',
  },
  eyebrow: 'OPEN CODE · MIT · LOCAL-FIRST · v0.3',
  heroA: 'Your backlog reaches',
  heroB: 'an accepted release.',
  heroLead:
    'You set the outcome, the metric and the acceptable risk. UNTIL turns real signals into a bounded contract, drives approved work until your own project test suite is green, has a separate role accept it, and packages a candidate with a hash manifest and a complete audit trail.',
  heroNote:
    'Not text generation. Work that reaches a verified release and leaves a trail you can hand to a security reviewer.',
  primary: 'Request a pilot',
  secondary: 'See how it works',
  releaseMeta: 'v0.3.0 · Node.js 24+ · 0 runtime dependencies',
  releaseMetaLink: 'Read the code',
  repoStats: '{tests} tests · {proof} proof checks',

  sandboxKicker: 'A REAL ENGINE RUN',
  sandboxTitle: 'The test failed. The builder saw the error. It fixed it.',
  sandboxAttemptOne: 'Attempt 1',
  sandboxAttemptTwo: 'Attempt 2',
  sandboxVerdict: 'Verdict',
  sandboxFile: 'src/executor/workspace.js',
  sandboxResult: 'The project test suite goes green',
  sandboxButton: 'Open the raw trace',
  sandboxNote:
    'A deterministic harness proves the control plane and the repair loop. It does not measure model intelligence.',

  valueKicker: 'VALUE FOR A PRODUCT TEAM',
  valueTitle: 'What the team actually gets',
  valueBody:
    'Not another role-play chat. A division of labour where every step has an owner of the decision, and the result is judged by a check that actually runs.',
  valueCards: [
    {
      title: 'Priority without hand-coordination',
      body: 'An unfinished outcome creates the next bounded task by itself. A synthetic signal can never unlock delivery — a real observation has to come first.',
      link: 'the evidence gate',
    },
    {
      title: 'Implementation until the test is green',
      body: 'The acceptance gate is your own project test suite. The builder receives the failing output and retries until the suite passes.',
      link: 'the repair loop',
    },
    {
      title: 'Acceptance by a separate role',
      body: 'The builder can never accept its own work. A verdict comes from another role, and only executable checks carry weight.',
      link: 'independent acceptance',
    },
  ],

  rolesKicker: 'DIVISION OF LABOUR',
  rolesTitle: 'Who owns which decision',
  rolesBody: 'The point is not to remove people from the loop. The point is to move the mechanical part of the loop out of it.',
  roles: [
    ['Research', 'Prepares and processes signals, links them to an opportunity', 'A real person stays the source of observation. An agent never replaces the customer'],
    ['Product', 'Prioritises and writes the contract with locked criteria', 'Outcome, metric, risk budget and the limits of autonomy'],
    ['Engineering', 'Changes the code and drives it to a green test', 'Ambiguous cases and decisions that need domain knowledge'],
    ['QA', 'Runs the authoritative checks in a separate role', 'The right to accept an exception — and only a human has it'],
    ['Integrations', 'Not built yet: evidence arrives through until import', 'Connecting the sources and the intake rules'],
    ['CPO', 'Counts the cost of an accepted release and closes the cycle', 'Strategy, priorities and accountability for the result'],
  ],

  agentKicker: 'A REAL AGENT ON REAL CODE',
  agentTitle: 'We pointed an agent at this repository. It found eleven defects.',
  agentBody:
    'A copy of this repository, a seeded defect, a real failing test and a local model with real tools. The system behaved correctly at every step: it rolled the workspace back byte for byte, refused to release, and left the audit chain intact.',
  agentSteps: [
    ['A real failing test', '✖ a snapshot hashes a binary file by its real bytes\n  actual:   5165985b…7ca\n  expected: c05982dd…e9a'],
    ['A real agent', '→ grep → read_file(test/executor-binary.test.mjs)\n→ read_file(src/executor/workspace.js)\n→ patch_file(src/executor/workspace.js)'],
    ['A real refusal', 'repair: attempts_exhausted\nworkspaceRestored: true\nrelease: null · verdict: 0 · audit: valid'],
  ],
  agentLink: 'Open the published trace',
  agentNote:
    'The control plane held in every run. Four local models from 9B to 27B ran the full protocol: each read the code, ran the check and stopped — none committed to the edit. That is a fact about the models, not about the loop. It is now a permanent test class: npm run agent.',

  securityKicker: 'SECURITY YOU CAN CHECK',
  securityTitle: 'Everything the agent may touch is declared in advance',
  securityBody:
    'UNTIL is not an OS sandbox and it says so. But every failure class has an explicit boundary, and every step leaves a trace.',
  securityList: [
    'Zero runtime dependencies — the supply-chain surface is zero',
    'Runs inside your perimeter: Ollama, LM Studio or any OpenAI-compatible endpoint',
    'Edits only inside goal.policy.build.allowedPaths',
    'A failed attempt is restored byte for byte',
    'Unknown role, check or action is rejected — fail-closed everywhere',
    'Every event links to the previous one: a forged trail breaks the chain',
  ],
  securityPanelTitle: 'Perimeter',
  securityPanel: [
    'NOT inside: production deployment',
    'NOT inside: payments and billing',
    'NOT inside: IAM and access changes',
    'NOT inside: bulk outreach on your behalf',
    'NOT inside: irreversible operations',
  ],
  securityPolicyTitle: 'Access rules',
  securityPolicyNote: 'Fields the owner sets — the kernel enforces them, not the model.',
  securityPolicy: [
    ['policy.autonomy', 'observe stops at the proposal — nothing gets built'],
    ['policy.maxRisk', 'low by default; high needs a separate risk boundary'],
    ['policy.build.allowedPaths', 'the only paths the builder may write'],
    ['contract.verification', 'authoritative checks, run by another role'],
    ['contract.maxSteps', 'the step budget of the task'],
  ],
  securityCi: 'CI: npm audit · CodeQL · SBOM (CycloneDX) · dependency review',

  metricsKicker: 'NUMBERS, NOT CLAIMS',
  metricsTitle: 'What the project publishes about itself',
  metrics: [
    ['97/97', 'unit and integration tests', 'every commit, three operating systems'],
    ['17/17', 'deterministic proof checks', 'recorded and replayable'],
    ['11', 'defects a real agent found', 'on the seam between model and kernel'],
    ['0', 'runtime npm dependencies', 'the core pulls in no package at all'],
  ],

  boundsKicker: 'HONEST LIMITS',
  boundsTitle: 'What the system deliberately does not do',
  boundsBody: 'A boundary that is named can be discussed. A boundary that is vague makes people distrust everything else.',
  bounds: [
    ['It does not deploy to production', 'A release candidate is a verified local artifact. Deployment is a separate boundary with separate rights.'],
    ['It does not replace customer interviews', 'A synthetic persona is good for hypotheses and red-teaming. It is not observation.'],
    ['It is not a sandbox', 'An external builder is an ordinary process with the user’s permissions. Run it in a disposable environment.'],
    ['It does not promise ROI', 'The cost of an accepted release is computed on your data. Headcount savings stay a hypothesis for paired pilots.'],
  ],

  ctaTitle: 'Set the goal once. The cycle continues.',
  ctaBody: 'We run a 14-day pilot on your repository. You write the acceptance criteria.',
  ctaButton: 'Request a pilot',
  ctaSecondary: 'See the code on GitHub',
  ctaCommand: 'git clone https://github.com/Balanov/until.git',
  footerNote: 'Open product operations. Run it locally and verify it yourself.',

  economicsKicker: 'ECONOMICS',
  economicsTitle: 'What one accepted release costs',
  economicsBody:
    'Scenario arithmetic on your own numbers: how many releases a month the system closes and what each one costs. Not a savings promise and not a recommendation to cut people.',
  economicsModel:
    'Model: a task is accepted on the first attempt with the probability you set; otherwise the flow retries until the attempt budget runs out. Infrastructure is charged per attempt, human review per accepted release.',
  releasesPerMonth: 'Autonomous items / month',
  firstTryRate: 'Accepted on the first attempt, %',
  attemptsPerTask: 'Attempts per task',
  monthlyInfra: 'Model + infrastructure / month',
  reviewHours: 'Human review hours / month',
  reviewRate: 'Loaded cost of review / hour',
  outputsTitle: 'The scenario',
  outReleases: 'Accepted releases / month',
  outCostPerRelease: 'Cost of one accepted release',
  outWasted: 'Cost of the work that was rejected',
  outTotal: 'Total monthly cost of the autonomous flow',
  economicsNote:
    'This is arithmetic on the assumptions you set. On a pilot the same formula runs on your real numbers.',
  reset: 'Reset assumptions',
  footerLinks: ['Source', 'Method and sources', 'Market analysis'],
  skip: 'Skip to content',
  language: 'Language',
  loading: 'Loading evidence…',
  unavailable: 'Evidence unavailable — open the raw files on GitHub.',
  pilotMailto: 'mailto:office@balanov.pro?subject=Пилот%20UNTIL',
}

export type Copy = typeof en

const ru: Copy = {
  ...en,
  title: 'UNTIL — ваш бэклог доводится до принятого релиза',
  description:
    'Автономная продуктовая операция: реальные сигналы → контракт → правка кода → ваш собственный тест → независимая приёмка → кандидат с hash-манифестом и полным аудитом. MIT.',
  nav: {
    value: 'Что это делает',
    proof: 'Доказательство',
    security: 'Безопасность',
    economics: 'Экономика',
    pilot: 'Пилот',
  },
  eyebrow: 'ОТКРЫТЫЙ КОД · MIT · LOCAL-FIRST · v0.3',
  heroA: 'Ваш бэклог',
  heroB: 'доводится до принятого релиза.',
  heroLead:
    'Вы задаёте результат, метрику и допустимый риск. UNTIL превращает реальные сигналы в ограниченный контракт, доводит разрешённую работу до зелёного теста вашего проекта, принимает результат отдельной ролью и упаковывает кандидата с hash-манифестом и полным журналом аудита.',
  heroNote:
    'Не генерация текста. Работа, которая доходит до проверенного релиза и оставляет след, который можно предъявить.',
  primary: 'Запросить пилот',
  secondary: 'Как это работает',
  releaseMeta: 'v0.3.0 · Node.js 24+ · 0 runtime-зависимостей',
  releaseMetaLink: 'Открыть код',
  repoStats: '{tests} тестов · {proof} proof-проверок',

  sandboxKicker: 'ЖИВОЙ ПРОГОН ДВИЖКА',
  sandboxTitle: 'Тест упал. Исполнитель увидел ошибку. Починил.',
  sandboxAttemptOne: 'Попытка 1',
  sandboxAttemptTwo: 'Попытка 2',
  sandboxVerdict: 'Вердикт',
  sandboxFile: 'src/executor/workspace.js',
  sandboxResult: 'Тестовый набор проекта стал зелёным',
  sandboxButton: 'Открыть сырой след',
  sandboxNote:
    'Детерминированный harness доказывает control plane и цикл починки. Интеллект модели здесь не измеряется.',

  valueKicker: 'ЦЕННОСТЬ ДЛЯ ПРОДУКТОВОЙ КОМАНДЫ',
  valueTitle: 'Что получает команда',
  valueBody:
    'Не «ещё один чат с ролями». Разделение труда, где у каждого шага есть владелец решения, а результат проверяется исполняемой проверкой.',
  valueCards: [
    {
      title: 'Приоритет без ручной координации',
      body: 'Незакрытая цель сама создаёт следующую ограниченную задачу. Синтетический сигнал не может открыть поставку — сначала нужно реальное наблюдение.',
      link: 'evidence gate',
    },
    {
      title: 'Реализация до зелёного теста',
      body: 'Критерий приёмки — собственный тестовый набор вашего проекта. Исполнитель получает вывод упавшей проверки и повторяет попытку, пока тест не станет зелёным.',
      link: 'цикл починки',
    },
    {
      title: 'Приёмка отдельной ролью',
      body: 'Строитель не может принять собственную работу. Вердикт выносит другая роль, и вес имеют только исполняемые проверки.',
      link: 'независимая приёмка',
    },
  ],

  rolesKicker: 'РАЗДЕЛЕНИЕ ТРУДА',
  rolesTitle: 'Кто за какое решение отвечает',
  rolesBody: 'Задача не в том, чтобы убрать людей из цикла. Задача — вынести из цикла его механическую часть.',
  roles: [
    ['Исследование', 'Готовит и обрабатывает сигналы, связывает их с возможностью', 'Наблюдение остаётся за реальным человеком. Агент не заменяет клиента'],
    ['Продукт', 'Приоритизирует и пишет контракт с зафиксированными критериями', 'Цель, метрика, бюджет риска и границы автономии'],
    ['Разработка', 'Меняет код и доводит до зелёного теста', 'Разбор спорных случаев и решения, где нужен домен'],
    ['Проверка', 'Запускает авторитетные проверки в отдельной роли', 'Право принять исключение — и только человеком'],
    ['Интеграции', 'Пока нет: доказательства вносятся через until import', 'Подключение источников и регламент поступления'],
    ['CPO', 'Считает стоимость принятого релиза и закрывает цикл', 'Стратегия, приоритеты и ответственность за результат'],
  ],

  agentKicker: 'НАСТОЯЩИЙ АГЕНТ НА НАСТОЯЩЕМ КОДЕ',
  agentTitle: 'Мы направили агента на этот репозиторий. Он нашёл одиннадцать дефектов.',
  agentBody:
    'Копия этого репозитория, засеянный дефект, настоящий падающий тест и локальная модель с настоящими инструментами. Система отработала правильно на каждом шаге: откатила рабочую копию побайтово, отказалась выпускать релиз и оставила цепочку аудита целой.',
  agentSteps: [
    ['Настоящий падающий тест', '✖ a snapshot hashes a binary file by its real bytes\n  actual:   5165985b…7ca\n  expected: c05982dd…e9a'],
    ['Настоящий агент', '→ grep → read_file(test/executor-binary.test.mjs)\n→ read_file(src/executor/workspace.js)\n→ patch_file(src/executor/workspace.js)'],
    ['Настоящий отказ', 'repair: attempts_exhausted\nworkspaceRestored: true\nrelease: null · verdict: 0 · audit: valid'],
  ],
  agentLink: 'Открыть опубликованный след',
  agentNote:
    'Control plane устоял в каждом прогоне. Полный протокол прошли четыре локальные модели от 9B до 27B: каждая прочитала код, прогнала проверку и остановилась — ни одна не решилась на правку. Это факт о моделях, а не о контуре. Теперь это постоянный тестовый класс: npm run agent.',

  securityKicker: 'БЕЗОПАСНОСТЬ, КОТОРУЮ МОЖНО ПРОВЕРИТЬ',
  securityTitle: 'Всё, что агент может тронуть, объявлено заранее',
  securityBody:
    'UNTIL — не OS-песочница, и это сказано прямо. Но у каждого класса отказа есть явная граница, а у каждого шага есть след.',
  securityList: [
    'Ноль runtime-зависимостей — поверхность supply-chain нулевая',
    'Работает в вашем контуре: Ollama, LM Studio или любой OpenAI-совместимый endpoint',
    'Правки — только внутри goal.policy.build.allowedPaths',
    'Неудачная попытка откатывается побайтово',
    'Неизвестная роль, проверка или действие отклоняются — fail-closed везде',
    'Каждое событие связано с предыдущим: подделка ломает цепочку',
  ],
  securityPanelTitle: 'Периметр',
  securityPanel: [
    'НЕ входит: деплой в продакшн',
    'НЕ входит: платежи и биллинг',
    'НЕ входит: изменение прав и IAM',
    'НЕ входит: массовая рассылка от имени компании',
    'НЕ входит: необратимые операции',
  ],
  securityPolicyTitle: 'Правила допуска',
  securityPolicyNote: 'Поля, которые задаёт владелец. Их проверяет ядро, а не модель.',
  securityPolicy: [
    ['policy.autonomy', 'observe останавливается на предложении — ничего не строится'],
    ['policy.maxRisk', 'по умолчанию low; high требует отдельной границы риска'],
    ['policy.build.allowedPaths', 'единственные пути, куда билдер может писать'],
    ['contract.verification', 'авторитетные проверки выполняет другая роль'],
    ['contract.maxSteps', 'бюджет шагов задачи'],
  ],
  securityCi: 'CI: npm audit · CodeQL · SBOM (CycloneDX) · dependency review',

  metricsKicker: 'ЦИФРЫ, А НЕ ОБЕЩАНИЯ',
  metricsTitle: 'Что проект публикует о себе',
  metrics: [
    ['97/97', 'юнит- и интеграционных тестов', 'на каждом коммите, три операционные системы'],
    ['17/17', 'детерминированных proof-проверок', 'записаны и воспроизводимы'],
    ['11', 'дефектов нашёл настоящий агент', 'на стыке модель ↔ ядро'],
    ['0', 'runtime npm-зависимостей', 'ядро не подтягивает ни одного пакета'],
  ],

  boundsKicker: 'ЧЕСТНЫЕ ГРАНИЦЫ',
  boundsTitle: 'Что система принципиально не делает',
  boundsBody: 'Названная граница обсуждается. Размытая — заставляет не доверять всему остальному.',
  bounds: [
    ['Не выкатывает в продакшн', 'Релиз-кандидат — проверенный локальный артефакт. Деплой — отдельный контур с отдельными правами.'],
    ['Не заменяет интервью с клиентом', 'Синтетический персонаж годится для гипотез и red-team. Это не наблюдение.'],
    ['Не является песочницей', 'Внешний исполнитель — обычный процесс с правами пользователя. Запускать в disposable-окружении.'],
    ['Не обещает ROI', 'Стоимость принятого релиза считается на ваших данных. Экономия ФОТ — гипотеза для парных пилотов.'],
  ],

  ctaTitle: 'Задайте цель один раз. Цикл продолжится.',
  ctaBody: 'Пилот 14 дней на вашем репозитории. Критерии приёмки пишете вы.',
  ctaButton: 'Запросить пилот',
  ctaSecondary: 'Открыть код на GitHub',
  ctaCommand: 'git clone https://github.com/Balanov/until.git',
  footerNote: 'Открытые продуктовые операции. Запустите локально и проверьте сами.',

  economicsKicker: 'ЭКОНОМИКА',
  economicsTitle: 'Сколько стоит один принятый релиз',
  economicsBody:
    'Арифметика сценария на ваших числах: сколько релизов в месяц закрывает система и сколько стоит каждый. Не обещание экономии и не рекомендация сокращать людей.',
  economicsModel:
    'Модель: задача принимается с первой попытки с вероятностью, которую задаёте вы; иначе система повторяет попытку, пока не кончится бюджет попыток. Инфраструктура считается на попытку, человеческая проверка — на принятый релиз.',
  releasesPerMonth: 'Задач на автономию в месяц',
  firstTryRate: 'Принято с первой попытки, %',
  attemptsPerTask: 'Попыток на задачу',
  monthlyInfra: 'Модель + инфраструктура / месяц',
  reviewHours: 'Часов проверки в месяц',
  reviewRate: 'Стоимость часа проверки',
  outputsTitle: 'Сценарий',
  outReleases: 'Принятых релизов в месяц',
  outCostPerRelease: 'Стоимость одного принятого релиза',
  outWasted: 'Стоимость отклонённой работы',
  outTotal: 'Итоговая стоимость автономного потока в месяц',
  economicsNote:
    'Это арифметика по заданным допущениям. На пилоте та же формула считается на ваших реальных числах.',
  reset: 'Сбросить допущения',
  footerLinks: ['Исходный код', 'Методика и источники', 'Анализ рынка'],
  skip: 'К содержанию',
  language: 'Язык',
  loading: 'Загружаем доказательства…',
  unavailable: 'Данные недоступны — откройте сырые файлы на GitHub.',
  pilotMailto: 'mailto:office@balanov.pro?subject=Пилот%20UNTIL',
}

export const languages = [
  { id: 'ru' as Language, label: 'RU', dir: 'ltr' },
  { id: 'en' as Language, label: 'EN', dir: 'ltr' },
]

export const translations: Record<Language, Copy> = { en, ru }

export type Language = 'en' | 'ru' | 'es' | 'zh' | 'hi' | 'ar'

export interface Copy {
  title: string
  description: string
  nav: { proof: string; manifest: string; architecture: string; start: string }
  source: string
  heroKicker: string
  heroA: string
  heroB: string
  heroBody: string
  heroNote: string
  replay: string
  replaying: string
  replayAgain: string
  real: string
  synthetic: string
  fixture: string
  download: string
  waiting: string
  achieved: string
  blocked: string
  auditOk: string
  stages: string[]
  stageDetails: string[]
  manifestTitle: string
  manifestBody: string
  principles: { title: string; text: string }[]
  architectureTitle: string
  architectureBody: string
  role: string
  can: string
  cannot: string
  roles: { role: string; can: string; cannot: string }[]
  proofTitle: string
  proofBody: string
  metricTests: string
  metricProof: string
  metricCycle: string
  metricEvents: string
  metricEvolution: string
  fixtureWarning: string
  benchmarkTitle: string
  benchmarkBody: string
  benchmarkQueue: string
  benchmarkStartup: string
  rsiTitle: string
  rsiBody: string
  rsiRules: string[]
  quickTitle: string
  quickBody: string
  copy: string
  copied: string
  copyFailed: string
  openQuick: string
  close: string
  boundariesTitle: string
  faq: { q: string; a: string }[]
  footer: string
  license: string
  proofData: string
}

const en: Copy = {
  title: 'UNTIL — Done means proven',
  description: 'Open, local-first, evidence-gated autonomous product operations. Signal to verified outcome, then the next cycle.',
  nav: { proof: 'Proof', manifest: 'Manifesto', architecture: 'Architecture', start: 'Start' },
  source: 'GitHub',
  heroKicker: 'OPEN AUTONOMOUS PRODUCT OPERATIONS · MIT',
  heroA: 'Work until',
  heroB: 'it’s proven.',
  heroBody: 'A local-first control plane where agents research, decide, build, verify and learn in a continuous product loop — without self-approval or synthetic demand.',
  heroNote: 'Not another role-playing chat. A durable outer loop with rights, budgets, receipts and independent verdicts.',
  replay: 'Replay proof',
  replaying: 'Replaying…',
  replayAgain: 'Replay again',
  real: 'Real signal',
  synthetic: 'Synthetic signal',
  fixture: 'Actual local engine trace · deterministic fixture · no LLM call',
  download: 'Download trace',
  waiting: 'Waiting for real evidence',
  achieved: 'Observed outcome achieved',
  blocked: 'Delivery blocked by policy',
  auditOk: 'Hash chain verified',
  stages: ['Signal', 'Research', 'Contract', 'Build', 'Verdict', 'Release', 'Outcome'],
  stageDetails: [
    'A typed observation with source and consent.',
    'An opportunity linked only to existing evidence IDs.',
    'A bounded experiment with executable acceptance checks.',
    'An immutable artifact created inside the assigned workspace.',
    'A different role checks the artifact, never the builder’s claim.',
    'An idempotent local candidate with a content-hash receipt.',
    'A later real metric decides: achieved, missed, or unknown.',
  ],
  manifestTitle: 'Autonomy needs a proof protocol.',
  manifestBody: 'The model is allowed to think. The kernel is allowed to decide what counts. That separation is the product.',
  principles: [
    { title: 'No prompt treadmill', text: 'Open goals create the next task. A finished answer never means a finished product cycle.' },
    { title: 'No self-approval', text: 'Builders cannot verify their own artifacts. Unknown checks and missing evidence fail closed.' },
    { title: 'No synthetic demand', text: 'Personas can improve a research guide. Only real observations can unlock delivery.' },
    { title: 'No silent side effects', text: 'Leases expire. Late results are rejected. Every external action is bounded and auditable.' },
    { title: 'No unmeasured improvement', text: 'Candidates face selection and held-out evals. Regressions are kept in lineage, not promoted.' },
  ],
  architectureTitle: 'Agents propose. The kernel disposes.',
  architectureBody: 'Roles receive capabilities, not personalities with admin keys. Predictable transitions are deterministic; probabilistic models stay behind validated contracts.',
  role: 'Role', can: 'May', cannot: 'May never',
  roles: [
    { role: 'Researcher', can: 'Read signals and propose opportunities', cannot: 'Invent observations or release' },
    { role: 'Owner', can: 'Prioritize and write bounded contracts', cannot: 'Bypass the evidence gate' },
    { role: 'Builder', can: 'Produce an artifact in a sandbox', cannot: 'Verify itself or publish' },
    { role: 'Verifier', can: 'Run registered checks and issue a verdict', cannot: 'Change the goal or implementation' },
    { role: 'Evolver', can: 'Propose and evaluate strategy variants', cannot: 'Edit rights, budgets or evals' },
  ],
  proofTitle: 'Show the trace. Not the aura.',
  proofBody: 'Every number below comes from a file you can download and regenerate. Fixture results prove mechanisms, not universal performance.',
  metricTests: 'unit + integration tests',
  metricProof: 'adversarial proof checks',
  metricCycle: 'role-separated tasks in one real-signal cycle',
  metricEvents: 'hash-linked events in the real trace',
  metricEvolution: 'held-out fixture: baseline → candidate',
  fixtureWarning: 'No “10×”. No invented ROI. Model quality and business impact require paired pilots on your own tasks.',
  benchmarkTitle: 'Small enough to inspect. Measured enough to discuss.',
  benchmarkBody: 'Intrinsic local observations on this machine: 1,000 durable tasks per round, 15 rounds, 30 CLI launches. Raw samples included.',
  benchmarkQueue: 'median lease + complete for 1,000 tasks',
  benchmarkStartup: 'median CLI startup',
  rsiTitle: 'RSI with a seatbelt.',
  rsiBody: 'UNTIL evolves strategies, not its own permissions. A candidate can tune prioritization weights; it cannot rewrite the goal, verifier, budget or safety policy.',
  rsiRules: ['Freeze the candidate', 'Evaluate on selection fixtures', 'Confirm on separate held-out fixtures', 'Reject safety and quality regressions', 'Keep the full lineage'],
  quickTitle: 'Run the proof before reading the pitch.',
  quickBody: 'Node.js 24+. No account, telemetry, mandatory model key or runtime npm dependency in the core.',
  copy: 'Copy commands', copied: 'Copied', copyFailed: 'Select and copy manually',
  openQuick: 'Open quick start', close: 'Close',
  boundariesTitle: 'Clear boundaries. On purpose.',
  faq: [
    { q: 'Does this replace a product team?', a: 'The target is autonomous routine cycles within explicit policy. Universal replacement is not claimed. Start with low-risk work whose outcome can be checked authoritatively.' },
    { q: 'Does it do custdev without people?', a: 'It can moderate and analyze without a human research team. Real customers must still supply real answers or behavior. Human-free team does not mean human-free market.' },
    { q: 'Does it train its own LLM?', a: 'No. Use hosted or local OpenAI-compatible models per role. Replay fixtures test the kernel for free. A specialized model can be added later if held-out evidence justifies it.' },
    { q: 'Is the release candidate a production deployment?', a: 'No. The default proof publishes only a local candidate with a receipt. Production, outreach, payments and IAM changes require separately configured risk controls.' },
  ],
  footer: 'Free and open source. Fork it, inspect it, prove it on your own work.',
  license: 'MIT · Local-first · Model-neutral',
  proofData: 'Proof data',
}

const ru: Copy = {
  title: 'UNTIL — Готово значит доказано',
  description: 'Открытая local-first система автономных продуктовых циклов: от реального сигнала до проверенного результата и следующего цикла.',
  nav: { proof: 'Доказательства', manifest: 'Манифест', architecture: 'Архитектура', start: 'Запуск' },
  source: 'GitHub',
  heroKicker: 'ОТКРЫТЫЕ АВТОНОМНЫЕ ПРОДУКТОВЫЕ ЦИКЛЫ · MIT',
  heroA: 'Работай до тех пор,',
  heroB: 'пока не доказано.',
  heroBody: 'Local-first control plane: агенты исследуют, решают, создают, проверяют и учатся в непрерывном продуктовом цикле — без самоприёмки и синтетического спроса.',
  heroNote: 'Не ещё один чат с ролями. Надёжный внешний цикл с правами, бюджетами, квитанциями и независимыми вердиктами.',
  replay: 'Повторить доказательство',
  replaying: 'Воспроизводим…',
  replayAgain: 'Ещё раз',
  real: 'Реальный сигнал',
  synthetic: 'Синтетический сигнал',
  fixture: 'Настоящий след локального ядра · детерминированная фикстура · без вызова LLM',
  download: 'Скачать след',
  waiting: 'Ждём реальные доказательства',
  achieved: 'Наблюдаемый результат достигнут',
  blocked: 'Delivery заблокирован политикой',
  auditOk: 'Hash chain проверен',
  stages: ['Сигнал', 'Исследование', 'Контракт', 'Сборка', 'Вердикт', 'Релиз', 'Результат'],
  stageDetails: [
    'Типизированное наблюдение с источником и согласием.',
    'Возможность связана только с существующими ID доказательств.',
    'Ограниченный эксперимент с исполняемыми критериями приёмки.',
    'Неизменяемый артефакт внутри назначенного workspace.',
    'Другая роль проверяет артефакт, а не заявление исполнителя.',
    'Идемпотентный локальный кандидат с квитанцией content hash.',
    'Новая реальная метрика решает: достигнуто, не достигнуто или неизвестно.',
  ],
  manifestTitle: 'Автономии нужен протокол доказательства.',
  manifestBody: 'Модель может думать. Ядро решает, что считать результатом. Ценность продукта — в этом разделении.',
  principles: [
    { title: 'Никакой беготни по промптам', text: 'Незакрытые цели создают следующую задачу. Завершённый ответ не равен завершённому продуктовому циклу.' },
    { title: 'Никакой самоприёмки', text: 'Builder не проверяет собственные артефакты. Неизвестные проверки и отсутствие доказательств блокируют цикл.' },
    { title: 'Никакого синтетического спроса', text: 'Персоны улучшают interview guide. Только реальные наблюдения открывают delivery.' },
    { title: 'Никаких скрытых побочных эффектов', text: 'Leases истекают. Поздние результаты отклоняются. Каждое внешнее действие ограничено и аудируется.' },
    { title: 'Никаких улучшений без измерений', text: 'Кандидаты проходят selection и held-out evals. Регрессии остаются в lineage, но не принимаются.' },
  ],
  architectureTitle: 'Агенты предлагают. Ядро разрешает.',
  architectureBody: 'Роли получают capabilities, а не личности с admin-ключами. Предсказуемые переходы детерминированы; вероятностные модели находятся за валидируемыми контрактами.',
  role: 'Роль', can: 'Может', cannot: 'Не может никогда',
  roles: [
    { role: 'Researcher', can: 'Читать сигналы и предлагать возможности', cannot: 'Выдумывать наблюдения или выпускать' },
    { role: 'Owner', can: 'Приоритизировать и создавать контракты', cannot: 'Обходить evidence gate' },
    { role: 'Builder', can: 'Создавать артефакт в sandbox', cannot: 'Проверять себя или публиковать' },
    { role: 'Verifier', can: 'Запускать проверки и выносить вердикт', cannot: 'Менять цель или реализацию' },
    { role: 'Evolver', can: 'Предлагать и оценивать стратегии', cannot: 'Менять права, бюджеты или evals' },
  ],
  proofTitle: 'Покажи след. Не ауру.',
  proofBody: 'Каждое число ниже взято из файла, который можно скачать и пересоздать. Фикстуры доказывают механику, а не универсальную производительность.',
  metricTests: 'unit + integration тестов',
  metricProof: 'adversarial proof-проверок',
  metricCycle: 'ролевых задач в цикле с реальным сигналом',
  metricEvents: 'связанных hash-событий в реальном следе',
  metricEvolution: 'held-out фикстура: baseline → кандидат',
  fixtureWarning: 'Никаких «10×» и выдуманного ROI. Качество модели и бизнес-эффект требуют парных пилотов на ваших задачах.',
  benchmarkTitle: 'Маленький для изучения. Измеренный для спора.',
  benchmarkBody: 'Локальные intrinsic-замеры на этой машине: 1 000 durable-задач за раунд, 15 раундов, 30 запусков CLI. Сырые выборки прилагаются.',
  benchmarkQueue: 'медиана lease + complete для 1 000 задач',
  benchmarkStartup: 'медиана запуска CLI',
  rsiTitle: 'RSI с ограничителем.',
  rsiBody: 'UNTIL развивает стратегии, а не собственные полномочия. Кандидат настраивает веса приоритетов, но не переписывает цель, verifier, бюджет или политику безопасности.',
  rsiRules: ['Заморозить кандидата', 'Проверить на selection fixtures', 'Подтвердить на отдельных held-out fixtures', 'Отклонить safety и quality регрессии', 'Сохранить всю lineage'],
  quickTitle: 'Сначала запусти доказательство. Потом читай питч.',
  quickBody: 'Node.js 24+. Без аккаунта, телеметрии, обязательного ключа модели и runtime npm-зависимостей в ядре.',
  copy: 'Скопировать команды', copied: 'Скопировано', copyFailed: 'Выделите и скопируйте вручную',
  openQuick: 'Открыть быстрый старт', close: 'Закрыть',
  boundariesTitle: 'Честные границы. Специально.',
  faq: [
    { q: 'Это замена продуктовой команды?', a: 'Цель — автономные рутинные циклы внутри явной политики. Универсальная замена не заявляется. Начинайте с низкорисковых задач с авторитетно проверяемым результатом.' },
    { q: 'Кастдев совсем без людей?', a: 'Модерация и анализ могут работать без исследовательской команды. Но реальные клиенты должны давать реальные ответы или поведение. Команда без людей не означает рынок без людей.' },
    { q: 'Своя LLM обучается?', a: 'Нет. Для каждой роли подключаются hosted или local OpenAI-compatible модели. Replay проверяет ядро бесплатно. Специализированную модель можно добавить позже после held-out доказательств.' },
    { q: 'Release candidate — это production?', a: 'Нет. Proof публикует только локального кандидата с квитанцией. Production, outreach, платежи и IAM требуют отдельно настроенного контура риска.' },
  ],
  footer: 'Бесплатно и открыто. Форкайте, проверяйте, доказывайте на своей работе.',
  license: 'MIT · Local-first · Model-neutral',
  proofData: 'Данные доказательств',
}

const es: Copy = {
  ...en,
  title: 'UNTIL — Terminado significa probado',
  description: 'Operaciones de producto autónomas, locales y abiertas, guiadas por evidencia. De la señal al resultado verificado y al siguiente ciclo.',
  nav: { proof: 'Pruebas', manifest: 'Manifiesto', architecture: 'Arquitectura', start: 'Empezar' },
  heroKicker: 'OPERACIONES DE PRODUCTO AUTÓNOMAS Y ABIERTAS · MIT',
  heroA: 'Trabaja hasta',
  heroB: 'que esté probado.',
  heroBody: 'Un plano de control local donde los agentes investigan, deciden, construyen, verifican y aprenden en un ciclo continuo, sin autoaprobación ni demanda sintética.',
  heroNote: 'No es otro chat con roles. Es un bucle externo durable con derechos, presupuestos, recibos y veredictos independientes.',
  replay: 'Repetir prueba', replaying: 'Repitiendo…', replayAgain: 'Repetir otra vez',
  real: 'Señal real', synthetic: 'Señal sintética',
  fixture: 'Traza real del motor local · fixture determinista · sin llamada LLM',
  download: 'Descargar traza', waiting: 'Esperando evidencia real', achieved: 'Resultado observado logrado', blocked: 'Entrega bloqueada por política', auditOk: 'Cadena hash verificada',
  stages: ['Señal', 'Investigación', 'Contrato', 'Construcción', 'Veredicto', 'Entrega', 'Resultado'],
  stageDetails: ['Observación tipada con fuente y consentimiento.', 'Oportunidad vinculada solo a evidencia existente.', 'Experimento acotado con criterios ejecutables.', 'Artefacto inmutable en el workspace asignado.', 'Otro rol comprueba el artefacto, no la afirmación del constructor.', 'Candidato local idempotente con recibo hash.', 'Una métrica real posterior decide: logrado, fallido o desconocido.'],
  manifestTitle: 'La autonomía necesita un protocolo de prueba.',
  manifestBody: 'El modelo puede pensar. El kernel decide qué cuenta como resultado. Esa separación es el producto.',
  principles: [
    { title: 'Sin persecución de prompts', text: 'Los objetivos abiertos crean la siguiente tarea. Una respuesta terminada no cierra el ciclo.' },
    { title: 'Sin autoaprobación', text: 'El constructor no verifica su propio artefacto. La evidencia ausente bloquea.' },
    { title: 'Sin demanda sintética', text: 'Las personas mejoran la guía. Solo las observaciones reales desbloquean la entrega.' },
    { title: 'Sin efectos ocultos', text: 'Los leases expiran, los resultados tardíos se rechazan y cada acción queda auditada.' },
    { title: 'Sin mejoras sin medición', text: 'Los candidatos pasan selección y held-out. Las regresiones no se promueven.' },
  ],
  architectureTitle: 'Los agentes proponen. El kernel decide.',
  architectureBody: 'Los roles reciben capacidades, no personalidades con claves de administrador. Las transiciones predecibles son deterministas; los modelos quedan detrás de contratos validados.',
  role: 'Rol', can: 'Puede', cannot: 'Nunca puede',
  roles: [
    { role: 'Investigador', can: 'Leer señales y proponer oportunidades', cannot: 'Inventar observaciones o publicar' },
    { role: 'Owner', can: 'Priorizar y crear contratos acotados', cannot: 'Evadir la puerta de evidencia' },
    { role: 'Constructor', can: 'Crear artefactos en sandbox', cannot: 'Verificarse o publicar' },
    { role: 'Verificador', can: 'Ejecutar checks y emitir veredictos', cannot: 'Cambiar la meta o la implementación' },
    { role: 'Evolver', can: 'Proponer y evaluar estrategias', cannot: 'Editar derechos, presupuestos o evaluaciones' },
  ],
  proofTitle: 'Muestra la traza. No el aura.',
  proofBody: 'Cada número procede de un archivo descargable y reproducible. Los fixtures prueban mecanismos, no rendimiento universal.',
  metricTests: 'pruebas unitarias + integración', metricProof: 'comprobaciones adversarias', metricCycle: 'tareas separadas por rol en un ciclo real', metricEvents: 'eventos hash en la traza real', metricEvolution: 'fixture held-out: baseline → candidato',
  fixtureWarning: 'Sin “10×” ni ROI inventado. La calidad del modelo y el impacto empresarial exigen pilotos pareados con tus tareas.',
  benchmarkTitle: 'Pequeño para inspeccionar. Medido para debatir.', benchmarkBody: 'Observaciones locales: 1.000 tareas por ronda, 15 rondas y 30 lanzamientos CLI. Muestras incluidas.', benchmarkQueue: 'mediana lease + complete para 1.000 tareas', benchmarkStartup: 'mediana de inicio CLI',
  rsiTitle: 'RSI con cinturón de seguridad.', rsiBody: 'UNTIL hace evolucionar estrategias, no sus propios permisos. El candidato ajusta pesos; no reescribe metas, verificadores, presupuestos ni políticas.',
  rsiRules: ['Congelar el candidato', 'Evaluar en selección', 'Confirmar en held-out', 'Rechazar regresiones', 'Conservar el linaje'],
  quickTitle: 'Ejecuta la prueba antes de leer el pitch.', quickBody: 'Node.js 24+. Sin cuenta, telemetría, clave obligatoria ni dependencias runtime en el núcleo.',
  copy: 'Copiar comandos', copied: 'Copiado', copyFailed: 'Copiar manualmente', openQuick: 'Abrir inicio rápido', close: 'Cerrar',
  boundariesTitle: 'Límites claros. A propósito.',
  faq: [
    { q: '¿Sustituye a un equipo de producto?', a: 'El objetivo son ciclos rutinarios autónomos bajo políticas explícitas. No se promete sustitución universal. Empieza con trabajo de bajo riesgo y verificable.' },
    { q: '¿Custdev sin personas?', a: 'Puede moderar y analizar sin un equipo de investigación, pero los clientes reales deben aportar respuestas o comportamiento real.' },
    { q: '¿Entrena su propia LLM?', a: 'No. Usa modelos locales o alojados compatibles con OpenAI por rol. Los fixtures prueban el núcleo gratis.' },
    { q: '¿El candidato es un despliegue en producción?', a: 'No. La prueba publica solo un candidato local con recibo. Producción, pagos e IAM requieren controles separados.' },
  ],
  footer: 'Gratuito y abierto. Haz fork, inspecciona y pruébalo en tu trabajo.', license: 'MIT · Local-first · Model-neutral', proofData: 'Datos de prueba',
}

const zh: Copy = {
  ...en,
  title: 'UNTIL — 完成必须被证明',
  description: '开放、本地优先、证据驱动的自主产品运营。从真实信号到验证结果，再进入下一个循环。',
  nav: { proof: '证据', manifest: '宣言', architecture: '架构', start: '开始' },
  heroKicker: '开放式自主产品运营 · MIT',
  heroA: '持续工作，',
  heroB: '直到被证明。',
  heroBody: '本地优先的控制平面，让代理在持续产品循环中研究、决策、构建、验证和学习，拒绝自我验收和合成需求。',
  heroNote: '不是另一个角色扮演聊天，而是具有权限、预算、回执和独立裁决的持久外循环。',
  replay: '重放证明', replaying: '正在重放…', replayAgain: '再次重放',
  real: '真实信号', synthetic: '合成信号',
  fixture: '真实本地引擎轨迹 · 确定性测试数据 · 无 LLM 调用',
  download: '下载轨迹', waiting: '等待真实证据', achieved: '已达成观察结果', blocked: '交付被策略阻止', auditOk: '哈希链已验证',
  stages: ['信号', '研究', '合同', '构建', '裁决', '发布', '结果'],
  stageDetails: ['带来源和同意的类型化观察。', '机会只关联现有证据 ID。', '具有可执行验收检查的受限实验。', '在指定工作区生成不可变工件。', '不同角色检查工件，而不是构建者的声明。', '带内容哈希回执的幂等本地候选。', '后续真实指标决定：达成、未达成或未知。'],
  manifestTitle: '自主性需要证明协议。',
  manifestBody: '模型负责思考，内核负责判定什么算作结果。这种分离就是产品。',
  principles: [
    { title: '不再追逐提示词', text: '未闭合目标创建下一项任务。回答结束不等于产品循环结束。' },
    { title: '不做自我验收', text: '构建者不能验证自己的工件。未知检查和缺失证据默认拒绝。' },
    { title: '不伪造合成需求', text: '合成角色可改进访谈指南，只有真实观察才能解锁交付。' },
    { title: '不允许隐藏副作用', text: '租约会过期，迟到结果被拒绝，每项外部操作都可审计。' },
    { title: '不接受未测量的改进', text: '候选策略经过选择和留出评估，回归不会被提升。' },
  ],
  architectureTitle: '代理提议，内核裁决。',
  architectureBody: '角色获得能力，而不是拥有管理员密钥的人格。可预测的转换是确定性的，概率模型必须经过合同验证。',
  role: '角色', can: '可以', cannot: '绝不能',
  roles: [
    { role: '研究员', can: '读取信号并提出机会', cannot: '捏造观察或发布' },
    { role: '负责人', can: '确定优先级并编写受限合同', cannot: '绕过证据门' },
    { role: '构建者', can: '在沙箱中生成工件', cannot: '自我验证或发布' },
    { role: '验证者', can: '运行注册检查并作出裁决', cannot: '更改目标或实现' },
    { role: '进化者', can: '提出并评估策略变体', cannot: '编辑权限、预算或评估' },
  ],
  proofTitle: '展示轨迹，而不是光环。',
  proofBody: '每个数字都来自可下载、可重新生成的文件。测试数据证明机制，不证明普遍性能。',
  metricTests: '单元 + 集成测试', metricProof: '对抗性证明检查', metricCycle: '真实信号循环中的角色分离任务', metricEvents: '真实轨迹中的哈希事件', metricEvolution: '留出测试数据：基线 → 候选',
  fixtureWarning: '没有“10 倍”，没有虚构 ROI。模型质量和业务影响需要针对你的任务进行配对试点。',
  benchmarkTitle: '足够小，便于检查；有测量，便于讨论。', benchmarkBody: '本机测量：每轮 1,000 个持久任务，15 轮，30 次 CLI 启动，附原始样本。', benchmarkQueue: '1,000 个任务 lease + complete 中位数', benchmarkStartup: 'CLI 启动中位数',
  rsiTitle: '带安全限制的 RSI。', rsiBody: 'UNTIL 演化策略，而不是自身权限。候选可以调整优先级权重，但不能重写目标、验证器、预算或安全策略。',
  rsiRules: ['冻结候选', '运行选择集评估', '在独立留出集确认', '拒绝安全和质量回归', '保留完整谱系'],
  quickTitle: '先运行证明，再阅读宣传。', quickBody: 'Node.js 24+。核心无需账户、遥测、模型密钥或运行时 npm 依赖。',
  copy: '复制命令', copied: '已复制', copyFailed: '请手动复制', openQuick: '打开快速开始', close: '关闭',
  boundariesTitle: '刻意清晰的边界。',
  faq: [
    { q: '它能取代产品团队吗？', a: '目标是在明确策略内自主执行常规循环，不声称普遍替代。请从低风险的、可权威验证结果的工作开始。' },
    { q: '客户开发可以完全没有人吗？', a: '无需人类研究团队即可主持和分析，但真实客户仍必须提供真实回答或行为。无人的团队不等于无人的市场。' },
    { q: '会训练自己的 LLM 吗？', a: '不会。每个角色可使用本地或托管的 OpenAI 兼容模型。重放测试数据可免费验证内核。' },
    { q: '发布候选等于生产部署吗？', a: '不等于。默认证明只发布带回执的本地候选。生产、外联、支付和 IAM 需要独立风险控制。' },
  ],
  footer: '免费开源。复刻、检查，并在自己的工作中验证。', license: 'MIT · 本地优先 · 模型中立', proofData: '证明数据',
}

const hi: Copy = {
  ...en,
  title: 'UNTIL — पूरा होना मतलब सिद्ध होना',
  description: 'खुला, लोकल-फर्स्ट, प्रमाण-नियंत्रित स्वायत्त उत्पाद संचालन। वास्तविक संकेत से सत्यापित परिणाम और अगले चक्र तक।',
  nav: { proof: 'प्रमाण', manifest: 'घोषणा', architecture: 'आर्किटेक्चर', start: 'शुरू करें' },
  heroKicker: 'खुला स्वायत्त उत्पाद संचालन · MIT',
  heroA: 'काम करते रहें,',
  heroB: 'जब तक सिद्ध न हो।',
  heroBody: 'लोकल-फर्स्ट कंट्रोल प्लेन जिसमें एजेंट लगातार शोध, निर्णय, निर्माण, सत्यापन और सीखते हैं — स्व-स्वीकृति या कृत्रिम मांग के बिना।',
  heroNote: 'भूमिकाओं वाली एक और चैट नहीं। अधिकारों, बजट, रसीदों और स्वतंत्र निर्णयों वाला टिकाऊ बाहरी चक्र।',
  replay: 'प्रमाण फिर चलाएँ', replaying: 'फिर चल रहा है…', replayAgain: 'फिर से चलाएँ',
  real: 'वास्तविक संकेत', synthetic: 'कृत्रिम संकेत',
  fixture: 'वास्तविक लोकल इंजन ट्रेस · निर्धारित फिक्स्चर · कोई LLM कॉल नहीं',
  download: 'ट्रेस डाउनलोड करें', waiting: 'वास्तविक प्रमाण की प्रतीक्षा', achieved: 'अवलोकित परिणाम प्राप्त', blocked: 'नीति द्वारा डिलीवरी रोकी गई', auditOk: 'हैश श्रृंखला सत्यापित',
  stages: ['संकेत', 'शोध', 'अनुबंध', 'निर्माण', 'निर्णय', 'रिलीज़', 'परिणाम'],
  stageDetails: ['स्रोत और सहमति सहित टाइप किया अवलोकन।', 'अवसर केवल मौजूदा प्रमाण ID से जुड़ा है।', 'निष्पादन योग्य स्वीकृति जाँच वाला सीमित प्रयोग।', 'निर्धारित वर्कस्पेस में अपरिवर्तनीय आर्टिफैक्ट।', 'दूसरी भूमिका आर्टिफैक्ट जाँचती है, बिल्डर का दावा नहीं।', 'कंटेंट हैश रसीद वाला आइडेम्पोटेंट लोकल कैंडिडेट।', 'बाद की वास्तविक मेट्रिक तय करती है: प्राप्त, छूटा या अज्ञात।'],
  manifestTitle: 'स्वायत्तता के लिए प्रमाण प्रोटोकॉल चाहिए।',
  manifestBody: 'मॉडल सोच सकता है। केरनल तय करता है कि क्या परिणाम माना जाएगा। उत्पाद यही अलगाव है।',
  principles: [
    { title: 'प्रॉम्प्ट का दौड़ नहीं', text: 'खुले लक्ष्य अगला कार्य बनाते हैं। उत्तर पूरा होना चक्र पूरा होना नहीं है।' },
    { title: 'स्व-स्वीकृति नहीं', text: 'बिल्डर अपने आर्टिफैक्ट स्वयं सत्यापित नहीं करता। प्रमाण न होने पर रोक।' },
    { title: 'कृत्रिम मांग नहीं', text: 'पर्सोना साक्षात्कार गाइड सुधार सकते हैं। केवल वास्तविक अवलोकन डिलीवरी खोलते हैं।' },
    { title: 'छिपे दुष्प्रभाव नहीं', text: 'लीज़ समाप्त होती हैं, देर से परिणाम अस्वीकृत होते हैं और हर क्रिया ऑडिट होती है।' },
    { title: 'बिना माप सुधार नहीं', text: 'उम्मीदवार चयन और होल्ड-आउट मूल्यांकन से गुजरते हैं। रिग्रेशन प्रमोट नहीं होते।' },
  ],
  architectureTitle: 'एजेंट प्रस्ताव देते हैं। केरनल निर्णय करता है।',
  architectureBody: 'भूमिकाओं को क्षमताएँ मिलती हैं, एडमिन कुंजियों वाले व्यक्तित्व नहीं। अनुमानित संक्रमण नियत हैं; संभाव्य मॉडल मान्य अनुबंधों के पीछे रहते हैं।',
  role: 'भूमिका', can: 'कर सकता है', cannot: 'कभी नहीं कर सकता',
  roles: [
    { role: 'शोधकर्ता', can: 'संकेत पढ़ना और अवसर प्रस्तावित करना', cannot: 'अवलोकन बनाना या रिलीज़ करना' },
    { role: 'ओनर', can: 'प्राथमिकता और सीमित अनुबंध बनाना', cannot: 'प्रमाण गेट छोड़ना' },
    { role: 'बिल्डर', can: 'सैंडबॉक्स में आर्टिफैक्ट बनाना', cannot: 'स्वयं सत्यापन या प्रकाशन' },
    { role: 'सत्यापनकर्ता', can: 'जाँच चलाना और निर्णय देना', cannot: 'लक्ष्य या कार्यान्वयन बदलना' },
    { role: 'इवॉल्वर', can: 'रणनीति प्रस्तावित और मूल्यांकित करना', cannot: 'अधिकार, बजट या मूल्यांकन बदलना' },
  ],
  proofTitle: 'ट्रेस दिखाओ। आभा नहीं।',
  proofBody: 'हर संख्या डाउनलोड और पुनः बनाई जा सकने वाली फ़ाइल से है। फिक्स्चर तंत्र सिद्ध करते हैं, सार्वभौमिक प्रदर्शन नहीं।',
  metricTests: 'यूनिट + इंटीग्रेशन परीक्षण', metricProof: 'प्रतिकूल प्रमाण जाँच', metricCycle: 'वास्तविक संकेत चक्र में भूमिका-पृथक कार्य', metricEvents: 'वास्तविक ट्रेस में हैश घटनाएँ', metricEvolution: 'होल्ड-आउट फिक्स्चर: बेसलाइन → उम्मीदवार',
  fixtureWarning: '“10×” नहीं, कोई काल्पनिक ROI नहीं। मॉडल गुणवत्ता और व्यावसायिक प्रभाव के लिए आपके कार्यों पर युग्मित पायलट चाहिए।',
  benchmarkTitle: 'जाँचने लायक छोटा। चर्चा लायक मापा हुआ।', benchmarkBody: 'इस मशीन पर लोकल माप: प्रति राउंड 1,000 टिकाऊ कार्य, 15 राउंड, 30 CLI लॉन्च। कच्चे नमूने सहित।', benchmarkQueue: '1,000 कार्यों के lease + complete की माध्यिका', benchmarkStartup: 'CLI स्टार्टअप माध्यिका',
  rsiTitle: 'सुरक्षा-बंधन वाला RSI।', rsiBody: 'UNTIL रणनीतियों को विकसित करता है, अपनी अनुमतियों को नहीं। उम्मीदवार प्राथमिकता बदल सकता है; लक्ष्य, सत्यापनकर्ता, बजट या सुरक्षा नीति नहीं।',
  rsiRules: ['उम्मीदवार फ्रीज़ करें', 'चयन फिक्स्चर पर मूल्यांकन', 'अलग होल्ड-आउट पर पुष्टि', 'सुरक्षा और गुणवत्ता रिग्रेशन अस्वीकार', 'पूरी वंशावली रखें'],
  quickTitle: 'पिच पढ़ने से पहले प्रमाण चलाएँ।', quickBody: 'Node.js 24+। कोर में खाता, टेलीमेटरी, अनिवार्य मॉडल कुंजी या रनटाइम npm निर्भरता नहीं।',
  copy: 'कमांड कॉपी करें', copied: 'कॉपी हुआ', copyFailed: 'हाथ से कॉपी करें', openQuick: 'क्विक स्टार्ट खोलें', close: 'बंद करें',
  boundariesTitle: 'जान-बूझकर स्पष्ट सीमाएँ।',
  faq: [
    { q: 'क्या यह उत्पाद टीम की जगह लेता है?', a: 'लक्ष्य स्पष्ट नीति के भीतर नियमित चक्रों का स्वायत्त संचालन है। सार्वभौमिक प्रतिस्थापन का दावा नहीं। कम जोखिम और सत्यापन योग्य कार्य से शुरू करें।' },
    { q: 'क्या कस्टडेव बिना लोगों के होगा?', a: 'मॉडरेशन और विश्लेषण बिना शोध टीम हो सकते हैं, लेकिन वास्तविक ग्राहकों से वास्तविक उत्तर या व्यवहार आवश्यक है।' },
    { q: 'क्या यह अपना LLM प्रशिक्षित करता है?', a: 'नहीं। प्रत्येक भूमिका के लिए होस्टेड या लोकल OpenAI-संगत मॉडल उपयोग करें। फिक्स्चर कोर को मुफ्त जाँचते हैं।' },
    { q: 'क्या रिलीज़ कैंडिडेट प्रोडक्शन डिप्लॉयमेंट है?', a: 'नहीं। डिफ़ॉल्ट प्रमाण केवल रसीद सहित लोकल कैंडिडेट प्रकाशित करता है। प्रोडक्शन, भुगतान और IAM के लिए अलग नियंत्रण चाहिए।' },
  ],
  footer: 'निःशुल्क और ओपन सोर्स। फोर्क करें, जाँचें और अपने काम पर सिद्ध करें।', license: 'MIT · लोकल-फर्स्ट · मॉडल-तटस्थ', proofData: 'प्रमाण डेटा',
}

const ar: Copy = {
  ...en,
  title: 'UNTIL — الإنجاز يعني الإثبات',
  description: 'عمليات منتج مستقلة ومحلية ومفتوحة تحكمها الأدلة. من إشارة حقيقية إلى نتيجة موثقة ثم دورة جديدة.',
  nav: { proof: 'الدليل', manifest: 'البيان', architecture: 'البنية', start: 'ابدأ' },
  heroKicker: 'عمليات منتج مستقلة ومفتوحة · MIT',
  heroA: 'اعمل حتى',
  heroB: 'يتم الإثبات.',
  heroBody: 'مستوى تحكم محلي تبحث فيه الوكلاء وتقرر وتبني وتتحقق وتتعلم ضمن دورة منتج مستمرة، دون موافقة ذاتية أو طلب اصطناعي.',
  heroNote: 'ليست محادثة أدوار أخرى، بل حلقة خارجية دائمة بحقوق وميزانيات وإيصالات وأحكام مستقلة.',
  replay: 'إعادة تشغيل الدليل', replaying: 'جارٍ التشغيل…', replayAgain: 'إعادة مرة أخرى',
  real: 'إشارة حقيقية', synthetic: 'إشارة اصطناعية',
  fixture: 'تتبع فعلي للمحرك المحلي · بيانات حتمية · دون استدعاء نموذج',
  download: 'تنزيل التتبع', waiting: 'بانتظار دليل حقيقي', achieved: 'تحققت النتيجة المرصودة', blocked: 'حظر التسليم بموجب السياسة', auditOk: 'تم التحقق من سلسلة الهاش',
  stages: ['إشارة', 'بحث', 'عقد', 'بناء', 'حكم', 'إصدار', 'نتيجة'],
  stageDetails: ['ملاحظة مصنفة مع المصدر والموافقة.', 'فرصة مرتبطة فقط بمعرفات أدلة موجودة.', 'تجربة محدودة مع اختبارات قبول قابلة للتنفيذ.', 'أثر غير قابل للتغيير داخل مساحة العمل المحددة.', 'دور مختلف يفحص الأثر لا ادعاء المنشئ.', 'مرشح محلي idempotent مع إيصال هاش.', 'مقياس حقيقي لاحق يقرر: تحقق أو فات أو غير معروف.'],
  manifestTitle: 'الاستقلالية تحتاج إلى بروتوكول إثبات.',
  manifestBody: 'النموذج يفكر، والنواة تقرر ما يُحتسب نتيجة. هذا الفصل هو المنتج.',
  principles: [
    { title: 'لا ملاحقة للتعليمات', text: 'الأهداف المفتوحة تنشئ المهمة التالية. انتهاء الإجابة لا يعني انتهاء دورة المنتج.' },
    { title: 'لا موافقة ذاتية', text: 'المنشئ لا يتحقق من أثره بنفسه. الفحوص المجهولة وغياب الدليل يوقفان الدورة.' },
    { title: 'لا طلب اصطناعي', text: 'الشخصيات الاصطناعية تحسن دليل المقابلة، لكن الملاحظات الحقيقية وحدها تفتح التسليم.' },
    { title: 'لا آثار جانبية خفية', text: 'تنتهي التأجيرات وتُرفض النتائج المتأخرة، وكل إجراء خارجي محدود وقابل للتدقيق.' },
    { title: 'لا تحسن بلا قياس', text: 'يخضع المرشحون لتقييم الاختيار والاحتجاز، ولا تُرقّى الانحدارات.' },
  ],
  architectureTitle: 'الوكلاء يقترحون والنواة تقرر.',
  architectureBody: 'تحصل الأدوار على قدرات، لا على شخصيات بمفاتيح إدارية. التحولات المتوقعة حتمية، والنماذج الاحتمالية تبقى خلف عقود مُتحققة.',
  role: 'الدور', can: 'يستطيع', cannot: 'لا يستطيع أبداً',
  roles: [
    { role: 'الباحث', can: 'قراءة الإشارات واقتراح الفرص', cannot: 'اختلاق الملاحظات أو الإصدار' },
    { role: 'المالك', can: 'ترتيب الأولويات وكتابة عقود محدودة', cannot: 'تجاوز بوابة الدليل' },
    { role: 'المنشئ', can: 'إنتاج أثر داخل بيئة معزولة', cannot: 'التحقق من نفسه أو النشر' },
    { role: 'المدقق', can: 'تشغيل فحوص مسجلة وإصدار حكم', cannot: 'تغيير الهدف أو التنفيذ' },
    { role: 'المطور', can: 'اقتراح وتقييم استراتيجيات', cannot: 'تعديل الحقوق أو الميزانيات أو التقييمات' },
  ],
  proofTitle: 'أظهر التتبع، لا الهالة.',
  proofBody: 'كل رقم أدناه يأتي من ملف يمكن تنزيله وإعادة توليده. تثبت البيانات الآلية لا الأداء العام.',
  metricTests: 'اختبارات وحدة وتكامل', metricProof: 'فحوص إثبات عدائية', metricCycle: 'مهام مفصولة الأدوار في دورة حقيقية', metricEvents: 'أحداث مترابطة بالهاش في التتبع', metricEvolution: 'بيانات الاحتجاز: الأساس ← المرشح',
  fixtureWarning: 'لا “10×” ولا عائد مختلق. جودة النموذج والأثر التجاري يتطلبان تجارب مزدوجة على مهامك.',
  benchmarkTitle: 'صغير للفحص، مقاس للنقاش.', benchmarkBody: 'قياسات محلية: 1,000 مهمة دائمة لكل جولة، 15 جولة، 30 تشغيلاً لواجهة الأوامر. العينات الخام مرفقة.', benchmarkQueue: 'وسيط lease + complete لـ 1,000 مهمة', benchmarkStartup: 'وسيط بدء واجهة الأوامر',
  rsiTitle: 'تحسين ذاتي بحزام أمان.', rsiBody: 'يطور UNTIL الاستراتيجيات لا صلاحياته. يضبط المرشح أوزان الأولوية، لكنه لا يعيد كتابة الهدف أو المدقق أو الميزانية أو السياسة.',
  rsiRules: ['تجميد المرشح', 'التقييم على بيانات الاختيار', 'التأكيد على بيانات احتجاز منفصلة', 'رفض انحدارات السلامة والجودة', 'حفظ النسب الكامل'],
  quickTitle: 'شغّل الدليل قبل قراءة العرض.', quickBody: 'Node.js 24+. النواة لا تحتاج حساباً أو تتبعاً أو مفتاح نموذج أو اعتماديات runtime.',
  copy: 'نسخ الأوامر', copied: 'تم النسخ', copyFailed: 'انسخ يدوياً', openQuick: 'فتح البدء السريع', close: 'إغلاق',
  boundariesTitle: 'حدود واضحة عن قصد.',
  faq: [
    { q: 'هل يستبدل فريق المنتج؟', a: 'الهدف هو دورات روتينية مستقلة ضمن سياسة صريحة، وليس الاستبدال الشامل. ابدأ بعمل منخفض المخاطر يمكن التحقق من نتيجته بموثوقية.' },
    { q: 'هل تطوير العملاء بلا بشر؟', a: 'يمكن الإشراف والتحليل دون فريق بحث بشري، لكن العملاء الحقيقيين يجب أن يقدموا إجابات أو سلوكاً حقيقياً. فريق بلا بشر لا يعني سوقاً بلا بشر.' },
    { q: 'هل يدرب نموذجه الخاص؟', a: 'لا. استخدم نماذج محلية أو مستضافة متوافقة مع OpenAI لكل دور. تختبر البيانات المسجلة النواة مجاناً.' },
    { q: 'هل المرشح نشر إنتاجي؟', a: 'لا. ينشر الدليل الافتراضي مرشحاً محلياً مع إيصال فقط. الإنتاج والتواصل والمدفوعات وIAM تتطلب ضوابط مخاطر منفصلة.' },
  ],
  footer: 'مجاني ومفتوح المصدر. انسخه وافحصه وأثبته في عملك.', license: 'MIT · محلي أولاً · محايد للنموذج', proofData: 'بيانات الدليل',
}

export const languages: { id: Language; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'EN', dir: 'ltr' },
  { id: 'ru', label: 'RU', dir: 'ltr' },
  { id: 'es', label: 'ES', dir: 'ltr' },
  { id: 'zh', label: '中文', dir: 'ltr' },
  { id: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
]

export const translations: Record<Language, Copy> = { en, ru, es, zh, hi, ar }

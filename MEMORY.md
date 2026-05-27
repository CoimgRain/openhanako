# MEMORY.md

这是本项目的项目级实时工作记忆，用来记录编码 Agent 在本仓库内做过的重要判断、修改和验证结果。

## 记录规则

- 使用中文。
- 只记录和本项目工作直接相关的事实。
- 每次有实质修改后追加记录，不要覆盖旧记录。
- 记录“为什么改”和“验证了什么”，不要只写“已修改”。
- 不记录密钥、token、账号、隐私内容。

## 记录模板

```markdown
## YYYY-MM-DD HH:mm

- 目标：
- 背景：
- 改动：
- 验证：
- 风险/后续：
```

## 记录

## 2026-05-20 22:55

- 目标：建立项目级 Agent 协作文件。
- 背景：用户要求项目内固定有 `AGENTS.md`、`MEMORY.md`、`TODO.md` 三个协作文件，并全部使用中文。
- 改动：新增中文 `AGENTS.md`，明确本项目存在项目级 memory 和 todo 事件；新增本文件作为项目级实时工作记忆。
- 验证：已读取项目结构、`package.json` 和现有 `.gitignore`，确认根目录此前没有提交型 `AGENTS.md`。
- 风险/后续：`.gitignore` 当前忽略 `AGENTS.md` 和 `TODO.md`，如需提交这些文件，需要后续显式处理 git 忽略规则或使用强制添加。

## 2026-05-20 23:00

- 目标：把项目级 `AGENTS.md`、`MEMORY.md`、`TODO.md` 三件套流程沉淀为可复用 Codex skill。
- 背景：用户希望以后不管做项目还是长期事项，都默认采用同一套 agents/memory/todo 协作方式，并倾向使用 `agents` 作为 skill 名称。
- 改动：在 `/Users/kang/.codex/skills/agents` 创建本地 skill，`SKILL.md` 使用中文说明触发场景和执行流程；明确项目级 memory 不是个人知识库也不是全局记忆。
- 验证：检查本机没有现有 `agents` skill 冲突，并运行 `quick_validate.py /Users/kang/.codex/skills/agents`，结果通过。
- 风险/后续：无新增项目待办；后续可在任何项目中用 `agents` skill 初始化或维护三件套。

## 2026-05-21 02:56

- 目标：实现内部 Agent 子会话二阶段“用户加入群聊”。
- 背景：subagent 投影原本只读，用户希望进入 A 与 B 的内部对话后主要和执行方 B 继续对话，A 只作为背景，除非明确提到才少量出现。
- 改动：允许只读 subagent collaboration 在输入区发送；服务端对 subagent session 的 prompt 注入群聊参与说明并标记真人消息；历史加载会剥离内部说明并把真人消息标为 desktop；恢复 subagent session 时按 metadata 使用 executor agent 和 subagent-sessions 的 meta 文件；聊天身份渲染区分 requester A 与真人用户。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js desktop/src/react/__tests__/components/InputArea.media-send.test.tsx`、`npm run typecheck`、`npm run build:renderer`，均通过；已刷新 Electron 开发窗口。
- 风险/后续：目前 A 不会作为独立模型自动并发发言，而是由 B 根据上下文少量引用 A；如果以后要真正多 Agent 同时在同一群聊发言，需要新增群聊调度器。

## 2026-05-21 02:59

- 目标：补充二阶段改动的服务端构建验证。
- 背景：subagent 群聊加入涉及 server/routes/chat.js 与 server/routes/sessions.js，除了 renderer 构建外也需要确认 server bundle 能构建。
- 改动：无新增源码改动；运行 `npm run build:server` 生成服务端 bundle。
- 验证：`npm run build:server` 通过；尝试单独启动源码 server 时发现 14500 端口已被 `/Applications/Hanako.app` 的服务占用，因此没有替换正式 App 进程。
- 风险/后续：正式 `/Applications/Hanako.app` 不会自动使用本仓库源码改动；需要用开发版/重新打包后才能看到服务端行为。

## 2026-05-21 03:06

- 目标：调整只读 subagent 内部对话的 10 分钟倒计时清理行为。
- 背景：用户要求倒计时到期后不再自动归档，而是自动删除；同时用户正在查看该内部聊天框时，倒计时应恢复到 10 分钟满状态并暂停，只有完全不看时才继续倒计时。
- 改动：`core/session-coordinator.js` 将空闲过期 subagent 投影从归档隐藏改为调用删除流程，清理 jsonl、sidecar、skill snapshot 和 session-meta；`desktop/src/react/components/SessionList.tsx` 增加窗口聚焦/可见状态判断，当前查看的只读 subagent 每 30 秒 touch 一次并显示暂停满状态，失焦或切走后才继续按 mtime 倒计时；更新 `/api/sessions/subagent/touch` 注释与相关测试。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx`，40 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：本轮未新增 TODO；当前工作区在开始前已有多处未提交改动，未处理与本需求无关的脏文件。

## 2026-05-21 03:48

- 目标：按用户要求把当前开发板构建成可直接打开的本地成品 App，并安装为 `/Applications/Hanako Plus.app`。
- 背景：用户要求名字在原 Hanako 后加 Plus，同时保留当前所有聊天记录、内部信息、聊天界面设置和各类配置；项目默认数据目录为 `~/.hanako`，正式版 userData 当前为 `~/Library/Application Support/hanako`。
- 改动：运行 `npm run pack` 生成 `dist/mac-arm64/Hanako.app`；首次 SwiftPM 拉取 `trycua/cua` 卡住后终止并重跑，成功构建 computer-use helper、renderer、server 和 Electron app；复制到 `/Applications/Hanako Plus.app`，只修改 `CFBundleDisplayName=Hanako Plus`，保留 `CFBundleName=Hanako`、`CFBundleIdentifier=com.hanako.app` 和 app.asar 内产品名，以确保继续使用现有 `~/.hanako` 与 `Application Support/hanako` 数据；重新 ad-hoc 签名 Plus app。
- 验证：`codesign --verify --deep --strict /Applications/Hanako\ Plus.app` 通过；退出旧 `/Applications/Hanako.app` 后用 `open -a /Applications/Hanako\ Plus.app` 启动成功，进程路径为 `/Applications/Hanako Plus.app/Contents/MacOS/Hanako`，server 进程路径为 Plus app 内资源，`~/.hanako/server-info.json` 显示端口 14500，`/api/health` 返回 200 且读取到现有 agent/model/user 信息。
- 风险/后续：由于使用 ad-hoc 本地签名且没有 Apple notarization 密码，`spctl` 会显示 rejected，但本机可直接打开；Plus 与原 Hanako 共用同一数据目录和单实例锁，不建议两个同时运行。

## 2026-05-21 03:55

- 目标：按用户要求把当前项目根文件夹名称中的“开发板”改为“开发版”，并重新打开开发版应用。
- 背景：用户明确指出这里是“版本的版”；旧路径为 `/Users/kang/AI Studio/hanako开发板`。
- 改动：停止旧路径下的开发版 Electron/server 进程；将项目目录重命名为 `/Users/kang/AI Studio/hanako开发版`；同步更新 `AGENTS.md` 中的本机根目录约定。
- 验证：已确认新目录存在，旧开发版进程已停止；后续从新路径启动开发版。
- 风险/后续：外部记忆或历史聊天里的旧路径仍可能出现，后续本项目应以新路径为准。

## 2026-05-21 04:00

- 目标：调整侧边栏内部子任务条目的第二行信息对齐。
- 背景：用户指出“小康 完成 · Hanako · 刚刚”应与执行者头像对齐，而不是与左侧转接/回车图标对齐。
- 改动：`SessionList.tsx` 对协作子会话的 meta 行追加专用 class；`SessionList.module.css` 增加 `sessionItemMetaCollaboration`，仅让子会话 meta 行向右缩进 18px，普通会话不变。
- 验证：本轮为纯样式微调，未运行自动化测试。
- 风险/后续：实际视觉对齐需在开发版 UI 中确认；如头像尺寸或间距继续调整，18px 缩进可能需同步微调。

## 2026-05-21 04:03

- 目标：修正 subagent 内部任务列表状态圈的完成/倒计时展示时机。
- 背景：用户指出任务未完成时不应显示对勾或启动倒计时，应持续转圈；任务完成后才转一圈并打勾，同时外圈线条略细。
- 改动：`core/session-coordinator.js` 从 durable subagent run store 解析 `subagentStatus`，pending 任务不再触发 10 分钟自动删除；`server/routes/sessions.js` 向前端暴露 `subagentStatus`；`desktop/src/react/components/SessionList.tsx` 按 running/done 区分旋转圈与完成倒计时；`SessionList.module.css` 调细圆环并添加 running 旋转、完成打勾动画；补充相关组件和 coordinator 测试。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx`，42 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：本轮未新增 TODO；工作区开始前已有多处未提交改动，本轮只在相关文件上增量修改。

## 2026-05-21 04:10

- 目标：将侧边栏会话 meta 中无用的工作目录名替换为子任务执行耗时。
- 背景：用户指出父会话第二行中的 `Hanako` 目录名没有价值，希望显示上一个/最近子任务执行了多少分钟多少秒；任务运行中时显示已执行时间，并且时间数字要等宽、固定 `MM:SS`，避免跳动。
- 改动：`SessionList.tsx` 现在会从父会话最近子任务或子任务自身计算耗时，显示为 `耗时 MM:SS` 或 `执行中 MM:SS`；`SessionList.module.css` 为耗时数字添加等宽字体、tabular nums 和 `5ch` 占位；前后端类型/会话列表补充 `subagentStartedAt`、`subagentCompletedAt` 字段，并保留从 `taskId` 和 `modified` 推导的前端兜底。
- 验证：已运行 `npm run typecheck` 与 `npm run build:renderer`，均通过；构建输出仅有既有 Vite chunk/script 警告。
- 风险/后续：当前 dev server 若未重启，后端新增精确 started/completed 字段不会立即生效，但前端会用 taskId 时间戳和 modified 兜底显示；如需完全精确历史耗时，需要重启开发版服务端后重新拉取 session 列表。

## 2026-05-21 04:14

- 目标：微调侧边栏任务耗时展示，去除重复状态并稳定时间宽度。
- 背景：用户指出子任务行不需要再写“完成”，运行中时也不应同时出现两次“执行中”；同时希望右侧相对时间（如“1 分钟前”）也使用等宽数字风格。
- 改动：`SessionList.tsx` 的子任务 meta 首段改为仅显示执行者名称，状态交给后续 `耗时/执行中 MM:SS` 展示；`formatSessionDate` 输出包裹 `sessionRelativeTime`。`SessionList.module.css` 为相对时间增加等宽字体与 tabular nums。
- 验证：已运行 `npm run typecheck` 与 `npm run build:renderer`，均通过；构建输出仅有既有 Vite 警告。
- 风险/后续：未重启后端；本次为前端展示微调，刷新 renderer 后可见。

## 2026-05-21 04:17

- 目标：修复只读子任务条目点击/选中后 meta 被无意义省略的问题。
- 背景：用户指出子任务条目没有右下角操作按钮，却在 active/hover 状态下仍被挤出省略号。
- 改动：`SessionList.tsx` 为只读条目追加 `sessionItemReadOnly` class；`SessionList.module.css` 将 hover/active 的 `padding-right: 68px` 仅应用于非只读条目，只读子任务不再为不存在的操作按钮预留空间。
- 验证：已运行 `npm run typecheck` 与 `npm run build:renderer`，均通过；构建输出仅有既有 Vite 警告。
- 风险/后续：本次只影响只读条目的 meta 行压缩行为，普通会话仍保留操作按钮预留空间。

## 2026-05-21 04:21

- 目标：固定父会话下子代理条目的顺序，避免点击/查看后上下跳动。
- 背景：用户要求子代理列表顺序按创建/派出时间确定，而不是按点击、touch 或 modified 时间变化；新派出的 B 应稳定排在旧的 A 上方，点击 A 不应导致顺序重排闪动。
- 改动：`session-sections.ts` 中父会话 children 排序改为优先使用 `subagentStartedAt`，其次从 `taskId` 的时间戳推导，最后才回退到 `modified`；`core/session-coordinator.js` 在子代理投影中补充 projection created 作为 startedAt 兜底；更新 `session-sections.test.ts`，覆盖“modified 更新不影响子任务创建时间排序”。
- 验证：已运行 `npm test -- desktop/src/react/__tests__/components/session-sections.test.ts`、`npm run typecheck`、`npm run build:renderer`，均通过；构建输出仅有既有 Vite 警告。
- 风险/后续：当前排序主要由前端生效；后端新增 created 兜底需要服务端重启后才会进入接口，但已有 `taskId` 时间戳可作为当前前端排序兜底。

## 2026-05-21 04:25

- 目标：继续修正 subagent 列表状态，避免子代理仍在思考时提前显示完成/耗时。
- 背景：用户反馈子代理运行中应只显示同尺寸同粗细的旋转圆环，不再显示原来的闪烁点；完成后才用同一圆环过渡到对勾动画。
- 改动：`core/session-coordinator.js` 的 subagent 状态判断改为综合 task registry、deferred store、durable run store 和 childSessionPath 反查；有 taskId 但无终态时默认视为 running，并绕过 subagent meta 缓存以避免刚写入的 taskId 被旧缓存吞掉；`server/routes/sessions.js` 透出 started/completed 时间；`desktop/src/react/components/SessionList.tsx` 前端也把有 taskId 但无终态的 subagent 视为 running，运行中显示“执行中”而非错误耗时；`ws-message-handler.ts` 在 block_update 终态到达时同步更新 optimistic session 状态；移除 Agent pair 旁边旧的闪烁点，只保留同规格旋转圈。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx desktop/src/react/__tests__/services/ws-message-handler.test.ts`，66 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：本轮未新增 TODO；工作区仍有本轮前已存在的其他未提交改动，未处理无关文件。

## 2026-05-21 04:31

- 目标：把 subagent 的转圈到对勾 UI 同步到主 agent 会话，但不引入自动删除。
- 背景：用户要求主 agent 执行中也使用同尺寸同粗细圆环转圈，完成后转一圈打勾；完成对勾再次点击时收起，并带轻微取消动画。
- 改动：`desktop/src/react/components/SessionList.tsx` 增加主会话完成态本地指示器，监听 `streamingSessions` 从运行到结束的变化，运行中显示统一圆环，结束后显示完成对勾；点击主会话行会触发 dismiss 动画并移除对勾；主会话逻辑不触发 subagent 的 10 分钟自动删除；移除侧边栏旧 streaming 闪烁点样式。`SessionList.module.css` 增加完成指示器收起动画；补充组件测试覆盖主会话转圈、完成打勾、点击收起且无自动删除倒计时。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx desktop/src/react/__tests__/services/ws-message-handler.test.ts`，67 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：本轮未新增 TODO；完成对勾是前端本地状态，应用重载后不会保留历史完成提示。

## 2026-05-21 04:37

- 目标：修复侧边栏子 Agent 已完成后仍一直显示执行中转圈，导致无法进入倒计时删除的问题。
- 背景：用户反馈子任务已经完成但 UI 仍持续旋转，右侧删除/倒计时无法出现；同时主 Agent 不应因为子 Agent 正在运行而显示“执行中”。
- 改动：在 subagent 列表状态解析中综合 task registry、deferred result、durable run store 与 child session；当没有活跃任务记录且子会话已有 assistant 输出时，将 stale running 兜底为完成态，允许进入完成对勾和 10 分钟删除倒计时；前端父会话不再借用子任务状态，子任务标题去掉“任务：”前缀并缩小标题与右侧状态圈间距；终态 block_update 会触发 session 刷新。
- 验证：已运行 `npm test -- desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx tests/session-coordinator.test.js`，49 个测试通过；已运行 `npm test -- desktop/src/react/__tests__/services/ws-message-handler.test.ts`，22 个测试通过；已运行 `npm run build:renderer`，构建通过，仅有既有 Vite chunk/script 警告。
- 风险/后续：需要在开发窗口按 `⌘R` 刷新 renderer 后确认现有卡住的子任务是否立即转为对勾/倒计时；若使用 `/Applications/Hanako Plus.app` 成品包，需要重新打包才会包含本次源码改动。

## 2026-05-21 04:38

- 目标：主 agent 会话归档时同步清理其子 agent 内部会话。
- 背景：用户要求主会话归档后，对应子 agent 会话不要保留/归档，而是直接删除并从列表消失。
- 改动：`core/session-coordinator.js` 新增 `deleteSubagentChildrenForParentSession`，通过 `parentSessionPath` 找到只读 subagent 子会话并调用直接删除；`core/engine.js` 暴露代理方法；`server/routes/sessions.js` 在 `/api/sessions/archive` 归档主会话前级联直接删除子会话，并在响应中返回 `deletedSubagentPaths`；`desktop/src/react/stores/session-actions.ts` 根据响应清理被删子会话的本地缓存和当前焦点。补充 coordinator、archive route、前端 session-actions 测试。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js tests/sessions-archived-route.test.js desktop/src/react/__tests__/stores/session-actions.test.ts`，81 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：本轮未新增 TODO；级联删除使用 skipStreamingCheck=true，符合用户“子 Agent 直接删除”的要求，但运行中的子会话会被强制清理。

## 2026-05-21 04:42

- 目标：减少侧边栏会话标题右侧无效空白，让标题文字显示更多。
- 背景：用户截图指出普通会话标题在右侧仍有大块空白时已经提前省略，浪费列表宽度。
- 改动：`SessionList.tsx` 为标题行增加是否存在右上角状态圈的判断；`SessionList.module.css` 将标题行默认右侧预留从 22px 改为 0，仅在存在运行中圆环或完成对勾/倒计时时保留 20px。
- 验证：已运行 `npm run build:renderer`，构建通过，仅有既有 Vite chunk/script 警告。
- 风险/后续：普通会话标题可显示更多；带右上角状态圈的会话仍保留必要空间避免文字与圆环重叠。

## 2026-05-21 04:42

- 目标：优化主 agent 完成对勾的停留和消失动画。
- 背景：用户希望主窗口任务完成后对勾只显示约 3 秒，然后自动隐藏；隐藏动画应像圆环再转一圈后消失，而不是立即/点击才消失。
- 改动：`desktop/src/react/components/SessionList.tsx` 为主会话完成提示增加 3 秒自动 dismiss 计时，并把点击收起与自动隐藏统一到同一状态机；`SessionList.module.css` 将 dismiss 动画改为圆环再转一圈并淡出，同时勾淡出；更新 `SessionListContextMenu.test.tsx` 覆盖 3 秒停留、自动隐藏和提前点击收起。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js tests/sessions-archived-route.test.js desktop/src/react/__tests__/stores/session-actions.test.ts desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx desktop/src/react/__tests__/services/ws-message-handler.test.ts`，119 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：本轮未新增 TODO；该 3 秒完成提示仍是前端本地即时反馈，刷新后不恢复历史提示。

## 2026-05-21 04:47

- 目标：补齐主 agent 会话运行中与上一轮完成耗时显示。
- 背景：用户反馈主 agent 执行时侧边栏没有显示运行时间，执行完毕后也没有保留上一轮任务耗时。
- 改动：`desktop/src/react/components/SessionList.tsx` 为主会话增加本地 timing 状态，监听 `streamingSessions` 开始时记录 startedAt，结束时写 completedAt；主会话 meta 在运行中显示 `执行中 MM:SS`，结束后保留 `耗时 MM:SS`，下一轮运行会重置为新的计时。计时器从只服务子 agent 倒计时扩展为任意 streaming 会话也每秒刷新。
- 验证：已运行 `npm test -- desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx`，17 个测试通过；已运行 `npm run typecheck`，通过。
- 风险/后续：主 agent 上一轮耗时仍是前端本地即时状态，刷新 renderer 后不会恢复历史上一轮耗时；本轮未新增 TODO。

## 2026-05-21 04:48

- 补充验证：已运行 `npm run build:renderer`，构建通过；输出为既有 Vite script/chunk 警告。

## 2026-05-21 04:51

- 目标：修复子 Agent 仍在思考/整理中时侧边栏却提前显示完成对勾的问题。
- 背景：用户截图显示内容区仍为“思考中 / 整理结果 5/6”，但左侧子任务行已经打勾；根因是前端曾把“running 且已有 assistant 输出”误当作完成，用来兜底旧的卡死 running。
- 改动：`SessionList.tsx` 调整状态优先级，明确 `subagentStatus=running`、streaming 或 pending 时始终显示转圈，不再因已有中间输出改成完成；无终态但带 `taskId` 的会话优先视为运行中。`ws-message-handler.ts` 在收到 running 的 `block_update` 时清空旧 `subagentCompletedAt`，避免 stale 完成时间继续让 UI 打勾；补充组件与 WS 测试。
- 验证：已运行 `npm test -- desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx tests/session-coordinator.test.js desktop/src/react/__tests__/services/ws-message-handler.test.ts`，74 个测试通过；已运行 `npm run build:renderer`，构建通过，仅有既有 Vite chunk/script 警告。
- 风险/后续：本修复优先避免提前完成；真正旧的卡死任务仍依赖后端确认没有活跃任务记录后返回 done 才进入倒计时。

## 2026-05-21 04:56

- 目标：修复侧边栏子 Agent 条目短暂跑到列表顶部后又跳回父会话下面的严重抖动。
- 背景：用户截图显示子 Agent 投影在 WebSocket/刷新竞态期间被当成顶层会话显示在“今天”顶部，随后父子关系补齐又跳回，视觉上出现错误位置和闪跳。
- 改动：`desktop/src/react/components/session-sections.ts` 调整父子挂载规则：只读 subagent 投影必须在父会话存在时才渲染到父会话 children 下；父会话暂缺或 parentSessionPath 未匹配时先隐藏，不再作为顶层 fallback 行展示。同步更新 `session-sections` 与 `SessionListContextMenu` 测试数据，确保正常有父会话的 subagent 仍显示、运行/完成状态不受影响。
- 验证：已运行 `npm test -- desktop/src/react/__tests__/components/session-sections.test.ts desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx`，23 个测试通过；已运行 `npm run typecheck`，通过；已运行 `npm run build:renderer`，构建通过，仅有既有 Vite script/chunk 警告。
- 风险/后续：如果历史数据里存在真正没有父会话的只读 subagent 投影，现在会从侧边栏隐藏；这符合主会话归档后子会话直接删除、子会话不应独立跑到顶层的当前产品逻辑。本轮未新增 TODO。

## 2026-05-21 05:05

- 目标：固化开发/测试版端口约定，避免与正式版 Hanako 端口冲突。
- 背景：正式版 Hanako 使用 `14500`，本仓库开发版此前也默认抢占 `14500`，导致启动时报 `EADDRINUSE`；用户要求把约定写入 AGENTS。
- 改动：`AGENTS.md` 的“本机约定”新增规则：`14500` 保留给正式版，开发/测试版默认使用 `14501`；开发版配置位于 `/Users/kang/.hanako-dev/server-network.json` 且应保持 `listenPort: 14501`；不要为启动开发版杀正式版端口进程，除非用户明确要求。
- 验证：文档约定更新，无需运行测试。
- 风险/后续：若未来需要并行多套开发实例，应另行分配端口并更新本约定。

## 2026-05-21 05:17

- 目标：恢复 Sub Agent 工具可用性，排查用户反馈“子代理工具被删/用不了”。
- 背景：代码中的 `subagent` 工具并未删除；实际日志显示主 agent 调用子代理时模型参数被填成当前可用模型列表里不存在的 `deepseek/deepseek-chat`，导致 `executeIsolated` 直接失败并让 UI 看起来像子代理不可用。
- 改动：`core/session-coordinator.js` 在 `executeIsolated` 收到显式 `opts.model` 时先尝试解析；如果该模型不可用，记录 warn 并回退到目标 agent 的 `models.chat` 或 default model，而不是让子代理任务失败。`tests/session-coordinator.test.js` 增加覆盖：子代理传入不可用模型时应回退到可用模型继续创建 isolated session。
- 验证：已运行 `npm test -- tests/session-coordinator.test.js`，35 个测试通过；已用 Node 25.8.1 重启开发版，14501 端口已监听，正式版 14500 未被杀；最新开发日志未再出现 better-sqlite ABI、runtime init 或 `找不到模型: deepseek/deepseek-chat` 错误。
- 风险/后续：历史已经失败的子代理 run 仍会保留失败记录；新派发的子代理会走模型回退逻辑。

## 2026-05-21 05:37

- 目标：把当前已提交版本构建并安装成本机可直接打开的 `Hanako Plus.app`。
- 背景：用户要求将当前修复好的版本打包成 Plus；本机 Plus 约定是 `/Applications/Hanako Plus.app`，保留 `com.hanako.app` 和正式数据目录以继承原有聊天记录与配置。
- 改动：先停止开发版 14501，不动正式数据；运行 `npm run pack`，首次因 Swift 旧路径模块缓存失败，清理 `.cache/computer-use-helper/swift-build/mac-arm64` 和 `dist-computer-use/mac-arm64` 后重跑；`electron-builder` 在最后 notarize 因缺少 Apple 密码报错，但 `dist/mac-arm64/Hanako.app` 已生成。随后复制为 `/Applications/Hanako Plus.app`，设置 `CFBundleDisplayName=Hanako Plus`，保留 `CFBundleName=Hanako` 与 `CFBundleIdentifier=com.hanako.app`，写入 `app-update.yml`，移除 quarantine，并对 server node/native addon、computer-use helper、framework/helper 和主 app 做 ad-hoc 重签。
- 验证：`codesign --verify --deep --strict /Applications/Hanako\ Plus.app` 通过；启动 `/Applications/Hanako Plus.app` 后 server 进程来自 Plus app，监听 14500；使用 `/Users/kang/.hanako/server-info.json` token 请求 `/api/health` 返回 `status: ok`、版本 `0.222.8`。
- 风险/后续：本地 ad-hoc 签名未 notarize，适合本机使用；若要分发给其他机器，需要配置 Apple notarization 密码后走正式签名流程。

## 2026-05-21 08:12

- 目标：按用户澄清把 A1 服务器配置为 Hanako Plus 的公网桥接入口，而不是把 Hanako 部署到服务器。
- 背景：用户希望手机在外网访问时，本质仍连接这台 Mac 上的 `/Applications/Hanako Plus.app` 与本机正式端口 `14500`；A1 只承担公网 nginx 入口和 SSH 反向隧道转发。
- 改动：确认并保留本机 LaunchAgent `/Users/kang/Library/LaunchAgents/com.hanako.a1-bridge.plist`，通过 `ssh -R 127.0.0.1:18649:127.0.0.1:14500 a1` 把 A1 本地端口转回 Mac 的 Plus 服务；A1 nginx 当前使用公网 `http://47.110.74.238:8648` 转发到 `127.0.0.1:18649`；本地连接信息文件 `/Users/kang/.hanako/a1-bridge-access.txt` 已改为 `8648` 并保持 `600` 权限。
- 验证：`launchctl print gui/$(id -u)/com.hanako.a1-bridge` 显示 running；本机存在 ssh 反向隧道进程；`curl -I http://47.110.74.238:8648/mobile/` 返回 `HTTP/1.1 200 OK`；带本地生成的 device credential 请求 `http://47.110.74.238:8648/api/server/identity` 返回 `credentialKind: device_credential`、`capabilities: [chat, resources, files]`、`version: 0.222.8`。
- 风险/后续：公网 `8649` 端口疑似被云安全组拦截，所以当前稳定入口临时复用 `8648`；若后续需要更干净的独立端口或域名 HTTPS，应打开云安全组或绑定域名证书。旧 Hermes 8648 nginx 配置已备份在 A1 的 `/root/nginx-backups/`。

## 2026-05-21 11:28

- 目标：按用户要求从个人知识库找回“双 Mac 通过 A1 SSH 中转”的方案，并执行最后一步。
- 背景：知识库笔记 `MacBook Pro与MacBook Air SSH连接` 记录最终步骤是补齐 Pro 侧 SSH 别名，形成 `Pro -> A1 -> Air` 固定入口；当前本机确认为 MacBook Pro，`a1` SSH 别名可用。
- 改动：在 `/Users/kang/.ssh/config` 新增 `Host air-via-a1`，通过 `ProxyJump a1` 访问 A1 上的 `127.0.0.1:22022`，用户为 `kang`，使用现有 `~/.ssh/sortify_server` key，并设置 SSH keepalive 与 `HostKeyAlias macbook-air-via-a1`。
- 验证：`ssh -G air-via-a1` 已确认别名解析为 `ProxyJump a1`、目标 `127.0.0.1:22022`；`ssh a1` 可登录。实际 `ssh air-via-a1` 当前因 A1 上未检测到 Air 反向隧道监听 `22022` 而 `Connection refused`，说明 Pro 侧最后一步已补齐，但 Air 侧隧道需要在线后才能连通。
- 风险/后续：未修改 `TODO.md`；若 Air 侧端口不是 `22022` 或 Air 登录用户名/授权 key 不同，需按实际 Air 侧配置调整该别名。

## 2026-05-27 18:48

- 目标：按 `UPSTREAM_SYNC.md` 将原作者 `upstream/main` 更新合并进本地定制分支，并保留本地修改优先。
- 背景：用户要求检查原作者 GitHub 是否有新版本，若有则与当前本地/个人 GitHub 分支合并；合并前必须先提交当前状态，便于出问题时回溯。
- 改动：先将未提交的 `MEMORY.md` 记录提交为 checkpoint `e3c7c977 保存上游同步前当前状态`；从 `upstream/main` 拉取到最新 `v0.243.0`，在临时分支 `sync-upstream-2026-05-27` 使用 `git merge -X ours upstream/main` 合并 154 个上游提交；保留本地 `AGENTS.md`、`MEMORY.md`、`TODO.md`、`UPSTREAM_SYNC.md`；修复合并后前端编译问题，补齐 channel hydrate、聊天选区捕获、输入引用状态与 session 搜索状态；更新 `ChannelTabBar` 测试 mock。
- 验证：`npm run typecheck` 通过；`npm test -- desktop/src/react/__tests__/components/ChatArea.continuous-scroll.test.tsx desktop/src/react/__tests__/components/InputArea.media-send.test.tsx desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx desktop/src/react/__tests__/components/ChannelTabBar.test.ts` 通过，4 个测试文件、28 个测试通过。
- 风险/后续：本轮未运行全量测试；上游跨度较大，后续若发现运行时 UI 回归，应优先检查合并涉及的聊天、频道、SessionList、图片生成和新插件功能。

## 2026-05-27 18:54

- 目标：启动合并上游后的开发版供用户检查，并修复启动期发现的运行时问题。
- 背景：开发版启动后 server 在 `14501` 正常监听，但切换会话触发 `isActiveDesktopSessionPath is not defined`；同时本机 `better-sqlite3` native addon 曾因 Node 25/22 ABI 不一致导致焦点 agent runtime 初始化失败。
- 改动：在 `server/routes/sessions.js` 补齐 `isActiveDesktopSessionPath` import；使用当前 Node 22.22.2 执行 `npm rebuild better-sqlite3`，使 native addon ABI 回到 `NODE_MODULE_VERSION 127`。
- 验证：`node -e "require('better-sqlite3')"` 通过；`npm run typecheck` 通过；`npm test -- tests/message-utils.test.js desktop/src/react/__tests__/components/ChannelTabBar.test.ts desktop/src/react/__tests__/components/ChatArea.continuous-scroll.test.tsx desktop/src/react/__tests__/components/InputArea.media-send.test.tsx desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx` 通过，5 个测试文件、57 个测试通过。
- 风险/后续：`tests/sessions-route.test.js` 在本轮合并后仍有若干上游搜索/历史窗口 mock 相关失败，暂未作为打开开发版前置阻塞；正式构建前如时间允许可继续对齐该测试文件。

## 2026-05-27 18:59

- 目标：修复开发版 UI 中 `/api/sessions/new` 500，解除新建聊天失败。
- 背景：合并上游 `v0.243.0` 后，用户在开发版窗口看到新建 session 失败；复现接口返回 `normalizeStringArray is not defined`，说明上游 session prompt snapshot/cache 相关实现合入时 import 缺失。
- 改动：在 `core/session-coordinator.js` 补齐 `cache-prefix-contract` 与 `session-prompt-snapshot` 相关 import，包括 `normalizeStringArray`、`SESSION_PROMPT_SNAPSHOT_VERSION`、`freezeAgentsFilesResult`、`freezeSkillsResult`、`normalizeSessionPromptSnapshot` 等。
- 验证：`node --check core/session-coordinator.js` 和 `node --check server/routes/sessions.js` 通过；`npm test -- tests/session-coordinator.test.js tests/message-utils.test.js desktop/src/react/__tests__/components/SessionListContextMenu.test.tsx` 通过，3 个测试文件、89 个测试通过；重启开发版后直接调用 `POST http://127.0.0.1:14501/api/sessions/new` 返回 200，并创建新 session。
- 风险/后续：本轮为合并漏 import 的运行时修复；若继续遇到 500，应继续按接口返回 error 字段定位上游合并遗漏。

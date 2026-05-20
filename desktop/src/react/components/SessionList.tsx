/**
 * SessionList — 侧边栏 session 列表 React 组件
 *
 * Phase 6B: 替代 sidebar-shim.ts 中的 renderSessionList / createSessionItem。
 * 通过 portal 渲染到 #sessionList，从 Zustand sessions 状态驱动。
 */

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../stores';
import { hanaFetch } from '../hooks/use-hana-fetch';
import { useI18n } from '../hooks/use-i18n';
import { formatSessionDate } from '../utils/format';
import { switchSession, archiveSession, renameSession, pinSession, deleteSubagentSession, loadSessions } from '../stores/session-actions';
import { updateKeyed } from '../stores/create-keyed-slice';
import type { Session, Agent } from '../types';
import { AgentAvatar, resolveAgentDisplayInfo } from '../utils/agent-display';
import { buildSessionSections } from './session-sections';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { renderMarkdown } from '../utils/markdown';
import styles from './SessionList.module.css';


const SUBAGENT_SESSION_TTL_MS = 10 * 60 * 1000;

interface BrowserSessionState {
  url: string | null;
  running: boolean;
  resumable: boolean;
  unavailableReason: string | null;
}

function normalizeBrowserSessionStates(data: unknown): Record<string, BrowserSessionState> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const result: Record<string, BrowserSessionState> = {};
  for (const [sessionPath, rawState] of Object.entries(data as Record<string, unknown>)) {
    if (typeof rawState === 'string') {
      result[sessionPath] = {
        url: rawState,
        running: false,
        resumable: true,
        unavailableReason: null,
      };
      continue;
    }
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) continue;
    const state = rawState as Partial<BrowserSessionState>;
    result[sessionPath] = {
      url: typeof state.url === 'string' ? state.url : null,
      running: state.running === true,
      resumable: state.resumable !== false,
      unavailableReason: typeof state.unavailableReason === 'string' ? state.unavailableReason : null,
    };
  }
  return result;
}


// ── 主组件 ──

export function SessionList() {
  return <SessionListInner />;
}

// ── 内部组件 ──

function SessionListInner() {
  const { t } = useI18n();
  const sessions = useStore(s => s.sessions);
  const currentSessionPath = useStore(s => s.currentSessionPath);
  const pendingSessionSwitchPath = useStore(s => s.pendingSessionSwitchPath);
  const pendingNewSession = useStore(s => s.pendingNewSession);
  const agents = useStore(s => s.agents);
  const streamingSessions = useStore(s => s.streamingSessions);
  const browserBySession = useStore(s => s.browserBySession);

  const [browserSessions, setBrowserSessions] = useState<Record<string, BrowserSessionState>>({});
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const closingBrowserSessionsRef = useRef(new Set<string>());

  const setVisibleBrowserSessions = useCallback((data: unknown) => {
    const states = normalizeBrowserSessionStates(data);
    for (const sessionPath of closingBrowserSessionsRef.current) {
      delete states[sessionPath];
    }
    setBrowserSessions(states);
  }, []);

  const hasSubagentCountdown = sessions.some(s => (s.collaborationKind === 'subagent' || s.kind === 'subagent') && s.readOnly);
  useEffect(() => {
    if (!hasSubagentCountdown) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasSubagentCountdown]);

  useEffect(() => {
    const hasExpiredSubagent = sessions.some(s => {
      const isSubagent = (s.collaborationKind === 'subagent' || s.kind === 'subagent') && s.readOnly;
      if (!isSubagent || streamingSessions.includes(s.path)) return false;
      const modifiedMs = Date.parse(s.modified || '');
      return Number.isFinite(modifiedMs) && countdownNow - modifiedMs >= SUBAGENT_SESSION_TTL_MS;
    });
    if (!hasExpiredSubagent) return;
    void loadSessions();
  }, [countdownNow, sessions, streamingSessions]);

  // Fetch browser sessions (re-fetch when browser state changes)
  useEffect(() => {
    let cancelled = false;
    if (sessions.length === 0) {
      setBrowserSessions({});
      return;
    }
    hanaFetch('/api/browser/session-states')
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setVisibleBrowserSessions(data);
      })
      .catch(err => console.warn('[sessions] fetch browser sessions failed:', err));
    return () => {
      cancelled = true;
    };
  }, [sessions, browserBySession, setVisibleBrowserSessions]);

  const handleCloseBrowserSession = useCallback(async (sessionPath: string) => {
    closingBrowserSessionsRef.current.add(sessionPath);
    setBrowserSessions(prev => {
      const next = { ...prev };
      delete next[sessionPath];
      return next;
    });
    try {
      const res = await hanaFetch('/api/browser/close-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionPath }),
      });
      const data = await res.json();
      updateKeyed('browserBySession', sessionPath, { running: false, url: null, thumbnail: null });
      closingBrowserSessionsRef.current.delete(sessionPath);
      if (data?.sessions) {
        setBrowserSessions(normalizeBrowserSessionStates(data.sessions));
      }
    } catch (err) {
      closingBrowserSessionsRef.current.delete(sessionPath);
      console.warn('[sessions] close browser session failed:', err);
    }
  }, []);

  if (sessions.length === 0) {
    return <div className={styles.sessionEmpty}>{t('sidebar.empty')}</div>;
  }

  const sections = buildSessionSections(sessions, { mode: 'time' });
  const activeSessionPath = pendingSessionSwitchPath || currentSessionPath;

  return (
    <>
      {sections.map(section => {
        const items = section.items.map(s => (
          <SessionItem
            key={s.path}
            session={s}
            isActive={!pendingNewSession && s.path === activeSessionPath}
            isStreaming={streamingSessions.includes(s.path) || !!s.pendingSubagent}
            isPinned={!!s.pinnedAt}
            agents={agents}
            browserState={browserSessions[s.path] || null}
            countdownNow={countdownNow}
            onCloseBrowser={handleCloseBrowserSession}
          />
        ));

        if (section.kind === 'pinned') {
          return (
            <section key={section.id} className={styles.pinnedSection}>
              <div className={`${styles.sessionSectionTitle} ${styles.pinnedSectionTitle}`}>
                <span>{t(section.titleKey)}</span>
                <svg className={styles.pinnedTitleIcon} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 17v5" />
                  <path d="M5 17h14" />
                  <path d="M7 3h10l-2 9H9L7 3z" />
                  <path d="M9 12l-2 5h10l-2-5" />
                </svg>
              </div>
              {items}
            </section>
          );
        }

        return (
          <Fragment key={section.id}>
            <div className={styles.sessionSectionTitle}>{t(section.titleKey)}</div>
            {items}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Session Item ──

const SessionItem = memo(function SessionItem({ session: s, isActive, isStreaming, isPinned, agents, browserState, countdownNow, onCloseBrowser }: {
  session: Session;
  isActive: boolean;
  isStreaming: boolean;
  isPinned: boolean;
  agents: Agent[];
  browserState: BrowserSessionState | null;
  countdownNow: number;
  onCloseBrowser: (sessionPath: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [summaryPreviewPosition, setSummaryPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    if (editing || s.pendingSubagent) return;
    switchSession(s.path);
  }, [s.path, s.pendingSubagent, editing]);

  const handleArchive = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    archiveSession(s.path);
  }, [s.path]);

  const handleDeleteSubagent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSubagentSession(s.path);
  }, [s.path]);

  const handlePin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    pinSession(s.path, !isPinned);
  }, [s.path, isPinned]);

  const beginRename = useCallback(() => {
    setEditValue(s.title || s.firstMessage || '');
    setEditing(true);
  }, [s.title, s.firstMessage]);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    beginRename();
  }, [beginRename]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== (s.title || s.firstMessage || '')) {
      renameSession(s.path, trimmed);
    }
  }, [editValue, s.path, s.title, s.firstMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  }, [commitRename]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (s.readOnly) return;
    setSummaryPreviewPosition(null);
    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, [s.readOnly]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const isCollaboration = s.collaborationKind === 'subagent' || s.kind === 'subagent';

  // Meta line
  const parts: string[] = [];
  if (isCollaboration) {
    parts.push(s.pendingSubagent ? 'Agent 对话 · 建立中' : 'Agent 对话 · 只读');
  } else if (s.agentName || s.agentId) parts.push(s.agentName || s.agentId!);
  if (s.cwd) {
    const dirName = s.cwd.split(/[/\\]/).filter(Boolean).pop();
    if (dirName) parts.push(dirName);
  }
  if (s.modified) parts.push(formatSessionDate(s.modified));
  const rcLabel = s.rcAttachment ? `${formatRcPlatform(s.rcAttachment.platform)} 接管中` : null;
  const browserUrl = browserState?.url || null;
  const browserTitle = [
    browserUrl,
    browserState?.unavailableReason,
    t('browser.close'),
  ].filter(Boolean).join('\n');

  const handleBrowserClose = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCloseBrowser(s.path);
  }, [onCloseBrowser, s.path]);

  const handleBrowserKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    handleBrowserClose(e);
  }, [handleBrowserClose]);

  return (
    <>
      <button
        className={`${styles.sessionItem}${isActive ? ` ${styles.sessionItemActive}` : ''}`}
        data-session-path={s.path}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className={styles.sessionItemHeader}>
          {isCollaboration ? (
            <AgentPairBadge
              requesterAgentId={s.requesterAgentId || null}
              requesterAgentName={s.requesterAgentName || null}
              executorAgentId={s.executorAgentId || s.agentId || null}
              executorAgentName={s.executorAgentName || s.agentName || null}
              agents={agents}
            />
          ) : s.agentId ? (
            <AgentBadge agentId={s.agentId} agentName={s.agentName} agents={agents} />
          ) : null}
          {isStreaming && <span className={styles.sessionStreamingDot} />}
          {isCollaboration && !isStreaming && !s.pendingSubagent && (
            <SubagentCountdown modified={s.modified} now={countdownNow} />
          )}
          {editing ? (
            <input
              ref={inputRef}
              className={styles.sessionRenameInput}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className={styles.sessionItemTitle}>
              {s.title || s.firstMessage || t('session.untitled')}
            </div>
          )}
        </div>

        {!editing && !s.readOnly && (
          <div className={styles.sessionPinBtn} title={t(isPinned ? 'session.unpin' : 'session.pin')} onClick={handlePin}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5" />
              <path d="M5 17h14" />
              <path d="M7 3h10l-2 9H9L7 3z" />
              <path d="M9 12l-2 5h10l-2-5" />
            </svg>
          </div>
        )}

        {!editing && !s.readOnly && (
          <div className={styles.sessionRenameBtn} title={t('session.rename')} onClick={startRename}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </div>
        )}

        {s.readOnly && isCollaboration && !s.pendingSubagent ? (
          <div className={styles.sessionArchiveBtn} title="删除内部对话" onClick={handleDeleteSubagent}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
        ) : !s.readOnly && (
          <div className={styles.sessionArchiveBtn} title={t('session.archive')} onClick={handleArchive}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </div>
        )}

        <div className={styles.sessionItemMeta}>
          {parts.join(' · ')}
        </div>

        {rcLabel && (
          <div className={styles.sessionRcBadge}>
            {rcLabel}
          </div>
        )}

        {browserUrl && (
          <span
            className={styles.sessionBrowserBadge}
            title={browserTitle}
            role="button"
            tabIndex={0}
            aria-label={t('browser.close')}
            data-running={browserState?.running ? 'true' : 'false'}
            data-resumable={browserState?.resumable ? 'true' : 'false'}
            onClick={handleBrowserClose}
            onKeyDown={handleBrowserKeyDown}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </span>
        )}
      </button>
      {menuPosition && (
        <SessionContextMenu
          session={s}
          isPinned={isPinned}
          position={menuPosition}
          onClose={() => setMenuPosition(null)}
          onRename={beginRename}
          onShowSummary={(position) => setSummaryPreviewPosition(position)}
        />
      )}
      {summaryPreviewPosition && (
        <SessionSummaryPreviewCard
          session={s}
          position={summaryPreviewPosition}
          onClose={() => setSummaryPreviewPosition(null)}
        />
      )}
    </>
  );
});

interface SessionSummaryResponse {
  hasSummary?: boolean;
  summary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

type SummaryState =
  | { status: 'loading'; text: null }
  | { status: 'ready'; text: string }
  | { status: 'empty'; text: null }
  | { status: 'error'; text: null };

const SessionContextMenu = memo(function SessionContextMenu({
  session,
  isPinned,
  position,
  onClose,
  onRename,
  onShowSummary,
}: {
  session: Session;
  isPinned: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onShowSummary: (position: { x: number; y: number }) => void;
}) {
  const { t } = useI18n();
  const items = useMemo<ContextMenuItem[]>(() => [
    {
      label: t('session.summary.open'),
      disabled: session.hasSummary !== true,
      action: () => onShowSummary(position),
    },
    {
      label: t(isPinned ? 'session.unpin' : 'session.pin'),
      action: () => pinSession(session.path, !isPinned),
    },
    {
      label: t('session.rename'),
      action: onRename,
    },
    {
      label: t('session.archive'),
      danger: true,
      action: () => archiveSession(session.path),
    },
  ], [isPinned, onRename, onShowSummary, position, session.path, t]);

  return (
    <ContextMenu
      items={items}
      position={position}
      onClose={onClose}
    />
  );
});

const SessionSummaryPreviewCard = memo(function SessionSummaryPreviewCard({
  session,
  position,
  onClose,
}: {
  session: Session;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const [summaryState, setSummaryState] = useState<SummaryState>(
    session.hasSummary === true
      ? { status: 'loading', text: null }
      : { status: 'empty', text: null },
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth) x = Math.max(4, window.innerWidth - rect.width - 4);
    if (y + rect.height > window.innerHeight) y = Math.max(4, window.innerHeight - rect.height - 4);
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }, [position, summaryState]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick, true);
      document.addEventListener('contextmenu', handleContextMenu, true);
      document.addEventListener('keydown', handleKeyDown);
    });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (session.hasSummary !== true) {
      setSummaryState({ status: 'empty', text: null });
      return;
    }

    let cancelled = false;
    setSummaryState({ status: 'loading', text: null });
    hanaFetch(`/api/sessions/summary?path=${encodeURIComponent(session.path)}`)
      .then(res => res.json())
      .then((data: SessionSummaryResponse) => {
        if (cancelled) return;
        const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
        if (data.hasSummary && summary) {
          setSummaryState({ status: 'ready', text: summary });
        } else {
          setSummaryState({ status: 'empty', text: null });
        }
      })
      .catch(() => {
        if (!cancelled) setSummaryState({ status: 'error', text: null });
      });

    return () => {
      cancelled = true;
    };
  }, [session.path, session.hasSummary]);

  const summaryHtml = useMemo(() => (
    summaryState.status === 'ready' ? renderMarkdown(summaryState.text) : ''
  ), [summaryState]);

  return createPortal(
    <div
      ref={cardRef}
      className={styles.sessionSummaryCard}
      style={{ left: position.x, top: position.y }}
      data-testid="session-summary-card"
      data-scrollable="true"
    >
      <div className={styles.sessionSummaryTitle}>{t('session.summary.title')}</div>
      <div className={styles.sessionSummaryBody}>
        {summaryState.status === 'ready' ? (
          <div dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        ) : (
          <span className={styles.sessionSummaryPlaceholder}>
            {summaryState.status === 'loading'
              ? t('session.summary.loading')
              : summaryState.status === 'error'
                ? t('session.summary.loadFailed')
                : t('session.summary.empty')}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
});

function formatRcPlatform(platform: string) {
  const lower = (platform || '').toLowerCase();
  if (lower === 'tg' || lower === 'telegram') return 'Telegram';
  if (lower === 'feishu' || lower === 'fs') return '飞书';
  if (lower === 'wechat' || lower === 'wx') return '微信';
  if (lower === 'qq') return 'QQ';
  return platform || 'Bridge';
}

// ── Agent Avatar Badge ──


const SubagentCountdown = memo(function SubagentCountdown({ modified, now }: {
  modified: string | null;
  now: number;
}) {
  const modifiedMs = Date.parse(modified || '');
  const remaining = Number.isFinite(modifiedMs)
    ? Math.max(0, SUBAGENT_SESSION_TTL_MS - (now - modifiedMs))
    : SUBAGENT_SESSION_TTL_MS;
  const ratio = Math.max(0, Math.min(1, remaining / SUBAGENT_SESSION_TTL_MS));
  const colorClass = ratio <= 0.2
    ? styles.sessionCountdownDanger
    : ratio <= 0.5
      ? styles.sessionCountdownWarn
      : styles.sessionCountdownSafe;
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const minutes = Math.ceil(remaining / 60000);

  return (
    <span className={`${styles.sessionCountdown} ${colorClass}`} title={`${minutes} 分钟后自动删除`} aria-label={`${minutes} 分钟后自动删除`}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle className={styles.sessionCountdownTrack} cx="8" cy="8" r={radius} />
        <circle
          className={styles.sessionCountdownValue}
          cx="8"
          cy="8"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
    </span>
  );
});

const AgentPairBadge = memo(function AgentPairBadge({ requesterAgentId, requesterAgentName, executorAgentId, executorAgentName, agents }: {
  requesterAgentId: string | null;
  requesterAgentName: string | null;
  executorAgentId: string | null;
  executorAgentName: string | null;
  agents: Agent[];
}) {
  return (
    <span className={styles.sessionAgentPairBadge} title={`${requesterAgentName || requesterAgentId || 'Agent'} ↔ ${executorAgentName || executorAgentId || 'Agent'}`}>
      {requesterAgentId && (
        <AgentBadge agentId={requesterAgentId} agentName={requesterAgentName} agents={agents} />
      )}
      <span className={styles.sessionAgentPairArrow}>↔</span>
      {executorAgentId && (
        <AgentBadge agentId={executorAgentId} agentName={executorAgentName} agents={agents} />
      )}
    </span>
  );
});

const AgentBadge = memo(function AgentBadge({ agentId, agentName, agents }: {
  agentId: string;
  agentName: string | null;
  agents: Agent[];
}) {
  const info = resolveAgentDisplayInfo({
    id: agentId,
    agents,
    fallbackAgentName: agentName || agentId,
  });

  return (
    <AgentAvatar
      info={info}
      className={styles.sessionAgentBadge}
      title={agentName || agentId}
    />
  );
});

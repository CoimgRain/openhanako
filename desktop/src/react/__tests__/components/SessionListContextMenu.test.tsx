/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const hanaFetchMock = vi.fn();
const switchSessionMock = vi.fn();
const archiveSessionMock = vi.fn();
const renameSessionMock = vi.fn();
const pinSessionMock = vi.fn();
const loadSessionsMock = vi.fn();

vi.mock('../../hooks/use-hana-fetch', () => ({
  hanaFetch: (...args: unknown[]) => hanaFetchMock(...args),
  hanaUrl: (p: string) => p,
}));

vi.mock('../../stores/session-actions', () => ({
  switchSession: (...args: unknown[]) => switchSessionMock(...args),
  archiveSession: (...args: unknown[]) => archiveSessionMock(...args),
  renameSession: (...args: unknown[]) => renameSessionMock(...args),
  pinSession: (...args: unknown[]) => pinSessionMock(...args),
  loadSessions: (...args: unknown[]) => loadSessionsMock(...args),
}));

vi.mock('../../hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key === 'session.summary.open' ? '摘要' : key,
  }),
}));

import { SessionList } from '../../components/SessionList';
import { useStore } from '../../stores';

function jsonResponse(data: unknown) {
  return {
    json: async () => data,
  };
}

function seedSessions() {
  useStore.setState({
    sessions: [
      {
        path: '/tmp/agents/hana/sessions/with-summary.jsonl',
        title: 'Has summary',
        firstMessage: 'hello',
        modified: '2026-04-29T08:00:00.000Z',
        messageCount: 2,
        agentId: 'hana',
        agentName: 'Hana',
        cwd: '/tmp/project',
        pinnedAt: null,
        hasSummary: true,
      },
      {
        path: '/tmp/agents/hana/sessions/no-summary.jsonl',
        title: 'No summary',
        firstMessage: 'hello',
        modified: '2026-04-29T07:00:00.000Z',
        messageCount: 1,
        agentId: 'hana',
        agentName: 'Hana',
        cwd: '/tmp/project',
        pinnedAt: null,
        hasSummary: false,
      },
    ],
    currentSessionPath: null,
    pendingSessionSwitchPath: null,
    pendingNewSession: false,
    agents: [],
    streamingSessions: [],
    browserBySession: {},
    locale: 'zh',
  });
}

function sessionButton(title: string) {
  const button = screen.getByText(title).closest('button');
  if (!button) throw new Error(`Missing session button: ${title}`);
  return button;
}

describe('SessionList context menu', () => {
  beforeEach(() => {
    globalThis.t = ((key: string) => {
      if (key === 'yuan.types') return {};
      return key;
    }) as typeof globalThis.t;
    hanaFetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/browser/session-states') return jsonResponse({});
      if (url === '/api/browser/sessions') return jsonResponse({});
      if (url === '/api/sessions/subagent/touch') return jsonResponse({ modified: '2026-04-29T08:10:00.000Z' });
      if (url.startsWith('/api/sessions/summary')) {
        return jsonResponse({
          hasSummary: true,
          summary: '### 重要事实\n- 用户在做记忆系统。\n\n### 事情经过\n- 10:00 用户讨论 session 摘要。',
          createdAt: '2026-04-29T07:00:00.000Z',
          updatedAt: '2026-04-29T08:00:00.000Z',
        });
      }
      return jsonResponse({});
    });
    switchSessionMock.mockReset();
    archiveSessionMock.mockReset();
    renameSessionMock.mockReset();
    pinSessionMock.mockReset();
    loadSessionsMock.mockReset();
    seedSessions();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps summaryless session rows readable and disables only the summary menu item', () => {
    render(<SessionList />);

    expect(sessionButton('No summary').className).not.toContain('sessionItemSummaryEmpty');

    fireEvent.contextMenu(sessionButton('No summary'), { clientX: 24, clientY: 32 });
    const summaryItem = screen.getByText('摘要').closest('.context-menu-item');
    expect(summaryItem).toHaveClass('disabled');

    fireEvent.click(screen.getByText('摘要'));
    expect(screen.queryByTestId('session-summary-card')).not.toBeInTheDocument();
    expect(hanaFetchMock).not.toHaveBeenCalledWith(
      '/api/sessions/summary?path=%2Ftmp%2Fagents%2Fhana%2Fsessions%2Fno-summary.jsonl',
    );
  });

  it('keeps the right-click menu as a shared narrow menu and opens summary as a click-through preview card', async () => {
    render(<SessionList />);

    fireEvent.contextMenu(sessionButton('Has summary'), { clientX: 24, clientY: 32 });

    const menu = document.querySelector('.context-menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass('context-menu');
    expect(menu?.className).toBe('context-menu');
    expect(screen.getByText('摘要')).toBeInTheDocument();
    expect(menu?.querySelector('.context-menu-divider')).toBeNull();
    expect(screen.queryByTestId('session-summary-card')).not.toBeInTheDocument();
    expect(hanaFetchMock).not.toHaveBeenCalledWith(
      '/api/sessions/summary?path=%2Ftmp%2Fagents%2Fhana%2Fsessions%2Fwith-summary.jsonl',
    );

    fireEvent.click(screen.getByText('摘要'));

    expect(await screen.findByTestId('session-summary-card')).toHaveAttribute('data-scrollable', 'true');
    expect(await screen.findByText(/用户在做记忆系统/)).toBeInTheDocument();
    expect(hanaFetchMock).toHaveBeenCalledWith(
      '/api/sessions/summary?path=%2Ftmp%2Fagents%2Fhana%2Fsessions%2Fwith-summary.jsonl',
    );
  });

  it('routes context menu actions through the existing session operations', async () => {
    render(<SessionList />);

    fireEvent.contextMenu(sessionButton('Has summary'), { clientX: 24, clientY: 32 });
    fireEvent.click(await screen.findByText('session.pin'));
    expect(pinSessionMock).toHaveBeenCalledWith('/tmp/agents/hana/sessions/with-summary.jsonl', true);

    fireEvent.contextMenu(sessionButton('No summary'), { clientX: 24, clientY: 32 });
    fireEvent.click(await screen.findByText('session.rename'));
    const input = screen.getByDisplayValue('No summary');
    fireEvent.change(input, { target: { value: 'Renamed summaryless session' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameSessionMock).toHaveBeenCalledWith(
      '/tmp/agents/hana/sessions/no-summary.jsonl',
      'Renamed summaryless session',
    );

    fireEvent.contextMenu(sessionButton('Has summary'), { clientX: 24, clientY: 32 });
    fireEvent.click(await screen.findByText('session.archive'));
    expect(archiveSessionMock).toHaveBeenCalledWith('/tmp/agents/hana/sessions/with-summary.jsonl');
  });

  it('closes a sidebar browser badge without switching the session row', async () => {
    const browserStates = {
      '/tmp/agents/hana/sessions/with-summary.jsonl': {
        url: 'https://example.com',
        running: false,
        resumable: true,
        unavailableReason: null,
      },
    };
    let closed = false;
    hanaFetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/browser/session-states') return jsonResponse(closed ? {} : browserStates);
      if (url === '/api/browser/close-session') {
        closed = true;
        return jsonResponse({ ok: true, sessions: {} });
      }
      return jsonResponse({});
    });

    render(<SessionList />);

    const closeBadge = await screen.findByRole('button', { name: 'browser.close' });
    fireEvent.click(closeBadge);

    await waitFor(() => {
      expect(hanaFetchMock).toHaveBeenCalledWith('/api/browser/close-session', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionPath: '/tmp/agents/hana/sessions/with-summary.jsonl' }),
      }));
    });
    expect(switchSessionMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'browser.close' })).not.toBeInTheDocument();
    });
  });

  it('uses the session meta font size for the summary body', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../components/SessionList.module.css'),
      'utf-8',
    );

    expect(css).toMatch(/\.sessionSummaryBody\s*\{[\s\S]*font-size:\s*0\.66rem/);
    expect(css).not.toMatch(/\.sessionContextMenu/);
    expect(css).not.toMatch(/sessionItemSummaryEmpty/);
  });

  it('keeps row hover-only controls behind fine pointer media queries so mobile taps switch immediately', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../components/SessionList.module.css'),
      'utf-8',
    );

    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*\.sessionItem:hover\s*\{/);
    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*\.sessionItem:hover \.sessionArchiveBtn\s*\{/);
  });

  it('shows row action controls for the active or focused session without requiring hover', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../components/SessionList.module.css'),
      'utf-8',
    );

    expect(css).toMatch(/\.sessionItemActive \.sessionPinBtn,\s*\.sessionItemActive \.sessionRenameBtn,\s*\.sessionItemActive \.sessionArchiveBtn/);
    expect(css).toMatch(/\.sessionItem:focus-visible \.sessionPinBtn,\s*\.sessionItem:focus-visible \.sessionRenameBtn,\s*\.sessionItem:focus-visible \.sessionArchiveBtn/);
    expect(css).toMatch(/\.sessionItemActive(?::not\([^)]*\))? \.sessionItemMeta,\s*\.sessionItem:focus-visible \.sessionItemMeta/);
  });

  it('pauses the subagent countdown and keeps touching it while the current chat is focused', async () => {
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    try {
      useStore.setState({
        sessions: [
          {
            path: '/tmp/agents/hana/subagent-sessions/child.jsonl',
            title: '内部对话',
            firstMessage: '执行阶段一',
            modified: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
            messageCount: 2,
            agentId: 'agent-b',
            agentName: '小库',
            executorAgentId: 'agent-b',
            executorAgentName: '小库',
            requesterAgentId: 'hana',
            requesterAgentName: '小颜',
            cwd: '/tmp/project',
            pinnedAt: null,
            readOnly: true,
            kind: 'subagent',
            collaborationKind: 'subagent',
            taskTitle: '执行阶段一',
          },
        ],
        currentSessionPath: '/tmp/agents/hana/subagent-sessions/child.jsonl',
        pendingSessionSwitchPath: null,
        pendingNewSession: false,
        agents: [],
        streamingSessions: [],
        browserBySession: {},
        locale: 'zh',
      });

      render(<SessionList />);
      window.dispatchEvent(new Event('focus'));

      expect(await screen.findByTitle('正在查看，自动删除计时已暂停')).toBeTruthy();
      await waitFor(() => expect(hanaFetchMock).toHaveBeenCalledWith('/api/sessions/subagent/touch', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: '/tmp/agents/hana/subagent-sessions/child.jsonl' }),
      })));
      expect(loadSessionsMock).not.toHaveBeenCalled();
    } finally {
      hasFocusSpy.mockRestore();
    }
  });

  it('keeps running subagent sessions spinning instead of showing the completion countdown', async () => {
    useStore.setState({
      sessions: [
        {
          path: '/tmp/agents/hana/subagent-sessions/running-child.jsonl',
          title: '内部对话',
          firstMessage: '执行中的任务',
          modified: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
          messageCount: 1,
          agentId: 'agent-b',
          agentName: '小库',
          executorAgentId: 'agent-b',
          executorAgentName: '小库',
          requesterAgentId: 'hana',
          requesterAgentName: '小颜',
          cwd: '/tmp/project',
          pinnedAt: null,
          readOnly: true,
          kind: 'subagent',
          collaborationKind: 'subagent',
          taskTitle: '执行中的任务',
          subagentStatus: 'running',
          subagentStartedAt: new Date(Date.now() - 90_000).toISOString(),
        },
      ],
      currentSessionPath: null,
      pendingSessionSwitchPath: null,
      pendingNewSession: false,
      agents: [],
      streamingSessions: [],
      browserBySession: {},
      locale: 'zh',
    });

    render(<SessionList />);

    expect(screen.getByLabelText('执行中，等待任务完成')).toBeInTheDocument();
    expect(screen.getByTitle('小颜 → 小库')).toBeInTheDocument();
    expect(screen.getByText('执行中')).toBeInTheDocument();
    expect(screen.queryByTitle(/分钟后自动删除/)).not.toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(loadSessionsMock).not.toHaveBeenCalled();
  });

  it('treats subagent sessions with taskId but no terminal status as still running', () => {
    useStore.setState({
      sessions: [
        {
          path: '/tmp/agents/hana/subagent-sessions/unknown-child.jsonl',
          title: '内部对话',
          firstMessage: '仍在思考的任务',
          modified: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
          messageCount: 1,
          agentId: 'agent-b',
          agentName: '小库',
          executorAgentId: 'agent-b',
          executorAgentName: '小库',
          requesterAgentId: 'hana',
          requesterAgentName: '小颜',
          cwd: '/tmp/project',
          pinnedAt: null,
          readOnly: true,
          kind: 'subagent',
          collaborationKind: 'subagent',
          taskId: 'subagent-unknown',
          taskTitle: '仍在思考的任务',
        },
      ],
      currentSessionPath: null,
      pendingSessionSwitchPath: null,
      pendingNewSession: false,
      agents: [],
      streamingSessions: [],
      browserBySession: {},
      locale: 'zh',
    });

    render(<SessionList />);

    expect(screen.getByLabelText('执行中，等待任务完成')).toBeInTheDocument();
    expect(screen.queryByTitle(/分钟后自动删除/)).not.toBeInTheDocument();
  });

  it('keeps explicitly running subagent sessions spinning even after assistant output', () => {
    useStore.setState({
      sessions: [
        {
          path: '/tmp/agents/hana/subagent-sessions/running-with-output-child.jsonl',
          title: '内部对话',
          firstMessage: '仍在整理的任务',
          modified: new Date().toISOString(),
          messageCount: 2,
          agentId: 'agent-b',
          agentName: '小库',
          executorAgentId: 'agent-b',
          executorAgentName: '小库',
          requesterAgentId: 'hana',
          requesterAgentName: '小颜',
          cwd: '/tmp/project',
          pinnedAt: null,
          readOnly: true,
          kind: 'subagent',
          collaborationKind: 'subagent',
          taskId: 'subagent-running-with-output',
          taskTitle: '仍在整理的任务',
          subagentStatus: 'running',
        },
      ],
      currentSessionPath: null,
      pendingSessionSwitchPath: null,
      pendingNewSession: false,
      agents: [],
      streamingSessions: [],
      browserBySession: {},
      locale: 'zh',
    });

    render(<SessionList />);

    expect(screen.getByLabelText('执行中，等待任务完成')).toBeInTheDocument();
    expect(screen.queryByTitle(/分钟后自动删除/)).not.toBeInTheDocument();
  });

  it('shows parent session normal timestamp while a child subagent is running', () => {
    const parentModified = new Date(Date.now() - 9 * 60 * 1000).toISOString();
    useStore.setState({
      sessions: [
        {
          path: '/tmp/agents/hana/sessions/parent.jsonl',
          title: '你看一下，我数据库有什么',
          firstMessage: '你看一下，我数据库有什么',
          modified: parentModified,
          messageCount: 2,
          agentId: 'hana',
          agentName: '小颜',
          cwd: '/tmp/project',
          pinnedAt: null,
        },
        {
          path: '/tmp/agents/hana/subagent-sessions/running-child.jsonl',
          title: '内部对话',
          firstMessage: '再次巡检 KK 知识库',
          modified: new Date().toISOString(),
          messageCount: 1,
          agentId: 'agent-b',
          agentName: '小库',
          executorAgentId: 'agent-b',
          executorAgentName: '小库',
          requesterAgentId: 'hana',
          requesterAgentName: '小颜',
          parentSessionPath: '/tmp/agents/hana/sessions/parent.jsonl',
          cwd: '/tmp/project',
          pinnedAt: null,
          readOnly: true,
          kind: 'subagent',
          collaborationKind: 'subagent',
          taskTitle: '再次巡检 KK 知识库',
          subagentStatus: 'running',
          subagentStartedAt: new Date(Date.now() - 90_000).toISOString(),
        },
      ],
      currentSessionPath: null,
      pendingSessionSwitchPath: null,
      pendingNewSession: false,
      agents: [],
      streamingSessions: [],
      browserBySession: {},
      locale: 'zh',
    });

    render(<SessionList />);

    const parent = sessionButton('你看一下，我数据库有什么');
    expect(parent).not.toHaveTextContent('执行中');
    expect(parent).toHaveTextContent('小颜');
    expect(parent).toHaveTextContent('time.minutesAgo');
    expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('执行中');
  });

  it('switches a completed subagent from running to countdown/check state', () => {
    useStore.setState({
      sessions: [
        {
          path: '/tmp/agents/hana/subagent-sessions/done-child.jsonl',
          title: '内部对话',
          firstMessage: '已经完成的任务',
          modified: new Date().toISOString(),
          messageCount: 2,
          agentId: 'agent-b',
          agentName: '小库',
          executorAgentId: 'agent-b',
          executorAgentName: '小库',
          requesterAgentId: 'hana',
          requesterAgentName: '小颜',
          cwd: '/tmp/project',
          pinnedAt: null,
          readOnly: true,
          kind: 'subagent',
          collaborationKind: 'subagent',
          taskId: 'subagent-done',
          taskTitle: '已经完成的任务',
          subagentCompletedAt: new Date().toISOString(),
        },
      ],
      currentSessionPath: null,
      pendingSessionSwitchPath: null,
      pendingNewSession: false,
      agents: [],
      streamingSessions: [],
      browserBySession: {},
      locale: 'zh',
    });

    render(<SessionList />);

    expect(screen.queryByLabelText('执行中，等待任务完成')).not.toBeInTheDocument();
    expect(screen.getByTitle(/分钟后自动删除/)).toBeInTheDocument();
  });

  it('does not keep the old flashing dot beside running subagent avatars', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../components/SessionList.module.css'),
      'utf-8',
    );

    expect(css).not.toContain('sessionAgentPairRunning');
  });

  it('uses the same ring-to-check interaction for main agent sessions without auto-delete countdown', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-21T04:50:00.000Z'));
      const mainPath = '/tmp/agents/hana/sessions/main.jsonl';
      useStore.setState({
        sessions: [
          {
            path: mainPath,
            title: '再次巡检 KK 知识库',
            firstMessage: '再次巡检 KK 知识库',
            modified: new Date().toISOString(),
            messageCount: 2,
            agentId: 'hana',
            agentName: '小库',
            cwd: '/tmp/project',
            pinnedAt: null,
          },
        ],
        currentSessionPath: mainPath,
        pendingSessionSwitchPath: null,
        pendingNewSession: false,
        agents: [],
        streamingSessions: [mainPath],
        browserBySession: {},
        locale: 'zh',
      });

      render(<SessionList />);

      expect(screen.getByLabelText('执行中，等待任务完成')).toBeInTheDocument();
      expect(screen.queryByTitle(/分钟后自动删除/)).not.toBeInTheDocument();
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('执行中');
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('00:00');

      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('00:02');

      act(() => {
        useStore.setState({ streamingSessions: [] } as never);
      });

      expect(screen.getByLabelText('任务已完成，点击收起')).toBeInTheDocument();
      expect(screen.queryByTitle(/分钟后自动删除/)).not.toBeInTheDocument();
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('耗时');
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('00:02');

      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(screen.getByLabelText('任务已完成，点击收起')).toBeInTheDocument();
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('耗时');
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('00:02');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByLabelText('任务已完成，点击收起').className).toMatch(/sessionCountdownDismissing/);

      act(() => {
        vi.advanceTimersByTime(560);
      });
      expect(screen.queryByLabelText('任务已完成，点击收起')).not.toBeInTheDocument();
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('耗时');
      expect(sessionButton('再次巡检 KK 知识库')).toHaveTextContent('00:02');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the main agent duration when a new run starts', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-21T04:55:00.000Z'));
      const mainPath = '/tmp/agents/hana/sessions/main.jsonl';
      useStore.setState({
        sessions: [
          {
            path: mainPath,
            title: '持续优化主任务',
            firstMessage: '持续优化主任务',
            modified: new Date().toISOString(),
            messageCount: 2,
            agentId: 'hana',
            agentName: '小库',
            cwd: '/tmp/project',
            pinnedAt: null,
          },
        ],
        currentSessionPath: mainPath,
        pendingSessionSwitchPath: null,
        pendingNewSession: false,
        agents: [],
        streamingSessions: [mainPath],
        browserBySession: {},
        locale: 'zh',
      });

      render(<SessionList />);

      act(() => {
        vi.advanceTimersByTime(3200);
        useStore.setState({ streamingSessions: [] } as never);
      });
      expect(sessionButton('持续优化主任务')).toHaveTextContent('耗时');
      expect(sessionButton('持续优化主任务')).toHaveTextContent('00:03');

      act(() => {
        vi.advanceTimersByTime(5000);
        useStore.setState({ streamingSessions: [mainPath] } as never);
      });

      expect(sessionButton('持续优化主任务')).toHaveTextContent('执行中');
      expect(sessionButton('持续优化主任务')).toHaveTextContent('00:00');
      expect(sessionButton('持续优化主任务')).not.toHaveTextContent('耗时');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets users dismiss the main agent completion check before the 3 second auto-hide', async () => {
    vi.useFakeTimers();
    try {
      const mainPath = '/tmp/agents/hana/sessions/main.jsonl';
      useStore.setState({
        sessions: [
          {
            path: mainPath,
            title: '再次巡检 KK 知识库',
            firstMessage: '再次巡检 KK 知识库',
            modified: new Date().toISOString(),
            messageCount: 2,
            agentId: 'hana',
            agentName: '小库',
            cwd: '/tmp/project',
            pinnedAt: null,
          },
        ],
        currentSessionPath: mainPath,
        pendingSessionSwitchPath: null,
        pendingNewSession: false,
        agents: [],
        streamingSessions: [mainPath],
        browserBySession: {},
        locale: 'zh',
      });

      render(<SessionList />);

      act(() => {
        useStore.setState({ streamingSessions: [] } as never);
      });

      fireEvent.click(sessionButton('再次巡检 KK 知识库'));
      expect(screen.getByLabelText('任务已完成，点击收起').className).toMatch(/sessionCountdownDismissing/);

      act(() => {
        vi.advanceTimersByTime(560);
      });

      expect(screen.queryByLabelText('任务已完成，点击收起')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

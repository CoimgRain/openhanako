import { describe, expect, it } from 'vitest';
import type { Session } from '../../types';
import { buildSessionSections, type SessionSection } from '../../components/session-sections';

function makeSession(overrides: Partial<Session>): Session {
  return {
    path: '/sessions/default.jsonl',
    title: null,
    firstMessage: '',
    modified: '2026-04-29T01:00:00.000Z',
    messageCount: 1,
    agentId: 'hana',
    agentName: 'Hana',
    cwd: null,
    ...overrides,
  };
}

function itemPaths(section: SessionSection): string[] {
  return section.items.map(item => item.session.path);
}

describe('buildSessionSections', () => {
  it('places pinned sessions first and excludes them from date sections', () => {
    const sections = buildSessionSections([
      makeSession({
        path: '/sessions/today.jsonl',
        firstMessage: 'today',
        modified: '2026-04-29T07:00:00.000Z',
      }),
      makeSession({
        path: '/sessions/old-pin.jsonl',
        firstMessage: 'old pin',
        modified: '2026-04-20T07:00:00.000Z',
        pinnedAt: '2026-04-29T07:00:00.000Z',
      }),
      makeSession({
        path: '/sessions/new-pin.jsonl',
        firstMessage: 'new pin',
        modified: '2026-04-28T07:00:00.000Z',
        pinnedAt: '2026-04-29T08:00:00.000Z',
      }),
    ], {
      mode: 'time',
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    expect(sections.map(section => section.kind)).toEqual(['pinned', 'date']);
    expect(sections[0]).toMatchObject({
      kind: 'pinned',
      titleKey: 'sidebar.pinned',
    });
    expect(itemPaths(sections[0])).toEqual([
      '/sessions/new-pin.jsonl',
      '/sessions/old-pin.jsonl',
    ]);
    expect(sections[1]).toMatchObject({
      kind: 'date',
      titleKey: 'time.today',
    });
    expect(itemPaths(sections[1])).toEqual(['/sessions/today.jsonl']);
  });

  it('keeps the pinned section visible when no sessions are pinned and rolls yesterday into this week', () => {
    const sections = buildSessionSections([
      makeSession({
        path: '/sessions/yesterday.jsonl',
        modified: '2026-04-28T07:00:00.000Z',
      }),
    ], {
      mode: 'time',
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      kind: 'pinned',
      titleKey: 'sidebar.pinned',
      items: [],
    });
    expect(sections[1]).toMatchObject({
      kind: 'date',
      titleKey: 'time.thisWeek',
    });
  });

  it('sorts sessions within a date group by modified descending', () => {
    const sections = buildSessionSections([
      makeSession({
        path: '/sessions/older.jsonl',
        firstMessage: 'older',
        modified: '2026-04-29T02:00:00.000Z',
      }),
      makeSession({
        path: '/sessions/newer.jsonl',
        firstMessage: 'newer',
        modified: '2026-04-29T09:00:00.000Z',
      }),
      makeSession({
        path: '/sessions/middle.jsonl',
        firstMessage: 'middle',
        modified: '2026-04-29T05:00:00.000Z',
      }),
    ], {
      mode: 'time',
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    const todaySection = sections.find(s => s.kind === 'date' && s.group === 'today');
    expect(todaySection).toBeDefined();
    expect(itemPaths(todaySection!)).toEqual([
      '/sessions/newer.jsonl',
      '/sessions/middle.jsonl',
      '/sessions/older.jsonl',
    ]);
  });

  it('uses a deterministic path tie-breaker and sinks malformed dates', () => {
    const sections = buildSessionSections([
      makeSession({
        path: '/sessions/z-same-time.jsonl',
        modified: '2026-04-29T09:00:00.000Z',
      }),
      makeSession({
        path: '/sessions/bad-date.jsonl',
        modified: 'not-a-date',
      }),
      makeSession({
        path: '/sessions/a-same-time.jsonl',
        modified: '2026-04-29T09:00:00.000Z',
      }),
    ], {
      mode: 'time',
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    const todaySection = sections.find(s => s.kind === 'date' && s.group === 'today');
    const earlierSection = sections.find(s => s.kind === 'date' && s.group === 'earlier');
    expect(itemPaths(todaySection!)).toEqual([
      '/sessions/a-same-time.jsonl',
      '/sessions/z-same-time.jsonl',
    ]);
    expect(itemPaths(earlierSection!)).toEqual(['/sessions/bad-date.jsonl']);
  });

  it('nests subagent projections under their parent session and sorts children by created time instead of modified time', () => {
    const sections = buildSessionSections([
      makeSession({
        path: '/agents/hana/sessions/parent.jsonl',
        firstMessage: 'parent',
        modified: '2026-04-29T03:00:00.000Z',
      }),
      makeSession({
        path: '/agents/hana/subagent-sessions/old-child.jsonl',
        firstMessage: 'old child',
        modified: '2026-04-29T10:00:00.000Z',
        kind: 'subagent',
        collaborationKind: 'subagent',
        readOnly: true,
        parentSessionPath: '/agents/hana/sessions/parent.jsonl',
        subagentStartedAt: '2026-04-29T08:00:00.000Z',
      }),
      makeSession({
        path: '/agents/hana/subagent-sessions/new-child.jsonl',
        firstMessage: 'new child',
        modified: '2026-04-29T09:00:00.000Z',
        kind: 'subagent',
        collaborationKind: 'subagent',
        readOnly: true,
        parentSessionPath: '/agents/hana/sessions/parent.jsonl',
        subagentStartedAt: '2026-04-29T08:30:00.000Z',
      }),
      makeSession({
        path: '/agents/hana/sessions/other.jsonl',
        firstMessage: 'other',
        modified: '2026-04-29T07:00:00.000Z',
      }),
    ], {
      mode: 'time',
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    const todaySection = sections.find(s => s.kind === 'date' && s.group === 'today');
    expect(itemPaths(todaySection!)).toEqual([
      '/agents/hana/sessions/other.jsonl',
      '/agents/hana/sessions/parent.jsonl',
    ]);
    const parent = todaySection!.items.find(item => item.session.path === '/agents/hana/sessions/parent.jsonl');
    expect(parent!.children.map(child => child.path)).toEqual([
      '/agents/hana/subagent-sessions/new-child.jsonl',
      '/agents/hana/subagent-sessions/old-child.jsonl',
    ]);
  });

  it('keeps orphan subagent projections visible as top-level fallback rows', () => {
    const sections = buildSessionSections([
      makeSession({
        path: '/agents/hana/subagent-sessions/orphan.jsonl',
        modified: '2026-04-29T09:00:00.000Z',
        kind: 'subagent',
        collaborationKind: 'subagent',
        readOnly: true,
        parentSessionPath: '/agents/hana/sessions/missing.jsonl',
      }),
    ], {
      mode: 'time',
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    const todaySection = sections.find(s => s.kind === 'date' && s.group === 'today');
    expect(itemPaths(todaySection!)).toEqual(['/agents/hana/subagent-sessions/orphan.jsonl']);
    expect(todaySection!.items[0].children).toEqual([]);
  });
});

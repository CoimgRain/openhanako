import type { Session } from '../types';

export type SessionViewMode = 'time';
export type DateGroup = 'today' | 'thisWeek' | 'earlier';

export interface SessionTreeItem {
  session: Session;
  children: Session[];
}

export type SessionSection =
  | {
      id: 'pinned';
      kind: 'pinned';
      titleKey: 'sidebar.pinned';
      items: SessionTreeItem[];
    }
  | {
      id: `date:${DateGroup}`;
      kind: 'date';
      titleKey: `time.${DateGroup}`;
      group: DateGroup;
      items: SessionTreeItem[];
    };

interface BuildSessionSectionsOptions {
  mode?: SessionViewMode;
  now?: Date;
}

const DATE_GROUP_ORDER: DateGroup[] = ['today', 'thisWeek', 'earlier'];

function getSessionDateGroup(isoStr: string | null, now: Date): DateGroup {
  if (!isoStr) return 'earlier';
  const date = new Date(isoStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  if (date >= today) return 'today';
  if (date >= weekAgo) return 'thisWeek';
  return 'earlier';
}

function isPinnedSession(session: Session): boolean {
  return typeof session.pinnedAt === 'string' && session.pinnedAt.length > 0;
}

function pinnedTime(session: Session): number {
  return timestamp(session.pinnedAt);
}

function modifiedTime(session: Session): number {
  return timestamp(session.modified);
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function compareByPath(a: Session, b: Session): number {
  return String(a.path || '').localeCompare(String(b.path || ''));
}

function isSubagentSession(session: Session): boolean {
  return (session.kind === 'subagent' || session.collaborationKind === 'subagent') && session.readOnly === true;
}

function compareByModifiedDesc(a: Session, b: Session): number {
  return modifiedTime(b) - modifiedTime(a) || compareByPath(a, b);
}

function subagentCreatedTime(session: Session): number {
  const explicit = timestamp(session.subagentStartedAt);
  if (explicit > 0) return explicit;
  const taskId = typeof session.taskId === 'string' ? session.taskId : '';
  const match = /^subagent-(\d+)-/.exec(taskId);
  if (match) {
    const fromTaskId = Number(match[1]);
    if (Number.isFinite(fromTaskId) && fromTaskId > 0) return fromTaskId;
  }
  return modifiedTime(session);
}

function compareSubagentChildrenByCreatedDesc(a: Session, b: Session): number {
  return subagentCreatedTime(b) - subagentCreatedTime(a) || compareByPath(a, b);
}

function attachChildSessions(sessions: Session[]): SessionTreeItem[] {
  const sessionPaths = new Set(sessions.map(session => session.path).filter(Boolean));
  const childrenByParent = new Map<string, Session[]>();
  const topLevel: Session[] = [];

  for (const session of sessions) {
    const parentPath = session.parentSessionPath || null;
    if (isSubagentSession(session) && parentPath && sessionPaths.has(parentPath)) {
      const children = childrenByParent.get(parentPath) || [];
      children.push(session);
      childrenByParent.set(parentPath, children);
    } else {
      topLevel.push(session);
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareSubagentChildrenByCreatedDesc);
  }

  return topLevel.map(session => ({
    session,
    children: childrenByParent.get(session.path) || [],
  }));
}

export function buildSessionSections(
  sessions: Session[],
  options: BuildSessionSectionsOptions = {},
): SessionSection[] {
  const mode = options.mode ?? 'time';
  if (mode !== 'time') {
    const exhaustive: never = mode;
    throw new Error(`Unsupported session view mode: ${exhaustive}`);
  }

  const treeItems = attachChildSessions(sessions);
  const pinned = treeItems
    .filter(item => isPinnedSession(item.session))
    .sort((a, b) => pinnedTime(b.session) - pinnedTime(a.session) || compareByPath(a.session, b.session));
  const regular = treeItems.filter(item => !isPinnedSession(item.session));

  const sections: SessionSection[] = [];
  sections.push({
    id: 'pinned',
    kind: 'pinned',
    titleKey: 'sidebar.pinned',
    items: pinned,
  });

  const now = options.now ?? new Date();
  const dateGroups: Record<DateGroup, SessionTreeItem[]> = {
    today: [],
    thisWeek: [],
    earlier: [],
  };
  for (const item of regular) {
    dateGroups[getSessionDateGroup(item.session.modified, now)].push(item);
  }

  // Sort within each group: newest modified first
  for (const group of DATE_GROUP_ORDER) {
    dateGroups[group].sort((a, b) => compareByModifiedDesc(a.session, b.session));
  }

  for (const group of DATE_GROUP_ORDER) {
    const items = dateGroups[group];
    if (items.length === 0) continue;
    sections.push({
      id: `date:${group}`,
      kind: 'date',
      titleKey: `time.${group}`,
      group,
      items,
    });
  }

  return sections;
}

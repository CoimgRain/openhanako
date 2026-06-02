import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const SUBAGENT_EXECUTOR_META_VERSION = 1;
export const SUBAGENT_SESSION_META_VERSION = 1;
export const SUBAGENT_SESSION_META_FILE = "session-meta.json";
export const UNKNOWN_EXECUTOR_NAME = "Unknown agent";

const metaWriteQueues = new Map();

export function normalizeExecutorMetadata(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const executorAgentId = source.executorAgentId || source.agentId || null;
  const executorAgentNameSnapshot =
    source.executorAgentNameSnapshot
    || source.executorAgentName
    || source.agentNameSnapshot
    || source.agentName
    || null;

  if (!executorAgentId && !executorAgentNameSnapshot) return null;

  return {
    executorAgentId,
    executorAgentNameSnapshot,
    executorMetaVersion: SUBAGENT_EXECUTOR_META_VERSION,
  };
}

function nullableString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeSubagentSessionMetadata(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const executor = normalizeExecutorMetadata(source);
  if (!executor) return null;

  const requesterAgentId = nullableString(source.requesterAgentId) || nullableString(source.parentAgentId);
  const requesterAgentNameSnapshot =
    nullableString(source.requesterAgentNameSnapshot)
    || nullableString(source.requesterAgentName)
    || nullableString(source.parentAgentNameSnapshot)
    || nullableString(source.parentAgentName);

  return {
    ...executor,
    subagentSessionMetaVersion: SUBAGENT_SESSION_META_VERSION,
    ...(requesterAgentId ? { requesterAgentId, parentAgentId: requesterAgentId } : {}),
    ...(requesterAgentNameSnapshot ? { requesterAgentNameSnapshot, parentAgentNameSnapshot: requesterAgentNameSnapshot } : {}),
    ...(nullableString(source.requestedAgentId) ? { requestedAgentId: nullableString(source.requestedAgentId) } : {}),
    ...(nullableString(source.requestedAgentNameSnapshot) ? { requestedAgentNameSnapshot: nullableString(source.requestedAgentNameSnapshot) } : {}),
    ...(nullableString(source.taskId) ? { taskId: nullableString(source.taskId) } : {}),
    ...(nullableString(source.taskTitle) ? { taskTitle: nullableString(source.taskTitle) } : {}),
    ...(nullableString(source.taskSummary) ? { taskSummary: nullableString(source.taskSummary) } : {}),
    ...(nullableString(source.parentSessionPath) ? { parentSessionPath: nullableString(source.parentSessionPath) } : {}),
    ...(nullableString(source.archivedAt) ? { archivedAt: nullableString(source.archivedAt) } : {}),
  };
}

export function mergeExecutorMetadata(target, raw, { includeLegacy = true } = {}) {
  const meta = normalizeExecutorMetadata(raw);
  if (!target || !meta) return target;

  target.executorAgentId = meta.executorAgentId;
  target.executorAgentNameSnapshot = meta.executorAgentNameSnapshot;
  target.executorMetaVersion = meta.executorMetaVersion;

  if (includeLegacy) {
    if (meta.executorAgentId) target.agentId = meta.executorAgentId;
    if (meta.executorAgentNameSnapshot) target.agentName = meta.executorAgentNameSnapshot;
  }

  return target;
}

export function materializeExecutorIdentity(raw, getAgent, unknownName = UNKNOWN_EXECUTOR_NAME) {
  const meta = normalizeExecutorMetadata(raw);
  if (!meta) return null;

  const liveAgent = meta.executorAgentId ? getAgent?.(meta.executorAgentId) || null : null;
  return {
    agentId: meta.executorAgentId,
    agentName: meta.executorAgentNameSnapshot || liveAgent?.agentName || unknownName,
  };
}

export function getSubagentSessionMetaPath(sessionPath) {
  if (!sessionPath) return null;
  return path.join(path.dirname(sessionPath), SUBAGENT_SESSION_META_FILE);
}

export function readSubagentSessionMetaSync(sessionPath) {
  const metaPath = getSubagentSessionMetaPath(sessionPath);
  if (!metaPath) return null;

  try {
    if (!fs.existsSync(metaPath)) return null;
    const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    return normalizeSubagentSessionMetadata(raw[path.basename(sessionPath)] || {});
  } catch {
    return null;
  }
}

export function writeSubagentSessionMeta(sessionPath, raw) {
  const meta = normalizeSubagentSessionMetadata(raw);
  const metaPath = getSubagentSessionMetaPath(sessionPath);
  if (!meta || !metaPath) return Promise.resolve();

  const sessKey = path.basename(sessionPath);
  const next = async () => {
    let fileData = {};
    try {
      fileData = JSON.parse(await fsp.readFile(metaPath, "utf-8"));
    } catch {
      fileData = {};
    }

    fileData[sessKey] = {
      ...fileData[sessKey],
      ...meta,
    };

    await fsp.mkdir(path.dirname(metaPath), { recursive: true });
    await fsp.writeFile(metaPath, JSON.stringify(fileData, null, 2) + "\n", "utf-8");
  };

  const prev = metaWriteQueues.get(metaPath) || Promise.resolve();
  const queued = prev.then(next, next);
  metaWriteQueues.set(metaPath, queued);
  return queued.finally(() => {
    if (metaWriteQueues.get(metaPath) === queued) {
      metaWriteQueues.delete(metaPath);
    }
  });
}

export async function archiveSubagentSessionMeta(sessionPath, archivedAt = new Date().toISOString()) {
  const metaPath = getSubagentSessionMetaPath(sessionPath);
  if (!metaPath) return archivedAt;
  const sessKey = path.basename(sessionPath);
  const next = async () => {
    let fileData = {};
    try {
      fileData = JSON.parse(await fsp.readFile(metaPath, "utf-8"));
    } catch {
      fileData = {};
    }

    fileData[sessKey] = {
      ...(fileData[sessKey] || {}),
      archivedAt,
    };

    await fsp.mkdir(path.dirname(metaPath), { recursive: true });
    await fsp.writeFile(metaPath, JSON.stringify(fileData, null, 2) + "\n", "utf-8");
  };

  const prev = metaWriteQueues.get(metaPath) || Promise.resolve();
  const queued = prev.then(next, next);
  metaWriteQueues.set(metaPath, queued);
  await queued.finally(() => {
    if (metaWriteQueues.get(metaPath) === queued) {
      metaWriteQueues.delete(metaPath);
    }
  });
  return archivedAt;
}

export async function deleteSubagentSessionMeta(sessionPath) {
  const metaPath = getSubagentSessionMetaPath(sessionPath);
  if (!metaPath) return;
  const sessKey = path.basename(sessionPath);
  const next = async () => {
    let fileData = {};
    try {
      fileData = JSON.parse(await fsp.readFile(metaPath, "utf-8"));
    } catch {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(fileData, sessKey)) return;
    delete fileData[sessKey];
    await fsp.writeFile(metaPath, JSON.stringify(fileData, null, 2) + "\n", "utf-8");
  };

  const prev = metaWriteQueues.get(metaPath) || Promise.resolve();
  const queued = prev.then(next, next);
  metaWriteQueues.set(metaPath, queued);
  return queued.finally(() => {
    if (metaWriteQueues.get(metaPath) === queued) {
      metaWriteQueues.delete(metaPath);
    }
  });
}

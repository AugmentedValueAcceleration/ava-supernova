import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock filesystem for HistoryStorage tests ────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  mkdir: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
}));

import { readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { HistoryStorage, type ConversationRecord } from '../src/history/storage.js';
import { HistoryManager } from '../src/history/history-manager.js';
import { Conversation } from '../src/agent/conversation.js';

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;
const mockRename = rename as unknown as ReturnType<typeof vi.fn>;
const mockReaddir = readdir as unknown as ReturnType<typeof vi.fn>;
const mockUnlink = unlink as unknown as ReturnType<typeof vi.fn>;

function makeRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: 'test-id',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    title: 'Test Conversation',
    messages: [
      { role: 'system', content: 'You are an assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

// ── HistoryStorage ───────────────────────────────────────────────────────────

describe('HistoryStorage', () => {
  const storage = new HistoryStorage();

  it('save writes JSON atomically (temp file + rename)', async () => {
    const record = makeRecord();
    await storage.save(record);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.test-id.tmp'),
      expect.any(String),
      'utf-8',
    );
    expect(mockRename).toHaveBeenCalledWith(
      expect.stringContaining('.test-id.tmp'),
      expect.stringContaining('test-id.json'),
    );
  });

  it('load returns parsed record for existing file', async () => {
    const record = makeRecord();
    mockReadFile.mockResolvedValue(JSON.stringify(record));
    const loaded = await storage.load('test-id');
    expect(loaded).toEqual(record);
  });

  it('load returns null for missing file', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const loaded = await storage.load('missing');
    expect(loaded).toBeNull();
  });

  it('load returns null for corrupt JSON', async () => {
    mockReadFile.mockResolvedValue('{broken json');
    const loaded = await storage.load('corrupt');
    expect(loaded).toBeNull();
  });

  it('list returns sorted summaries (newest first)', async () => {
    mockReaddir.mockResolvedValue(['a.json', 'b.json']);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(makeRecord({
        id: 'a', title: 'Older', updatedAt: '2024-01-01T00:00:00.000Z',
      })))
      .mockResolvedValueOnce(JSON.stringify(makeRecord({
        id: 'b', title: 'Newer', updatedAt: '2024-01-02T00:00:00.000Z',
      })));

    const list = await storage.list();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('Newer');
    expect(list[1].title).toBe('Older');
  });

  it('list skips non-JSON files and corrupt files', async () => {
    mockReaddir.mockResolvedValue(['good.json', 'notes.txt', 'bad.json']);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'good' })))
      .mockResolvedValueOnce('{corrupt}');

    const list = await storage.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('good');
  });

  it('delete removes file and returns true', async () => {
    const result = await storage.delete('test-id');
    expect(result).toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('test-id.json'));
  });

  it('delete returns false for missing file', async () => {
    mockUnlink.mockRejectedValue(new Error('ENOENT'));
    const result = await storage.delete('missing');
    expect(result).toBe(false);
  });

  it('prune deletes oldest unpinned conversations beyond max', async () => {
    mockReaddir.mockResolvedValue(['a.json', 'b.json', 'c.json']);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'a', updatedAt: '2024-01-03T00:00:00Z' })))
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'b', updatedAt: '2024-01-02T00:00:00Z' })))
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'c', updatedAt: '2024-01-01T00:00:00Z' })));

    const deleted = await storage.prune(2);
    expect(deleted).toBe(1);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('c.json'));
  });

  it('prune never deletes pinned conversations', async () => {
    mockReaddir.mockResolvedValue(['a.json', 'b.json']);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'a', updatedAt: '2024-01-02T00:00:00Z', pinned: true })))
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'b', updatedAt: '2024-01-01T00:00:00Z', pinned: true })));

    const deleted = await storage.prune(1);
    expect(deleted).toBe(0);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('prune returns 0 when under max', async () => {
    mockReaddir.mockResolvedValue(['a.json']);
    mockReadFile.mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'a' })));

    const deleted = await storage.prune(10);
    expect(deleted).toBe(0);
  });
});

// ── HistoryManager ───────────────────────────────────────────────────────────

describe('HistoryManager', () => {
  it('saveConversation skips conversations with only system prompt', async () => {
    const manager = new HistoryManager();
    const conv = new Conversation('test-id');
    conv.setSystemPrompt('System prompt');
    await manager.saveConversation(conv);
    // Should not write anything — only 1 message (system prompt)
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('saveConversation derives title from first user message', async () => {
    mockReadFile.mockResolvedValue(null as any); // no existing record
    mockReadFile.mockRejectedValue(new Error('ENOENT')); // load returns null

    const manager = new HistoryManager();
    const conv = new Conversation('test-id');
    conv.setMessages([
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Help me fix the login bug' },
      { role: 'assistant', content: 'Sure, let me look at that.' },
    ]);

    await manager.saveConversation(conv);
    expect(mockWriteFile).toHaveBeenCalled();
    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(writtenData.title).toBe('Help me fix the login bug');
  });

  it('renameConversation updates title', async () => {
    const record = makeRecord();
    mockReadFile.mockResolvedValue(JSON.stringify(record));

    const manager = new HistoryManager();
    const result = await manager.renameConversation('test-id', 'New Title');
    expect(result).toBe(true);
    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(writtenData.title).toBe('New Title');
  });

  it('renameConversation returns false for nonexistent', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const manager = new HistoryManager();
    const result = await manager.renameConversation('missing', 'Title');
    expect(result).toBe(false);
  });

  it('pinConversation sets pinned flag', async () => {
    const record = makeRecord();
    mockReadFile.mockResolvedValue(JSON.stringify(record));

    const manager = new HistoryManager();
    const result = await manager.pinConversation('test-id', true);
    expect(result).toBe(true);
    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(writtenData.pinned).toBe(true);
  });

  it('exportConversation returns JSON format', async () => {
    const record = makeRecord();
    mockReadFile.mockResolvedValue(JSON.stringify(record));

    const manager = new HistoryManager();
    const exported = await manager.exportConversation('test-id', 'json');
    expect(exported).toBeTruthy();
    const parsed = JSON.parse(exported!);
    expect(parsed.id).toBe('test-id');
    expect(parsed.title).toBe('Test Conversation');
  });

  it('exportConversation returns markdown, skipping system/tool messages', async () => {
    const record = makeRecord({
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
        { role: 'tool', content: 'tool output', tool_call_id: 'tc1' },
      ],
    });
    mockReadFile.mockResolvedValue(JSON.stringify(record));

    const manager = new HistoryManager();
    const exported = await manager.exportConversation('test-id', 'markdown');
    expect(exported).toContain('## User');
    expect(exported).toContain('Question');
    expect(exported).toContain('## Ava');
    expect(exported).toContain('Answer');
    expect(exported).not.toContain('System');
    expect(exported).not.toContain('tool output');
  });

  it('exportConversation returns null for nonexistent', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const manager = new HistoryManager();
    const result = await manager.exportConversation('missing', 'json');
    expect(result).toBeNull();
  });

  it('deleteConversation delegates to storage.delete', async () => {
    const manager = new HistoryManager();
    const result = await manager.deleteConversation('test-id');
    expect(result).toBe(true);
    expect(mockUnlink).toHaveBeenCalled();
  });

  it('listConversations filters by projectPath', async () => {
    mockReaddir.mockResolvedValue(['a.json', 'b.json']);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'a', projectPath: '/project-a' })))
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'b', projectPath: '/project-b' })));

    const manager = new HistoryManager('/project-a');
    const list = await manager.listConversations(true);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('a');
  });

  it('listConversations returns all when filterByProject is false', async () => {
    mockReaddir.mockResolvedValue(['a.json', 'b.json']);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'a', projectPath: '/project-a' })))
      .mockResolvedValueOnce(JSON.stringify(makeRecord({ id: 'b', projectPath: '/project-b' })));

    const manager = new HistoryManager('/project-a');
    const list = await manager.listConversations(false);
    expect(list).toHaveLength(2);
  });
});

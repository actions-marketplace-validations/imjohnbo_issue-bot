'use strict';

jest.mock('@actions/github');

const issueBot = require('../lib/issue-bot');
const core = require('@actions/core');
const { getOctokit, mockOctokit } = require('@actions/github');

core.info = jest.fn();
core.debug = jest.fn();
core.setFailed = jest.fn();
core.setOutput = jest.fn();

const DEFAULT_ISSUE = { number: 42, id: 100, node_id: 'NEW_NODE_ID' };
const PREVIOUS_ISSUE = { number: 10, node_id: 'PREV_NODE_ID', assignees: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockOctokit.rest.issues.create.mockResolvedValue({ data: DEFAULT_ISSUE });
  mockOctokit.rest.issues.update.mockResolvedValue({ data: DEFAULT_ISSUE });
  mockOctokit.rest.issues.createComment.mockResolvedValue({});
  mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: [] });
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('needPreviousIssue', () => {
  test('returns true when any condition is true', () => {
    expect(issueBot.needPreviousIssue(true, false, false, false)).toBe(true);
    expect(issueBot.needPreviousIssue(false, true, false, false)).toBe(true);
    expect(issueBot.needPreviousIssue(false, false, true, false)).toBe(true);
    expect(issueBot.needPreviousIssue(false, false, false, true)).toBe(true);
  });

  test('returns false when all conditions are false', () => {
    expect(issueBot.needPreviousIssue(false, false, false, false)).toBe(false);
  });

  test('returns false with no arguments', () => {
    expect(issueBot.needPreviousIssue()).toBe(false);
  });
});

describe('issueExists', () => {
  test('returns true for issue number 0', () => {
    expect(issueBot.issueExists(0)).toBe(true);
  });

  test('returns true for positive issue numbers', () => {
    expect(issueBot.issueExists(1)).toBe(true);
    expect(issueBot.issueExists(999)).toBe(true);
  });

  test('returns false for -1 (sentinel: no previous issue)', () => {
    expect(issueBot.issueExists(-1)).toBe(false);
  });

  test('returns false for any negative number', () => {
    expect(issueBot.issueExists(-100)).toBe(false);
  });
});

// ─── checkInputs ─────────────────────────────────────────────────────────────

describe('checkInputs', () => {
  test('passes with only title', () => {
    expect(issueBot.checkInputs({ title: 'Title' })).toBe(true);
  });

  test('fails with empty title', () => {
    expect(issueBot.checkInputs({ title: '' })).toBe(false);
  });

  test('passes with valid projectType "user"', () => {
    expect(issueBot.checkInputs({ title: 'T', projectType: 'user' })).toBe(true);
  });

  test('passes with valid projectType "organization"', () => {
    expect(issueBot.checkInputs({ title: 'T', projectType: 'organization' })).toBe(true);
  });

  test('passes with valid projectType "repository"', () => {
    expect(issueBot.checkInputs({ title: 'T', projectType: 'repository' })).toBe(true);
  });

  test('fails with unrecognised projectType', () => {
    expect(issueBot.checkInputs({ title: 'T', projectType: 'nonsense' })).toBe(false);
  });

  test('passes when pinned and labels provided', () => {
    expect(issueBot.checkInputs({ title: 'T', pinned: true, labels: 'label1' })).toBe(true);
  });

  test('fails when pinned but no labels', () => {
    expect(issueBot.checkInputs({ title: 'T', pinned: true })).toBe(false);
  });

  test('passes when closePrevious and labels provided', () => {
    expect(issueBot.checkInputs({ title: 'T', closePrevious: true, labels: 'label1' })).toBe(true);
  });

  test('fails when closePrevious but no labels', () => {
    expect(issueBot.checkInputs({ title: 'T', closePrevious: true })).toBe(false);
  });

  test('passes when linkedComments and labels provided', () => {
    expect(issueBot.checkInputs({ title: 'T', linkedComments: true, labels: 'label1' })).toBe(true);
  });

  test('fails when linkedComments but no labels', () => {
    expect(issueBot.checkInputs({ title: 'T', linkedComments: true })).toBe(false);
  });

  test('passes when rotateAssignees with labels and assignees', () => {
    expect(issueBot.checkInputs({
      title: 'T', rotateAssignees: true, assignees: 'p1, p2', labels: 'l1'
    })).toBe(true);
  });

  test('fails when rotateAssignees but no labels', () => {
    expect(issueBot.checkInputs({
      title: 'T', rotateAssignees: true, assignees: 'p1'
    })).toBe(false);
  });

  test('fails when rotateAssignees but no assignees', () => {
    expect(issueBot.checkInputs({
      title: 'T', rotateAssignees: true, labels: 'l1'
    })).toBe(false);
  });
});

// ─── getNextAssignee ──────────────────────────────────────────────────────────

describe('getNextAssignee', () => {
  test('wraps around a single-element list', () => {
    expect(issueBot.getNextAssignee(['person1'], 'person1')).toEqual(['person1']);
  });

  test('advances to the next assignee', () => {
    expect(issueBot.getNextAssignee(['person1', 'person2'], 'person1')).toEqual(['person2']);
  });

  test('wraps around from the last assignee', () => {
    expect(issueBot.getNextAssignee(['p1', 'p2', 'p3'], 'p3')).toEqual(['p1']);
  });

  test('defaults to first assignee when previous is not in the list', () => {
    expect(issueBot.getNextAssignee(['p1', 'p2'], 'unknown')).toEqual(['p1']);
  });
});

// ─── run ─────────────────────────────────────────────────────────────────────

describe('run', () => {
  test('creates an issue with minimal inputs', async () => {
    await issueBot.run({ token: 'tok', title: 'Hello', body: '' });

    expect(getOctokit).toHaveBeenCalledWith('tok');
    expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hello', owner: 'owner', repo: 'repo' })
    );
    expect(core.setOutput).toHaveBeenCalledWith('issue-number', '42');
  });

  test('does not look up a previous issue when no flags require it', async () => {
    await issueBot.run({ token: 'tok', title: 'Hello', body: '' });

    expect(mockOctokit.rest.issues.listForRepo).not.toHaveBeenCalled();
  });

  test('closes previous issue when closePrevious is true', async () => {
    mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: [PREVIOUS_ISSUE] });

    await issueBot.run({
      token: 'tok', title: 'Hello', body: '',
      labels: ['standup'], closePrevious: true
    });

    expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 10, state: 'closed' })
    );
  });

  test('skips closing when there is no previous issue', async () => {
    await issueBot.run({
      token: 'tok', title: 'Hello', body: '',
      labels: ['standup'], closePrevious: true
    });

    expect(mockOctokit.rest.issues.update).not.toHaveBeenCalled();
  });

  test('creates linked comments on both issues when linkedComments is true', async () => {
    mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: [PREVIOUS_ISSUE] });

    await issueBot.run({
      token: 'tok', title: 'Hello', body: '',
      labels: ['standup'],
      linkedComments: true,
      linkedCommentsNewIssueText: 'Previous: #{{ previousIssueNumber }}',
      linkedCommentsPreviousIssueText: 'Next: #{{ newIssueNumber }}'
    });

    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(2);
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 42, body: 'Previous: #10' })
    );
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 10, body: 'Next: #42' })
    );
  });

  test('adds issue to milestone when milestone input is provided', async () => {
    await issueBot.run({
      token: 'tok', title: 'Hello', body: '', milestone: '3'
    });

    expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 42, milestone: '3' })
    );
  });

  test('rotates assignees based on previous issue assignee', async () => {
    mockOctokit.rest.issues.listForRepo.mockResolvedValue({
      data: [{ ...PREVIOUS_ISSUE, assignees: [{ login: 'alice' }] }]
    });

    await issueBot.run({
      token: 'tok', title: 'Hello', body: '',
      labels: ['standup'],
      assignees: ['alice', 'bob'],
      rotateAssignees: true
    });

    expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ['bob'] })
    );
  });

  test('calls setFailed on error', async () => {
    mockOctokit.rest.issues.create.mockRejectedValue(new Error('API failure'));

    await issueBot.run({ token: 'tok', title: 'Hello', body: '' });

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('API failure')
    );
  });
});

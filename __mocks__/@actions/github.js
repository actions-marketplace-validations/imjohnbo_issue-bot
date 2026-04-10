/* eslint-env jest */
'use strict';

const mockOctokit = {
  rest: {
    issues: {
      create: jest.fn(),
      update: jest.fn(),
      createComment: jest.fn(),
      listForRepo: jest.fn()
    },
    projects: {
      listForRepo: jest.fn(),
      listForUser: jest.fn(),
      listForOrg: jest.fn(),
      listColumns: jest.fn(),
      createCard: jest.fn()
    }
  },
  graphql: jest.fn(),
  paginate: {
    iterator: jest.fn()
  }
};

module.exports = {
  context: {
    repo: { owner: 'owner', repo: 'repo' }
  },
  getOctokit: jest.fn().mockReturnValue(mockOctokit),
  mockOctokit
};

import { jest } from '@jest/globals';

export const mockQuery = jest.fn();

export const query = mockQuery;

export function getDb() {
  return {};
}

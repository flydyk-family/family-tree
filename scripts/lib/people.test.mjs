import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPeople } from './people.mjs';

const people = [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }];

test('null selection returns all people unchanged', () => {
  assert.deepEqual(selectPeople(people, null), people);
});

test('selects the requested ids in the requested order', () => {
  assert.deepEqual(selectPeople(people, ['p-3', 'p-1']), [{ id: 'p-3' }, { id: 'p-1' }]);
});

test('throws on unknown id, naming the offender', () => {
  assert.throws(() => selectPeople(people, ['p-1', 'p-9']), /Unknown person id\(s\): p-9/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDateInput, matchesDateAnswer} from '../core.mjs';
const dates = ['2025-11-13','2025-11-14'];

test('A date can be typed digit by digit without entering separators', () => {
  let value = '';
  for (const digit of '13112025') value = formatDateInput(value + digit).value;
  assert.equal(value, '13.11.2025');
  assert.equal(matchesDateAnswer(value, dates), true);
  assert.deepEqual(formatDateInput('1311'), {value:'13.11',caret:5});
});

test('Pasted compact, dotted and ISO dates keep the intended day and year', () => {
  for (const answer of ['14112025','14.11.2025','2025-11-14']) {
    assert.equal(formatDateInput(answer).value, '14.11.2025', answer);
    assert.equal(matchesDateAnswer(formatDateInput(answer).value, dates), true, answer);
  }
  assert.equal(formatDateInput('1/2/2025').value, '01.02.2025');
  assert.equal(formatDateInput('13 ноября 2025').value, '13 ноября 2025');
});

test('Compact dates also validate directly, including a short or omitted year', () => {
  for (const answer of ['13112025','14112025','131125','1411']) {
    assert.equal(matchesDateAnswer(answer, dates), true, answer);
  }
  assert.equal(matchesDateAnswer('13112026', dates), false);
  assert.equal(matchesDateAnswer('12112025', dates), false);
});

test('Formatting preserves the edit position and supports deleting digits', () => {
  assert.deepEqual(formatDateInput('14.11.2025', 2), {value:'14.11.2025',caret:2});
  assert.deepEqual(formatDateInput('1311.2025', 3), {value:'13.11.2025',caret:4});
  assert.deepEqual(formatDateInput('13.11.202'), {value:'13.11.202',caret:9});
  assert.deepEqual(formatDateInput(''), {value:'',caret:0});
  const edited = formatDateInput('3.11.2025', 0);
  assert.equal(edited.caret, 0);
  assert.deepEqual(formatDateInput('1' + edited.value, 1), {value:'13.11.2025',caret:1});
  assert.equal(formatDateInput('13112025999').value, '13.11.2025');
});

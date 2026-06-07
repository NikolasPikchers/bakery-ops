import { describe, it, expect } from 'vitest';
import { parseQuantity } from './parseQuantity';

describe('parseQuantity', () => {
  it('пустое и прочерк → null, не ambiguous', () => {
    expect(parseQuantity('')).toMatchObject({ value: null, parts: [], ambiguous: false });
    expect(parseQuantity('   ')).toMatchObject({ value: null, parts: [], ambiguous: false });
    expect(parseQuantity('-')).toMatchObject({ value: null, parts: [], ambiguous: false });
    expect(parseQuantity('—')).toMatchObject({ value: null, parts: [], ambiguous: false });
  });

  it('одиночное число', () => {
    expect(parseQuantity('9')).toMatchObject({ value: 9, parts: [9], ambiguous: false });
  });

  it('партии прихода a+b+c → сумма', () => {
    expect(parseQuantity('8+8')).toMatchObject({ value: 16, parts: [8, 8], ambiguous: false });
    expect(parseQuantity('24+12+6')).toMatchObject({ value: 42, parts: [24, 12, 6], ambiguous: false });
    expect(parseQuantity('24+10')).toMatchObject({ value: 34, ambiguous: false });
  });

  it('поправка остатка x-y → разность', () => {
    expect(parseQuantity('13-1')).toMatchObject({ value: 12, parts: [13, 1], ambiguous: false });
    expect(parseQuantity('5-1')).toMatchObject({ value: 4, ambiguous: false });
  });

  it('явный итог =N: доверяем итогу, math сходится → не ambiguous', () => {
    expect(parseQuantity('2+1=3')).toMatchObject({ value: 3, parts: [2, 1], ambiguous: false });
    expect(parseQuantity('8+25=33')).toMatchObject({ value: 33, ambiguous: false });
  });

  it('явный итог =N не сходится с суммой → ambiguous, берём написанный итог', () => {
    expect(parseQuantity('2+1=4')).toMatchObject({ value: 4, ambiguous: true });
  });

  it('кружок-итог ⑨: math сходится', () => {
    expect(parseQuantity('6+3 ⑨')).toMatchObject({ value: 9, parts: [6, 3], ambiguous: false });
  });

  it('кружок-итог не сходится → ambiguous, берём кружок', () => {
    expect(parseQuantity('6+3 ⑤')).toMatchObject({ value: 5, parts: [6, 3], ambiguous: true });
  });

  it('одиночный итог без выражения → не ambiguous', () => {
    expect(parseQuantity('⑨')).toMatchObject({ value: 9, parts: [], ambiguous: false });
    expect(parseQuantity('=12')).toMatchObject({ value: 12, parts: [], ambiguous: false });
  });

  it('смешанные операторы +/- → корректный value, parts без знака', () => {
    expect(parseQuantity('6+5-1')).toMatchObject({ value: 10, parts: [6, 5, 1], ambiguous: false });
  });

  it('несколько «=» (опечатка) → ambiguous', () => {
    expect(parseQuantity('2+1=3=4')).toMatchObject({ value: 4, ambiguous: true });
  });

  it('единицы/мусор → ambiguous, лучшее усилие по числу', () => {
    expect(parseQuantity('3кг')).toMatchObject({ value: 3, ambiguous: true });
    expect(parseQuantity('1десерт')).toMatchObject({ value: 1, ambiguous: true });
  });

  it('всегда сохраняет raw', () => {
    expect(parseQuantity('24+12+6').raw).toBe('24+12+6');
  });
});

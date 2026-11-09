import { describe, expect, test } from '@jest/globals';
import { classicPolicy, evaluateNpcs, evaluationMarkdown, fixedEvents } from './evaluation';
import { initialState } from './core';
describe('reproducible offline evaluation', () => {
  test('same seed gives byte-identical results with fixed initial state and exogenous events', () => {
    expect(JSON.stringify(evaluateNpcs('seed', 40))).toBe(JSON.stringify(evaluateNpcs('seed', 40)));
    expect(evaluateNpcs('another', 40).events).toEqual(fixedEvents(40));
    expect(evaluateNpcs('another', 40).initialState).not.toEqual(
      evaluateNpcs('seed', 40).initialState,
    );
  });
  test('all modes see identical event IDs and report honest no-API metrics', () => {
    const report = evaluateNpcs();
    for (const result of report.results) {
      expect(result.trace.map((t) => t.eventId)).toEqual(report.events.map((e) => e.id));
      expect(Object.values(result.metrics.actionDistribution).reduce((a, b) => a + b, 0)).toBe(
        report.steps,
      );
      expect(result.metrics.apiRequests).toBe(0);
      expect(result.metrics.apiCostUsd).toBe(0);
      expect(result.metrics.apiLatencyMs).toBeNull();
      expect(result.metrics.invalidStateCount).toBe(0);
      expect(result.metrics.decisionSuccessRate).toBeGreaterThanOrEqual(0);
      expect(result.metrics.decisionSuccessRate).toBeLessThanOrEqual(1);
    }
    expect(report.results[2].label).toContain('utility fallback');
    expect(evaluationMarkdown(report)).toContain('not proof of subjective naturalness');
  });
  test('classic adapter preserves 80% invite threshold rather than choosing utility', () => {
    const context = {
      state: initialState('Ada', 0),
      now: 1000,
      nearby: [],
      invitation: { playerId: 'p:1', conversationId: 'c:1' },
    };
    expect(classicPolicy(context, () => 0.79, 0, 0).action).toBe('accept_invite');
    expect(classicPolicy(context, () => 0.8, 0, 0).action).toBe('reject_invite');
  });
  test('known fixture contains conflict, rejection, invitation and promise events', () => {
    expect(fixedEvents(8).map((e) => e.kind)).toEqual(
      expect.arrayContaining(['conflict', 'rejected', 'invitation', 'promise_due', 'goal_stalled']),
    );
  });
  test.each([0, 1.5, NaN, 10001])('rejects invalid step count %s', (steps) =>
    expect(() => evaluateNpcs('seed', steps)).toThrow(),
  );
});

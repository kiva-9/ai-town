import { useI18n, getLocale, label, errorMessage, diagnosticMessage, recordedText } from '../i18n';
import { useId, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { activeGoal, NpcState } from '../../convex/npc/core';
import './NpcIntelligence.css';

type Mode = 'classic' | 'hybrid' | 'mock';
const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${value.toFixed(4)}`;
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const timestamp = (value: number) =>
  new Date(value).toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function RecordedText({ value }: { value: string }) {
  const { t, locale } = useI18n();
  const content = recordedText(value, locale);
  return (
    <span className="npc-recorded-text">
      {content.text}
      {content.original && (
        <small className="npc-original-label">
          {t('Original record, not automatically translated')}
        </small>
      )}
    </span>
  );
}

function Meter({ name, value }: { name: string; value: number }) {
  useI18n();
  return (
    <div className="npc-meter">
      <span>{label(name)}</span>
      <meter min={0} max={1} value={value} aria-label={label(name)} />
      <span>{percent(value)}</span>
    </div>
  );
}

export default function NpcIntelligence({
  worldId,
  playerId,
  names,
}: {
  worldId: Id<'worlds'>;
  playerId: string;
  names: ReadonlyMap<string, string>;
}) {
  const { t, locale } = useI18n();
  const text = (value: unknown) =>
    typeof value === 'string' ? label(value, locale) : t('Not recorded');
  const inspection = useQuery(api.npc.service.inspect, { worldId, playerId });
  const overview = useQuery(api.npc.service.overview, { worldId });
  const setMode = useMutation(api.npc.service.setMode);
  const setNpcLanguage = useMutation(api.npc.service.setLanguage);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageSaved, setLanguageSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const id = useId();
  const state = inspection?.npc?.state as NpcState | undefined;
  const jobs = inspection?.jobs ?? [];
  const goal = state && activeGoal(state, Date.now());
  const mood =
    state &&
    (state.stress >= 0.7
      ? t('Tense')
      : state.energy <= 0.3
        ? t('Tired')
        : state.stress <= 0.3 && state.energy >= 0.6
          ? t('At ease')
          : t('Steady'));
  const person = (target: string) => names.get(target) ?? t('Unknown resident');
  const changeMode = async (mode: Mode) => {
    setSaving(true);
    setError(undefined);
    try {
      await setMode({ mode });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const changeLanguage = async (language: 'zh-CN' | 'en') => {
    setSavingLanguage(true);
    setLanguageSaved(false);
    setError(undefined);
    try {
      await setNpcLanguage({ language });
      setLanguageSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSavingLanguage(false);
    }
  };

  return (
    <section className="npc-intelligence" aria-labelledby={`${id}-heading`}>
      <details>
        <summary id={`${id}-heading`}>
          <strong>{t('NPC Intelligence')}</strong>
          <span className="npc-badge">{inspection ? label(inspection.mode) : t('Loading')}</span>
        </summary>
        {!inspection || !overview ? (
          <p role="status">{t('Loading NPC state\u2026')}</p>
        ) : (
          <>
            <div className="npc-mode">
              <label htmlFor={`${id}-mode`}>{t('World policy')}</label>
              <select
                id={`${id}-mode`}
                value={overview.mode}
                disabled={overview.disabled || !overview.controlAllowed || saving}
                aria-describedby={`${id}-mode-help`}
                onChange={(event) => {
                  void changeMode(event.target.value as Mode);
                }}
              >
                <option value="classic">{t('Classic')}</option>
                <option value="hybrid">{t('Hybrid')}</option>
                <option value="mock">{t('Mock')}</option>
              </select>
            </div>
            <p id={`${id}-mode-help`} className="npc-muted">
              {overview.disabled
                ? t('NPC decisions are disabled on the server.')
                : overview.controlAllowed
                  ? t(
                      'Changes apply globally to all worlds. Hybrid may use paid model requests; mock uses local decisions.',
                    )
                  : t(
                      'Read-only. Mode changes must be enabled by the server operator in a trusted deployment.',
                    )}
            </p>
            <div className="npc-mode">
              <label htmlFor={`${id}-language`}>{t('NPC generation language')}</label>
              <select
                id={`${id}-language`}
                value={overview.language}
                disabled={!overview.controlAllowed || savingLanguage}
                aria-describedby={`${id}-language-help`}
                onChange={(event) => void changeLanguage(event.target.value as 'zh-CN' | 'en')}
              >
                <option value="zh-CN">{t('Simplified Chinese')}</option>
                <option value="en">{t('English')}</option>
              </select>
            </div>
            <p id={`${id}-language-help`} className="npc-muted">
              {t(
                'Changes new dialogue and memories for the entire town, not history. Separate from this browser’s interface language.',
              )}
            </p>
            {savingLanguage && <p role="status">{t('Updating NPC language…')}</p>}
            {languageSaved && <p role="status">{t('NPC language updated.')}</p>}
            {saving && <p role="status">{t('Updating policy\u2026')}</p>}
            {error && (
              <p role="alert" className="npc-error">
                {error}
              </p>
            )}
            <details className="npc-subsection">
              <summary>{t('Global budget & queue')}</summary>
              <dl className="npc-facts">
                <dt>{t('Budget day (UTC)')}</dt>
                <dd>{overview.day ?? t('No reservations yet')}</dd>
                <dt>{t('Request reservations')}</dt>
                <dd>
                  {overview.requests} / {overview.limits.perDay}
                </dd>
                <dt>{t('Cost reserved (USD)')}</dt>
                <dd>
                  {money(overview.cost)} / {money(overview.limits.dailyCost)}
                </dd>
                <dt>{t('Queue / running')}</dt>
                <dd>
                  {overview.queued} / {overview.running}
                </dd>
                <dt>{t('Policy epoch')}</dt>
                <dd>{overview.epoch}</dd>
              </dl>
              <p className="npc-muted">
                {t(
                  'Global reservation accounting, including retry allowance. This is not exact billed usage or cost.',
                )}
              </p>
            </details>
            {!state ? (
              <p className="npc-muted">
                {t('No intelligence state yet.')}
                {overview.mode === 'classic'
                  ? t('Classic mode uses the original agent behavior.')
                  : t('State appears when this NPC next makes a decision.')}
              </p>
            ) : (
              <>
                <div className="npc-status">
                  <span className="npc-badge">{mood}</span>
                  <span>{t('Mood derived from energy and stress')}</span>
                </div>
                <Meter name="Energy" value={state.energy} />
                <Meter name="Stress" value={state.stress} />
                <p>
                  <strong>{t('Current goal:')}</strong>{' '}
                  {goal
                    ? `${label(goal.kind)}${goal.targetId ? ` → ${person(goal.targetId)}` : ''} (${percent(goal.progress)})`
                    : t('No active goal')}
                </p>
                <details className="npc-subsection">
                  <summary>{t('Personality \u00b7 7 traits')}</summary>
                  {(Object.keys(state.personality) as (keyof NpcState['personality'])[]).map(
                    (trait) => (
                      <Meter key={trait} name={trait} value={state.personality[trait]} />
                    ),
                  )}
                </details>
                <details className="npc-subsection">
                  <summary>
                    {t('Directed relationships')} · {state.relationships.length}
                  </summary>
                  <p className="npc-muted">
                    {t('This NPC\u2019s view of others. Feelings may not be mutual.')}
                  </p>
                  {state.relationships.length === 0 && <p>{t('No relationships recorded yet.')}</p>}
                  {state.relationships.map((relationship) => (
                    <div className="npc-entry" key={relationship.playerId}>
                      <strong>→ {person(relationship.playerId)}</strong>
                      <Meter name="Trust" value={relationship.trust} />
                      <Meter name="Familiarity" value={relationship.familiarity} />
                      <Meter name="Affinity" value={relationship.affinity} />
                      <Meter name="Conflict" value={relationship.conflict} />
                      {relationship.promises.map((promise) => (
                        <p key={promise.id}>
                          <RecordedText value={promise.description} /> · {label(promise.status)}
                        </p>
                      ))}
                    </div>
                  ))}
                </details>
                <details className="npc-subsection">
                  <summary>
                    {t('Recent memories')} · {state.memories.length}
                  </summary>
                  {state.memories.length === 0 && <p>{t('No memories recorded yet.')}</p>}
                  <ol className="npc-list">
                    {[...state.memories]
                      .reverse()
                      .slice(0, 8)
                      .map((memory) => (
                        <li key={memory.id}>
                          <time dateTime={new Date(memory.at).toISOString()}>
                            {timestamp(memory.at)}
                          </time>{' '}
                          · {label(memory.kind)}
                          {memory.targetId && <> → {person(memory.targetId)}</>}
                          {memory.summary && (
                            <p>
                              <RecordedText value={memory.summary} />
                            </p>
                          )}
                        </li>
                      ))}
                  </ol>
                </details>
              </>
            )}
            <details className="npc-subsection">
              <summary>
                {t('Recent decisions')} · {jobs.length}
              </summary>
              <p className="npc-muted">
                {t('Latest {count} retained jobs for this NPC, not lifetime totals.', {
                  count: jobs.length,
                })}{' '}
                {jobs.filter((job) => job.status === 'done').length} {t('done')} ·{' '}
                {jobs.filter((job) => job.status === 'queued').length} {t('queued')} ·{' '}
                {jobs.filter((job) => job.status === 'running').length} {t('running')}.
              </p>
              {jobs.length === 0 && <p>{t('No decision jobs recorded yet.')}</p>}
              {jobs.map((job) => {
                const decision = record(job.decision);
                const event = record(job.event);
                const candidates: unknown[] = Array.isArray(job.candidates) ? job.candidates : [];
                const result = record(job.apiResult);
                const answers: unknown[] = Array.isArray(result.answers) ? result.answers : [];
                const answer = record(answers.find((item) => record(item).name === 'action'));
                const distribution: unknown[] = Array.isArray(answer.probabilities)
                  ? answer.probabilities
                  : [];
                const probabilityFor = (candidateId: unknown) =>
                  number(
                    record(distribution.find((item) => record(item).value === candidateId))
                      .probability,
                  );
                const probability = probabilityFor(decision.id) ?? number(decision.probability);
                const usage = record(result.usage);
                return (
                  <details className="npc-entry" key={job._id}>
                    <summary>
                      {timestamp(job.createdAt)} · {text(decision.action ?? job.status)}
                    </summary>
                    <dl className="npc-facts">
                      <dt>{t('Event')}</dt>
                      <dd>
                        {text(event.kind)}
                        {typeof event.summary === 'string' && (
                          <p>
                            <RecordedText value={event.summary} />
                          </p>
                        )}
                      </dd>
                      <dt>{t('Source')}</dt>
                      <dd>{job.source === 'decisions' ? t('Decisions API') : text(job.source)}</dd>
                      <dt>{t('Execution')}</dt>
                      <dd>{text(job.outcome ?? job.status)}</dd>
                      <dt>{t('Choice')}</dt>
                      <dd>
                        {text(decision.action)}
                        {typeof decision.targetId === 'string' && (
                          <> → {person(decision.targetId)}</>
                        )}
                      </dd>
                      <dt>{t('Probability')}</dt>
                      <dd>
                        {probability === undefined ? t('Not recorded') : percent(probability)}
                      </dd>
                    </dl>
                    {job.error && (
                      <p className="npc-error">{diagnosticMessage(job.error, locale)}</p>
                    )}
                    {job.apiResult && (
                      <details className="npc-subsection">
                        <summary>{t('Model response & usage')}</summary>
                        <dl className="npc-facts">
                          <dt>{t('Model')}</dt>
                          <dd>
                            {typeof result.model === 'string' ? result.model : t('Not recorded')}
                          </dd>
                          <dt>{t('Response')}</dt>
                          <dd>{text(answer.type)}</dd>
                          <dt>{t('Model choice')}</dt>
                          <dd>
                            {text(
                              candidates.find((item) => record(item).id === answer.choice)
                                ? record(
                                    candidates.find((item) => record(item).id === answer.choice),
                                  ).action
                                : undefined,
                            )}
                          </dd>
                          <dt>{t('Confidence')}</dt>
                          <dd>
                            {number(answer.confidence) === undefined
                              ? t('Not recorded')
                              : percent(number(answer.confidence)!)}
                          </dd>
                          <dt>{t('Attempts')}</dt>
                          <dd>{number(result.attempts) ?? t('Not recorded')}</dd>
                          <dt>{t('Latency')}</dt>
                          <dd>
                            {number(result.latencyMs) === undefined
                              ? t('Not recorded')
                              : `${number(result.latencyMs)} ms`}
                          </dd>
                          <dt>{t('Input / output tokens')}</dt>
                          <dd>
                            {number(usage.input_tokens) ?? '—'} /{' '}
                            {number(usage.output_tokens) ?? '—'}
                          </dd>
                          <dt>{t('Estimated cost (USD)')}</dt>
                          <dd>
                            {number(result.costUsd) === undefined
                              ? t('Not recorded')
                              : money(number(result.costUsd)!)}
                          </dd>
                        </dl>
                        <p className="npc-muted">
                          {t(
                            'Provider response, separate from the executed choice. Estimated cost is not a billing receipt.',
                          )}
                        </p>
                      </details>
                    )}
                    <strong>{t('Candidates')}</strong>
                    <ul className="npc-list">
                      {candidates.map((item, index) => {
                        const candidate = record(item);
                        const utility = number(candidate.utility);
                        return (
                          <li key={typeof candidate.id === 'string' ? candidate.id : index}>
                            {text(candidate.action)}
                            {typeof candidate.targetId === 'string' && (
                              <> → {person(candidate.targetId)}</>
                            )}
                            {utility !== undefined && (
                              <>
                                {' '}
                                · {t('utility')} {utility.toFixed(3)}
                              </>
                            )}
                            {probabilityFor(candidate.id) !== undefined && (
                              <>
                                {' '}
                                · {t('model probability')} {percent(probabilityFor(candidate.id)!)}
                              </>
                            )}
                            {typeof candidate.reason === 'string' && (
                              <p className="npc-muted">
                                <RecordedText value={candidate.reason} />
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="npc-muted">
                      {t(
                        'Utility scores are not model probabilities. Submitted decisions may still be rejected by the game\u2019s execution checks.',
                      )}
                    </p>
                  </details>
                );
              })}
            </details>
          </>
        )}
      </details>
    </section>
  );
}

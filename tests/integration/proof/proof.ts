import {
  approvePack, createFirebaseInference, evaluateAnswer, generatePack, validatePack,
  type GradingPack, type Attempt,
} from '../../../shared/core/src/index.ts';
import fixturePack from '../../../shared/rubrics/roots.v1.json';
import answers from '../../benchmarks/roots.json';
import paper from '../../fixtures/question-paper.txt?raw';
import key from '../../fixtures/answer-key.txt?raw';

const inference = createFirebaseInference();
const fixture = validatePack(fixturePack);
const result = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLParagraphElement>('#capabilities')!;

async function refresh() {
  status.textContent = `On-device model: ${await inference.deviceAvailability()}. Cloud configured: ${inference.cloudConfigured}.`;
}

function setupButton(id: string, action: () => Promise<unknown>) {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = async () => {
    result.dataset.state = 'running';
    result.textContent = 'Running…';
    try {
      result.textContent = JSON.stringify(await action(), null, 2);
      result.dataset.state = 'done';
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : 'Proof failed.';
      result.dataset.state = 'error';
    }
  };
}

setupButton('init', async () => {
  await inference.initializeDevice((fraction) => {
    status.textContent = `Downloading model: ${Math.round(fraction * 100)}%`;
  });
  await refresh();
  return { device: await inference.deviceAvailability() };
});

function run(pack: GradingPack, source: 'device' | 'cloud', record: typeof answers[number]) {
  const question = pack.questions.find(({ id }) => id === record.questionId);
  if (!question) throw new Error('The generated pack changed a question identifier.');
  return evaluateAnswer(inference, question, record.answer, {
    policy: source === 'device' ? 'device-only' : 'cloud-only',
    cloudConsent: source === 'cloud',
    online: navigator.onLine,
  });
}

async function benchmark(source: 'device' | 'cloud') {
  const records = [];
  for (const answer of answers) {
    const evaluation = await run(fixture, source, answer);
    records.push({
      id: answer.id, teacherMarks: answer.teacherMarks, modelMarks: evaluation.proposed?.marks ?? null,
      status: evaluation.status, attempts: evaluation.attempts,
    });
  }
  const comparable = records.filter((record) => record.teacherMarks !== null);
  const valid = comparable.filter((record) => record.modelMarks !== null);
  const exact = valid.filter((record) => record.teacherMarks === record.modelMarks);
  return { source, exact: exact.length, valid: valid.length, comparable: comparable.length, records };
}

setupButton('local', async () => run(fixture, 'device', answers[0]));
setupButton('local-benchmark', async () => benchmark('device'));
setupButton('cloud-benchmark', async () => benchmark('cloud'));
setupButton('app-check', async () => {
  await inference.verifyCloudAttestation();
  return { attestationReceived: true };
});
setupButton('cloud', async () => {
  const attempts: Attempt[] = [];
  const generated = approvePack(await generatePack(inference, fixture.exam, paper, key, (attempt) => attempts.push(attempt)));
  const evaluation = await run(generated, 'cloud', answers[0]);
  if (evaluation.attempts[0]?.source !== 'cloud' || evaluation.status !== 'provisional' || evaluation.proposed?.marks !== 2) {
    throw new Error(`Cloud grading failed verification. ${JSON.stringify(evaluation)}`);
  }
  return { rubric: { questions: generated.questions.length, attempts }, evaluation };
});

void refresh();

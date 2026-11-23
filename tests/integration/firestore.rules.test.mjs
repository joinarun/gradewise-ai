import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

test('Firestore blocks all client access, even for a signed-in teacher', async () => {
  const rules = await readFile(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8');
  const env = await initializeTestEnvironment({
    projectId: 'demo-gradewise-ai',
    firestore: { rules },
  });
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'exams/sample'), { owner: 'teacher-1' });
    });
    for (const context of [env.unauthenticatedContext(), env.authenticatedContext('teacher-1')]) {
      const database = context.firestore();
      const exam = doc(database, 'exams/sample');
      await assertFails(getDoc(exam));
      await assertFails(getDocs(collection(database, 'exams')));
      await assertFails(setDoc(doc(database, 'exams/new'), { owner: 'teacher-1' }));
      await assertFails(updateDoc(exam, { owner: 'teacher-2' }));
      await assertFails(deleteDoc(exam));
    }
  } finally {
    await env.cleanup();
  }
});

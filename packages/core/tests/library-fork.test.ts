// Forking a library course into the learner's own store.
//
// The one that matters: until 20 Sep 2026 the converter copied `content` only,
// so a course written to the steps standard reached the learner as a blob.
// The Classroom writes steps; this is the pipe they travel down.

import { describe, it, expect } from 'vitest';
import { libraryPathToCurriculum, type LibraryPathInput } from '../src/learning/library-fork.js';

const path: LibraryPathInput = {
  title: 'GIMP from the First Layer',
  description: 'Retouch, cut out, export.',
  subject: 'GIMP',
  level: 'beginner',
  goal: 'Do it yourself',
  estimated_hours: 6,
  learning_objectives: ['Retouch a photo'],
  prerequisites: 'None',
  target_audience: 'First-timers',
  content: {
    modules: [
      {
        title: 'The workspace',
        lessons: [
          {
            title: 'Layers',
            estimated_minutes: 12,
            learning_objectives: ['Stack two layers'],
            steps: [
              {
                id: 'authored-1',
                teach: 'Layers are stacked transparencies.',
                interaction: { kind: 'choice', prompt: 'Which wins?', options: ['Top', 'Bottom'], answer: 'Top' },
                feedback: { correct: 'Yes.', incorrect: 'The top one.' },
              },
              {
                teach: 'Now do it.',
                interaction: { kind: 'free_text', prompt: 'Add a layer and name it.', evaluation: 'A named layer above the photo.' },
              },
            ],
          },
          {
            title: 'Legacy lesson',
            content: 'A page about selections.',
            quiz_questions: [{ question: 'What is a selection?', correct_answer: 'A region', options: ['A region', 'A layer'], explanation: 'It bounds edits.' }],
          },
        ],
      },
    ],
  },
};

describe('libraryPathToCurriculum', () => {
  it('carries steps through, with the progress half reset and fresh ids', () => {
    const c = libraryPathToCurriculum(path, '2026-09-20T00:00:00.000Z');
    const lesson = c.modules[0].lessons[0];
    expect(lesson.steps).toHaveLength(2);
    const [a, b] = lesson.steps!;
    expect(a.teach).toBe('Layers are stacked transparencies.');
    expect(a.interaction).toEqual({ kind: 'choice', prompt: 'Which wins?', options: ['Top', 'Bottom'], answer: 'Top' });
    expect(a.feedback).toEqual({ correct: 'Yes.', incorrect: 'The top one.' });
    expect(a).toMatchObject({ status: 'not_started', attempts: 0, last_attempt: null });
    expect(a.id).not.toBe('authored-1');           // never the library's id
    expect(b.interaction.evaluation).toBe('A named layer above the photo.');
    expect(lesson.estimated_minutes).toBe(12);
    expect(lesson.learning_objectives).toEqual(['Stack two layers']);
  });

  it('two forks of the same course do not share step ids', () => {
    const one = libraryPathToCurriculum(path).modules[0].lessons[0].steps![0].id;
    const two = libraryPathToCurriculum(path).modules[0].lessons[0].steps![0].id;
    expect(one).not.toBe(two);
  });

  it('keeps a legacy lesson playable: content and its quiz, no steps', () => {
    const c = libraryPathToCurriculum(path);
    const legacy = c.modules[0].lessons[1];
    expect(legacy.steps).toBeUndefined();
    expect(legacy.content).toBe('A page about selections.');
    expect(legacy.quiz_questions).toEqual([
      { question: 'What is a selection?', correct_answer: 'A region', options: ['A region', 'A layer'], explanation: 'It bounds edits.' },
    ]);
  });

  it('an empty steps array is treated as no steps', () => {
    const p: LibraryPathInput = { ...path, content: { modules: [{ title: 'M', lessons: [{ title: 'L', steps: [] }] }] } };
    expect(libraryPathToCurriculum(p).modules[0].lessons[0].steps).toBeUndefined();
  });
});

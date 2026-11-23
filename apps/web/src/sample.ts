import type { ExamRecord } from "./model.ts";

export function sampleExam(): ExamRecord {
  const now = new Date().toISOString();
  const metadata = {
    name: "Plant Biology · Unit Assessment",
    subject: "Biology",
    className: "Grade 7",
    date: now.slice(0, 10),
    maxMarks: 4,
    autoApprove: false,
  };
  return {
    id: "plant-biology-sample",
    metadata,
    paper: "1. Mention two functions of roots in plants. (2 marks)\n2. Explain how leaves make food. (2 marks)",
    key: "1. Roots absorb water and minerals, and anchor plants. Award one mark for each concept.\n2. Leaves use light energy and make sugar from carbon dioxide and water. Award one mark for light energy and one for describing the inputs and product together.",
    pack: {
      schemaVersion: 1,
      exam: metadata,
      approvedAt: now,
      questions: [
        {
          id: "Q1",
          text: "Mention two functions of roots in plants.",
          referenceAnswer: "Roots absorb water and minerals from soil. They also anchor the plant.",
          maxMarks: 2,
          criteria: [
            { id: "Q1-C1", description: "Absorption of water from soil", maxMarks: 1, partialCredit: "Award 1 mark for taking up water, with or without mentioning minerals." },
            { id: "Q1-C2", description: "Anchoring or holding the plant in place", maxMarks: 1, partialCredit: "Award 1 mark for clearly describing anchoring or plant stability." },
          ],
          alternatives: ["They draw water from the soil and keep the plant standing."],
          examples: { correct: ["Roots take up water and hold the plant in the ground."], incorrect: ["Roots make fruit."] },
          constraints: ["Award each mark independently. Do not award a mark for repeating the same function."],
        },
        {
          id: "Q2",
          text: "Explain how leaves make food.",
          referenceAnswer: "Leaves use energy from sunlight to turn water and carbon dioxide into sugar.",
          maxMarks: 2,
          criteria: [
            { id: "Q2-C1", description: "Sunlight provides energy", maxMarks: 1, partialCredit: "Award 1 mark for identifying light as an input or energy source." },
            { id: "Q2-C2", description: "Water and carbon dioxide are inputs used to make sugar", maxMarks: 1, partialCredit: "Award 0.5 marks if sugar is stated along with exactly one correct input." },
          ],
          alternatives: ["Leaves use sunlight to make glucose from water and CO₂."],
          examples: { correct: ["Light helps leaves change water and carbon dioxide into sugar."], incorrect: ["Leaves turn dirt into food."] },
          constraints: ["Grade this question from the answer alone."],
        },
      ],
    },
    answers: [
      ["S-01", "Q1", "Roots take water from the soil and keep the plant fixed.", 2],
      ["S-01", "Q2", "Leaves use light to turn carbon dioxide and water into sugar.", 2],
      ["S-02", "Q1", "Roots soak up water.", 1],
      ["S-02", "Q2", "Leaves use sunshine and water to make sugar.", 1.5],
      ["S-03", "Q1", "Roots make flowers.", 0],
      ["S-03", "Q2", "Leaves eat soil.", 0],
      ["S-04", "Q1", "Roots get things from the ground and help the plant.", 0],
      ["S-04", "Q2", "[line illegible] light", 0],
    ].map(([student, questionId, answer, reference], index) => ({
      id: `sample-${index + 1}`,
      student: String(student),
      questionId: String(questionId),
      text: String(answer),
      reference: Number(reference),
      extractionVerified: index !== 7,
    })),
    createdAt: now,
    sample: true,
  };
}

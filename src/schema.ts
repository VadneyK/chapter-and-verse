/**
 * Study-plan schema, shared by the generator and the verifier.
 *
 * Deliberately small. Every optional field is here because the verifier can
 * check it against the index. There is no field the verifier merely stores,
 * because a field a model can fill and nothing reads is exactly where a
 * confident falsehood goes to hide.
 */

export type PlanItemType = 'reading' | 'memory' | 'question';

export interface PlanItem {
  /** Stable id within the plan, e.g. "w1-r1". */
  id: string;
  type: PlanItemType;
  /** Which week of the plan this falls in, 1-based. */
  week: number;
  /** Short label shown to the learner. Prose, and checked as prose: see README. */
  title: string;
  /**
   * One passage. "Romans", "Romans 8", "Romans 8-9", "Romans 8:28",
   * "Romans 8:28-30", "Romans 8:28-9:2", "1 Corinthians 13:1-13", "Jude 3".
   * One passage per item: a comma-separated list is rejected rather than
   * half-checked.
   */
  reference: string;
  /**
   * Text the item claims the reference says, verbatim in the translation the
   * index was built from. Checked character for character after punctuation
   * and case are normalized away.
   */
  quote?: string;
  /**
   * Other passages the item claims are connected to this one. Checked against
   * the cross-reference graph, which carries a vote weight per link, so a real
   * but thinly attested link reports differently from an invented one.
   */
  crossReferences?: string[];
  /** Free-text note. Prose, and not verified. */
  note?: string;
}

export interface StudyPlan {
  goal: string;
  weeks: number;
  /** Free text recording what produced the plan. Never verified. */
  generatedBy: string;
  items: PlanItem[];
}

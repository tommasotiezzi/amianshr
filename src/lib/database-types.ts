/**
 * Tipi TypeScript del database Supabase — v3
 *
 * Allineato allo schema con axis scoring + ICP + answer_key lockdown.
 * Auto-generabili con: npx supabase gen types typescript --project-id YOUR_ID
 */

// ── Enums ──

export type UserRole = 'admin' | 'candidate';
export type PositionStatus = 'draft' | 'published' | 'closed' | 'archived';
export type ContractType = 'full_time' | 'part_time' | 'freelance' | 'internship';
export type ApplicationStatus = 'applied' | 'interview' | 'rejected' | 'hired';
export type QuizType = 'logic' | 'skills' | 'attitudinal';
export type QuestionType = 'multiple_choice' | 'ranking' | 'open_text' | 'file_upload';

export type AxisType =
  | 'action_bias'
  | 'ownership'
  | 'ambiguity_tolerance'
  | 'data_driven'
  | 'autonomy'
  | 'feedback_receptivity'
  | 'learning_loop'
  | 'perfection_as_means'
  | 'people_first'
  | 'constructive_restlessness'
  | 'innovation_renewal';

/** All 11 axes in canonical order — for iterating in UI (e.g. ICP sliders). */
export const AXES: AxisType[] = [
  'action_bias',
  'ownership',
  'ambiguity_tolerance',
  'data_driven',
  'autonomy',
  'feedback_receptivity',
  'learning_loop',
  'perfection_as_means',
  'people_first',
  'constructive_restlessness',
  'innovation_renewal',
];

/** UI labels for axes (Italian, to be swapped to English when frontend is redone). */
export const AXIS_LABELS: Record<AxisType, string> = {
  action_bias:               'Bias all\'azione',
  ownership:                 'Ownership',
  ambiguity_tolerance:       'Tolleranza ambiguità',
  data_driven:               'Data-driven',
  autonomy:                  'Autonomia operativa',
  feedback_receptivity:      'Feedback receptivity',
  learning_loop:             'Learning loop',
  perfection_as_means:       'Perfezione come mezzo',
  people_first:              'Le persone al centro',
  constructive_restlessness: 'Inquietudine costruttiva',
  innovation_renewal:        'Innovazione e rinnovo',
};

// ── Row types ──

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  quiz_type: QuizType;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_type: QuestionType;
  question_text: string;
  sort_order: number;
  points: number;
  axis: AxisType | null;
  config: QuestionConfig;
  /** Present only when admin reads. Candidates get this stripped by RPC. */
  answer_key: AnswerKey;
  created_at: string;
}

/** Shape of a question when fetched for a candidate (via get_quiz_for_candidate RPC). */
export interface QuizQuestionForCandidate {
  id: string;
  question_type: QuestionType;
  question_text: string;
  sort_order: number;
  points: number;
  axis: AxisType | null;
  config: QuestionConfig;
  // answer_key is deliberately absent
}

export interface Position {
  id: string;
  title: string;
  description: string;
  department: string;
  contract_type: ContractType;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  stock_options: string | null;
  bonus: string | null;
  app_name: string | null;
  app_color_from: string | null;
  app_color_to: string | null;
  status: PositionStatus;
  pre_quiz_id: string | null;
  post_quiz_id: string | null;
  att_quiz_id: string | null;
  icp_config: IcpConfig;
  slug: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  /** 'milan' (based in Milan, can do hybrid) or 'remote' (remote-only). null = legacy/unknown. */
  work_location: 'milan' | 'remote' | null;
  created_at: string;
}

export interface Application {
  id: string;
  position_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  cv_file_path: string;
  portfolio_path: string | null;
  cover_letter: string | null;

  // Pre-Quiz (logic, e.g. 25 min)
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_responses: QuizResponse[] | null;
  pre_quiz_started_at: string | null;
  pre_quiz_completed_at: string | null;
  pre_quiz_over_time: boolean;

  // Post-Quiz (skills, e.g. 35 min)
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_responses: QuizResponse[] | null;
  post_quiz_started_at: string | null;
  post_quiz_completed_at: string | null;
  post_quiz_over_time: boolean;

  // Attitudinal (no timer)
  att_quiz_responses: QuizResponse[] | null;
  att_quiz_completed_at: string | null;

  // Axis scoring (filled after attitudinal is submitted)
  axis_scores: AxisScores | null;
  composite_score: number | null;

  /** Tommaso has reviewed portfolio/LinkedIn and they're worth considering. */
  screened: boolean;
  /** Interesting but on hold (e.g. ambiguous fit, second-tier). */
  standby: boolean;

  created_at: string;
  updated_at: string;
}

export interface ApplicationNote {
  id: string;
  application_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  old_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changed_by: string;
  changed_at: string;
}

export interface EmailTemplate {
  id: string;
  trigger: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

// ── Nested / JSONB types ──

/**
 * Candidate response stored in applications.*_quiz_responses.
 * For multiple_choice: answer is number[] (selected indices).
 * For ranking: answer is string[] (ordered option IDs, index 0 = most important / rank 1).
 * For open_text: answer is string.
 */
export interface QuizResponse {
  question_id: string;
  answer: string | string[] | number[] | null;
  is_correct?: boolean | null;
  points_earned?: number;
}

/**
 * Candidate-visible portion of a question.
 * No correct answers here — those live in AnswerKey.
 *
 * `options` is overloaded:
 *   - multiple_choice: string[] (option labels)
 *   - ranking: RankingItem[] (items with stable ids + axis_value)
 * Use type assertions when reading: `config.options as RankingItem[]`
 */
export interface QuestionConfig {
  // Optional image shown above the question text.
  // Public URL from the question-images storage bucket.
  image_url?: string;

  // multiple_choice OR ranking
  options?: string[] | RankingItem[];
  allow_multiple?: boolean;

  // file_upload
  allowed_types?: string[];
  max_size_mb?: number;
}

export interface RankingItem {
  /** Stable identifier used in answer arrays and answer_key.correct. */
  id: string;
  label: string;
  /** For attitudinal (1-5) — contribution to the question's axis when ranked #1. Unused for logic ranking. */
  axis_value?: number;
}

/**
 * Admin-only. Never sent to candidates.
 * - multiple_choice: correct = number[] (indices of correct options)
 * - ranking: correct = string[] (ordered item IDs, correct order)
 * - open_text / file_upload: only ideal_answer is used
 */
export interface AnswerKey {
  correct?: number[] | string[];
  ideal_answer?: string;
  /** Optional explicit method; inferred from question_type otherwise. */
  scoring_method?: 'exact' | 'ranking_weighted' | 'ipsative';
}

/** ICP target + weight per axis, stored on positions.icp_config. */
export type IcpConfig = Partial<Record<AxisType, IcpAxisConfig>>;

export interface IcpAxisConfig {
  /** Desired candidate score on this axis, 1-5. */
  target: number;
  /** Importance weight, 0-5. 0 = axis ignored in composite. */
  weight: number;
}

/** Computed per-axis result on applications.axis_scores. */
export type AxisScores = Partial<Record<AxisType, AxisScore>>;

export interface AxisScore {
  /** Raw average of axis values from candidate's top-ranked options. */
  raw: number;
  /** Match percentage vs ICP target, 0-100. */
  match_pct: number;
}

// ── Insert types ──

export interface PositionInsert {
  title: string;
  description: string;
  department: string;
  contract_type: ContractType;
  location: string;
  salary_min?: number | null;
  salary_max?: number | null;
  status?: PositionStatus;
  pre_quiz_id?: string | null;
  post_quiz_id?: string | null;
  att_quiz_id?: string | null;
  icp_config?: IcpConfig;
  slug: string;
}

export interface QuizInsert {
  title: string;
  description?: string | null;
  quiz_type: QuizType;
  duration_minutes?: number | null;
}

export interface QuizQuestionInsert {
  quiz_id: string;
  question_type: QuestionType;
  question_text: string;
  sort_order: number;
  points?: number;
  axis?: AxisType | null;
  config?: QuestionConfig;
  answer_key?: AnswerKey;
}

export interface CandidateInsert {
  user_id?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  linkedin_url?: string | null;
  work_location?: 'milan' | 'remote' | null;
}

export interface ApplicationInsert {
  position_id: string;
  candidate_id: string;
  cv_file_path: string;
  portfolio_path?: string | null;
  cover_letter?: string | null;
}

export interface ApplicationNoteInsert {
  application_id: string;
  author_id: string;
  content: string;
}

// ── RPC return types ──

export interface GetQuizForCandidateResult {
  quiz_id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  questions: QuizQuestionForCandidate[];
}

export interface SubmitQuizResult {
  total_score: number;
  max_score: number;
  over_time: boolean;
  axis_scores: AxisScores;
  composite_score: number | null;
}
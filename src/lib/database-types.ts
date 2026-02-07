/**
 * Tipi TypeScript del database Supabase — v2
 *
 * Allineato a supabase-schema-v2.sql
 * Auto-generabili con: npx supabase gen types typescript --project-id YOUR_ID
 */

// ── Enums ──

export type UserRole = 'admin' | 'candidate';
export type PositionStatus = 'draft' | 'published' | 'closed' | 'archived';
export type ContractType = 'full-time' | 'part-time' | 'freelance' | 'stage';
export type ApplicationStatus = 'applied' | 'interview' | 'rejected' | 'hired';
export type QuizType = 'logic' | 'skills' | 'attitudinal';
export type QuestionType = 'multiple_choice' | 'open_text' | 'file_upload';

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
  config: QuestionConfig;
  ideal_answer: string | null;
  created_at: string;
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
  status: PositionStatus;
  pre_quiz_id: string | null;
  post_quiz_id: string | null;
  att_quiz_id: string | null;
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

  // Pre-Quiz (logica, 25 min)
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_responses: QuizResponse[] | null;
  pre_quiz_started_at: string | null;
  pre_quiz_completed_at: string | null;
  pre_quiz_over_time: boolean;

  // Post-Quiz (skills, 35 min)
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_responses: QuizResponse[] | null;
  post_quiz_started_at: string | null;
  post_quiz_completed_at: string | null;
  post_quiz_over_time: boolean;

  // Attitudinale (opzionale, no timer)
  att_quiz_responses: QuizResponse[] | null;
  att_quiz_completed_at: string | null;

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

// ── Tipi nested ──

export interface QuizResponse {
  question_id: string;
  answer: string | string[];
  is_correct?: boolean;
  points_earned?: number;
}

export interface QuestionConfig {
  options?: string[];
  correct?: number[];           // indici delle risposte corrette
  allow_multiple?: boolean;
  allowed_types?: string[];     // per file_upload
  max_size_mb?: number;
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
  config?: QuestionConfig;
  ideal_answer?: string | null;
}

export interface CandidateInsert {
  user_id?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  linkedin_url?: string | null;
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
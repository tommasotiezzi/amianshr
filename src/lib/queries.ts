/**
 * Query helpers — thin wrappers around Supabase calls.
 *
 * Purpose:
 *   1. Abort support — pass ctx.signal so stale fetches don't write into stale DOM
 *   2. Normalized error handling — Result type instead of throwing
 *   3. Typed return shapes for the common patterns
 *
 * Pages use these instead of calling supabase directly whenever possible.
 * For one-off queries, calling supabase directly (with .abortSignal(ctx.signal))
 * is still fine.
 *
 * Example:
 *   async mount() {
 *     const res = await q.fetchPositions({ signal: ctx.signal });
 *     if (ctx.signal.aborted) return;
 *     if (res.error) { showToast(res.error, 'error'); return; }
 *     render(res.data);
 *   }
 */

import { supabase } from './supabase-client';
import type {
  Position,
  Quiz,
  QuizQuestion,
  Application,
  ApplicationNote,
  Candidate,
  EmailTemplate,
  PositionStatus,
  ApplicationStatus,
} from './database-types';

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: string };

interface QueryOpts {
  signal?: AbortSignal;
}

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

function fail(error: string): Result<never> {
  return { data: null, error };
}

// ── Positions ──

export interface PositionWithCount extends Position {
  applications_count: number;
}

export async function fetchPositions(
  opts: QueryOpts = {},
): Promise<Result<PositionWithCount[]>> {
  const { data, error } = await supabase
    .from('positions')
    .select('*, applications(count)')
    .order('created_at', { ascending: false })
    .abortSignal(opts.signal!);

  if (error) return fail(error.message);
  return ok((data ?? []).map((p: any) => ({
    ...p,
    applications_count: p.applications?.[0]?.count ?? 0,
  })));
}

export async function fetchPosition(
  id: string,
  opts: QueryOpts = {},
): Promise<Result<Position>> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('id', id)
    .abortSignal(opts.signal!)
    .single();

  if (error) return fail(error.message);
  if (!data) return fail('Position not found');
  return ok(data);
}

export async function updatePositionStatus(
  id: string,
  status: PositionStatus,
): Promise<Result<null>> {
  const payload: Record<string, unknown> = { status };
  if (status === 'published') payload.published_at = new Date().toISOString();
  const { error } = await supabase.from('positions').update(payload).eq('id', id);
  if (error) return fail(error.message);
  return ok(null);
}

// ── Quizzes ──

export interface QuizWithCount extends Quiz {
  questions_count: number;
}

export async function fetchQuizzes(opts: QueryOpts = {}): Promise<Result<QuizWithCount[]>> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*, quiz_questions(count)')
    .order('created_at', { ascending: false })
    .abortSignal(opts.signal!);

  if (error) return fail(error.message);
  return ok((data ?? []).map((q: any) => ({
    ...q,
    questions_count: q.quiz_questions?.[0]?.count ?? 0,
  })));
}

export async function fetchQuizWithQuestions(
  id: string,
  opts: QueryOpts = {},
): Promise<Result<{ quiz: Quiz; questions: QuizQuestion[] }>> {
  const [quizRes, questionsRes] = await Promise.all([
    supabase.from('quizzes').select('*').eq('id', id).abortSignal(opts.signal!).single(),
    supabase.from('quiz_questions').select('*').eq('quiz_id', id).order('sort_order').abortSignal(opts.signal!),
  ]);

  if (quizRes.error) return fail(quizRes.error.message);
  if (!quizRes.data) return fail('Quiz not found');
  if (questionsRes.error) return fail(questionsRes.error.message);

  return ok({ quiz: quizRes.data, questions: questionsRes.data ?? [] });
}

export async function fetchQuizzesMinimal(
  opts: QueryOpts = {},
): Promise<Result<Pick<Quiz, 'id' | 'title' | 'quiz_type'>[]>> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, title, quiz_type')
    .order('title')
    .abortSignal(opts.signal!);

  if (error) return fail(error.message);
  return ok(data ?? []);
}

// ── Applications ──

export interface ApplicationRow extends Pick<
  Application,
  | 'id' | 'status' | 'created_at'
  | 'pre_quiz_score' | 'pre_quiz_max_score' | 'pre_quiz_completed_at' | 'pre_quiz_over_time'
  | 'post_quiz_score' | 'post_quiz_max_score' | 'post_quiz_completed_at' | 'post_quiz_over_time'
  | 'att_quiz_completed_at' | 'composite_score'
> {
  candidate: Pick<Candidate, 'first_name' | 'last_name' | 'email'>;
  position: Pick<Position, 'title' | 'department'>;
}

export async function fetchApplications(
  opts: QueryOpts & { status?: ApplicationStatus } = {},
): Promise<Result<ApplicationRow[]>> {
  let q = supabase
    .from('applications')
    .select(`
      id, status, created_at,
      pre_quiz_score, pre_quiz_max_score, pre_quiz_completed_at, pre_quiz_over_time,
      post_quiz_score, post_quiz_max_score, post_quiz_completed_at, post_quiz_over_time,
      att_quiz_completed_at, composite_score,
      candidate:candidates(first_name, last_name, email),
      position:positions(title, department)
    `)
    .order('created_at', { ascending: false });

  if (opts.status) q = q.eq('status', opts.status);

  const { data, error } = await q.abortSignal(opts.signal!);

  if (error) return fail(error.message);
  return ok((data ?? []).map((a: any) => ({
    ...a,
    candidate: Array.isArray(a.candidate) ? a.candidate[0] : a.candidate,
    position: Array.isArray(a.position) ? a.position[0] : a.position,
  })));
}

export async function fetchApplicationDetail(
  id: string,
  opts: QueryOpts = {},
): Promise<Result<{ application: any; notes: ApplicationNote[] }>> {
  const [appRes, notesRes] = await Promise.all([
    supabase.from('applications').select(`
      *,
      candidate:candidates(first_name, last_name, email, phone, linkedin_url),
      position:positions(title, department, icp_config)
    `).eq('id', id).abortSignal(opts.signal!).single(),
    supabase.from('application_notes').select('*').eq('application_id', id)
      .order('created_at', { ascending: false }).abortSignal(opts.signal!),
  ]);

  if (appRes.error) return fail(appRes.error.message);
  if (!appRes.data) return fail('Application not found');
  if (notesRes.error) return fail(notesRes.error.message);

  const application = {
    ...appRes.data,
    candidate: Array.isArray(appRes.data.candidate) ? appRes.data.candidate[0] : appRes.data.candidate,
    position: Array.isArray(appRes.data.position) ? appRes.data.position[0] : appRes.data.position,
  };

  return ok({ application, notes: notesRes.data ?? [] });
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<Result<null>> {
  const { error } = await supabase.from('applications').update({ status }).eq('id', id);
  if (error) return fail(error.message);
  return ok(null);
}

// ── Application notes ──

export async function addApplicationNote(
  applicationId: string,
  authorId: string,
  content: string,
): Promise<Result<ApplicationNote>> {
  const { data, error } = await supabase
    .from('application_notes')
    .insert({ application_id: applicationId, author_id: authorId, content })
    .select()
    .single();

  if (error) return fail(error.message);
  if (!data) return fail('Insert failed');
  return ok(data);
}

// ── Email templates ──

export async function fetchEmailTemplates(
  opts: QueryOpts = {},
): Promise<Result<EmailTemplate[]>> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('trigger')
    .abortSignal(opts.signal!);

  if (error) return fail(error.message);
  return ok(data ?? []);
}
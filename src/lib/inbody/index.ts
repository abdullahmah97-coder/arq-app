import * as DocumentPicker from 'expo-document-picker';
import { createPlanWithFallback } from '../plan';
import type { PlanInput } from '../plan/types';
import { supabase, uploadImage } from '../supabase';
import type { HealthProfile } from '../types';
import { analyzeInBody } from './analyze';
import { hasEssentials, normalizeMetrics } from './normalize';
import type { InBodyAnalysis, InBodyMetrics } from './types';

export interface InBodyReport {
  id: string;
  user_id: string;
  file_path: string | null;
  test_date: string | null;
  metrics: InBodyMetrics;
  analysis: InBodyAnalysis | null;
  source: 'ai' | 'manual';
  applied: boolean;
  created_at: string;
}

/** مسودة بين شاشة الرفع وشاشة المراجعة */
let draft: { metrics: InBodyMetrics; filePath: string | null; source: 'ai' | 'manual' } | null = null;
export const setDraft = (d: typeof draft) => { draft = d; };
export const getDraft = () => draft;

export async function pickPdf(): Promise<{ uri: string; mimeType: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? (a.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') };
}

/** رفع ملف التقرير إلى الحاوية الخاصة */
export async function uploadReport(userId: string, uri: string, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const path = `${userId}/${Date.now()}.pdf`;
    const body = await (await fetch(uri)).arrayBuffer();
    const { error } = await supabase.storage.from('inbody').upload(path, body, { contentType: mimeType });
    if (error) throw error;
    return path;
  }
  return uploadImage('inbody', userId, uri, mimeType);
}

/** قراءة التقرير بالذكاء الاصطناعي. يرجع null إذا لم تتوفر الخدمة (فننتقل للإدخال اليدوي) */
export async function extractReport(filePath: string): Promise<{ metrics: InBodyMetrics | null; error?: string }> {
  const { data, error } = await supabase.functions.invoke('analyze-inbody', { body: { file_path: filePath } });
  if (error || !data?.metrics) {
    let code = data?.error as string | undefined;
    try { code = code ?? (await (error as any)?.context?.json?.())?.error; } catch { /* ignore */ }
    return { metrics: null, error: code ?? 'ai_failed' };
  }
  return { metrics: normalizeMetrics(data.metrics) };
}

export async function saveReport(userId: string, raw: InBodyMetrics, filePath: string | null, source: 'ai' | 'manual') {
  const metrics = normalizeMetrics(raw);
  if (!hasEssentials(metrics)) throw new Error('missing_essentials');
  const analysis = analyzeInBody(metrics);
  const { data, error } = await supabase.from('inbody_reports').insert({
    user_id: userId, file_path: filePath, test_date: metrics.test_date, metrics, analysis, source,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function listReports(userId: string): Promise<InBodyReport[]> {
  const { data } = await supabase.from('inbody_reports').select('*').eq('user_id', userId)
    .order('test_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(50);
  return (data ?? []) as InBodyReport[];
}

export async function getReport(id: string): Promise<InBodyReport | null> {
  const { data } = await supabase.from('inbody_reports').select('*').eq('id', id).maybeSingle();
  return (data as InBodyReport) ?? null;
}

export async function latestAppliedAnalysis(userId: string): Promise<{ id: string; analysis: InBodyAnalysis } | null> {
  const { data } = await supabase.from('inbody_reports').select('id, analysis').eq('user_id', userId).eq('applied', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data?.analysis ? { id: data.id, analysis: data.analysis as InBodyAnalysis } : null;
}

export async function deleteReport(r: InBodyReport) {
  await supabase.from('inbody_reports').delete().eq('id', r.id);
  if (r.file_path) await supabase.storage.from('inbody').remove([r.file_path]);
}

/**
 * يطبّق التقرير على الخطة: يحدّث الملف الصحي (الوزن، الهدف المقترح، والطول/الجنس إن كانت ناقصة)
 * ثم يولّد خطة جديدة مبنية على التحليل ويربطها بالتقرير
 */
export async function applyReportToPlan(userId: string, report: InBodyReport, health: HealthProfile | null) {
  const m = report.metrics;
  const a = report.analysis ?? analyzeInBody(m);
  const gender = health?.gender ?? m.gender ?? 'male';
  const height = Number(health?.height_cm ?? m.height_cm ?? 170);
  const birthYear = health?.birth_year ?? (m.age ? new Date().getFullYear() - m.age : 1995);

  await supabase.from('health_profiles').update({
    weight_kg: m.weight_kg,
    goal: a.recommended_goal,
    ...(health?.gender ? {} : { gender }),
    ...(health?.height_cm ? {} : { height_cm: height }),
    ...(health?.birth_year ? {} : { birth_year: birthYear }),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  // سجل الوزن مع تاريخ الفحص
  await supabase.from('body_logs').insert({ user_id: userId, weight_kg: m.weight_kg, note: 'InBody' });

  const input: PlanInput = {
    gender,
    age: new Date().getFullYear() - birthYear,
    height_cm: height,
    weight_kg: m.weight_kg!,
    goal: a.recommended_goal,
    level: health?.level ?? 'beginner',
    days_per_week: health?.days_per_week ?? 3,
    inbody: a,
  };
  // خطة بالذكاء الاصطناعي مبنية على التقرير (الدالة تحفظها)، ولو ما زبطت خطة قياسية
  const g = await createPlanWithFallback(userId, input, { inbodyReportId: report.id });
  const planId = g.planId;
  await supabase.from('inbody_reports').update({ applied: false }).eq('user_id', userId).neq('id', report.id);
  await supabase.from('inbody_reports').update({ applied: true }).eq('id', report.id);
  return { planId, source: g.source };
}

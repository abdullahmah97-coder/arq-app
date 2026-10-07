// مكتب أرك أب: ورقة مهمة الوكيل الذكي — ملخص اقتراحه وتفاصيله، تعدّل عليه لو تبي،
// وبعدين «اعتمد ونفّذ» (التطبيق ينفّذه بجلستك بنفس دوال الأقسام) أو «ارفض الاقتراح» (ينسجّل قرارك بس).
// المهام اللي خلصت أو ما كمّلت تنفتح للقراءة بس (القرار، أو سبب الفشل)
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Row, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { approveTask, rejectTask } from '@/lib/officeAgents';
import {
  AGENT_LIMIT_MAX, clampLimits, draftFrom, failReason, isWorking, NOTE_MAX, NUDGE_PLACEHOLDERS, NUDGE_WHO, officeErrorCode, parseProposal,
  prepareFinal, REPLY_MAX, REPORT_FINAL_STATUSES,
  type AgentProposal, type AgentTaskRow, type BriefOutput, type LimitsOutput, type NudgeCat, type NudgeOutput, type PartnerOutput, type Severity, type TriageOutput,
} from '@/lib/officeAgentsCore';
import { agentTaskKind, deskDef, type DeskId, type OfficeRoute } from '@/lib/officeCore';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space, withAlpha } from '@/theme';

type Draft = Record<string, unknown>;

const SEVERITY_COLOR: Record<Severity, string> = { critical: '#C23A12', high: '#F1551D', medium: '#C9822B', low: '#2E9E6A' };
const OK_COLOR = '#2E9E6A';

export function AgentTaskSheet({ task, route, onClose, onChanged, onOpen, onPickDesk }: {
  task: AgentTaskRow;
  route: OfficeRoute;
  onClose: () => void;
  /** بعد الموافقة أو الرفض (يحدّث المكتب) */
  onChanged: () => void;
  onOpen: (route: OfficeRoute) => void;
  /** من ملخص اليوم: يختار المكتب في المشهد */
  onPickDesk?: (id: DeskId) => void;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const insets = useSafeAreaInsets();
  const proposal = useMemo(() => (task.output ? parseProposal(task.kind, task.output) : null), [task.kind, task.output]);
  const [draft, setDraft] = useState<Draft | null>(() => (proposal ? (draftFrom(proposal) as Draft | null) : null));
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  // الاقتراح وصل وهي مفتوحة (كانت شغّالة): نبدأ المسودة منه
  useEffect(() => {
    if (!draft && proposal) setDraft(draftFrom(proposal) as Draft | null);
  }, [draft, proposal]);

  const waiting = task.status === 'waiting_approval';
  const working = isWorking(task.status);
  const canApprove = waiting && !!proposal && proposal.kind !== 'daily_brief' && !!draft;
  const d = deskDef(task.desk);
  const set = (patch: Draft) => setDraft((x) => ({ ...(x ?? {}), ...patch }));
  // اللي خلص: نعرض اللي انطبق فعلاً (final)، وإلا اقتراح الوكيل نفسه
  const applied = useMemo(() => {
    if (task.decision !== 'approved' || !task.final) return null;
    const p = prepareFinal(task.kind, task.final);
    return 'error' in p ? null : (p.final as unknown as Draft);
  }, [task.decision, task.final, task.kind]);
  const value: Draft | null = waiting ? draft : applied ?? (proposal ? (draftFrom(proposal) as Draft | null) : null);

  const showError = (e: unknown) => {
    const code = officeErrorCode(e);
    if (code === 'already_decided') {
      Alert.alert(t('office.err_already_decided'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('office.closeTask'), onPress: () => { void reject(t('office.closedNote')); } },
      ]);
    } else {
      Alert.alert(code ? t(`office.err_${code}`) : t(errorKey(e)));
    }
  };

  const approve = async () => {
    if (!canApprove) return;
    const ready = prepareFinal(task.kind, draft);
    if ('error' in ready) return Alert.alert(t(`office.err_final_${ready.error}`));
    setBusy('approve');
    try {
      await approveTask(task, ready.final);
      onChanged();
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const reject = async (note?: string) => {
    setBusy('reject');
    try {
      await rejectTask(task, note);
      onChanged();
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const when = task.decided_at ?? task.finished_at ?? task.created_at;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
          <View style={{ maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: Math.max(insets.bottom, space.md) }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: space.sm }} />

            {/* الرأس: المكتب ونوع المهمة وحالتها */}
            <Row gap={space.md} style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: d.shirt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={20} color={brand.cream} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T bold numberOfLines={2}>{t(`office.kind_${agentTaskKind(task)}`, { n: 0 })}</T>
                <T size="xs" muted numberOfLines={1}>{[t(`office.sign_${task.desk}`), timeAgo(when, lng)].filter(Boolean).join(' · ')}</T>
              </View>
              <StatusPill status={task.status} />
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </Row>

            <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
              {task.title ? <T semibold>{task.title}</T> : null}

              {working ? (
                <Row gap={space.sm} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt }}>
                  <ActivityIndicator color={colors.primary} />
                  <T size="sm" style={{ flex: 1 }}>{t('office.sh_working')}</T>
                </Row>
              ) : null}

              {task.status === 'failed' ? (
                <Box tone={colors.danger}>
                  <T size="sm" semibold color={colors.danger}>{t('office.sh_failed')}</T>
                  <T size="sm">{t(`office.aerr_${failReason(task.error)}`)}</T>
                </Box>
              ) : null}

              {!working && task.status !== 'failed' && !proposal ? <T size="sm" muted>{t('office.sh_unreadable')}</T> : null}

              {proposal ? (
                <ProposalView p={proposal} task={task} value={value} editable={canApprove} set={set} onPickDesk={onPickDesk ? (id) => { onClose(); onPickDesk(id); } : undefined} />
              ) : null}

              {/* القرار (للمهام اللي خلصت) */}
              {task.decision ? (
                <Box tone={task.decision === 'approved' ? OK_COLOR : colors.muted}>
                  <Row gap={6}>
                    <Ionicons name={task.decision === 'approved' ? 'checkmark-circle' : 'close-circle'} size={18} color={task.decision === 'approved' ? OK_COLOR : colors.muted} />
                    <T size="sm" semibold>{t(task.decision === 'approved' ? 'office.sh_approved' : 'office.sh_rejected')}</T>
                    {task.decided_at ? <T size="xs" muted>{timeAgo(task.decided_at, lng)}</T> : null}
                  </Row>
                  {task.decision_note ? <T size="sm">{task.decision_note}</T> : null}
                </Box>
              ) : null}

              {rejecting ? (
                <View style={{ gap: space.sm }}>
                  <Input value={rejectNote} onChangeText={setRejectNote} placeholder={t('office.rejectNotePh')} maxLength={NOTE_MAX} />
                  <T size="xs" muted>{t('office.rejectHint')}</T>
                </View>
              ) : null}
            </ScrollView>

            {/* الأزرار: اعتمد ونفّذ / ارفض / افتح القسم */}
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              {rejecting ? (
                <Row gap={space.sm}>
                  <View style={{ flex: 1 }}>
                    <Button variant="danger" icon="close-circle-outline" title={t('office.rejectConfirm')} loading={busy === 'reject'} disabled={!!busy} onPress={() => reject(rejectNote)} />
                  </View>
                  <Button variant="ghost" title={t('common.cancel')} disabled={!!busy} onPress={() => setRejecting(false)} />
                </Row>
              ) : (
                <>
                  {canApprove ? <Button icon="checkmark-circle-outline" title={t('office.approve')} loading={busy === 'approve'} disabled={!!busy} onPress={approve} /> : null}
                  <Row gap={space.sm}>
                    {waiting ? (
                      <View style={{ flex: 1 }}>
                        <Button small variant="secondary" title={t('office.reject')} disabled={!!busy} onPress={() => setRejecting(true)} />
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Button small variant="ghost" icon="open-outline" title={t('office.openSection')} disabled={!!busy} onPress={() => { onClose(); onOpen(route); }} />
                    </View>
                  </Row>
                </>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StatusPill({ status }: { status: AgentTaskRow['status'] }) {
  const { t } = useTranslation();
  const map = { waiting_approval: ['st_waiting', '#F1551D'], scheduled: ['st_scheduled', '#5B8DEF'], in_progress: ['st_in_progress', '#C9822B'], done: ['st_done', '#2E9E6A'], failed: ['st_failed', colors.danger] } as const;
  const [key, color] = map[status];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: withAlpha(color, 0.14) }}>
      <T size="xs" semibold color={color}>{t(`office.${key}`)}</T>
    </View>
  );
}

function Box({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: withAlpha(tone, 0.4), backgroundColor: withAlpha(tone, 0.06) }}>
      {children}
    </View>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: withAlpha(color, 0.14) }}>
      <T size="xs" semibold color={color}>{label}</T>
    </View>
  );
}

/** اختيار من شرائح (تنعرض كقيمة بس لما تكون للقراءة) */
function Chips<V extends string>({ options, value, onChange, editable }: {
  options: { value: V; label: string }[]; value: V | undefined; onChange: (v: V) => void; editable: boolean;
}) {
  if (!editable) {
    const cur = options.find((o) => o.value === value);
    return cur ? <View style={{ flexDirection: 'row' }}><Pill label={cur.label} color={colors.text} /></View> : null;
  }
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: on ? brand.deepGreen : colors.border,
              backgroundColor: on ? brand.deepGreen : colors.card, paddingHorizontal: 12, paddingVertical: 7 }}>
            <T size="xs" semibold color={on ? brand.cream : colors.text}>{o.label}</T>
          </Pressable>
        );
      })}
    </Row>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T size="sm" semibold>{title}</T>
      {children}
      {hint ? <T size="xs" muted style={{ lineHeight: 18 }}>{hint}</T> : null}
    </View>
  );
}

/** نص تعدّله (أو تقراه لما تكون المهمة منتهية) */
function Field({ value, onChange, editable, maxLength, multiline, placeholder, numeric }: {
  value: string; onChange: (v: string) => void; editable: boolean; maxLength: number; multiline?: boolean; placeholder?: string; numeric?: boolean;
}) {
  if (!editable) return value ? <T size="sm" style={{ lineHeight: 22 }}>{value}</T> : <T size="sm" muted>—</T>;
  return (
    <Input value={value} onChangeText={onChange} maxLength={maxLength} multiline={multiline} placeholder={placeholder}
      keyboardType={numeric ? 'number-pad' : 'default'} style={multiline ? { minHeight: 90 } : undefined} />
  );
}

const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function ProposalView({ p, task, value, editable, set, onPickDesk }: {
  p: AgentProposal; task: AgentTaskRow; value: Draft | null; editable: boolean; set: (patch: Draft) => void; onPickDesk?: (id: DeskId) => void;
}) {
  const { L } = useLocalized();
  const summary = p.kind === 'daily_brief' ? null : 'summary' in p.out ? p.out.summary : p.out.why;
  return (
    <View style={{ gap: space.md }}>
      {summary ? (
        <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <T size="sm" style={{ lineHeight: 22 }}>{L(summary)}</T>
        </View>
      ) : null}
      {p.kind === 'triage_report' ? <TriageView out={p.out} value={value} editable={editable} set={set} /> : null}
      {p.kind === 'review_partner' ? <PartnerView out={p.out} value={value} editable={editable} set={set} /> : null}
      {p.kind === 'draft_nudge' ? <NudgeView out={p.out} value={value} editable={editable} set={set} /> : null}
      {p.kind === 'review_ai_limits' ? <LimitsView out={p.out} task={task} value={value} editable={editable} set={set} /> : null}
      {p.kind === 'daily_brief' ? <BriefView out={p.out} onPickDesk={onPickDesk} /> : null}
    </View>
  );
}

type ViewProps<O> = { out: O; value: Draft | null; editable: boolean; set: (patch: Draft) => void };

function TriageView({ out, value, editable, set }: ViewProps<TriageOutput>) {
  const { t } = useTranslation();
  const lang = t(`nudge.lang_${out.reply_locale}`);
  return (
    <>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Pill label={t(`office.sev_${out.severity}`)} color={SEVERITY_COLOR[out.severity]} />
        <Pill label={t('office.sh_category', { v: t(`beta.cat_${out.category_guess}`) })} color={colors.muted} />
      </Row>
      <Section title={t('office.sh_reportStatus')}>
        <Chips editable={editable} value={value?.status as string | undefined} onChange={(v) => set({ status: v })}
          options={REPORT_FINAL_STATUSES.map((st) => ({ value: st, label: t(`owner.st_${st}`) }))} />
      </Section>
      <Section title={t('office.sh_reply')} hint={t('office.sh_replyHint', { lang })}>
        <Field editable={editable} multiline maxLength={REPLY_MAX} value={s(value?.reply)} onChange={(v) => set({ reply: v })} />
      </Section>
    </>
  );
}

function PartnerView({ out, value, editable, set }: ViewProps<PartnerOutput>) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const lang = t(`nudge.lang_${out.note_locale}`);
  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        <Pill label={t('office.sh_confidence', { v: t(`office.conf_${out.confidence}`) })} color={out.confidence === 'high' ? OK_COLOR : out.confidence === 'medium' ? '#C9822B' : colors.danger} />
      </View>
      {out.checks.length ? (
        <Section title={t('office.sh_checks')}>
          {out.checks.map((c, i) => (
            <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
              <Ionicons name={c.ok ? 'checkmark-circle' : 'close-circle'} size={18} color={c.ok ? OK_COLOR : colors.danger} accessibilityLabel={c.ok ? '✓' : '✗'} />
              <T size="sm" style={{ flex: 1 }}>{L(c.label)}</T>
            </Row>
          ))}
        </Section>
      ) : null}
      {out.missing.length ? (
        <Section title={t('office.sh_missing')}>
          {out.missing.map((m, i) => <T key={i} size="sm">• {L(m)}</T>)}
        </Section>
      ) : null}
      <Section title={t('office.sh_decision')}>
        <Chips editable={editable} value={value?.decision as string | undefined} onChange={(v) => set({ decision: v })}
          options={[{ value: 'approve', label: t('office.dec_approve') }, { value: 'reject', label: t('office.dec_reject') }]} />
      </Section>
      <Section title={t('office.sh_note')} hint={editable ? t('office.sh_noteHint', { lang }) : undefined}>
        <Field editable={editable} multiline maxLength={NOTE_MAX} value={s(value?.note)} onChange={(v) => set({ note: v })} />
      </Section>
    </>
  );
}

function NudgeView({ out, value, editable, set }: ViewProps<NudgeOutput>) {
  const { t } = useTranslation();
  const tpl = (value?.template ?? out.template) as Record<string, unknown>;
  const category = out.template.category as NudgeCat;
  const patch = (x: Record<string, unknown>) => set({ template: { ...tpl, ...x } });
  const vars = NUDGE_PLACEHOLDERS[category].map((v) => `{${v}}`).join(' ');
  const who = { all: t('nudge.aud_all'), male: t('nudge.g_male'), female: t('nudge.g_female') };
  return (
    <>
      <View style={{ flexDirection: 'row' }}><Pill label={t('office.sh_nudgeCat', { v: t(`nudge.cat_${category}`) })} color={brand.orange} /></View>
      <Section title={t('office.sh_nudgeTitle')}>
        <Field editable={editable} maxLength={80} value={s(tpl.title)} onChange={(v) => patch({ title: v })} />
      </Section>
      <Section title={t('office.sh_nudgeBody')} hint={editable ? t('office.sh_vars', { vars }) : undefined}>
        <Field editable={editable} multiline maxLength={240} value={s(tpl.body)} onChange={(v) => patch({ body: v })} />
      </Section>
      <Section title={t('office.sh_gender')}>
        <Chips editable={editable} value={tpl.gender as string | undefined} onChange={(v) => patch({ gender: v })}
          options={NUDGE_WHO.map((g) => ({ value: g, label: who[g] }))} />
      </Section>
      <Section title={t('office.sh_locale')}>
        <Chips editable={editable} value={tpl.locale as string | undefined} onChange={(v) => patch({ locale: v })}
          options={(['ar', 'en'] as const).map((l) => ({ value: l, label: t(`nudge.lang_${l}`) }))} />
      </Section>
      {editable ? <T size="xs" muted style={{ lineHeight: 18 }}>{t('office.sh_paused')}</T> : null}
    </>
  );
}

function LimitsView({ out, task, value, editable, set }: ViewProps<LimitsOutput> & { task: AgentTaskRow }) {
  const { t } = useTranslation();
  const cur = (task.input.current && typeof task.input.current === 'object') ? clampLimits(task.input.current as Record<string, unknown>) : null;
  const rows = [
    { key: 'barcode_per_day' as const, label: t('aiLimits.barcode_per_day') },
    { key: 'meal_photos_per_day' as const, label: t('aiLimits.meal_photos_per_day') },
  ];
  return (
    <Section title={t('office.sh_limits')}>
      {rows.map((r) => (
        <Row key={r.key} gap={space.md} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T size="sm" semibold>{r.label}</T>
            {cur ? <T size="xs" muted>{t('office.sh_limitNow', { n: cur[r.key] })} · 0–{AGENT_LIMIT_MAX[r.key]}</T> : null}
          </View>
          <View style={{ width: 90 }}>
            <Field editable={editable} numeric maxLength={3} value={s(value?.[r.key] ?? out[r.key])} onChange={(v) => set({ [r.key]: v })} />
          </View>
        </Row>
      ))}
    </Section>
  );
}

function BriefView({ out, onPickDesk }: { out: BriefOutput; onPickDesk?: (id: DeskId) => void }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  return (
    <>
      <T size="lg" bold>{L(out.headline)}</T>
      {out.points.length ? (
        <Section title={t('office.sh_points')}>
          {out.points.map((p, i) => <T key={i} size="sm" style={{ lineHeight: 22 }}>• {L(p)}</T>)}
        </Section>
      ) : null}
      {out.priorities.length ? (
        <Section title={t('office.sh_priorities')}>
          {out.priorities.map((p, i) => {
            const dd = deskDef(p.desk);
            return (
              <Pressable key={i} disabled={!onPickDesk} onPress={() => onPickDesk?.(p.desk)} accessibilityRole={onPickDesk ? 'button' : undefined}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md,
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: withAlpha(dd.shirt, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={dd.icon as never} size={15} color={dd.shirt} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size="xs" semibold color={dd.shirt}>{t(`office.sign_${p.desk}`)}</T>
                  <T size="sm">{L(p.text)}</T>
                </View>
              </Pressable>
            );
          })}
        </Section>
      ) : null}
    </>
  );
}

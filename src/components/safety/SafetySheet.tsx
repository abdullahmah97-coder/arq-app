// قائمة «⋯» على محتوى شخص ثاني: بلّغ عنه، أو احظر صاحبه (شرط App Store رقم 1.2)
// خطوات داخل نفس القائمة: الخيارات ← سبب البلاغ (و«سبب آخر» يفتح خانة كتابة) ← شكراً، وتأكيد الحظر.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';
import { ChatSheet, type SheetAction } from '@/components/chat/ChatSheet';
import { PromptModal } from '@/components/PromptModal';
import { errorKey } from '@/lib/supabase';
import { blockUser, REPORT_REASONS, reportContent, unblockUser, type ReportReason, type ReportTarget } from '@/lib/safety';

const AFTER_SHEET = Platform.OS === 'ios' ? 450 : 60;
const later = (fn: () => void) => setTimeout(fn, AFTER_SHEET);

export interface SafetyTarget {
  type: ReportTarget;
  id: string;
  /** صاحب المحتوى */
  userId: string;
  /** اسمه كما يبان (للعناوين) */
  name: string;
}

type Step = 'menu' | 'reasons' | 'block';

export function SafetySheet({ target, onClose, onBlocked, onUnblocked, extra, blockedByMe, startAt = 'menu' }: {
  target: SafetyTarget | null;
  onClose: () => void;
  /** بعد الحظر: الشاشة ترجع أو تحدّث القائمة */
  onBlocked?: (userId: string) => void;
  onUnblocked?: (userId: string) => void;
  /** خيارات إضافية فوق (مثل حذف تعليق على منشورك) */
  extra?: SheetAction[];
  /** أنا حاظره (يطلع «إلغاء الحظر» بدل «حظر») */
  blockedByMe?: boolean;
  /** يفتح على سبب البلاغ مباشرة (مثل «بلّغ» من قائمة الرسالة) */
  startAt?: Step;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(startAt);
  const [noteFor, setNoteFor] = useState<SafetyTarget | null>(null);
  // كل فتح جديد يبدأ من أول خطوة (بالمفتاح، مو بالكائن: الشاشة ممكن تبني الهدف من جديد مع كل رسم)
  const key = target ? `${target.type}:${target.id}` : '';
  useEffect(() => { if (key) setStep(startAt); }, [key, startAt]);
  if (!target && !noteFor) return null;

  const what = target ? t(`safety.what_${target.type}`) : '';

  const send = async (tg: SafetyTarget, reason: ReportReason, note?: string) => {
    try {
      const r = await reportContent(tg.type, tg.id, reason, note);
      later(() => Alert.alert(t('safety.thanksTitle'), r.hidden ? t('safety.thanksHidden') : t('safety.thanksBody'),
        tg.type === 'user' || blockedByMe ? [{ text: t('common.ok') }] : [
          { text: t('common.ok'), style: 'cancel' },
          { text: t('safety.blockName', { name: tg.name }), style: 'destructive', onPress: () => confirmBlock(tg) },
        ]));
    } catch (e) {
      later(() => Alert.alert(t(errorKey(e))));
    }
  };

  const doBlock = async (tg: SafetyTarget) => {
    try {
      await blockUser(tg.userId);
      later(() => Alert.alert(t('safety.blockedTitle', { name: tg.name }), t('safety.blockedBody')));
      onBlocked?.(tg.userId);
    } catch (e) {
      later(() => Alert.alert(t(errorKey(e))));
    }
  };
  // تأكيد الحظر بعد البلاغ (بنافذة تنبيه، لأن القائمة انقفلت)
  const confirmBlock = (tg: SafetyTarget) => Alert.alert(t('safety.blockQ', { name: tg.name }), t('safety.blockExplain'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('safety.block'), style: 'destructive', onPress: () => doBlock(tg) },
  ]);

  let title: string | undefined;
  let subtitle: string | undefined;
  let actions: SheetAction[] = [];
  if (target && step === 'menu') {
    actions = [
      ...(extra ?? []),
      ...(target.type === 'user' ? [] : [{ key: 'report', label: t('safety.reportWhat', { what }), icon: 'flag-outline' as const, onPress: () => setStep('reasons') }]),
      ...(target.type === 'user' ? [{ key: 'reportUser', label: t('safety.reportUser'), icon: 'flag-outline' as const, onPress: () => setStep('reasons') }] : []),
      blockedByMe
        ? { key: 'unblock', label: t('safety.unblockName', { name: target.name }), icon: 'lock-open-outline' as const,
            onPress: async () => {
              onClose();
              try { await unblockUser(target.userId); onUnblocked?.(target.userId); } catch (e) { later(() => Alert.alert(t(errorKey(e)))); }
            } }
        : { key: 'block', label: t('safety.blockName', { name: target.name }), icon: 'ban-outline' as const, destructive: true, onPress: () => setStep('block') },
    ];
  } else if (target && step === 'reasons') {
    title = t('safety.whyTitle', { what });
    subtitle = t('safety.whyHint');
    actions = REPORT_REASONS.map((r) => ({
      key: r, label: t(`safety.reason_${r}`),
      onPress: () => {
        const tg = target;
        onClose();
        if (r === 'other') later(() => setNoteFor(tg));
        else send(tg, r);
      },
    }));
  } else if (target && step === 'block') {
    title = t('safety.blockQ', { name: target.name });
    subtitle = t('safety.blockExplain');
    actions = [{ key: 'confirm', label: t('safety.block'), icon: 'ban-outline', destructive: true, onPress: () => { const tg = target; onClose(); doBlock(tg); } }];
  }

  return (
    <>
      <ChatSheet visible={!!target} title={title} subtitle={subtitle} actions={actions} onClose={onClose} />
      <PromptModal visible={!!noteFor} title={t('safety.otherTitle')} message={t('safety.otherHint')}
        fields={[{ key: 'note', placeholder: t('safety.otherPlaceholder'), multiline: true, maxLength: 500 }]}
        confirm={t('safety.send')}
        onSubmit={async (v) => { const tg = noteFor; setNoteFor(null); if (tg) await send(tg, 'other', v.note); }}
        onClose={() => setNoteFor(null)} />
    </>
  );
}

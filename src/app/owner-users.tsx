// لوحة إدارة التطبيق ← المتدربين: العدد والإيميلات، بحث، تعديل الاسم واسم المستخدم، وحذف الحساب نهائياً
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { adminDeleteUser, adminUpdateUser, adminUserList, adminUserStats, displayName, PAGE_SIZE, type AdminUser, type AdminUserStats, type UserKind } from '@/lib/adminUsers';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { isAdmin } from '@/lib/owner';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

export default function OwnerUsers() {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [kind, setKind] = useState<UserKind>('trainee');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const seq = useRef(0);

  const loadStats = useCallback(() => { adminUserStats().then(setStats).catch(() => {}); }, []);
  const loadRows = useCallback(async (k: UserKind, q: string) => {
    const my = ++seq.current;
    try {
      const r = await adminUserList({ kind: k, search: q });
      if (my !== seq.current) return;
      setRows(r.rows); setTotal(r.total);
    } catch (e) {
      if (my === seq.current) { setRows([]); setTotal(0); }
      Alert.alert(t(errorKey(e)));
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    isAdmin().then((a) => { setOk(a); if (a) loadStats(); }).catch(() => setOk(false));
  }, [loadStats]));

  // البحث بعد ما يوقف الكتابة شوي، والنوع على طول
  useEffect(() => {
    if (!ok) return;
    const h = setTimeout(() => { loadRows(kind, query); }, query ? 350 : 0);
    return () => clearTimeout(h);
  }, [ok, kind, query, loadRows]);

  const loadMore = async () => {
    if (!rows) return;
    setMore(true);
    try {
      const r = await adminUserList({ kind, search: query, offset: rows.length });
      setRows((cur) => [...(cur ?? []), ...r.rows.filter((x) => !(cur ?? []).some((y) => y.id === x.id))]);
      setTotal(r.total);
    } catch (e) { Alert.alert(t(errorKey(e))); }
    setMore(false);
  };

  const onChanged = (u: AdminUser) => setRows((cur) => cur?.map((x) => (x.id === u.id ? u : x)) ?? null);
  const onDeleted = (id: string) => {
    setRows((cur) => cur?.filter((x) => x.id !== id) ?? null);
    setTotal((n) => Math.max(0, n - 1));
    loadStats();
  };

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('adminUsers.title') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="people" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('adminUsers.eyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('adminUsers.headline')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('adminUsers.intro')}</T>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat n={stats?.trainees} label={t('adminUsers.st_trainees')} color={brand.orange} />
        <Stat n={stats?.new7d} label={t('adminUsers.st_new')} color={brand.green} />
        <Stat n={stats?.active7d} label={t('adminUsers.st_active')} color={brand.deepGreen} />
      </View>
      {stats ? <T size="xs" muted>{t('adminUsers.summary', { total: stats.total, partners: stats.partners, unconfirmed: stats.unconfirmed })}</T> : null}

      <Segmented<UserKind> value={kind} onChange={(k) => { setRows(null); setKind(k); }} options={[
        { value: 'trainee', label: t('adminUsers.kind_trainee') },
        { value: 'partner', label: t('adminUsers.kind_partner') },
        { value: 'all', label: t('adminUsers.kind_all') },
      ]} />
      <Input value={query} onChangeText={setQuery} placeholder={t('adminUsers.searchPh')} autoCapitalize="none" autoCorrect={false}
        clearButtonMode="while-editing" returnKeyType="search" />

      {!rows ? <Loading /> : !rows.length ? (
        <Empty icon="people-outline" text={query ? t('adminUsers.noneSearch') : t('adminUsers.none')} />
      ) : (
        <>
          <T size="xs" muted>{t('adminUsers.results', { count: total })}</T>
          {rows.map((u) => <UserCard key={u.id} u={u} onChanged={onChanged} onDeleted={onDeleted} />)}
          {rows.length < total ? (
            <Button variant="secondary" icon="chevron-down" title={t('adminUsers.more', { n: Math.min(PAGE_SIZE, total - rows.length) })} loading={more} onPress={loadMore} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Stat({ n, label, color }: { n: number | undefined; label: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 }}>
      <Num size={26} color={color}>{n == null ? '—' : String(n)}</Num>
      <T size="xs" muted>{label}</T>
    </View>
  );
}

function Chip({ icon, text, color = colors.muted }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Ionicons name={icon} size={12} color={color} />
      <T size="xs" color={color === colors.muted ? colors.text : color}>{text}</T>
    </View>
  );
}

function UserCard({ u, onChanged, onDeleted }: { u: AdminUser; onChanged: (u: AdminUser) => void; onDeleted: (id: string) => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(u.full_name ?? '');
  const [uname, setUname] = useState(u.username);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const me = u.id === userId;
  const trainee = u.account_type === 'trainee';
  const canDelete = trainee && !u.is_admin && !me;
  const gym = lng === 'en' && u.gym_name_en ? u.gym_name_en : u.gym_name;

  const startEdit = () => { setName(u.full_name ?? ''); setUname(u.username); setEditing(true); };
  const save = async () => {
    const un = uname.trim().toLowerCase();
    if (!USERNAME_RE.test(un)) return Alert.alert(t('errors.invalidUsername'), t('adminUsers.usernameHint'));
    if (name.trim().length > 60) return Alert.alert(t('srv.name_too_long'));
    setBusy('save');
    try {
      await adminUpdateUser(u.id, name, un);
      onChanged({ ...u, full_name: name.trim() || null, username: un });
      setEditing(false);
    } catch (e) { Alert.alert(t(errorKey(e))); }
    setBusy(null);
  };
  const remove = () => Alert.alert(t('adminUsers.deleteTitle', { name: displayName(u) }), t('adminUsers.deleteBody', { email: u.email }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('adminUsers.deleteBtn'), style: 'destructive', onPress: async () => {
      setBusy('delete');
      try { await adminDeleteUser(u.id); onDeleted(u.id); } catch (e) { setBusy(null); Alert.alert(t(errorKey(e))); }
    } },
  ]);

  return (
    <Card style={{ gap: space.sm, opacity: busy === 'delete' ? 0.5 : 1 }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })} accessibilityRole="link" accessibilityLabel={displayName(u)}>
          <Avatar size={46} uri={publicUrl('avatars', u.avatar_url)} name={displayName(u)} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <T bold numberOfLines={1} style={{ flexShrink: 1 }}>{displayName(u)}</T>
            {u.is_admin ? <Badge text={t('adminUsers.admin')} bg={brand.deepGreen} fg={brand.cream} /> : null}
            {me ? <Badge text={t('adminUsers.you')} bg={brand.sand} fg={brand.deepGreen} /> : null}
          </Row>
          <T size="xs" muted numberOfLines={1}>@{u.username}{!trainee ? ` · ${t(`partners.acct_${u.account_type}`, { defaultValue: u.account_type })}` : ''}{trainee && u.partner_intent ? ` · ${t('partners.wantsToBe', { type: t(`partners.acct_${u.partner_intent}`, { defaultValue: u.partner_intent }) })}` : ''}</T>
          <T size="sm" numberOfLines={1} style={{ writingDirection: 'ltr', textAlign: lng === 'ar' ? 'right' : 'left' }}>{u.email}</T>
        </View>
      </Row>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip icon="calendar-outline" text={t('adminUsers.joined', { when: timeAgo(u.created_at, lng) })} />
        <Chip icon="time-outline" text={u.last_sign_in_at ? t('adminUsers.lastSeen', { when: timeAgo(u.last_sign_in_at, lng) }) : t('adminUsers.neverSeen')} />
        {u.email_confirmed
          ? <Chip icon="checkmark-circle" text={t('adminUsers.confirmed')} color="#2E8B57" />
          : <Chip icon="alert-circle" text={t('adminUsers.unconfirmed')} color={brand.orange} />}
        {gym ? <Chip icon="barbell-outline" text={gym} /> : null}
        {u.points ? <Chip icon="star-outline" text={t('adminUsers.points', { n: u.points })} /> : null}
      </View>

      {editing ? (
        <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border }}>
          <Input label={t('adminUsers.fullName')} value={name} onChangeText={setName} maxLength={60} />
          <Input label={t('adminUsers.username')} value={uname} onChangeText={setUname} autoCapitalize="none" autoCorrect={false} maxLength={24}
            hint={t('adminUsers.usernameHint')} />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Button small icon="checkmark" title={t('common.save')} loading={busy === 'save'} onPress={save} /></View>
            <View style={{ flex: 1 }}><Button small variant="secondary" title={t('common.cancel')} onPress={() => setEditing(false)} /></View>
          </Row>
        </View>
      ) : (
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Button small variant="secondary" icon="create-outline" title={t('adminUsers.edit')} onPress={startEdit} /></View>
          <View style={{ flex: 1 }}><Button small variant="secondary" icon="person-outline" title={t('adminUsers.profile')} onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })} /></View>
          {canDelete ? (
            <View style={{ flex: 1 }}><Button small variant="danger" icon="trash-outline" title={t('adminUsers.delete')} loading={busy === 'delete'} onPress={remove} /></View>
          ) : null}
        </Row>
      )}
      {!trainee ? <T size="xs" muted>{t('adminUsers.partnerNote')}</T> : null}
    </Card>
  );
}

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 }}>
      <T size="xs" semibold color={fg}>{text}</T>
    </View>
  );
}

// بطاقة أرك في Apple Wallet: التطبيق يطلب رابط لمرة وحدة ويفتحه في Safari، وSafari يعرض «أضف إلى Apple Wallet»
import { Linking, Platform } from 'react-native';
import { SUPABASE_URL, supabase } from './supabase';

const FN = `${SUPABASE_URL}/functions/v1/wallet-pass`;
let cached: { at: number; enabled: boolean } | null = null;

/** هل البطاقة جاهزة بالسيرفر؟ (iPhone فقط) */
export async function walletEnabled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.enabled;
  try {
    const r = await fetch(`${FN}?check=1`);
    const j = r.ok ? await r.json() : null;
    cached = { at: Date.now(), enabled: !!j?.enabled };
  } catch { cached = { at: Date.now(), enabled: false }; }
  return cached.enabled;
}

export async function addToWallet() {
  const { data, error } = await supabase.rpc('wallet_link');
  if (error) throw error;
  const row = ((data ?? []) as { token: string }[])[0];
  if (!row) throw new Error('code_not_found');
  await Linking.openURL(`${FN}?t=${row.token}`);
}

export interface WalletStatus { has_pass: boolean; code_hint: string | null; rotated_at: string | null; last_used_at: string | null }
export async function myWalletPass(): Promise<WalletStatus | null> {
  const { data, error } = await supabase.rpc('my_wallet_pass');
  if (error) return null;
  return ((data ?? []) as WalletStatus[])[0] ?? null;
}
export async function revokeWalletPass() {
  const { error } = await supabase.rpc('revoke_wallet_pass');
  if (error) throw error;
}

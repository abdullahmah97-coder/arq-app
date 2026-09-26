// الويب/المعاينة: لا يوجد Apple Health ولا Health Connect → بيانات تجريبية واقعية لعرض الواجهة.
import { demoDays } from './demo';
import type { HealthProvider } from './provider-types';

export const provider: HealthProvider = {
  id: 'demo',
  isAvailable: async () => true,
  requestAccess: async () => true,
  readDays: async (n) => demoDays(n),
};

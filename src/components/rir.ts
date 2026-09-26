// نافذة شرح RIR (تُستخدم في الخطة والبرامج والتسجيل)
import { Alert } from 'react-native';
import { RIR_INFO } from '../content/programs';

export const showRir = (lng: 'ar' | 'en') => Alert.alert(RIR_INFO.title[lng], RIR_INFO.body[lng]);

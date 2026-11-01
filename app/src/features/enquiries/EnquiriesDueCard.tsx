import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, type } from '../../theme';
import { useEnquiries } from './api';

/** On Home, only when someone is waiting for a call back: how many follow-ups are due today or earlier. */
export function EnquiriesDueCard() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const q = useEnquiries();
  const due = q.data?.dueFollowUps ?? 0;
  if (!due) return null;
  return (
    <Pressable onPress={() => nav.navigate('Enquiries')} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.md,
            backgroundColor: colors.warningSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="call-outline" size={18} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{t('enquiries.dueTitle', { count: due })}</Text>
          <Text style={type.caption}>{t('enquiries.dueText')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>
    </Pressable>
  );
}

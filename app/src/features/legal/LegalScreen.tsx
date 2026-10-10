import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components';
import { open } from '../../lib/contact';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import legal from './legal.json';

export type LegalDoc = 'privacy' | 'terms';
export const LEGAL = legal;
export const SUPPORT_EMAIL = legal.email;
export const mailto = (subject = 'Chalkpis') =>
  `mailto:${legal.email}?subject=${encodeURIComponent(subject)}`;

/** Privacy Policy or Terms and Conditions, readable inside the app (same text as the website). */
export function LegalScreen({ route }: NativeStackScreenProps<MainStackParams, 'Legal'>) {
  const doc = legal[route.params.doc];
  return (
    <Screen>
      <Text style={type.title1}>{doc.title}</Text>
      <Text style={[type.footnote, { marginBottom: spacing.md }]}>Last updated {doc.updated}</Text>
      <Text style={[type.callout, { lineHeight: 23 }]}>{doc.intro}</Text>
      {doc.sections.map((s) => (
        <View key={s.h} style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Text style={type.title3} accessibilityRole="header">
            {s.h}
          </Text>
          {s.p.map((para) => (
            <Text
              key={para.slice(0, 40)}
              style={[type.callout, { lineHeight: 23, color: colors.text }]}
            >
              {para}
            </Text>
          ))}
        </View>
      ))}
      <Text
        style={[
          type.callout,
          { color: colors.primaryDark, marginTop: spacing.xl, marginBottom: spacing.xxl },
        ]}
        onPress={() => void open(mailto(doc.title))}
        accessibilityRole="link"
      >
        {legal.email}
      </Text>
    </Screen>
  );
}

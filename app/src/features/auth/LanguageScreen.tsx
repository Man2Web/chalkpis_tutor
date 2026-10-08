import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, Screen } from '../../components';
import { setLanguage, type Lang } from '../../lib/language';
import type { AuthStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';

export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParams, 'Language'>) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<Lang>(i18n.language === 'hi' ? 'hi' : 'en');

  const pick = (l: Lang) => {
    setLang(l);
    void setLanguage(l);
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
        <Text style={type.title}>{t('app.name')}</Text>
        <Text style={type.caption}>{t('app.tagline')}</Text>
        <Text style={[type.heading, { marginTop: spacing.xl }]}>{t('language.title')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Chip label="English" selected={lang === 'en'} onPress={() => pick('en')} />
          <Chip label="हिन्दी" selected={lang === 'hi'} onPress={() => pick('hi')} />
        </View>
      </View>
      <Button title={t('language.continue')} onPress={() => navigation.navigate('Phone')} />
    </Screen>
  );
}

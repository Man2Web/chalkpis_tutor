import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { haptic } from '../../lib/haptics';
import { CATEGORIES, CATEGORY_ICON, type Category } from '../../lib/category';
import { colors, font, radius, spacing, type } from '../../theme';

/**
 * "What do you teach?": one tile per kind of centre (tuition, coaching, abacus, karate, dance, yoga, sports,
 * other), two to a row. Used when the centre is set up and in Settings.
 */
export function CategoryPicker({
  value,
  onChange,
  error,
}: {
  value: Category | undefined;
  onChange: (c: Category) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={type.fieldLabel}>{t('categories.question')}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('categories.question')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
      >
        {CATEGORIES.map((c) => {
          const on = value === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={t(`categories.${c}.name`)}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => {
                haptic.select();
                onChange(c);
              }}
              style={({ pressed }) => ({
                flexBasis: '47%',
                flexGrow: 1,
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.primary : error ? colors.dangerFill : colors.input,
                backgroundColor: on ? colors.primarySoft : colors.surface,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons
                name={CATEGORY_ICON[c]}
                size={20}
                color={on ? colors.primary : colors.textMuted}
              />
              <Text
                style={{ fontSize: 15, ...font(on ? '600' : '500'), color: colors.text, flex: 1 }}
                numberOfLines={1}
              >
                {t(`categories.${c}.name`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={[type.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text>
      ) : null}
    </View>
  );
}

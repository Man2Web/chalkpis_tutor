import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import {
  BottomSheet,
  Button,
  Chip,
  FormInput,
  Input,
  ListItem,
  SearchField,
  toast,
} from '../../components';
import { reportError } from '../../lib/analytics';
import { colors, spacing, type } from '../../theme';
import {
  detailsSchema,
  filterStates,
  HEARD_FROM,
  toPayload,
  type Details,
  type DetailsInput,
} from './ownerDetails';

type Initial = Partial<Record<keyof DetailsInput, string>> | null | undefined;

/**
 * The owner's basic details (decision 156): email, city, state, PIN code and how they heard about Chalkpis. Saved with
 * PUT /institute/details; `onSaved` runs after the server has them. Used during sign-up, when an older centre is asked,
 * and from the profile to change them.
 */
export function OwnerDetailsForm({
  initial,
  submitLabel,
  onSaved,
}: {
  initial?: Initial;
  submitLabel: string;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [statesOpen, setStatesOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { control, handleSubmit, formState, watch } = useForm<DetailsInput, unknown, Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      email: initial?.email ?? '',
      city: initial?.city ?? '',
      state: (initial?.state || undefined) as DetailsInput['state'],
      pincode: initial?.pincode ?? '',
      heardFrom: (initial?.heardFrom || undefined) as DetailsInput['heardFrom'],
      heardFromOther: initial?.heardFromOther ?? '',
    },
  });
  const heardFrom = watch('heardFrom');

  const submit = handleSubmit(async (values) => {
    try {
      await api('PUT', '/institute/details', toPayload(values));
      await onSaved();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  });

  return (
    <View>
      <FormInput
        control={control}
        name="email"
        label={t('ownerDetails.email')}
        hint={t('ownerDetails.emailHint')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        placeholder="you@example.com"
      />
      <FormInput
        control={control}
        name="city"
        label={t('ownerDetails.city')}
        textContentType="addressCity"
        maxLength={80}
      />
      <Controller
        control={control}
        name="state"
        render={({ field, fieldState }) => (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('ownerDetails.state')}: ${field.value ?? t('ownerDetails.statePlaceholder')}`}
              onPress={() => {
                setSearch('');
                setStatesOpen(true);
              }}
            >
              {/* looks like the other fields; the list opens in a sheet */}
              <View pointerEvents="none">
                <Input
                  label={t('ownerDetails.state')}
                  value={field.value ?? ''}
                  placeholder={t('ownerDetails.statePlaceholder')}
                  editable={false}
                  error={fieldState.error ? t('validation.state') : undefined}
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
            </Pressable>
            <BottomSheet
              visible={statesOpen}
              onClose={() => setStatesOpen(false)}
              title={t('ownerDetails.state')}
            >
              <SearchField
                value={search}
                onChangeText={setSearch}
                placeholder={t('ownerDetails.stateSearch')}
              />
              <View>
                {filterStates(search).map((s) => (
                  <ListItem
                    key={s}
                    title={s}
                    right={
                      field.value === s ? (
                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                      ) : undefined
                    }
                    onPress={() => {
                      field.onChange(s);
                      setStatesOpen(false);
                    }}
                  />
                ))}
              </View>
            </BottomSheet>
          </>
        )}
      />
      <FormInput
        control={control}
        name="pincode"
        label={t('ownerDetails.pincode')}
        keyboardType="number-pad"
        autoComplete="postal-code"
        textContentType="postalCode"
        maxLength={6}
        placeholder="632001"
      />
      <Controller
        control={control}
        name="heardFrom"
        render={({ field, fieldState }) => (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={type.fieldLabel}>{t('ownerDetails.heardFrom')}</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('ownerDetails.heardFrom')}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
            >
              {HEARD_FROM.map((k) => (
                <Chip
                  key={k}
                  label={t(`ownerDetails.heard.${k}`)}
                  selected={field.value === k}
                  onPress={() => field.onChange(k)}
                />
              ))}
            </View>
            {fieldState.error ? (
              <Text style={[type.caption, { color: colors.danger, marginTop: spacing.xs }]}>
                {t('validation.heardFrom')}
              </Text>
            ) : null}
          </View>
        )}
      />
      {heardFrom === 'other' ? (
        <FormInput
          control={control}
          name="heardFromOther"
          label={t('ownerDetails.heardFromOther')}
          maxLength={120}
          placeholder={t('ownerDetails.heardFromOtherHint')}
        />
      ) : null}
      <Button title={submitLabel} onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}

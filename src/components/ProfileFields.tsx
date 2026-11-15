import { Grid, TextInput } from '@mantine/core';
import type { ProfileFormValues } from '../lib/practitioner';

interface ProfileFieldsProps {
  readonly values: ProfileFormValues;
  readonly errors: Partial<Record<keyof ProfileFormValues, string>>;
  readonly onChange: (values: ProfileFormValues) => void;
}

/** Name, credentials and contact fields for a clinician's Practitioner profile. */
export function ProfileFields({ values, errors, onChange }: ProfileFieldsProps) {
  const field = (key: keyof ProfileFormValues) => ({
    value: values[key],
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...values, [key]: e.currentTarget.value }),
  });
  return (
    <Grid>
      <Grid.Col span={{ base: 12, sm: 2 }}>
        <TextInput label="Title" placeholder="Dr." {...field('prefix')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <TextInput label="First name" required {...field('given')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <TextInput label="Last name" required {...field('family')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 2 }}>
        <TextInput label="Credentials" placeholder="MD" {...field('suffix')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <TextInput label="Work phone" type="tel" {...field('phone')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <TextInput label="Contact email" type="email" description="Shown on your profile" {...field('email')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <TextInput label="NPI" description="10-digit National Provider Identifier" {...field('npi')} />
      </Grid.Col>
    </Grid>
  );
}

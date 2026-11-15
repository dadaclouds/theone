import { Combobox, Group, Loader, Text, TextInput, useCombobox, type MantineStyleProp, type StyleProp } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { patientName, patientSummaryLine } from '../lib/fhir';
import { buildPatientQuery } from '../lib/search';

interface PatientSearchProps {
  readonly onSelect: (patient: Patient) => void;
  readonly w?: StyleProp<number | string>;
  readonly style?: MantineStyleProp;
  readonly placeholder?: string;
  readonly label?: string;
}

/** Type-ahead patient search by name, MRN or date of birth. */
export function PatientSearch({ onSelect, w, style, placeholder, label }: PatientSearchProps) {
  const medplum = useMedplum();
  const combobox = useCombobox();
  const [value, setValue] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      medplum
        .searchResources('Patient', { ...buildPatientQuery(q), _count: '8' })
        .then((r) => !cancelled && setResults(r))
        .catch(console.error)
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [medplum, value]);

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(id) => {
        const patient = results.find((p) => p.id === id);
        if (patient) {
          onSelect(patient);
          setValue('');
          combobox.closeDropdown();
        }
      }}
    >
      <Combobox.Target>
        <TextInput
          w={w}
          style={style}
          label={label}
          aria-label={label ?? 'Search participants'}
          placeholder={placeholder ?? 'Search participants (name, Medicaid ID, MRN, DOB)'}
          leftSection={<IconSearch size={16} />}
          rightSection={loading ? <Loader size="xs" /> : null}
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={value.trim().length < 2}>
        <Combobox.Options>
          {results.length === 0 && !loading && <Combobox.Empty>No matching participants</Combobox.Empty>}
          {results.map((p) => (
            <Combobox.Option value={p.id as string} key={p.id}>
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" fw={500}>
                  {patientName(p)}
                </Text>
                <Text size="xs" c="dimmed">
                  {patientSummaryLine(p)}
                </Text>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

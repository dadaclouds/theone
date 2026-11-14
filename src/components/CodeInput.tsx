import { Autocomplete, Group, Text, type AutocompleteProps } from '@mantine/core';
import type { CodeableConcept } from '@medplum/fhirtypes';
import { useMemo, useState } from 'react';
import { searchCatalog, type CatalogItem } from '../lib/catalog';
import { conceptFromCatalog, conceptFromText, conceptText } from '../lib/fhir';

interface CodeInputProps extends Omit<AutocompleteProps, 'data' | 'value' | 'onChange' | 'defaultValue'> {
  readonly catalog: readonly CatalogItem[];
  readonly defaultValue?: CodeableConcept;
  readonly onChange: (concept: CodeableConcept | undefined, item: CatalogItem | undefined) => void;
}

/** Resolves typed/selected text to a catalog entry (case-insensitive exact display match). */
export function matchCatalog(catalog: readonly CatalogItem[], text: string): CatalogItem | undefined {
  const t = text.trim().toLowerCase();
  return t ? catalog.find((c) => c.display.toLowerCase() === t) : undefined;
}

/**
 * Coded-concept picker backed by a local catalog. Matching catalog entries become fully coded
 * CodeableConcepts; anything else is saved as free text so documentation is never blocked.
 */
export function CodeInput({ catalog, defaultValue, onChange, ...rest }: CodeInputProps) {
  const [value, setValue] = useState(conceptText(defaultValue));
  const byDisplay = useMemo(() => new Map(catalog.map((c) => [c.display, c])), [catalog]);
  const options = useMemo(() => [...new Set(searchCatalog(catalog, value, 15).map((m) => m.display))], [catalog, value]);

  const handle = (text: string): void => {
    setValue(text);
    const item = matchCatalog(catalog, text);
    if (item) {
      onChange(conceptFromCatalog(item), item);
    } else if (text.trim()) {
      onChange(conceptFromText(text), undefined);
    } else {
      onChange(undefined, undefined);
    }
  };

  const selected = matchCatalog(catalog, value);
  return (
    <Autocomplete
      {...rest}
      value={value}
      data={options}
      filter={({ options: o }) => o}
      onChange={handle}
      limit={15}
      description={rest.description ?? (value.trim() ? (selected ? `Coded: ${selected.code}` : 'Free text (not coded)') : undefined)}
      renderOption={({ option }) => (
        <Group justify="space-between" wrap="nowrap" w="100%">
          <Text size="sm">{option.value}</Text>
          <Text size="xs" c="dimmed">{byDisplay.get(option.value)?.code}</Text>
        </Group>
      )}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

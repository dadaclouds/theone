// Curated starter catalogs of common clinical codes. These let the EHR work against any Medplum
// project without first loading full terminologies (SNOMED / RxNorm / LOINC). Every picker also
// accepts free text, so clinicians are never blocked by a missing code.
import { SYSTEMS } from './constants';

export interface CatalogItem {
  readonly code: string;
  readonly display: string;
  readonly system: string;
  /** Optional secondary coding (e.g. SNOMED equivalent of an ICD-10 code). */
  readonly alt?: { readonly system: string; readonly code: string };
  /** Free-form search keywords. */
  readonly keywords?: string;
}

const icd = (code: string, display: string, snomed?: string, keywords?: string): CatalogItem => ({
  code,
  display,
  system: SYSTEMS.ICD10,
  alt: snomed ? { system: SYSTEMS.SNOMED, code: snomed } : undefined,
  keywords,
});

export const PROBLEMS: CatalogItem[] = [
  icd('I10', 'Essential (primary) hypertension', '59621000', 'htn high blood pressure'),
  icd('E11.9', 'Type 2 diabetes mellitus without complications', '44054006', 'dm2 t2dm diabetes'),
  icd('E11.65', 'Type 2 diabetes mellitus with hyperglycemia', '237599002', 'dm2 diabetes'),
  icd('E78.5', 'Hyperlipidemia, unspecified', '55822004', 'cholesterol hld'),
  icd('E03.9', 'Hypothyroidism, unspecified', '40930008', 'thyroid'),
  icd('E66.9', 'Obesity, unspecified', '414916001', 'weight bmi'),
  icd('J45.909', 'Unspecified asthma, uncomplicated', '195967001', 'asthma wheeze'),
  icd('J44.9', 'Chronic obstructive pulmonary disease, unspecified', '13645005', 'copd emphysema'),
  icd('J06.9', 'Acute upper respiratory infection, unspecified', '54150009', 'uri cold'),
  icd('J02.9', 'Acute pharyngitis, unspecified', '405737000', 'sore throat'),
  icd('J01.90', 'Acute sinusitis, unspecified', '15805002', 'sinus'),
  icd('U07.1', 'COVID-19', '840539006', 'coronavirus sars-cov-2'),
  icd('I25.10', 'Atherosclerotic heart disease of native coronary artery', '53741008', 'cad coronary'),
  icd('I48.91', 'Unspecified atrial fibrillation', '49436004', 'afib af'),
  icd('I50.9', 'Heart failure, unspecified', '84114007', 'chf hf'),
  icd('N18.3', 'Chronic kidney disease, stage 3', '433144002', 'ckd renal'),
  icd('N39.0', 'Urinary tract infection, site not specified', '68566005', 'uti'),
  icd('K21.9', 'Gastro-esophageal reflux disease without esophagitis', '235595009', 'gerd reflux heartburn'),
  icd('K58.9', 'Irritable bowel syndrome without diarrhea', '10743008', 'ibs'),
  icd('F32.9', 'Major depressive disorder, single episode, unspecified', '35489007', 'depression mdd'),
  icd('F41.1', 'Generalized anxiety disorder', '21897009', 'gad anxiety'),
  icd('F90.9', 'Attention-deficit hyperactivity disorder, unspecified type', '406506008', 'adhd'),
  icd('G43.909', 'Migraine, unspecified', '37796009', 'headache'),
  icd('G47.33', 'Obstructive sleep apnea', '78275009', 'osa'),
  icd('M54.50', 'Low back pain, unspecified', '279039007', 'lbp back'),
  icd('M17.9', 'Osteoarthritis of knee, unspecified', '239873007', 'oa knee arthritis'),
  icd('M81.0', 'Age-related osteoporosis without current pathological fracture', '102447009', 'osteoporosis'),
  icd('M10.9', 'Gout, unspecified', '90560007', 'gout'),
  icd('L20.9', 'Atopic dermatitis, unspecified', '24079001', 'eczema'),
  icd('D64.9', 'Anemia, unspecified', '271737000', 'anemia'),
  icd('Z00.00', 'Encounter for general adult medical examination without abnormal findings', undefined, 'physical annual wellness'),
  icd('Z23', 'Encounter for immunization', undefined, 'vaccine shot'),
  icd('Z72.0', 'Tobacco use', '110483000', 'smoking smoker'),
  icd('R05.9', 'Cough, unspecified', '49727002', 'cough'),
  icd('R50.9', 'Fever, unspecified', '386661006', 'fever'),
  icd('R10.9', 'Unspecified abdominal pain', '21522001', 'abdominal pain'),
  icd('R51.9', 'Headache, unspecified', '25064002', 'headache'),
  icd('R07.9', 'Chest pain, unspecified', '29857009', 'chest pain'),
];

const rx = (code: string, display: string, keywords?: string): CatalogItem => ({
  code,
  display,
  system: SYSTEMS.RXNORM,
  keywords,
});

export const MEDICATIONS: CatalogItem[] = [
  rx('314076', 'lisinopril 10 MG Oral Tablet', 'ace inhibitor htn'),
  rx('197361', 'amlodipine 5 MG Oral Tablet', 'ccb htn'),
  rx('310798', 'hydrochlorothiazide 25 MG Oral Tablet', 'hctz diuretic'),
  rx('979480', 'losartan potassium 50 MG Oral Tablet', 'arb'),
  rx('866514', 'metoprolol tartrate 50 MG Oral Tablet', 'beta blocker'),
  rx('860975', 'metformin hydrochloride 500 MG Oral Tablet', 'diabetes'),
  rx('617312', 'atorvastatin 20 MG Oral Tablet', 'statin lipitor'),
  rx('312961', 'simvastatin 20 MG Oral Tablet', 'statin'),
  rx('966247', 'levothyroxine sodium 0.05 MG Oral Tablet', 'synthroid thyroid'),
  rx('745679', 'albuterol 0.09 MG/ACTUAT Metered Dose Inhaler', 'inhaler asthma proair'),
  rx('896188', 'fluticasone propionate 0.05 MG/ACTUAT Nasal Spray', 'flonase'),
  rx('308136', 'amoxicillin 500 MG Oral Capsule', 'penicillin antibiotic'),
  rx('617296', 'amoxicillin 875 MG / clavulanate 125 MG Oral Tablet', 'augmentin penicillin antibiotic'),
  rx('308460', 'azithromycin 250 MG Oral Tablet', 'zpak macrolide antibiotic'),
  rx('309054', 'cefdinir 300 MG Oral Capsule', 'cephalosporin antibiotic'),
  rx('197511', 'ciprofloxacin 500 MG Oral Tablet', 'fluoroquinolone antibiotic'),
  rx('198335', 'sulfamethoxazole 800 MG / trimethoprim 160 MG Oral Tablet', 'bactrim sulfa antibiotic'),
  rx('310965', 'ibuprofen 200 MG Oral Tablet', 'nsaid advil motrin'),
  rx('198440', 'acetaminophen 500 MG Oral Tablet', 'tylenol apap'),
  rx('243670', 'aspirin 81 MG Oral Tablet', 'asa nsaid'),
  rx('849574', 'naproxen sodium 220 MG Oral Tablet', 'nsaid aleve'),
  rx('312940', 'sertraline 50 MG Oral Tablet', 'zoloft ssri'),
  rx('248642', 'escitalopram 10 MG Oral Tablet', 'lexapro ssri'),
  rx('993503', 'bupropion hydrochloride 150 MG Extended Release Oral Tablet', 'wellbutrin'),
  rx('310429', 'furosemide 20 MG Oral Tablet', 'lasix diuretic'),
  rx('855332', 'warfarin sodium 5 MG Oral Tablet', 'coumadin anticoagulant'),
  rx('1364430', 'apixaban 5 MG Oral Tablet', 'eliquis anticoagulant'),
  rx('402014', 'omeprazole 20 MG Delayed Release Oral Capsule', 'prilosec ppi'),
  rx('310325', 'gabapentin 300 MG Oral Capsule', 'neurontin'),
  rx('312615', 'prednisone 20 MG Oral Tablet', 'steroid'),
  rx('1049621', 'oxycodone hydrochloride 5 MG Oral Tablet', 'opioid'),
  rx('311372', 'montelukast 10 MG Oral Tablet', 'singulair'),
  rx('1361615', 'semaglutide 0.25 MG/DOSE Pen Injector', 'ozempic glp1'),
];

const sct = (code: string, display: string, keywords?: string): CatalogItem => ({
  code,
  display,
  system: SYSTEMS.SNOMED,
  keywords,
});

export const ALLERGENS: CatalogItem[] = [
  sct('91936005', 'Penicillin', 'amoxicillin augmentin ampicillin pcn'),
  sct('294505008', 'Amoxicillin', 'penicillin'),
  sct('91939003', 'Sulfonamide', 'sulfa bactrim sulfamethoxazole'),
  sct('294530006', 'Cephalosporin', 'cefdinir cephalexin keflex'),
  sct('293586001', 'Aspirin', 'asa salicylate nsaid'),
  sct('293619005', 'Ibuprofen', 'nsaid advil motrin'),
  sct('387494007', 'Codeine', 'opioid'),
  sct('373529000', 'Morphine', 'opioid'),
  sct('294466004', 'Erythromycin', 'macrolide azithromycin'),
  sct('300916003', 'Latex', 'rubber'),
  sct('91935009', 'Peanut', 'nut food'),
  sct('91934008', 'Tree nut', 'nut food'),
  sct('300913006', 'Shellfish', 'seafood food'),
  sct('91930004', 'Egg', 'food'),
  sct('425525006', 'Dairy / milk', 'lactose food'),
  sct('300910009', 'Pollen', 'environmental seasonal'),
  sct('419474003', 'Mold', 'environmental'),
  sct('232347008', 'Dog dander', 'environmental pet'),
  sct('232350006', 'House dust mite', 'environmental'),
  sct('424213003', 'Bee venom', 'insect sting'),
  sct('293637006', 'Iodinated contrast media', 'iodine contrast'),
];

/** SNOMED code meaning "No known allergy". */
export const NO_KNOWN_ALLERGY: CatalogItem = sct('716186003', 'No known allergy');

export const REACTIONS: CatalogItem[] = [
  sct('271807003', 'Rash'),
  sct('126485001', 'Hives (urticaria)'),
  sct('418290006', 'Itching'),
  sct('39579001', 'Anaphylaxis'),
  sct('267036007', 'Shortness of breath'),
  sct('422587007', 'Nausea'),
  sct('422400008', 'Vomiting'),
  sct('62315008', 'Diarrhea'),
  sct('267038008', 'Swelling (angioedema)'),
  sct('25064002', 'Headache'),
];

const cvx = (code: string, display: string, keywords?: string): CatalogItem => ({
  code,
  display,
  system: SYSTEMS.CVX,
  keywords,
});

export const VACCINES: CatalogItem[] = [
  cvx('140', 'Influenza, seasonal, injectable, preservative free', 'flu'),
  cvx('208', 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose', 'covid pfizer'),
  cvx('207', 'COVID-19, mRNA, LNP-S, PF, 100 mcg/0.5 mL dose', 'covid moderna'),
  cvx('115', 'Tdap', 'tetanus diphtheria pertussis'),
  cvx('113', 'Td (adult), preservative free', 'tetanus'),
  cvx('187', 'Zoster vaccine recombinant (Shingrix)', 'shingles'),
  cvx('133', 'Pneumococcal conjugate PCV 13', 'pneumonia prevnar'),
  cvx('215', 'Pneumococcal conjugate PCV 20', 'pneumonia prevnar'),
  cvx('33', 'Pneumococcal polysaccharide PPV23', 'pneumovax'),
  cvx('08', 'Hepatitis B, adolescent or pediatric', 'hep b'),
  cvx('43', 'Hepatitis B, adult', 'hep b'),
  cvx('83', 'Hepatitis A, ped/adol, 2 dose', 'hep a'),
  cvx('03', 'MMR', 'measles mumps rubella'),
  cvx('21', 'Varicella', 'chickenpox'),
  cvx('165', 'HPV9', 'gardasil'),
  cvx('305', 'RSV, bivalent, protein subunit RSVpreF', 'rsv'),
];

const loinc = (code: string, display: string, keywords?: string): CatalogItem => ({
  code,
  display,
  system: SYSTEMS.LOINC,
  keywords,
});

export interface LabTestDefinition extends CatalogItem {
  /** Analytes that make up the panel, used when entering results. */
  readonly analytes: { code: string; display: string; unit: string; low?: number; high?: number }[];
}

export const LAB_TESTS: LabTestDefinition[] = [
  {
    ...loinc('24323-8', 'Comprehensive metabolic panel', 'cmp chem'),
    analytes: [
      { code: '2345-7', display: 'Glucose', unit: 'mg/dL', low: 70, high: 99 },
      { code: '3094-0', display: 'BUN', unit: 'mg/dL', low: 7, high: 20 },
      { code: '2160-0', display: 'Creatinine', unit: 'mg/dL', low: 0.6, high: 1.3 },
      { code: '2951-2', display: 'Sodium', unit: 'mmol/L', low: 135, high: 145 },
      { code: '2823-3', display: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.1 },
      { code: '2075-0', display: 'Chloride', unit: 'mmol/L', low: 98, high: 107 },
      { code: '2028-9', display: 'CO2', unit: 'mmol/L', low: 22, high: 29 },
      { code: '17861-6', display: 'Calcium', unit: 'mg/dL', low: 8.6, high: 10.3 },
      { code: '1742-6', display: 'ALT', unit: 'U/L', low: 7, high: 56 },
      { code: '1920-8', display: 'AST', unit: 'U/L', low: 10, high: 40 },
    ],
  },
  {
    ...loinc('24320-4', 'Basic metabolic panel', 'bmp chem'),
    analytes: [
      { code: '2345-7', display: 'Glucose', unit: 'mg/dL', low: 70, high: 99 },
      { code: '3094-0', display: 'BUN', unit: 'mg/dL', low: 7, high: 20 },
      { code: '2160-0', display: 'Creatinine', unit: 'mg/dL', low: 0.6, high: 1.3 },
      { code: '2951-2', display: 'Sodium', unit: 'mmol/L', low: 135, high: 145 },
      { code: '2823-3', display: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.1 },
    ],
  },
  {
    ...loinc('58410-2', 'CBC panel - Blood by Automated count', 'cbc complete blood count'),
    analytes: [
      { code: '6690-2', display: 'WBC', unit: '10*3/uL', low: 4.5, high: 11 },
      { code: '789-8', display: 'RBC', unit: '10*6/uL', low: 4.2, high: 5.9 },
      { code: '718-7', display: 'Hemoglobin', unit: 'g/dL', low: 12, high: 17.5 },
      { code: '4544-3', display: 'Hematocrit', unit: '%', low: 36, high: 50 },
      { code: '777-3', display: 'Platelets', unit: '10*3/uL', low: 150, high: 400 },
    ],
  },
  {
    ...loinc('57698-3', 'Lipid panel', 'cholesterol lipids'),
    analytes: [
      { code: '2093-3', display: 'Total cholesterol', unit: 'mg/dL', high: 200 },
      { code: '2571-8', display: 'Triglycerides', unit: 'mg/dL', high: 150 },
      { code: '2085-9', display: 'HDL cholesterol', unit: 'mg/dL', low: 40 },
      { code: '13457-7', display: 'LDL cholesterol (calc)', unit: 'mg/dL', high: 100 },
    ],
  },
  {
    ...loinc('4548-4', 'Hemoglobin A1c', 'a1c hba1c diabetes'),
    analytes: [{ code: '4548-4', display: 'Hemoglobin A1c', unit: '%', high: 5.6 }],
  },
  {
    ...loinc('3016-3', 'TSH', 'thyroid'),
    analytes: [{ code: '3016-3', display: 'TSH', unit: 'm[IU]/L', low: 0.4, high: 4.0 }],
  },
  {
    ...loinc('24356-8', 'Urinalysis complete', 'ua urine'),
    analytes: [
      { code: '5811-5', display: 'Specific gravity', unit: '{SG}', low: 1.005, high: 1.03 },
      { code: '5803-2', display: 'pH', unit: '[pH]', low: 4.5, high: 8 },
    ],
  },
  {
    ...loinc('2132-9', 'Vitamin B12', 'b12 cobalamin'),
    analytes: [{ code: '2132-9', display: 'Vitamin B12', unit: 'pg/mL', low: 200, high: 900 }],
  },
  {
    ...loinc('1989-3', 'Vitamin D, 25-hydroxy', 'vit d'),
    analytes: [{ code: '1989-3', display: '25-OH Vitamin D', unit: 'ng/mL', low: 30, high: 100 }],
  },
  {
    ...loinc('94500-6', 'SARS-CoV-2 RNA PCR', 'covid test'),
    analytes: [{ code: '94500-6', display: 'SARS-CoV-2 RNA', unit: '' }],
  },
];

export interface CptItem {
  readonly code: string;
  readonly display: string;
  readonly fee: number;
}

/** Evaluation & management codes plus common procedures, with default fee schedule (USD). */
export const CPT_CODES: CptItem[] = [
  { code: '99202', display: 'New patient office visit, straightforward', fee: 85 },
  { code: '99203', display: 'New patient office visit, low complexity', fee: 130 },
  { code: '99204', display: 'New patient office visit, moderate complexity', fee: 195 },
  { code: '99205', display: 'New patient office visit, high complexity', fee: 255 },
  { code: '99212', display: 'Established patient office visit, straightforward', fee: 65 },
  { code: '99213', display: 'Established patient office visit, low complexity', fee: 105 },
  { code: '99214', display: 'Established patient office visit, moderate complexity', fee: 150 },
  { code: '99215', display: 'Established patient office visit, high complexity', fee: 210 },
  { code: '99396', display: 'Preventive visit, established, age 40-64', fee: 180 },
  { code: '99397', display: 'Preventive visit, established, age 65+', fee: 195 },
  { code: '90471', display: 'Immunization administration, first', fee: 25 },
  { code: '36415', display: 'Venipuncture', fee: 10 },
  { code: '93000', display: 'Electrocardiogram, complete', fee: 45 },
  { code: '81002', display: 'Urinalysis, non-automated, without microscopy', fee: 8 },
  { code: '87880', display: 'Rapid strep test', fee: 18 },
];

/** Case-insensitive search across display, code and keywords. */
export function searchCatalog<T extends CatalogItem>(items: readonly T[], query: string, limit = 25): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items.slice(0, limit);
  }
  const terms = q.split(/\s+/);
  return items
    .filter((item) => {
      const hay = `${item.display} ${item.code} ${item.keywords ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, limit);
}

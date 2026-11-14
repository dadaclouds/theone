/** Portal name shown in the header, sign-in page and browser tab. Set MEDPLUM_APP_NAME in .env. */
export const APP_NAME: string = import.meta.env.MEDPLUM_APP_NAME?.trim() || 'The One';

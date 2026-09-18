/**
 * The catalogue CONTRACT this application can save.
 *
 * Since 20261126090000 the approved catalogue also lists definitions that need
 * a holder-written scope or a document-stated issuer. Over its REST listing the
 * database offers those rows ONLY to a caller that declares it can send the two
 * fields — this header. An application deployed before that migration sends no
 * header and is therefore never offered a credential its form cannot save, in
 * whichever order the migration and the application are released.
 */
export const PASSPORT_CATALOGUE_CONTRACT_HEADER = "x-passport-catalogue-contract";
export const PASSPORT_CATALOGUE_CONTRACT = "2";

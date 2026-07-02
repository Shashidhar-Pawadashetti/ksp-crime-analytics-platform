export const TABLE_NAME = 'CaseCategory';
export const FILE_NAME = 'CaseCategory.csv';
export const COLUMNS = [
  { id: 'CaseCategoryID', title: 'CaseCategoryID' },
  { id: 'LookupValue', title: 'LookupValue' },
];

export async function generate() {
  return [
    { CaseCategoryID: 1, LookupValue: 'Cognizable' },
    { CaseCategoryID: 2, LookupValue: 'Non-Cognizable' },
    { CaseCategoryID: 3, LookupValue: 'Warrant' },
    { CaseCategoryID: 4, LookupValue: 'Summons' },
    { CaseCategoryID: 5, LookupValue: 'CLA' },
  ];
}

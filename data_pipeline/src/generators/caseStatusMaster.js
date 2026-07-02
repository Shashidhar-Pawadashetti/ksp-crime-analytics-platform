export const TABLE_NAME = 'CaseStatusMaster';
export const FILE_NAME = 'CaseStatusMaster.csv';
export const COLUMNS = [
  { id: 'CaseStatusID', title: 'CaseStatusID' },
  { id: 'CaseStatusName', title: 'CaseStatusName' },
];

export async function generate() {
  return [
    { CaseStatusID: 1, CaseStatusName: 'Under Investigation' },
    { CaseStatusID: 2, CaseStatusName: 'Charge Sheet Filed' },
    { CaseStatusID: 3, CaseStatusName: 'Trial in Progress' },
    { CaseStatusID: 4, CaseStatusName: 'Convicted' },
    { CaseStatusID: 5, CaseStatusName: 'Acquitted' },
    { CaseStatusID: 6, CaseStatusName: 'Closed as Mistake of Fact' },
    { CaseStatusID: 7, CaseStatusName: 'Closed as Mistake of Law' },
  ];
}

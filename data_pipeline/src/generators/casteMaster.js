export const TABLE_NAME = 'CasteMaster';
export const FILE_NAME = 'CasteMaster.csv';
export const COLUMNS = [
  { id: 'caste_master_id', title: 'caste_master_id' },
  { id: 'caste_master_name', title: 'caste_master_name' },
];

export async function generate() {
  return [
    { caste_master_id: 1, caste_master_name: 'Brahmin' },
    { caste_master_id: 2, caste_master_name: 'Kshatriya' },
    { caste_master_id: 3, caste_master_name: 'Vokkaliga' },
    { caste_master_id: 4, caste_master_name: 'Lingayat' },
    { caste_master_id: 5, caste_master_name: 'Kuruba' },
    { caste_master_id: 6, caste_master_name: 'Scheduled Caste' },
    { caste_master_id: 7, caste_master_name: 'Scheduled Tribe' },
    { caste_master_id: 8, caste_master_name: 'Muslim' },
    { caste_master_id: 9, caste_master_name: 'Christian' },
    { caste_master_id: 10, caste_master_name: 'Jain' },
    { caste_master_id: 11, caste_master_name: 'Maratha' },
    { caste_master_id: 12, caste_master_name: 'Dalit' },
    { caste_master_id: 13, caste_master_name: 'Nayaka' },
    { caste_master_id: 14, caste_master_name: 'Lambani' },
    { caste_master_id: 15, caste_master_name: 'Other Backward Class' },
    { caste_master_id: 16, caste_master_name: 'Ediga' },
    { caste_master_id: 17, caste_master_name: 'Bestha' },
    { caste_master_id: 18, caste_master_name: 'Uppara' },
    { caste_master_id: 19, caste_master_name: 'Kumbara' },
    { caste_master_id: 20, caste_master_name: 'Ganiga' },
  ];
}

export const VALID_LEADGEN_PAYLOAD = {
  object: 'page',
  entry: [
    {
      id: '111222333',
      time: 1700000000,
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: 'lead_abc123',
            page_id: '111222333',
            ad_id: 'ad_456',
            form_id: 'form_789',
            created_time: 1700000000,
          },
        },
      ],
    },
  ],
};

export const VALID_LEAD_DATA = {
  id: 'lead_abc123',
  created_time: '2024-01-15T10:00:00+0000',
  field_data: [
    { name: 'full_name', values: ['Abdulloh Karimov'] },
    { name: 'phone_number', values: ['+998901234567'] },
    { name: 'email', values: ['abdulloh@example.com'] },
    { name: 'city', values: ['Toshkent'] },
  ],
};

export const DUPLICATE_PAYLOAD = {
  object: 'page',
  entry: [
    {
      id: '111222333',
      time: 1700000001,
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: 'lead_abc123', // same ID — should be deduped
            page_id: '111222333',
          },
        },
      ],
    },
  ],
};

export const NON_PAGE_PAYLOAD = {
  object: 'user',
  entry: [],
};

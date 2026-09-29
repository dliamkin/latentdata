import { useState } from 'react';

import { localIsoDate } from '@cert-tracker/core';

// the visitor's calendar day, fixed for the life of the page so a row can't change status
// mid-session under the cursor
export function useToday(): string {
  const [today] = useState(() => localIsoDate());
  return today;
}

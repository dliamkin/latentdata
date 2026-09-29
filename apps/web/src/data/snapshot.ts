import { SnapshotSchema, type Snapshot } from '@cert-tracker/core';
import raw from '@snapshot';

// parsed once at module load; a malformed file fails here, loudly, before anything renders
export const snapshot: Snapshot = SnapshotSchema.parse(raw);

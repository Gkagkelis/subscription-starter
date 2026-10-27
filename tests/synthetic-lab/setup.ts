// Κάθε εκτέλεση tests γράφει σε προσωρινό, απομονωμένο φάκελο δεδομένων.
import { mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';

process.env.SYNTHETIC_LAB_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'synthetic-lab-test-'));
delete process.env.SYNTHETIC_LAB_LIVE_AI;
delete process.env.SYNTHETIC_LAB_REQUIRE_LOGIN;

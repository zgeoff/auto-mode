import { createTestNetwork } from '@zgeoff/testing/fetch';
import { handlers } from './handlers.ts';

// The test preload lists this module, so the network's hooks apply to every test file.
export const network = createTestNetwork({ handlers });

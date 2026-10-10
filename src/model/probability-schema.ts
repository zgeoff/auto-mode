import * as z from 'zod';

export const probabilitySchema = z.number().min(0).max(1);

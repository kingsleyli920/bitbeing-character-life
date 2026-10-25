import { z } from 'zod';

// Default zod messages (wrong type, unknown key, …) in Chinese; field-specific messages are set on each schema.
z.config(z.locales.zhCN());

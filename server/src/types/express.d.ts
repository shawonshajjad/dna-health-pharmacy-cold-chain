import type { Role } from '@prisma/client'; declare global { namespace Express { interface Request { user?: {id:number; role:Role; name:string; email:string} } } } export {};

// types/next-auth.d.ts
import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            role?: string;
            passwordNeedsChange?: boolean;
            randomKey?: string;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        role?: string;
        passwordNeedsChange?: boolean;
        randomKey?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        id?: string;
        role?: string;
        passwordNeedsChange?: boolean;
        randomKey?: string;
    }
}
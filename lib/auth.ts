import { prisma } from '@/lib/prisma';
import { compare } from 'bcrypt';
import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

type CustomUser = {
    id: string;
    email: string | null;
    name: string | null;
    randomKey: string;
    role?: string;
    passwordNeedsChange?: boolean;
};

export const authOptions: NextAuthOptions = {
    session: {
        strategy: 'jwt',
    },
    providers: [
        CredentialsProvider({
            name: 'Sign in',
            credentials: {
                email: {
                    label: 'Email',
                    type: 'email',
                    placeholder: 'hello@example.com',
                },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) {
                    return null;
                }

                const user = await prisma.user.findUnique({
                    where: {
                        email: credentials.email,
                    },
                });

                if (!user) {
                    return null;
                }

                const isPasswordValid = await compare(
                    credentials.password,
                    user.password
                );

                if (!isPasswordValid) {
                    return null;
                }

                return {
                    id: user.id + '',
                    email: user.email,
                    name: user.name,
                    randomKey: 'Hey cool',
                    role: user.role,
                    passwordNeedsChange: user.passwordNeedsChange,
                };
            },
        }),
    ],
    callbacks: {
        session: ({ session, token }) => {
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.id,
                    randomKey: token.randomKey,
                    role: token.role,
                    passwordNeedsChange: token.passwordNeedsChange,
                },
            };
        },
        jwt: ({ token, user }) => {
            if (user) {
                const u = user as unknown as CustomUser;
                return {
                    ...token,
                    id: u.id,
                    randomKey: u.randomKey,
                    role: u.role,
                    passwordNeedsChange: u.passwordNeedsChange,
                };
            }
            return token;
        },
    },
};
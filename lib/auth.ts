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
    userType?: string;
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

                const user = await prisma.user.findFirst({
                    where: {
                        email: {
                            mode: 'insensitive',
                            equals: credentials.email.trim(),
                        },
                    },
                });

                if (!user) {
                    return null;
                }

                if (!user.password) {
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
                    role: user.accessLevel,
                    userType: user.userType,
                    passwordNeedsChange: user.passwordNeedsChange,
                };
            },
        }),
    ],
    callbacks: {
        async session({ session, token }) {
            if (session?.user?.email) {
                try {
                    const freshUser = await prisma.user.findFirst({
                        where: {
                            email: {
                                mode: 'insensitive',
                                equals: session.user.email.trim(),
                            }
                        },
                        select: {
                            id: true,
                            email: true,
                            name: true,
                            accessLevel: true,
                            userType: true,
                            passwordNeedsChange: true
                        }
                    });

                    if (freshUser) {
                        token.id = String(freshUser.id);
                        token.role = freshUser.accessLevel;
                        token.userType = freshUser.userType;
                        token.email = freshUser.email;
                        token.name = freshUser.name;
                        token.passwordNeedsChange = freshUser.passwordNeedsChange;
                    }
                } catch (error) {
                    console.error("Error refreshing session data:", error);
                }
            }

            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.id,
                    randomKey: token.randomKey,
                    role: token.role,
                    userType: token.userType,
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
                    userType: u.userType,
                    passwordNeedsChange: u.passwordNeedsChange,
                };
            }
            return token;
        },
    },
};
import "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            name?: string | null
            email?: string | null
            image?: string | null
            accessLevel: string
            memberType?: string | null
            passwordNeedsChange?: boolean | null
            role?: string // legacy – remove when role column is dropped
        }
    }
}
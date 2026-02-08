import "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            role: 'admin' | 'viewer';
            allowedCustomerIds: string[];
        }
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        role: 'admin' | 'viewer';
        allowedCustomerIds: string[];
    }
}

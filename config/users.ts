export interface User {
    id: string;
    name: string;
    username: string;
    password: string; // Plain text for MVP as requested, commonly hashed in production
    role: 'admin' | 'viewer';
    allowedCustomerIds: string[]; // '*' for all, or specific IDs
}

export const users: User[] = [
    {
        id: "1",
        name: "Admin User",
        username: "admin",
        password: "password123",
        role: "admin",
        allowedCustomerIds: ["*"]
    },
    {
        id: "2",
        name: "Client Demo",
        username: "client",
        password: "clientpassword",
        role: "viewer",
        allowedCustomerIds: ["5334827744"] // Bulgaria (Videnov.BG)
    }
];

export function getUser(username: string): User | undefined {
    return users.find(u => u.username === username);
}

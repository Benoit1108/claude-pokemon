export interface LoginInput {
    endpoint: string;
    clientId: string;
}
export interface LoginDeps {
    /** Human-facing progress — routed to stderr so it streams live to the tty. */
    write: (s: string) => void;
    /** Seconds. */
    sleep: (seconds: number) => Promise<void>;
    /** Epoch seconds. */
    now: () => number;
}
export declare function runLogin(input: LoginInput, deps: LoginDeps): Promise<{
    sessionToken: string | null;
}>;
export interface LogoutInput {
    endpoint: string;
    /** Current `.session` contents ('' if not logged in). */
    token: string;
}
export interface LogoutResult {
    output: string;
    session: {
        action: 'clear';
    } | null;
}
export declare function runLogout(input: LogoutInput): Promise<LogoutResult>;
//# sourceMappingURL=auth.d.ts.map
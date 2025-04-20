interface IElectronAPI {
    // ... existing methods ...
    dbQuery: (sql: string, params?: any[]) => Promise<any[]>;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}

export { }; 
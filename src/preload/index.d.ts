interface IElectronAPI {
    // ... existing methods ...
    dbQuery: (sql: string, params?: any[]) => Promise<any[]>;
    replaceFile: (sourcePath: string, destinationPath: string) => Promise<boolean>;
    deleteFile: (filePath: string) => Promise<boolean>;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}

export { }; 
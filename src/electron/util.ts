import { ipcMain, WebContents, WebFrameMain } from "electron";
import { getUIPath } from "./pathResolver.js";
import { pathToFileURL } from "url";
// Import EventPayloadMapping type
import type { EventPayloadMapping } from '../../types.js';

// Checks if you are in development mode
export function isDev(): boolean {
    return process.env.NODE_ENV === "development";
}

// Making IPC Typesafe
export function ipcMainHandle<Key extends keyof EventPayloadMapping>(key: Key, handler: () => EventPayloadMapping[Key]) {
    ipcMain.handle(key, (event) => {
        if (event.senderFrame) validateEventFrame(event.senderFrame);

        return handler()
    });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(key: Key, webContents: WebContents, payload: EventPayloadMapping[Key]) {
    // Assert key is a string, as EventPayloadMapping keys are always strings
    webContents.send(key as string, payload);
}

export function validateEventFrame(frame: WebFrameMain) {
    if (isDev() && new URL(frame.url).host === "localhost:3524") return;

    if (frame.url !== pathToFileURL(getUIPath()).toString()) throw new Error("Malicious event");
}

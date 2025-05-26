/**
 * presetDatabase.ts
 * 
 * This file contains functions for interacting with the encoding presets in the database.
 * It handles all database operations related to presets, including serialization/deserialization
 * of JSON data and backward compatibility with older preset structures.
 */

import Database from 'better-sqlite3';
import { EncodingPreset } from '../types.js';

/**
 * Get all presets from the database
 */
export const getPresets = async (db: Database.Database): Promise<EncodingPreset[]> => {
    if (!db) throw new Error("Database not initialized");
    
    try {
        const stmt = db.prepare('SELECT * FROM encoding_presets ORDER BY name');
        const presets = stmt.all();
        
        // Process the results to handle serialized data and backward compatibility
        return presets.map((preset: any) => {
            const result = { ...preset };

            // Deserialize or construct audioLanguageOrder
            if (typeof result.audioLanguageOrder === 'string') {
                try {
                    result.audioLanguageOrder = JSON.parse(result.audioLanguageOrder);
                } catch (e) {
                    console.error(`Error parsing audioLanguageOrder for preset ${preset.id}:`, e);
                    result.audioLanguageOrder = null; // Fallback on error
                }
            } else if (result.audioLanguageOrder === null || result.audioLanguageOrder === undefined) {
                // Backward compatibility: Construct order from old fields if new field is missing
                console.warn(`Preset ${preset.id} missing audioLanguageOrder, attempting fallback from old fields.`);
                let order: string[] = [];
                const preferredLangs = typeof preset.preferredAudioLanguages === 'string' ? 
                    JSON.parse(preset.preferredAudioLanguages || '[]') : 
                    (preset.preferredAudioLanguages || []);
                const keepOriginal = Boolean(preset.keepOriginalAudio ?? true); // Default true
                const defaultLang = preset.defaultAudioLanguage || 'original';

                if (defaultLang !== 'original' && preferredLangs.includes(defaultLang)) {
                    order.push(defaultLang);
                }
                if (keepOriginal) {
                    order.push('original');
                }
                preferredLangs.forEach((lang: string) => {
                    if (!order.includes(lang)) {
                        order.push(lang);
                    }
                });
                // Ensure 'original' is present if keepOriginal was true but wasn't the default
                if (keepOriginal && defaultLang !== 'original' && !order.includes('original')){
                    order.push('original');
                }
                // Remove duplicates just in case
                result.audioLanguageOrder = [...new Set(order)];
                console.log(`Constructed fallback order for ${preset.id}:`, result.audioLanguageOrder);
            }

            // Deserialize subtitleLanguageOrder
            if (typeof result.subtitleLanguageOrder === 'string') {
                try {
                    result.subtitleLanguageOrder = JSON.parse(result.subtitleLanguageOrder);
                } catch (e) {
                    console.error(`Error parsing subtitleLanguageOrder for preset ${preset.id}:`, e);
                    result.subtitleLanguageOrder = null; // Fallback on error
                }
            } else if (result.subtitleLanguageOrder === null || result.subtitleLanguageOrder === undefined) {
                // Default to empty array for new installations
                result.subtitleLanguageOrder = [];
            }

            // Deserialize subtitleTypeOrder
            if (typeof result.subtitleTypeOrder === 'string') {
                try {
                    result.subtitleTypeOrder = JSON.parse(result.subtitleTypeOrder);
                } catch (e) {
                    console.error(`Error parsing subtitleTypeOrder for preset ${preset.id}:`, e);
                    result.subtitleTypeOrder = null; // Fallback on error
                }
            } else if (result.subtitleTypeOrder === null || result.subtitleTypeOrder === undefined) {
                // Default to empty array for new installations
                result.subtitleTypeOrder = [];
            }

            // Handle removeAllSubtitles (stored as INTEGER in DB, convert to boolean)
            if (typeof result.removeAllSubtitles === 'number') {
                result.removeAllSubtitles = Boolean(result.removeAllSubtitles);
            } else if (result.removeAllSubtitles === null || result.removeAllSubtitles === undefined) {
                // Default to false for backward compatibility
                result.removeAllSubtitles = false;
            }

            // Clean up old fields from the result sent to UI
            delete result.preferredAudioLanguages;
            delete result.keepOriginalAudio;
            delete result.defaultAudioLanguage;
            
            return result;
        });
    } catch (error) {
        console.error("Error fetching encoding presets:", error);
        throw error;
    }
};

/**
 * Save or update a preset
 */
export const savePreset = async (db: Database.Database, preset: any): Promise<EncodingPreset> => {
    if (!db) throw new Error("Database not initialized");
    
    // Destructure known fields, including the new ones
    const { id, name, audioLanguageOrder, subtitleLanguageOrder, subtitleTypeOrder, removeAllSubtitles, ...settings } = preset;
    console.log(`Processing save request for preset ID: ${id}, Name: ${name}`);

    // Process settings for storage
    const processedSettings = { ...settings };
    
    // Handle removeAllSubtitles (convert boolean to integer for DB storage)
    if (typeof removeAllSubtitles === 'boolean') {
        processedSettings.removeAllSubtitles = removeAllSubtitles ? 1 : 0;
    } else if (removeAllSubtitles === undefined || removeAllSubtitles === null) {
        processedSettings.removeAllSubtitles = 0; // Default to false (0)
    }
    
    // Serialize array fields to JSON strings
    let serializedAudioOrder: string | null = null;
    let serializedSubtitleLangOrder: string | null = null;
    let serializedSubtitleTypeOrder: string | null = null;
    
    // Serialize the audioLanguageOrder field
    if (Array.isArray(audioLanguageOrder)) {
        serializedAudioOrder = JSON.stringify(audioLanguageOrder);
    } else if (audioLanguageOrder === undefined || audioLanguageOrder === null) {
        serializedAudioOrder = null; // Explicitly null if missing or null
    }
    
    // Serialize the subtitleLanguageOrder field
    if (Array.isArray(subtitleLanguageOrder)) {
        serializedSubtitleLangOrder = JSON.stringify(subtitleLanguageOrder);
    } else if (subtitleLanguageOrder === undefined || subtitleLanguageOrder === null) {
        serializedSubtitleLangOrder = null;
    }
    
    // Serialize the subtitleTypeOrder field
    if (Array.isArray(subtitleTypeOrder)) {
        serializedSubtitleTypeOrder = JSON.stringify(subtitleTypeOrder);
    } else if (subtitleTypeOrder === undefined || subtitleTypeOrder === null) {
        serializedSubtitleTypeOrder = null;
    }
    
    // Remove potentially interfering old audio fields from settings if they exist
    delete processedSettings.preferredAudioLanguages;
    delete processedSettings.keepOriginalAudio;
    delete processedSettings.defaultAudioLanguage;
    
    // Ensure other optional fields are null if undefined before saving
    Object.keys(processedSettings).forEach(key => {
        if (processedSettings[key] === undefined) {
            processedSettings[key] = null;
        }
    });

    try {
        const existingPreset = db.prepare('SELECT id FROM encoding_presets WHERE id = ?').get(id) as { id: string } | undefined;

        if (existingPreset) {
            console.log(`Updating existing preset ID: ${id}`);
            const updateFields = Object.keys(processedSettings);
            // Add all serialized fields explicitly
            const setClauses = [
                'audioLanguageOrder = @audioLanguageOrder',
                'subtitleLanguageOrder = @subtitleLanguageOrder',
                'subtitleTypeOrder = @subtitleTypeOrder',
                ...updateFields.map(key => `${key} = @${key}`)
            ].join(', ');
            const sql = `UPDATE encoding_presets SET name = @name, ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`;
            const stmt = db.prepare(sql);
            // Include all serialized fields in params
            const params = { 
                id, 
                name, 
                audioLanguageOrder: serializedAudioOrder,
                subtitleLanguageOrder: serializedSubtitleLangOrder,
                subtitleTypeOrder: serializedSubtitleTypeOrder,
                ...processedSettings 
            };
            const info = stmt.run(params);
            console.log(`Update result: Changes=${info.changes}`);
            // Return the original preset structure received from UI
            return { id, name, audioLanguageOrder, subtitleLanguageOrder, subtitleTypeOrder, removeAllSubtitles, ...settings }; 
        } else {
            console.log(`Inserting new preset with ID: ${id}, Name: ${name}`);
            const insertFields = Object.keys(processedSettings).filter(key => processedSettings[key] !== null);
            
            // Add serialized fields explicitly if they're not null
            const columns = [
                'id', 
                'name', 
                ...(serializedAudioOrder !== null ? ['audioLanguageOrder'] : []),
                ...(serializedSubtitleLangOrder !== null ? ['subtitleLanguageOrder'] : []),
                ...(serializedSubtitleTypeOrder !== null ? ['subtitleTypeOrder'] : []),
                ...insertFields
            ];
            
            const placeholders = columns.map(key => `@${key}`).join(', ');
            const sql = `INSERT INTO encoding_presets (${columns.join(', ')}) VALUES (${placeholders})`;
            const stmt = db.prepare(sql);
            
            // Define params with a more flexible type signature
            const params: { [key: string]: any } = { id, name };
            
            if (serializedAudioOrder !== null) params['audioLanguageOrder'] = serializedAudioOrder;
            if (serializedSubtitleLangOrder !== null) params['subtitleLanguageOrder'] = serializedSubtitleLangOrder;
            if (serializedSubtitleTypeOrder !== null) params['subtitleTypeOrder'] = serializedSubtitleTypeOrder;
            
            insertFields.forEach(key => params[key] = processedSettings[key]);
            
            const info = stmt.run(params);
            console.log(`Insert result: Changes=${info.changes}, LastInsertRowid=${info.lastInsertRowid}`);
            
            // Return the original preset structure received from UI
            return { id, name, audioLanguageOrder, subtitleLanguageOrder, subtitleTypeOrder, removeAllSubtitles, ...settings };
        }
    } catch (error) {
        console.error(`Error saving preset (ID: ${id}, Name: ${name}):`, error);
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed: encoding_presets.name')) {
            throw new Error(`Preset name "${name}" already exists. Please choose a different name.`);
        }
        throw error;
    }
};

/**
 * Delete a preset by ID
 */
export const deletePreset = async (db: Database.Database, id: string): Promise<any> => {
    if (!db) throw new Error("Database not initialized");
    
    try {
        const stmt = db.prepare('DELETE FROM encoding_presets WHERE id = ?');
        const info = stmt.run(id);
        console.log(`Deleted preset ID: ${id}, Changes: ${info.changes}`);
        return info; // Return info about deletion (e.g., info.changes)
    } catch (error) {
        console.error(`Error deleting preset ${id}:`, error);
        throw error;
    }
};

/**
 * Initialize preset table including migrations
 * This function should be called during app startup
 */
export const initializePresetTable = async (db: Database.Database): Promise<void> => {
    if (!db) throw new Error("Database not initialized");
    
    try {
        // Create encoding_presets table if it doesn't exist
        db.exec(`
            CREATE TABLE IF NOT EXISTS encoding_presets (
                id TEXT PRIMARY KEY, 
                name TEXT NOT NULL UNIQUE,
                videoCodec TEXT,
                videoPreset TEXT,
                videoQuality INTEGER,
                videoResolution TEXT,
                hwAccel TEXT,
                audioCodecConvert TEXT,
                audioBitrate TEXT,
                selectedAudioLayout TEXT,
                preferredAudioLanguages TEXT, -- Old field, keep for migration
                keepOriginalAudio INTEGER, -- Old field, keep for migration
                defaultAudioLanguage TEXT, -- Old field, keep for migration
                audioLanguageOrder TEXT, -- New field: Stored as JSON string array
                subtitleCodecConvert TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Check existing columns for migrations
        interface TableColumn {
            cid: number;
            name: string; 
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }
        
        console.log("Checking existing columns for 'encoding_presets' table...");
        const presetsTableInfo = db.prepare('PRAGMA table_info(encoding_presets)').all() as TableColumn[];
        const presetsColumns = presetsTableInfo.map(col => col.name);
        console.log(`Encoding_presets table columns: ${presetsColumns.join(', ')}`);

        const presetMigrations = [];
        // Keep old column migrations for robustness if needed
        if (!presetsColumns.includes('preferredAudioLanguages')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN preferredAudioLanguages TEXT`);
        if (!presetsColumns.includes('keepOriginalAudio')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN keepOriginalAudio INTEGER`);
        if (!presetsColumns.includes('defaultAudioLanguage')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN defaultAudioLanguage TEXT`);
        // Add migration for the new column
        if (!presetsColumns.includes('audioLanguageOrder')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN audioLanguageOrder TEXT`);
        // Add migrations for the new subtitle order columns
        if (!presetsColumns.includes('subtitleLanguageOrder')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN subtitleLanguageOrder TEXT`);
        if (!presetsColumns.includes('subtitleTypeOrder')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN subtitleTypeOrder TEXT`);
        // Add migration for the removeAllSubtitles column
        if (!presetsColumns.includes('removeAllSubtitles')) presetMigrations.push(`ALTER TABLE encoding_presets ADD COLUMN removeAllSubtitles INTEGER`);

        if (presetMigrations.length > 0) {
            console.log('Starting database migration transaction for encoding_presets table...');
            db.transaction((migrations: string[]) => {
                migrations.forEach((migration, index) => {
                    console.log(`Executing preset migration ${index + 1}/${migrations.length}: ${migration.trim().substring(0, 100)}...`);
                    db.exec(migration);
                });
            })(presetMigrations);
            console.log('Encoding_presets table migration transaction committed successfully.');
        } else {
            console.log('No database migrations needed for encoding_presets table.');
        }
    } catch (error) {
        // Handle case where encoding_presets table might not exist yet (e.g., very first run)
        if (error instanceof Error && error.message.includes('no such table: encoding_presets')) {
            console.log('Encoding_presets table does not exist yet, skipping migration check (will be created by CREATE TABLE).');
        } else {
            console.error('Error checking/migrating encoding_presets table:', error);
            throw error; // Re-throw other errors
        }
    }
}; 
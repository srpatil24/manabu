import React, { useState } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { Text, View } from '@/components/Themed';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';

let db: SQLite.SQLiteDatabase;

export default function TabTwoScreen() {
  const [importStatus, setImportStatus] = useState<string>('');

  const importDictionaryFile = async () => {
    try {
      const response = await DocumentPicker.getDocumentAsync({ type: 'application/zip' });
      if (!response.canceled) {
        await importDictionary(response.assets[0].uri);
        setImportStatus('Dictionary imported successfully!');
      }
    } catch (error) {
      console.error('Error importing dictionary:', error);
      setImportStatus('Error importing dictionary.');
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={importDictionaryFile}>
        <Text style={styles.text}>Import Dictionary</Text>
      </Pressable>
      <Text>{importStatus}</Text>
    </View>
  );
}

const setupDatabase = async () => {
  db = await SQLite.openDatabaseAsync('japanese_english_dictionary.db');
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      reading TEXT,
      language TEXT,
      UNIQUE(word, reading)
    );`,
    `CREATE TABLE IF NOT EXISTS definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER,
      part_of_speech TEXT,
      definition TEXT,
      FOREIGN KEY (entry_id) REFERENCES entries (id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_word ON entries (word);`,
    `CREATE INDEX IF NOT EXISTS idx_reading ON entries (reading);`
  ];

  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const query of queries) {
        await tx.execAsync(query);
      }
    });
    console.log('Database setup completed.');
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
};

const processDictionaryData = async (data: any[]) => {
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const entry of data) {
        const [word, reading, , , , content] = entry;
        const language = 'ja'; // Assume Japanese for this example

        // Insert entry
        const entryResult = await tx.runAsync(
          'INSERT OR IGNORE INTO entries (word, reading, language) VALUES (?, ?, ?)',
          [word, reading, language]
        );
        const entryId = entryResult.lastInsertRowId;

        // Process definitions
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'structured-content') {
              const definitionContent = parseStructuredContent(item.content);
              if (definitionContent) {
                await tx.runAsync(
                  'INSERT INTO definitions (entry_id, part_of_speech, definition) VALUES (?, ?, ?)',
                  [entryId, definitionContent.partOfSpeech, definitionContent.definition]
                );
              }
            }
          }
        }
      }
    });
    console.log('Dictionary data processed successfully.');
  } catch (error) {
    console.error('Error processing dictionary data:', error);
    throw error;
  }
};

const parseStructuredContent = (content: any): { partOfSpeech: string, definition: string } | null => {
  let partOfSpeech = '';
  let definition = '';

  const traverse = (node: any) => {
    if (typeof node === 'string') {
      definition += node + ' ';
    } else if (Array.isArray(node)) {
      node.forEach(traverse);
    } else if (node && typeof node === 'object') {
      if (node.tag === 'span' && node.title && node.title.includes('(')) {
        partOfSpeech = node.title.split('(')[0].trim();
      } else if (node.tag === 'li' && typeof node.content === 'string') {
        definition += node.content + ' ';
      } else if (node.content) {
        traverse(node.content);
      }
    }
  };

  traverse(content);

  return {
    partOfSpeech: partOfSpeech.trim(),
    definition: definition.trim()
  };
};

const importDictionary = async (uri: string) => {
  try {
    await setupDatabase();

    const zipContent = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = new JSZip();
    const zipFiles = await zip.loadAsync(zipContent, { base64: true });

    const jsonFiles = Object.keys(zipFiles.files).filter(
      (filename) => filename.startsWith('term_bank_') && filename.endsWith('.json')
    );

    if (jsonFiles.length === 0) {
      console.log('No valid dictionary files found in the zip.');
      return;
    }

    for (const jsonFile of jsonFiles) {
      const file = zipFiles.file(jsonFile);
      if (file) {
        const fileContent = await file.async('string');
        await processDictionaryData(JSON.parse(fileContent));
      } else {
        console.log(`File ${jsonFile} not found in the zip.`);
      }
    }

    console.log('Dictionary import completed successfully.');
  } catch (error) {
    console.error('Error importing dictionary:', error);
    throw error;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    margin: 10,
    color: 'white',
  },
  button: {
    backgroundColor: 'blue',
    padding: 10,
    borderRadius: 5,
  }
});
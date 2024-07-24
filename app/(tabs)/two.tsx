import { StyleSheet, Pressable } from 'react-native';
import { Text, View } from '@/components/Themed';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';

let db: SQLite.SQLiteDatabase;

//SQLite.openDatabaseAsync('dictionary.db').then(database => db = database);

export default function TabTwoScreen() {
  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={importDictionaryFile}>
        <Text style={styles.text}>Import Dictionary</Text>
      </Pressable>
    </View>
  );
}

function importDictionaryFile(){
  DocumentPicker.getDocumentAsync({type: 'application/zip'}).then((response) => {
    if (!response.canceled) {
      importDictionary(response.assets[0].uri);
    }
  });

}

const setupDatabase = async () => {
  db = await SQLite.openDatabaseAsync('japanese_english_dictionary.db');
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      reading TEXT,
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

        // Insert entry
        const entryResult = await tx.runAsync(
          'INSERT OR IGNORE INTO entries (word, reading) VALUES (?, ?)',
          [word, reading]
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

const lookupWord = async (query: string): Promise<any[]> => {
  try {
    const result = await db.getAllAsync(
      `SELECT e.word, e.reading, d.part_of_speech, d.definition
       FROM entries e
       JOIN definitions d ON e.id = d.entry_id
       WHERE e.word = ? OR e.reading = ?`,
      [query, query]
    );
    return result;
  } catch (error) {
    console.error('Error looking up word:', error);
    throw error;
  }
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
  }
};

export { setupDatabase, importDictionary, lookupWord };

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


import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import React, { useCallback, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';


function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

const createDummyCover = async (title: string, author: string): Promise<string> => {
  const dummyCoverPath = `${FileSystem.documentDirectory}dummy_cover_${Date.now()}.svg`;
  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3498db;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#2c3e50;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="200" height="300" fill="url(#bgGradient)"/>
      
      <!-- Decorative elements -->
      <circle cx="100" cy="80" r="50" fill="rgba(255,255,255,0.1)"/>
      <rect x="25" y="200" width="150" height="2" fill="rgba(255,255,255,0.3)"/>
      
      <!-- Title -->
      <text x="100" y="160" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
        ${title.toUpperCase()}
      </text>
      
      <!-- Author -->
      <text x="100" y="185" font-family="Arial, sans-serif" font-size="12" fill="rgba(255,255,255,0.8)" text-anchor="middle">
        by ${author}
      </text>
      
      <!-- "No cover available" text -->
      <text x="100" y="280" font-family="Arial, sans-serif" font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">
        No cover available
      </text>
    </svg>
  `;

  await FileSystem.writeAsStringAsync(dummyCoverPath, svgContent);
  return dummyCoverPath;
};

const importBooks = async () => {
  console.log('Importing books');

  try {
    console.log("Selecting file...");

    const doc = await DocumentPicker.getDocumentAsync({ type: 'application/epub+zip' });

    if (!doc.canceled) {
      console.log("Doc not canceled");

      const fileName = doc.assets[0].name;
      const uri = doc.assets[0].uri;

      console.log(fileName);
      console.log(uri);

      // Check if books.json exists and create it if it doesn't
      const booksJsonPath = `${FileSystem.documentDirectory}books.json`;
      const booksJsonInfo = await FileSystem.getInfoAsync(booksJsonPath);

      if (!booksJsonInfo.exists) {
        console.log("books.json does not exist, creating it");
        await FileSystem.writeAsStringAsync(booksJsonPath, JSON.stringify([]));
      }

      let bookTitle = fileName.replace(/\.epub$/i, '');

      console.log(bookTitle);

      // Read the existing books.json file
      const booksJson = await FileSystem.readAsStringAsync(booksJsonPath);
      const books = JSON.parse(booksJson);

      console.log(books);

      const bookExists = books.some((book: any) => book.title === bookTitle);

      console.log("book previously imported: " + bookExists);

      if (bookExists) {
        console.log("Book already exists, skipping import");
        return;
      }

      console.log("creating book directory");

      // Create a directory for the unzipped EPUB
      const bookDir = `${FileSystem.documentDirectory}books/${bookTitle}/`;
      await FileSystem.makeDirectoryAsync(bookDir, { intermediates: true });

      console.log("book directory created, now reading epub file as binary data...");

      // Read the EPUB file as binary data
      const epubContent = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

      console.log("epub file read, now unzipping...");

      // Unzip the EPUB content
      const zip = new JSZip();
      await zip.loadAsync(epubContent, { base64: true });

      let coverPath = '';
      let author = 'Unknown Author';
      let opfPath = '';

      console.log("epub unzipped, now extracting files...");

      // Extract files
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir) {
          const content = await zipEntry.async('arraybuffer');
          const filePath = `${bookDir}${relativePath}`;
          const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
          await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
          await FileSystem.writeAsStringAsync(filePath, btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(content)))), { encoding: FileSystem.EncodingType.Base64 });

          if (relativePath.endsWith('.opf')) {
            opfPath = filePath;
          }
        }
      }

      console.log(`EPUB extracted to: ${bookDir}`);

      console.log("Parsing OPF file...");

      // Parse OPF file to get cover image and author
      if (opfPath) {
        const opfContent = await FileSystem.readAsStringAsync(opfPath, { encoding: FileSystem.EncodingType.UTF8 });
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(opfContent, 'text/xml');

        // Find cover image
        const manifestItems = xmlDoc.getElementsByTagName('item');
        for (let i = 0; i < manifestItems.length; i++) {
          const item = manifestItems[i];
          if (item.getAttribute('properties') === 'cover-image') {
            const coverHref = item.getAttribute('href');
            if (coverHref) {
              const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));
              coverPath = `${opfDir}/${coverHref}`;
            }
            break;
          }
        }

        // Find author
        const creatorElements = xmlDoc.getElementsByTagName('dc:creator');
        if (creatorElements.length > 0) {
          author = creatorElements[0].textContent || 'Unknown Author';
        }
      }

      // Create a dummy cover if no cover image was found
      if (!coverPath) {
        console.log("No cover image found, creating dummy");
        coverPath = await createDummyCover(bookTitle, author);
        console.log(`Created dummy cover at: ${coverPath}`);
      }

      console.log("Cover path: " + coverPath);

      // Add book to books.json
      books.push({
        id: books.length + 1,
        title: bookTitle,
        author: author,
        image: coverPath,
        progress: '0',
        location: bookDir,
      });

      console.log("Book added to JSON");

      await FileSystem.writeAsStringAsync(booksJsonPath, JSON.stringify(books));
      console.log("books.json updated");

      console.log(JSON.stringify(books));
    }

  } catch (error) {
    console.error("Error while importing book: ", error);
  }
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleImportBooks = useCallback(async () => {
    await importBooks();
    // Trigger a refresh of the book list
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Books',
          tabBarIcon: ({ color }) => <TabBarIcon name="book" color={color} />,
          headerRight: () => (
            <Pressable onPress={handleImportBooks}>
              {({ pressed }) => (
                <FontAwesome
                  name="plus"
                  size={25}
                  color={Colors[colorScheme ?? 'light'].text}
                  style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Tab Two',
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
        }}
      />
    </Tabs>
  );
}
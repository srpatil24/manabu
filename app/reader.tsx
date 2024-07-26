import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, TouchableWithoutFeedback } from 'react-native';
import { useWindowDimensions, Modal } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { HTMLContentModel, HTMLElementModel, MixedStyleDeclaration, RenderHTML, HTMLSource, RenderHTMLProps, HTMLSourceInline } from 'react-native-render-html';
import { DOMParser } from '@xmldom/xmldom';
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SQLite from 'expo-sqlite';
import { SelectableText } from "@alentoma/react-native-selectable-text";

interface Section {
  path: string;
  title: string;
}

const db = SQLite.openDatabaseSync('japanese_english_dictionary.db');


const EpubReader = () => {
  const [sections, setSections] = useState<Section[]>([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [htmlSource, setHtmlSource] = useState<HTMLSourceInline>({ html: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { bookTitle, bookLocation, bookID, bookProgress } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const [showNavigation, setShowNavigation] = useState(true);
  const fadeAnim = useState(new Animated.Value(1))[0];

  const [selectedWord, setSelectedWord] = useState<string>('');
  const contentRef = useRef<any>(null);

  const [selectedText, setSelectedText] = useState<string>('');
  const [definition, setDefinition] = useState<string>('');
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  let initialBookProgress = 0;

  const initializeBookProgress = async () => {
    initialBookProgress = await loadInitialBookProgress();
  };

  initializeBookProgress();

  async function loadInitialBookProgress() {
    const booksJsonPath = `${FileSystem.documentDirectory}books.json`;
    const booksJson = await FileSystem.readAsStringAsync(booksJsonPath);
    const books = JSON.parse(booksJson);

    for (var i = 0; i < books.length; i++) {
      if (books[i].location == bookLocation || books[i].title == bookTitle) {
        console.log('returning initial progress of :', books[i].progress);
        return books[i].progress;
      }
    }
  };

  const handleTextSelection = useCallback(async (event: any) => {
    const selectedText = event.nativeEvent.selectedText;
    if (selectedText) {
      setSelectedText(selectedText);
      const def = await queryDictionary(selectedText);
      setDefinition(def);
      setModalVisible(true);
    }
  }, []);

  const handleTextPress = useCallback(
    async (event: any) => {
      const { pageX, pageY } = event.nativeEvent;
      const word = await findWordAtPosition(pageX, pageY);
      if (word) {
        setSelectedWord(word);
        const def = await queryDictionary(word);
        setDefinition(def);
        setModalVisible(true);
      }
    },
    []
  );

  const findWordAtPosition = async (x: number, y: number): Promise<string | null> => {
    return new Promise((resolve) => {
      if (contentRef.current) {
        contentRef.current.measureInWindow((fx: number, fy: number, width: number, height: number) => {
          const relativeX = x - fx;
          const relativeY = y - fy;
          // This is a simplified word boundary detection.
          // You may need to implement a more sophisticated algorithm based on your needs.
          const text = contentRef.current.textContent;
          const words = text.split(/\s+/);
          const index = Math.floor((relativeX / width) * words.length);
          resolve(words[index] || null);
        });
      } else {
        resolve(null);
      }
    });
  };

  const queryDictionary = async (word: string): Promise<string> => {
    try {
      const result = await db.getFirstAsync<{ definition: string }>(
        'SELECT definition FROM definitions WHERE entry_id IN (SELECT id FROM entries WHERE word = ? OR reading = ?) LIMIT 1',
        [word, word]
      );
      
      if (result) {
        return result.definition;
      } else {
        return 'Definition not found';
      }
    } catch (error) {
      console.error('Error querying dictionary:', error);
      throw error;
    }
  };

  let bookProgressToNumber = Number(Array.isArray(initialBookProgress) ? initialBookProgress[0] : bookProgress) || 0;
  if (bookProgressToNumber < 0) bookProgressToNumber = 0;

  const [bookProgressNumber, setBookProgressNumber] = useState(bookProgressToNumber);

  useEffect(() => {
    let bookProgressToNumber = Number(Array.isArray(bookProgress) ? bookProgress[0] : bookProgress) || 0;
    if (bookProgressToNumber < 0) bookProgressToNumber = 0;
    setBookProgressNumber(bookProgressToNumber);
  }, [bookProgress]);

  const bookLocationString = Array.isArray(bookLocation) ? bookLocation[0] : bookLocation as string;

  useEffect(() => {
    parseEpub();
  }, []);

  useEffect(() => {
    if (sections.length > 0 && bookProgressNumber >= 0) {
      console.log("loading section from useEffect: ", bookProgressNumber);
      loadSection(bookProgressNumber);
    }
  }, [bookProgressNumber, sections]);

  const toggleNavigation = useCallback(() => {
    console.log("Toggling navigation...");
    const newShowNavigation = !showNavigation;
    setShowNavigation(newShowNavigation);
    Animated.timing(fadeAnim, {
      toValue: newShowNavigation ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showNavigation, fadeAnim]);

  const normalizePath = (path: string) => {
    return path.replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\//, '')
      .replace(/\/$/, '');
  };

  const resolvePath = (basePath: string, relativePath: string) => {
    const baseparts = basePath.split('/').filter(p => p !== '');
    const relparts = relativePath.split('/').filter(p => p !== '');

    // Remove the filename from basePath
    baseparts.pop();

    for (const part of relparts) {
      if (part === '..') {
        baseparts.pop();
      } else if (part !== '.' && part !== '') {
        baseparts.push(part);
      }
    }

    return normalizePath('/' + baseparts.join('/'));
  };

  const safeReadFile = async (filePath: any) => {
    console.log(`Attempting to read file: ${filePath}`);
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log(`File does not exist: ${filePath}`);
        return null;
      }

      try {
        const content = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
        console.log(`File read successfully as UTF-8: ${filePath}`);
        return content;
      } catch (utf8Error) {
        console.log(`Failed to read as UTF-8, trying Base64: ${filePath}`);
        try {
          const base64Content = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
          const decodedContent = atob(base64Content);
          console.log(`File read successfully as Base64: ${filePath}`);
          return decodedContent;
        } catch (base64Error) {
          console.error(`Error reading file ${filePath} in both UTF-8 and Base64:`, base64Error);
          return null;
        }
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  };

  const findFiles = async (dir: string, extension: string): Promise<string[]> => {
    try {
      const dirContent = await FileSystem.readDirectoryAsync(dir);
      let results: string[] = [];
      for (const item of dirContent) {
        const fullPath = normalizePath(`${dir}/${item}`);
        const info = await FileSystem.getInfoAsync(fullPath);
        if (info.isDirectory) {
          results = results.concat(await findFiles(fullPath, extension));
        } else if (item.toLowerCase().endsWith(extension.toLowerCase())) {
          results.push(fullPath);
        }
      }
      return results;
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
      return [];
    }
  };

  const parseEpub = async () => {
    try {
      console.log("Parsing EPUB directory:", bookLocationString);
      setIsLoading(true);

      // 1. Search for container.xml
      const containerPath = await findContainerXml(bookLocationString);
      if (!containerPath) {
        throw new Error("container.xml not found");
      }

      // 2. Read container.xml and find OPF file
      const opfPath = await getOpfPath(containerPath);
      if (!opfPath) {
        throw new Error("OPF file not found");
      }

      // 3 & 4. Extract manifest and spine from OPF
      const { manifest, spine } = await parseOpf(opfPath);

      // filter the spine array to remove null values
      const filteredSpine: string[] = spine.filter((item): item is string => item !== null);

      // 5, 6 & 7. Process manifest and spine to create sections
      const newSections = await createSections(manifest, filteredSpine, opfPath);

      // 8 & 9. Parse NCX or Navigation Document (if available)
      const refinedSections = await refineWithToc(newSections, manifest, opfPath);

      // 10. Handle nested navigation structures (already done in refineWithToc)

      // 11. Handle media overlays (SMIL files) if necessary
      // This step would require additional implementation

      // 12. Handle multiple renditions (if present)
      // This step would require additional implementation

      // 13. Final check to ensure all files are accessible
      const validSections = await validateSections(refinedSections);

      console.log(`Found ${validSections.length} valid sections`);

      // Last ditch attempt to populate sections if none were found
      if (validSections.length <= 0) {

        console.warn("No sections found. Searching for any HTML or XHTML files.");
        const htmlFiles = await findFiles(bookLocationString, '.html');
        console.log("Number of html files", htmlFiles.length);
        const xhtmlFiles = await findFiles(bookLocationString, '.xhtml');
        console.log("Number of xhtml files", xhtmlFiles.length);
        const allHtmlFiles = [...htmlFiles, ...xhtmlFiles].sort();
        console.log("Number of all html files", allHtmlFiles.length);

        for (let i = 0; i < allHtmlFiles.length; i++) {
          const filePath = allHtmlFiles[i];
          validSections.push({
            path: filePath,
            title: `Section ${i + 1}`
          });
        }

      }

      setSections(validSections);

      const validProgress = Math.min(Math.max(0, bookProgressNumber), validSections.length - 1);
      setBookProgressNumber(validProgress);

      setIsLoading(false);
      setError(null);

    } catch (error) {
      console.error('Error parsing EPUB:', error);
      setHtmlSource({ html: `<p>Error parsing EPUB: ${error}</p>` });
      setIsLoading(false);
      setError(`Error parsing EPUB: ${error}`);
    }
  };

  const findContainerXml = async (rootDir: string): Promise<string | null> => {
    const containerPath = `${rootDir}/META-INF/container.xml`;
    const fileInfo = await FileSystem.getInfoAsync(containerPath);
    return fileInfo.exists ? containerPath : null;
  };

  const getOpfPath = async (containerPath: string): Promise<string | null> => {
    const containerContent = await safeReadFile(containerPath);
    if (!containerContent) return null;

    const containerDoc = new DOMParser().parseFromString(containerContent, 'text/xml');
    const rootfiles = containerDoc.getElementsByTagName('rootfile');
    if (rootfiles.length > 0) {
      const relativePath = rootfiles[0].getAttribute('full-path');
      if (relativePath) {
        console.log("OPF Relative Path:", relativePath);
        return findFile(bookLocationString, relativePath);
      }
    }
    return null;
  };

  const saveProgress = useCallback(async (progress: number) => {
    console.log("Saving progress of", progress, "for book", bookTitle, "at location", bookLocation);
    const booksJsonPath = `${FileSystem.documentDirectory}books.json`;
    const booksJson = await FileSystem.readAsStringAsync(booksJsonPath);
    const books = JSON.parse(booksJson);

    for (var i = 0; i < books.length; i++) {
      if (books[i].location == bookLocation || books[i].title == bookTitle) {
        console.log('Found book to update:', books[i]);
        books[i].progress = progress;
        console.log('Updated book:', books[i]);
        break;
      }
    }

    console.log('Writing updated books to file...');
    await FileSystem.writeAsStringAsync(booksJsonPath, JSON.stringify(books));
    console.log('Books updated and saved to file');

  }, [bookTitle, bookLocation]);

  const findFile = async (dir: string, relativePath: string): Promise<string | null> => {
    const list = await FileSystem.readDirectoryAsync(dir);

    for (const item of list) {
      const itemPath = `${dir}/${item}`;
      const itemInfo = await FileSystem.getInfoAsync(itemPath);

      if (itemInfo.isDirectory) {
        const result = await findFile(itemPath, relativePath);
        if (result) return result;
      } else if (itemPath.includes(relativePath)) {
        return itemPath;
      }
    }

    return null;
  };

  const parseOpf = async (opfPath: string) => {
    const opfContent = await safeReadFile(opfPath);
    if (!opfContent) {
      throw new Error(`Failed to read OPF file at ${opfPath}`);
    }

    const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');

    const manifest = Array.from(opfDoc.getElementsByTagName('item')).map(item => ({
      id: item.getAttribute('id'),
      href: item.getAttribute('href'),
      mediaType: item.getAttribute('media-type')
    }));

    const spine = Array.from(opfDoc.getElementsByTagName('itemref')).map(item =>
      item.getAttribute('idref')
    );

    return { manifest, spine };
  };



  const createSections = async (manifest: any[], spine: string[], opfPath: string) => {
    const sections: Section[] = [];
    const supportedTypes = [
      'application/xhtml+xml',
      'text/html',
      'application/xml',
      'text/xml',
      'text/x-oeb1-document'
    ];

    for (const idref of spine) {
      const item = manifest.find(m => m.id === idref);
      if (item && supportedTypes.includes(item.mediaType)) {
        const fullPath = resolvePath(opfPath, item.href);
        const title = await extractTitle(fullPath);
        sections.push({ path: fullPath, title: title || `Untitled Section` });
      }
    }

    if (bookProgressNumber >= sections.length) {
      setBookProgressNumber(sections.length - 1);
    }

    return sections;
  };

  const extractTitle = async (filePath: string) => {
    const content = await safeReadFile(filePath);
    if (!content) return `Untitled Section`;

    const doc = new DOMParser().parseFromString(content, 'text/html');
    const titleElement =
      doc.getElementsByTagName('title')[0] ||
      doc.getElementsByTagName('h1')[0] ||
      doc.querySelector('[epub:type="title"]');

    return titleElement ? titleElement.textContent?.trim() : `Untitled Section`;
  };

  const validateSections = async (sections: Section[]) => {
    const validSections: Section[] = [];

    for (const section of sections) {
      const fileInfo = await FileSystem.getInfoAsync(section.path);
      if (fileInfo.exists) {
        validSections.push(section);
      } else {
        console.warn(`File not found: ${section.path}`);
      }
    }

    return validSections;
  };

  const refineWithToc = async (sections: Section[], manifest: any[], opfPath: string) => {
    const ncxItem = manifest.find(item => item.mediaType === 'application/x-dtbncx+xml');
    const navItem = manifest.find(item => item.properties?.includes('nav'));

    if (navItem) {
      // EPUB3 Navigation Document
      const navPath = resolvePath(opfPath, navItem.href);
      const navContent = await safeReadFile(navPath);
      if (navContent) {
        const navDoc = new DOMParser().parseFromString(navContent, 'text/html');
        const navPoints = navDoc.getElementsByTagName('li');
        return refineWithNavPoints(sections, Array.from(navPoints), opfPath);
      }
    } else if (ncxItem) {
      // EPUB2 NCX
      const ncxPath = resolvePath(opfPath, ncxItem.href);
      const ncxContent = await safeReadFile(ncxPath);
      if (ncxContent) {
        const ncxDoc = new DOMParser().parseFromString(ncxContent, 'text/xml');
        const navPoints = ncxDoc.getElementsByTagName('navPoint');
        return refineWithNavPoints(sections, Array.from(navPoints), opfPath);
      }
    }

    return sections;
  };

  const refineWithNavPoints = (sections: Section[], navPoints: Element[], basePath: string) => {
    const refinedSections: Section[] = [];

    const processNavPoint = (navPoint: Element, level: number = 0) => {
      const labelElement = navPoint.getElementsByTagName('navLabel')[0] || navPoint.getElementsByTagName('span')[0];
      const contentElement = navPoint.getElementsByTagName('content')[0] || navPoint.getElementsByTagName('a')[0];

      if (labelElement && contentElement) {
        const title = labelElement.textContent?.trim() || 'Untitled';
        const src = contentElement.getAttribute('src');

        if (src) {
          const fullPath = resolvePath(basePath, src.split('#')[0]);
          const existingSection = sections.find(s => s.path === fullPath);

          if (existingSection) {
            refinedSections.push({ ...existingSection, title: title });
          } else {
            refinedSections.push({ path: fullPath, title: title });
          }
        }
      }

      // Process child nav points (for nested structures)
      const childNavPoints = navPoint.getElementsByTagName('navPoint');
      for (let i = 0; i < childNavPoints.length; i++) {
        processNavPoint(childNavPoints[i], level + 1);
      }
    };

    for (const navPoint of navPoints) {
      processNavPoint(navPoint);
    }

    // Add any sections that weren't in the TOC but were in the spine
    for (const section of sections) {
      if (!refinedSections.some(s => s.path === section.path)) {
        refinedSections.push(section);
      }
    }

    return refinedSections;
  };

  const loadSection = async (index: number) => {
    console.log("Loading section:", index);

    if (index < 0 || index >= sections.length) return;

    try {
      setIsLoading(true);
      console.log("Reading section content...");

      // Check if the file exists before trying to read it
      const fileInfo = await FileSystem.getInfoAsync(sections[index].path);
      if (!fileInfo.exists) {
        throw new Error(`File does not exist: ${sections[index].path}`);
      }

      // Try to read the file content
      let sectionContent;
      try {
        sectionContent = await FileSystem.readAsStringAsync(sections[index].path);
      } catch (readError) {
        console.error('Error reading file:', readError);
        // If reading as string fails, try reading as base64 and decode
        const base64Content = await FileSystem.readAsStringAsync(sections[index].path, { encoding: FileSystem.EncodingType.Base64 });
        sectionContent = atob(base64Content);
      }

      console.log("Read section content, now creating DOM Parser");
      const parser = new DOMParser();
      console.log("Created DOM Parser, now parsing section content");
      const doc = parser.parseFromString(sectionContent, 'text/html');
      console.log("Parsed section content, now getting body element");
      const body = doc.getElementsByTagName('body')[0];

      console.log("Got body element, setting HTML source...");
      if (body && body.innerHTML) {
        console.log("Setting HTML source from body inner HTML");
        //console.log("Body inner HTML: ", body.innerHTML);
        setHtmlSource({ html: body.innerHTML });
      } else {
        console.log("Setting HTML source from section content");
        //console.log("Section content: ", sectionContent);
        setHtmlSource({ html: sectionContent });
      }

      setCurrentSectionIndex(index);
      setBookProgressNumber(index);
      setIsLoading(false);
      setError(null);
      await saveProgress(index);
    } catch (error) {
      console.error('Error loading section:', error);
      setHtmlSource({ html: `<p>Error loading section: ${error}</p>` });
      setIsLoading(false);
      setError(`Error loading section: ${error}`);
    }
  }

  const goToNextSection = useCallback(() => {
    if (currentSectionIndex < sections.length - 1) {
      const nextProgress = bookProgressNumber + 1;
      setBookProgressNumber(nextProgress);
      loadSection(nextProgress);
    }
  }, [currentSectionIndex, sections.length, loadSection, bookProgressNumber]);

  const goToPreviousSection = useCallback(() => {
    if (currentSectionIndex > 0) {
      const prevProgress = bookProgressNumber - 1;
      setBookProgressNumber(prevProgress);
      loadSection(prevProgress);
    }
  }, [currentSectionIndex, loadSection, bookProgressNumber]);

  const renderersProps = useMemo<RenderHTMLProps['renderersProps']>(() => ({
    img: {
      enableExperimentalPercentWidth: true,
    },
  }), []);

  const tagsStyles: Readonly<Record<string, MixedStyleDeclaration>> = useMemo(() => ({
    body: { fontFamily: 'Arial', fontSize: 16, color: '#FFFFFF' },
    a: { color: '#00BFFF', textDecorationLine: 'underline' },
    p: { marginBottom: 10, color: '#FFFFFF' },
    h1: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, color: '#FFFFFF' },
    h2: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#FFFFFF' },
    // Add more tag styles as needed
  }), []);

  const classesStyles: Readonly<Record<string, MixedStyleDeclaration>> = useMemo(() => ({
    'chapter-title': { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#FFFFFF' },
    'text-center': { textAlign: 'center', color: '#FFFFFF' },
    'italic': { fontStyle: 'italic', color: '#FFFFFF' },
    // Add more class styles as needed
  }), []);

  const handleLinkPress = useCallback((evt: any, href: string) => {
    // Handle internal links if needed
    return false; // Prevent default link handling
  }, []);

  const renderContent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    console.log("HTML Source: ", htmlSource);
    console.log("Width: ", width);
    console.log("Inner html: ", htmlSource.html);

    return (
      <ScrollView style={styles.content}>
        {htmlSource.html ? (
          <RenderHTML
            contentWidth={width}
            source={htmlSource}
            tagsStyles={tagsStyles}
            classesStyles={classesStyles}
            renderersProps={renderersProps}
            ignoredDomTags={['svg']}
            baseStyle={{ color: '#FFFFFF', backgroundColor: '#000000' }}
            defaultTextProps={{ selectable: true, selectionColor: 'rgba(0, 0, 0, 0.3)' }}
            GenericPressable={TouchableOpacity}
          />
        ) : (
          <Text style={styles.errorText}>No content to display</Text>
        )}
      </ScrollView>
    );

  }, [isLoading, error, htmlSource, width, tagsStyles, classesStyles, renderersProps]);


  return (
    <GestureHandlerRootView style={styles.container}>
      {renderContent}
      <Animated.View style={[styles.navigation, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.navButton} onPress={goToPreviousSection}>
          <Text style={styles.navButtonText}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={goToNextSection}>
          <Text style={styles.navButtonText}>Next</Text>
        </TouchableOpacity>
      </Animated.View>
    </GestureHandlerRootView>
  );
};

document.addEventListener('selectionchange', () => {
  console.log('Selection changed:', window.getSelection());
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) {
    const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    const event = new CustomEvent('selectionchange', {
      detail: {
        selectedText: selection.toString(),
        x: selectionRect.left,
        y: selectionRect.top,
      },
    });
    document.dispatchEvent(event);
  }
});


const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  content: {
    padding: 30,
    flex: 1,
    backgroundColor: '#000000',
  },
  navigation: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  navButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
  },
  navButtonText: {
    color: 'white',
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  word: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#000000',
  },
  definition: {
    fontSize: 16,
    color: '#000000',
  },
  closeButton: {
    marginTop: 20,
    color: 'blue',
    textAlign: 'center',
  },
});


export default React.memo(EpubReader);

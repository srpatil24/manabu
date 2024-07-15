import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, TouchableWithoutFeedback } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { HTMLContentModel, HTMLElementModel, MixedStyleDeclaration, RenderHTML, HTMLSource, RenderHTMLProps, HTMLSourceInline } from 'react-native-render-html';
import { DOMParser } from '@xmldom/xmldom';
import { GestureHandlerRootView } from "react-native-gesture-handler";
import path from 'path-browserify';

interface Section {
  path: string;
  title: string;
}

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

  const bookLocationString = Array.isArray(bookLocation) ? bookLocation[0] : bookLocation as string;
  let bookProgressNumber = Number(Array.isArray(bookProgress) ? bookProgress[0] : bookProgress) || 0;

  useEffect(() => {
    parseEpub();
  }, []);

  useEffect(() => {
    if (sections.length > 0) {
      loadSection(bookProgressNumber);
    }
  }, [sections]);

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

  const safeReadFile = async (filePath: string): Promise<string | null> => {
    try {
      const normalizedPath = normalizePath(filePath);
      console.log("Attempting to read file:", normalizedPath);
      const content = await FileSystem.readAsStringAsync(normalizedPath, { encoding: FileSystem.EncodingType.UTF8 });
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      try {
        const normalizedPath = normalizePath(filePath);
        console.log("Attempting to read file with fallback encoding:", normalizedPath);
        const content = await FileSystem.readAsStringAsync(normalizedPath, { encoding: FileSystem.EncodingType.Base64 });
        return content;
      } catch (fallbackError) {
        console.error(`Error reading file with fallback encoding ${filePath}:`, fallbackError);
        return null;
      }
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
  
      // Normalize the book location string
      const normalizedBookLocation = normalizePath(bookLocationString);
  
      // Find OPF file
      let opfPath = '';
      const possibleOpfLocations = [
        `${normalizedBookLocation}/content.opf`,
        `${normalizedBookLocation}/OEBPS/content.opf`,
        `${normalizedBookLocation}/OPS/content.opf`,
        `${normalizedBookLocation}/META-INF/container.xml`,
        `${normalizedBookLocation}/package.opf`,
        `${normalizedBookLocation}/OEBPS/package.opf`,
        `${normalizedBookLocation}/OPS/package.opf`,
      ];
  
      for (const possiblePath of possibleOpfLocations) {
        const fileInfo = await FileSystem.getInfoAsync(possiblePath);
        if (fileInfo.exists) {
          if (possiblePath.endsWith('container.xml')) {
            const containerContent = await safeReadFile(possiblePath);
            if (containerContent) {
              const containerDoc = new DOMParser().parseFromString(containerContent, 'text/xml');
              const rootfiles = containerDoc.getElementsByTagName('rootfile');
              if (rootfiles.length > 0) {
                const relativePath = rootfiles[0].getAttribute('full-path');
                if (relativePath) {
                  opfPath = resolvePath(possiblePath, relativePath);
                  break;
                }
              }
            }
          } else {
            opfPath = possiblePath;
            break;
          }
        }
      }
  
      // If OPF file still not found, search for it
      if (!opfPath) {
        console.warn("OPF file not found in expected locations. Searching for .opf files...");
        const opfFiles = await findFiles(normalizedBookLocation, '.opf');
        if (opfFiles.length > 0) {
          opfPath = opfFiles[0];
        }
      }
  
      if (!opfPath) {
        throw new Error("Could not find OPF file in EPUB directory");
      }
  
      console.log("OPF path:", opfPath);
  
      // Read and parse OPF file
      const opfContent = await safeReadFile(opfPath);
      if (!opfContent) {
        throw new Error(`Failed to read OPF file at ${opfPath}`);
      }
  
      const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
      
      // Parse manifest
      const manifestItems = Array.from(opfDoc.getElementsByTagName('item'));
      const itemMap = new Map(
        manifestItems.map(item => [item.getAttribute('id'), item.getAttribute('href')])
      );
  
      // Parse spine
      let spineItems = Array.from(opfDoc.getElementsByTagName('itemref'));

      const manifestPaths = new Map(
        Array.from(manifestItems).map(item => {
          const id = item.getAttribute('id');
          const href = item.getAttribute('href');
          if (!id || !href) {
            throw new Error(`Invalid manifest item: ${item.outerHTML}`);
          }
          const fullPath = resolvePath(opfPath, href);
          return [id, fullPath];
        })
      );
      
      // If no spine, try to find a logical reading order
      if (spineItems.length === 0) {
        console.warn("No spine found. Attempting to create a logical reading order.");
        spineItems = manifestItems.filter(item => {
          const mediaType = item.getAttribute('media-type');
          return mediaType === 'application/xhtml+xml' || mediaType === 'text/html';
        });
      }
  
      // If still no spine items, use all items from manifest
      if (spineItems.length === 0) {
        console.warn("No suitable spine items found. Using all manifest items as fallback.");
        spineItems = manifestItems;
      }
  
      // Create sections
      const newSections: Section[] = [];
      const processedPaths = new Set<string>(); // To avoid duplicates
  
      for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i];
        const idref = item.getAttribute('idref') || item.getAttribute('id');
        let href = itemMap.get(idref) || item.getAttribute('href');
        
        if (href) {
          // Resolve the full path
          const fullPath = resolvePath(opfPath, href);
          
          if (!processedPaths.has(fullPath)) {
            processedPaths.add(fullPath);
  
            // Try to find a title for the section
            let title = `Section ${i + 1}`;
            const contentDoc = await safeReadFile(fullPath);
            if (contentDoc) {
              const contentHtml = new DOMParser().parseFromString(contentDoc, 'text/html');
              const titleElement = 
                contentHtml.getElementsByTagName('title')[0] || 
                contentHtml.getElementsByTagName('h1')[0] ||
                contentHtml.querySelector('[epub:type="title"]');
              if (titleElement) {
                title = titleElement.textContent?.trim() || title;
              }
            }
  
            newSections.push({
              path: fullPath,
              title: title
            });
          }
        }
      }
  
      // If still no sections, try to find any HTML or XHTML files
      if (newSections.length === 0) {
        console.warn("No sections found. Searching for any HTML or XHTML files.");
        const htmlFiles = await findFiles(normalizedBookLocation, '.html');
        const xhtmlFiles = await findFiles(normalizedBookLocation, '.xhtml');
        const allHtmlFiles = [...htmlFiles, ...xhtmlFiles].sort();
  
        for (let i = 0; i < allHtmlFiles.length; i++) {
          const filePath = allHtmlFiles[i];
          newSections.push({
            path: filePath,
            title: `Section ${i + 1}`
          });
        }
      }
  
      // If we still have no sections, try to parse any text files
      if (newSections.length === 0) {
        console.warn("No HTML sections found. Searching for any text files as a last resort.");
        const textFiles = await findFiles(normalizedBookLocation, '.txt');
        for (let i = 0; i < textFiles.length; i++) {
          const filePath = textFiles[i];
          newSections.push({
            path: filePath,
            title: `Section ${i + 1}`
          });
        }
      }
  
      if (newSections.length === 0) {
        throw new Error("No valid sections found in the EPUB");
      }
  
      console.log(`Found ${newSections.length} sections`);
      setSections(newSections);
      setIsLoading(false);
      setError(null);
  
    } catch (error) {
      console.error('Error parsing EPUB:', error);
      setHtmlSource({ html: `<p>Error parsing EPUB: ${error}</p>` });
      setIsLoading(false);
      setError(`Error parsing EPUB: ${error}`);
    }
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
        console.log("Body inner HTML: ", body.innerHTML);
        setHtmlSource({ html: body.innerHTML });
      } else {
        console.log("Setting HTML source from section content");
        console.log("Section content: ", sectionContent);
        setHtmlSource({ html: sectionContent });
      }
  
      setCurrentSectionIndex(index);
      setIsLoading(false);
      setError(null);
    } catch (error) {
      console.error('Error loading section:', error);
      setHtmlSource({ html: `<p>Error loading section: ${error}</p>` });
      setIsLoading(false);
      setError(`Error loading section: ${error}`);
    }
  }

  const goToNextSection = useCallback(() => {
    if (currentSectionIndex < sections.length - 1) {
      bookProgressNumber++;
      loadSection(currentSectionIndex + 1);
    }
  }, [currentSectionIndex, sections.length, loadSection]);

  const goToPreviousSection = useCallback(() => {
    if (currentSectionIndex > 0) {
      loadSection(currentSectionIndex - 1);
      bookProgressNumber--;
    }
  }, [currentSectionIndex, loadSection]);

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
            defaultTextProps={{ selectable: true }}
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


const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
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
});


export default React.memo(EpubReader);

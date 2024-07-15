import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, TouchableWithoutFeedback } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { HTMLContentModel, HTMLElementModel, MixedStyleDeclaration, RenderHTML, HTMLSource, RenderHTMLProps, HTMLSourceInline } from 'react-native-render-html';
import { DOMParser } from '@xmldom/xmldom';

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
    setShowNavigation((prev) => !prev);
    Animated.timing(fadeAnim, {
      toValue: showNavigation ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showNavigation, fadeAnim]);

  const parseEpub = async () => {
    try {
      console.log("Parsing EPUB file:", bookLocationString);
      setIsLoading(true);

      console.log("Reading container.xml file...");
      const containerXmlPath = `${bookLocationString}/META-INF/container.xml`;
      console.log("Container XML Path: ", containerXmlPath);
      const containerXml = await FileSystem.readAsStringAsync(containerXmlPath);
      console.log("finished reading container.xml file, creating DOM Parser");
      const parser = new DOMParser();
      console.log("Created DOM Parser, no parsing container.xml file");
      const containerDoc = parser.parseFromString(containerXml, 'text/xml');
      console.log("Parsed container.xml file, not getting rootfile");
      const opfPath = containerDoc.getElementsByTagName('rootfile')[0].getAttribute('full-path');
      console.log("got the OPF path");
      const opfContent = await FileSystem.readAsStringAsync(`${bookLocationString}/${opfPath}`);
      console.log("Got the OPF content");
      const opfDoc = parser.parseFromString(opfContent, 'text/xml');
      console.log("Parsed the OPF content");

      const spine = opfDoc.getElementsByTagName('spine')[0];
      console.log("Got the spine");
      const manifest = opfDoc.getElementsByTagName('manifest')[0];
      console.log("Got the manifest");
      const items = manifest.getElementsByTagName('item');
      console.log("Got the items");

      console.log("mapping items...");

      const itemMap = new Map();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        itemMap.set(item.getAttribute('id'), item.getAttribute('href'));
      }

      console.log("mapping items done, now populating sections...");

      const newSections: Section[] = [];
      const spineItems = spine.getElementsByTagName('itemref');
      for (let i = 0; i < spineItems.length; i++) {
        const idref = spineItems[i].getAttribute('idref');
        const href = itemMap.get(idref);
        if (href) {
          newSections.push({
            path: `${bookLocationString}/${href}`,
            title: `Section ${i + 1}` // You might want to extract actual titles from the NCX file
          });
        }
      }

      console.log("Populated sections, setting sections...");

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
      const sectionContent = await FileSystem.readAsStringAsync(sections[index].path);
      console.log("Read section content, now creating DOM Parser");
      const parser = new DOMParser();
      console.log("Created DOM Parser, now parsing section content");
      const doc = parser.parseFromString(sectionContent, 'text/html');
      console.log("Parsed section content, now getting body element");
      const body = doc.getElementsByTagName('body')[0];

      console.log("Got body element, setting HTML source...");
      if (body.innerHTML) {
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
  };

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
      <TouchableWithoutFeedback onPress={toggleNavigation}>
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
            />
          ) : (
            <Text style={styles.errorText}>No content to display</Text>
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    );

  }, [isLoading, error, htmlSource, width, tagsStyles, classesStyles, renderersProps]);


  return (
    <View style={styles.container}>
      {renderContent}
      <Animated.View style={[styles.navigation, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.navButton} onPress={goToPreviousSection}>
          <Text style={styles.navButtonText}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={goToNextSection}>
          <Text style={styles.navButtonText}>Next</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
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
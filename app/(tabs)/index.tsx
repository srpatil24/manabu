import { StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Pressable } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';

import { Text, View } from '@/components/Themed';
import { useRouter } from 'expo-router';

import * as FileSystem from 'expo-file-system';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

import {
  Menu,
  MenuOptions,
  MenuOption,
  MenuTrigger,
  MenuProvider,
} from 'react-native-popup-menu';

// Sample book data (you can replace this with your actual data)
let books = [
  {
    id: 1,
    title: "Book Title 1",
    author: "Author 1",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book1.epub",
    sections: [1, 2, 3, 4]
  },
  {
    id: 2,
    title: "Book Title 2",
    author: "Author 2",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book2.epub",
    sections: [1, 2, 3, 4]
  },
  {
    id: 3,
    title: "Book Title 3",
    author: "Author 3",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book3.epub",
    sections: [1, 2, 3, 4]
  },
  {
    id: 4,
    title: "Book Title 4",
    author: "Author 4",
    image: "https://via.placeholder.com/100",
    progress: 0,
    location: "file///path/to/book4.epub",
    sections: [1, 2, 3, 4]
  },
  // Add more book objects as needed
];

const loadBooks = async (setBooks: any, setRefreshing: any) => {
  try {
    const booksJson = await FileSystem.readAsStringAsync(`${FileSystem.documentDirectory}books.json`);
    const loadedBooks = JSON.parse(booksJson);
    setBooks(loadedBooks);
  } catch (error) {
    console.error("Error reading or parsing books.json:", error);
  } finally {
    setRefreshing(false);
  }
};

export default function TabOneScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [books, setBooks] = useState<{ id: number; title: string; author: string; image: string; progress: number; location: string; }[]>([]);

  useEffect(() => {
    loadBooks(setBooks, setRefreshing);
  }, []);

  const handleBookPress = (book: any) => {
    console.log(`Selected book: ${book.title}`);
    router.push({
      pathname: '/reader',
      params: { bookTitle: book.title, bookLocation: book.location, bookID: book.id, bookProgress: book.progress },
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBooks(setBooks, setRefreshing);
  };

  return (
    <MenuProvider>
      <View>
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {books.map((book) => (
            <TouchableOpacity key={book.id} onPress={() => handleBookPress(book)}>
              <BookContainer book={book} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </MenuProvider>
  );
}

const deleteBook = async (book: any) => {
  console.log(`Deleting book: ${book.title}`);

  const booksJson = await FileSystem.readAsStringAsync(`${FileSystem.documentDirectory}books.json`);
  const loadedBooks = JSON.parse(booksJson);
  const updatedBooks = loadedBooks.filter((b: any) => (b.id !== book.id && b.title !== book.title));
  await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}books.json`, JSON.stringify(updatedBooks));
  await FileSystem.deleteAsync(book.location);
}

const blurhash =
  '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';


function BookContainer({ book }: { book: any }) {
  const colorScheme = useColorScheme();

  return (
    <View style={styles.bookContainer}>
      <Image source={{ uri: book.image }} style={styles.bookImage} placeholder={{ blurhash }} />
      <View style={styles.contentContainer}>
        <View style={styles.textContainer}>
          <Text style={styles.bookTitle}>{book.title}</Text>
          <Text style={styles.bookAuthor}>{book.author}</Text>
        </View>
        <View style={styles.iconWrapper}>
          <Menu onOpen={() => console.log('Menu opened')} onClose={() => console.log('Menu closed')}>
            <MenuTrigger customStyles={triggerStyles}>
              <View style={styles.iconContainer}>
                <FontAwesome
                  name="ellipsis-v"
                  size={25}
                  color={Colors[colorScheme ?? 'light'].text}
                  style={styles.icon}
                />
              </View>
            </MenuTrigger>
            <MenuOptions customStyles={optionsStyles}>
              <MenuOption onSelect={() => deleteBook(book)} text='Delete' />
            </MenuOptions>
          </Menu>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bookContainer: {
    flexDirection: 'row',
    width: '100%',
    height: 200,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  bookImage: {
    width: 100,
    height: '100%',
    marginRight: 10,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  bookAuthor: {
    fontSize: 15,
    color: 'gray',
    marginTop: 5,
  },
  iconWrapper: {
    alignSelf: 'flex-end',
  },
  iconContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)', // Keep this for debugging, remove later if not needed
  },
  icon: {
    // You can add specific icon styles here if needed
  },
});

const triggerStyles = {
  triggerWrapper: {
    // No need for additional styles here
  },
};

const optionsStyles = {
  optionsContainer: {
    backgroundColor: 'black',
    padding: 5,
    borderRadius: 5,
  },
  optionWrapper: {
    margin: 5,
  },
  optionText: {
    color: 'white',
  },
};
